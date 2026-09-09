import { test } from "node:test";
import assert from "node:assert/strict";
import { persistComposerDrafts, snapshotDrafts } from "../src/ui/drafts.ts";

test("automatic and manual reconnect wait for fresh hello and discard stale-stream events", async () => {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const requests: string[] = [];
  const cache = new Map<string, string>();
  const drafts = new Map<string, string>();
  class FakeStream {
    static all: FakeStream[] = [];
    onopen?: () => void;
    onerror?: () => void;
    onmessage?: (e: { data: string }) => void;
    constructor() { FakeStream.all.push(this); }
    close() {}
    hello(base: unknown, revision: number) { this.onmessage?.({ data: JSON.stringify({ type: "hello", base, revision, notes: [], presence: [], work: [] }) }); }
  }
  const session = {
    getItem: (k: string) => drafts.get(k) ?? null,
    setItem: (k: string, v: string) => { drafts.set(k, v); },
    removeItem: (k: string) => { drafts.delete(k); },
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem: (k: string) => cache.get(k) ?? null, setItem: (k: string, v: string) => cache.set(k, v) } },
    sessionStorage: { configurable: true, value: session },
    window: { configurable: true, value: { setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id), setInterval: () => 0, addEventListener: () => {} } },
    document: { configurable: true, value: { visibilityState: "hidden", addEventListener: () => {} } },
    EventSource: { configurable: true, value: FakeStream },
    fetch: { configurable: true, value: async (url: string) => { requests.push(url); return { ok: true, status: 200, json: async () => ({ revision: 2 }) }; } },
  });
  const game = await import("../src/core/runtime.ts");
  const live = await import("../src/core/live.ts");
  game.bootRuntime();
  persistComposerDrafts("unsent radio", "unsent quick", session);
  const held = snapshotDrafts(session);
  live.connectLive();
  const first = FakeStream.all[0];
  first.onopen?.();
  first.hello(game.exportSave(), 1);
  const bank = game.runtime.buildings.find(b => b.hubId === "bank")!;
  game.assignAgent("codex", bank.uid);
  assert.equal(timers.size, 1);
  first.onerror?.();
  assert.equal(timers.size, 0);
  first.onopen?.();
  game.assignAgent("codex", null);
  assert.equal(timers.size, 0, "automatic reconnect must not save before hello");
  first.hello(game.exportSave(), 2);
  game.assignAgent("codex", bank.uid);
  assert.equal(timers.size, 1);
  live.reconnectLive();
  assert.equal(timers.size, 0);
  const second = FakeStream.all[1];
  second.onopen?.();
  first.hello({ buildings: [], assignments: {}, equipped: {} }, 999);
  first.onerror?.();
  assert.equal(live.radioLive, true);
  assert.ok(game.runtime.buildings.length > 0, "closed stream cannot replace the map");
  game.assignAgent("codex", null);
  assert.equal(timers.size, 0, "manual reconnect must not save before new hello");
  second.hello(game.exportSave(), 3);
  game.assignAgent("codex", bank.uid);
  assert.equal(timers.size, 1);
  assert.equal(requests.filter(p => p === "/api/base").length, 0);
  assert.deepEqual(snapshotDrafts(session), held, "live hello replacement must not touch chat drafts");
});
