import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ATTENTIVE_MS, OFFLINE_MS, MAX_QUIET_MS, effectiveAttention, type Presence,
} from "../shared/protocol.ts";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-monitor-"));
process.env.AREA67_TEST = "1"; process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");
const store = await import("../server/store.ts");

const seat = (over: Partial<Presence> = {}): Presence => ({
  seat: "claude", state: "busy", lastSeen: 0, activity: "building",
  source: "mcp", lastReadAt: 0, ...over,
});

test("a seat mid-build is reported busy, not dead, for the window it declared", () => {
  // The failure this exists for: an agent runs tools one at a time, so a long
  // build means no heartbeat, and the roster calls an actively working seat
  // away at two minutes and offline at ten.
  const working = seat({ lastSeen: 0, quietUntil: 900_000 });
  assert.equal(effectiveAttention(working, ATTENTIVE_MS + 1), "busy");
  assert.equal(effectiveAttention(working, OFFLINE_MS + 1), "busy");
  // Same seat without the declaration is exactly as before — this is additive.
  const silent = seat({ lastSeen: 0 });
  assert.equal(effectiveAttention(silent, ATTENTIVE_MS + 1), "away");
  assert.equal(effectiveAttention(silent, OFFLINE_MS + 1), "offline");
});

test("the claim expires and normal decay resumes from the real lastSeen", () => {
  // It cannot be used to look alive indefinitely: overrun your own estimate
  // and you decay like anyone else. "Like anyone else" is the load-bearing
  // part — the seat does not get punished for having declared, it just rejoins
  // the normal curve measured from its real lastSeen, which at 301s in is
  // away (past ATTENTIVE_MS) and not yet offline (short of OFFLINE_MS).
  const overrun = seat({ lastSeen: 0, quietUntil: 300_000 });
  assert.equal(effectiveAttention(overrun, 299_000), "busy");
  assert.equal(effectiveAttention(overrun, 301_000), "away");
  assert.equal(effectiveAttention(overrun, OFFLINE_MS + 1), "offline");
  // A seat with no claim at those same two moments reads identically, which is
  // what "the claim expires" has to mean.
  const never = seat({ lastSeen: 0 });
  assert.equal(effectiveAttention(never, 301_000), "away");
  assert.equal(effectiveAttention(never, OFFLINE_MS + 1), "offline");
});

test("explicitly going offline beats any outstanding claim", () => {
  const left = seat({ state: "offline", lastSeen: 0, quietUntil: 900_000 });
  assert.equal(effectiveAttention(left, 1000), "offline");
});

test("a heads-down claim is bounded, reaches the roster, and is dropped by the next check-in", async () => {
  const post = (body: unknown) => app.request("/api/presence/claude", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const before = Date.now();
  const declared = await (await post({ state: "busy", activity: "long build", quietForSeconds: MAX_QUIET_MS / 1000 })).json();
  assert.ok(declared.quietUntil > before, "the ceiling itself must be accepted, not rejected off-by-one");
  assert.ok(declared.quietUntil <= before + MAX_QUIET_MS + 1000, `window ${declared.quietUntil - before} exceeds the cap`);

  // Dropped, not sticky: a later check-in that says nothing about quiet clears
  // it, so a seat cannot declare once and coast.
  const plain = await (await post({ state: "attentive", activity: "back" })).json();
  assert.equal(plain.quietUntil, undefined);

  // And it reaches the public presence view, or nothing downstream can honour it.
  await post({ state: "busy", activity: "long build", quietForSeconds: 600 });
  const roster = await (await app.request("/api/presence")).json();
  const mine = roster.find((p: Presence) => p.seat === "claude");
  assert.ok(mine.quietUntil > Date.now(), "presence must carry the declared window");
  assert.equal(mine.state, "busy");

  // Going offline clears an outstanding claim at the source, not just in the
  // read path — otherwise a seat that left would sit in the roster as busy
  // until its window lapsed.
  const left = await (await post({ state: "offline", activity: "done", quietForSeconds: 600 })).json();
  assert.equal(left.quietUntil, undefined);
});

test("the store clamps a window even when the route schema is bypassed", () => {
  // Two layers disagreed on the first cut and it took running the tests to see
  // it: the route REJECTS anything over the cap, which makes the store's clamp
  // unreachable through HTTP. Both are kept on purpose — reject at the edge so
  // a caller is never silently given something other than what it asked for,
  // clamp in the store so an internal caller cannot mint an unbounded window.
  // This test covers the second layer, which no HTTP test can reach.
  const p = store.heartbeat("codex", "busy", "long build", "mcp", 99_999_000);
  assert.ok(p.quietUntil! <= Date.now() + MAX_QUIET_MS + 1000, "store must clamp");
  assert.ok(p.quietUntil! > Date.now());
  const cleared = store.heartbeat("codex", "offline", "gone", "mcp", 600_000);
  assert.equal(cleared.quietUntil, undefined);
});

test("an over-long or negative window cannot be smuggled in through the API", async () => {
  const post = (body: unknown) => app.request("/api/presence/claude", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await post({ state: "busy", quietForSeconds: -60 })).status, 400);
  assert.equal((await post({ state: "busy", quietForSeconds: MAX_QUIET_MS / 1000 + 1 })).status, 400);
});
