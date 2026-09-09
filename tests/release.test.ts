import { test } from "node:test";
import assert from "node:assert/strict";
import { composerAfterAttempt, persistComposerDrafts, readDraft, saveDraft, snapshotDrafts } from "../src/ui/drafts.ts";
import {
  CHAT_DRAFT_KEY,
  QUICK_DRAFT_KEY,
  applyHubUpdate,
  draftsStillHeld,
  parseHealthPayload,
  reconnectHub,
  releaseChipHtml,
  releaseStatus,
  resetReleaseWatchForTests,
  setReleaseReload,
  shortCommit,
} from "../src/ui/release.ts";

test("build chip uses /health commit and version, not a fake timer", () => {
  const live = releaseStatus({
    radioLive: true,
    health: { ok: true, version: "1.2.0", commit: "07245b5abc" },
    bootCommit: "07245b5abc",
  });
  assert.equal(live.kind, "live");
  assert.equal(live.label, "1.2.0 · 07245b5");
  assert.equal(live.showUpdate, false);
  assert.equal(shortCommit("e2d216a5d664dd60"), "e2d216a");
  const nameless = releaseStatus({
    radioLive: true,
    health: { ok: true, name: "area67", commit: null },
    bootCommit: null,
  });
  assert.equal(nameless.label, "Connected · version unverified");
});

test("stale deploy offers Update; disconnect offers Reconnect; neither auto-reloads", () => {
  resetReleaseWatchForTests();
  let reloads = 0;
  setReleaseReload(() => { reloads += 1; });

  const stale = releaseStatus({
    radioLive: true,
    health: { ok: true, version: "1.2.1", commit: "aaaaaaaa" },
    bootCommit: "bbbbbbbb",
  });
  assert.equal(stale.kind, "stale");
  assert.equal(stale.showUpdate, true);
  assert.match(releaseChipHtml(stale), /id="hub-update"/);
  assert.doesNotMatch(releaseChipHtml(stale), /id="hub-reconnect"/);

  const offline = releaseStatus({
    radioLive: false,
    health: { ok: true, version: "1.2.0", commit: "07245b5" },
    bootCommit: "07245b5",
  });
  assert.equal(offline.kind, "offline");
  assert.equal(offline.showReconnect, true);
  assert.match(releaseChipHtml(offline), /id="hub-reconnect"/);

  const bad = releaseStatus({
    radioLive: true,
    health: { ok: false, version: "1.2.0", commit: "07245b5" },
    bootCommit: "07245b5",
    healthError: "Hub /health is not ok",
  });
  assert.equal(bad.kind, "bad");
  assert.equal(reloads, 0);
});

test("boot identity stays the bundle commit; /health is validated and never adopted as boot", () => {
  const parsed = parseHealthPayload({ ok: true, version: "1.2.4", commit: "67bbb18deadbeef" }, true);
  assert.equal(parsed.error, null);
  assert.equal(parsed.health?.commit, "67bbb18deadbeef");
  const stale = releaseStatus({
    radioLive: true,
    health: parsed.health,
    bootCommit: "aaaaaaaa",
  });
  assert.equal(stale.kind, "stale");
  const garbage = parseHealthPayload("not-json", true);
  assert.equal(garbage.health, null);
  assert.match(garbage.error ?? "", /non-object/);
  const badCommit = parseHealthPayload({ ok: true, commit: 12 }, true);
  assert.equal(badCommit.health, null);
});

test("reconnect preserves chat drafts and does not reload or mark agents resumed", async () => {
  resetReleaseWatchForTests();
  const store = new Map<string, string>();
  const writes: string[] = [];
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push("set:" + k); store.set(k, v); },
    removeItem: (k: string) => { writes.push("remove:" + k); store.delete(k); },
  };
  persistComposerDrafts("keep this radio draft", "keep this quick draft", storage);
  const snapshot = snapshotDrafts(storage);
  writes.length = 0;

  let reloads = 0;
  let streams = 0;
  setReleaseReload(() => { reloads += 1; });
  await reconnectHub({
    reconnectStream: () => { streams += 1; },
    fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, version: "1.2.0", commit: "07245b5" }) })) as unknown as typeof fetch,
  });
  assert.equal(streams, 1);
  assert.equal(reloads, 0);
  assert.equal(writes.length, 0, "reconnect must not mutate draft storage");
  assert.equal(draftsStillHeld(storage, snapshot), true);

  applyHubUpdate();
  assert.equal(reloads, 1);
  assert.equal(draftsStillHeld(storage, snapshot), true);
  assert.equal(readDraft(CHAT_DRAFT_KEY, storage), snapshot[CHAT_DRAFT_KEY]);
  assert.equal(readDraft(QUICK_DRAFT_KEY, storage), snapshot[QUICK_DRAFT_KEY]);
  saveDraft(CHAT_DRAFT_KEY, "", storage);
  assert.equal(readDraft(CHAT_DRAFT_KEY, storage), "");
  assert.equal(readDraft(QUICK_DRAFT_KEY, storage), snapshot[QUICK_DRAFT_KEY]);
});

test("failed health poll and a second reconnect click still leave drafts in place", async () => {
  resetReleaseWatchForTests();
  const store = new Map<string, string>([[CHAT_DRAFT_KEY, "unsent directive"], [QUICK_DRAFT_KEY, "quick ping"]]);
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const snapshot = snapshotDrafts(storage);
  let streams = 0;
  let reloads = 0;
  setReleaseReload(() => { reloads += 1; });
  await reconnectHub({
    reconnectStream: () => { streams += 1; },
    fetchImpl: (async () => { throw new Error("network down"); }) as unknown as typeof fetch,
  });
  assert.equal(streams, 1);
  assert.equal(reloads, 0);
  assert.equal(draftsStillHeld(storage, snapshot), true);
  assert.equal(composerAfterAttempt("unsent directive", "unsent directive", false), "unsent directive");

  let second = 0;
  const first = reconnectHub({
    reconnectStream: () => { streams += 1; second += 1; },
    fetchImpl: (async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { ok: true, json: async () => ({ ok: true, version: "1.2.6", commit: "bb1cf2d" }) };
    }) as unknown as typeof fetch,
  });
  await reconnectHub({
    reconnectStream: () => { streams += 1; second += 1; },
    fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, version: "1.2.6", commit: "bb1cf2d" }) })) as unknown as typeof fetch,
  });
  await first;
  assert.equal(second, 1, "a reconnect already in flight must ignore a second click");
  assert.equal(draftsStillHeld(storage, snapshot), true);
  assert.equal(releaseStatus({ radioLive: true, health: { ok: true, version: "1.3.0", commit: "aaaaaaaa" }, bootCommit: "bbbbbbbb" }).showUpdate, true);
});
