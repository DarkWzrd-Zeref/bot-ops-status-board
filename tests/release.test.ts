import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_DRAFT_KEY,
  QUICK_DRAFT_KEY,
  applyHubUpdate,
  draftsStillHeld,
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

test("reconnect preserves chat drafts and does not reload or mark agents resumed", async () => {
  resetReleaseWatchForTests();
  const store = new Map<string, string>([
    [CHAT_DRAFT_KEY, "keep this radio draft"],
    [QUICK_DRAFT_KEY, "keep this quick draft"],
  ]);
  const storage = { getItem: (k: string) => store.get(k) ?? null };
  const snapshot = { [CHAT_DRAFT_KEY]: "keep this radio draft", [QUICK_DRAFT_KEY]: "keep this quick draft" };

  let reloads = 0;
  let streams = 0;
  setReleaseReload(() => { reloads += 1; });
  await reconnectHub({
    reconnectStream: () => { streams += 1; },
    fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, version: "1.2.0", commit: "07245b5" }) })) as unknown as typeof fetch,
  });
  assert.equal(streams, 1);
  assert.equal(reloads, 0);
  assert.equal(draftsStillHeld(storage, snapshot), true);

  applyHubUpdate();
  assert.equal(reloads, 1);
  assert.equal(draftsStillHeld(storage, snapshot), true);
});
