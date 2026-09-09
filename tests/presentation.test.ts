import { test } from "node:test";
import assert from "node:assert/strict";
import { agentSignal, standbySpots } from "../src/core/agentPresentation.ts";
import { buildPanelKind, dismissInteraction } from "../src/ui/panels.ts";
import { WorldGrid, generateWorld } from "../src/core/grid.ts";
import type { Presence } from "../shared/protocol.ts";
import type { WorkReport } from "../shared/workspace.ts";
const now = 1_000_000;
const presence: Presence = { seat: "codex", state: "busy", lastSeen: now, activity: "Reviewing", source: "mcp", lastReadAt: now };
const work: WorkReport = { seat: "codex", buildingUid: "project-area67", taskId: "TEST", activity: "Actual task", state: "working", updatedAt: now - 1000, sessionActive: true, artifacts: [] };

test("work thought requires a current report, active session and fresh own check-in", () => {
  assert.equal(agentSignal(true, presence, work, false, now).status, "working");
  for (const stale of [{ ...work, updatedAt: now - 120_000 }, { ...work, sessionActive: false }, { ...work, updatedAt: now + 1 }]) {
    const signal = agentSignal(true, presence, stale, false, now);
    assert.equal(signal.status, "idle"); assert.equal(signal.animate, false);
  }
  assert.equal(agentSignal(true, presence, undefined, false, now).status, "idle");
});
test("status distinguishes moving, blocked, reported done and away without faking work", () => {
  assert.equal(agentSignal(true, presence, work, true, now).status, "moving");
  assert.equal(agentSignal(true, presence, { ...work, state: "blocked" }, true, now).status, "blocked");
  assert.equal(agentSignal(true, presence, { ...work, state: "done" }, false, now).status, "done");
  assert.equal(agentSignal(true, { ...presence, state: "away" }, work, false, now).status, "away");
  assert.equal(agentSignal(true, { ...presence, lastSeen: now - 120_000 }, work, false, now).animate, false);
});
test("offline and disconnected displays park without reusing stale work as online status", () => {
  assert.equal(agentSignal(true, undefined, work, true, now).parked, true);
  assert.equal(agentSignal(true, { ...presence, state: "offline" }, work, true, now).status, "offline");
  assert.equal(agentSignal(true, { ...presence, lastSeen: now - 600_000 }, work, true, now).parked, true);
  assert.equal(agentSignal(false, presence, work, false, now).status, "disconnected");
  assert.equal(agentSignal(true, presence, work, false, now).parked, false);
});
test("standby slots are distinct walkable outer-map locations, never occupy or mutate the grid", () => {
  const grid = new WorldGrid(); generateWorld(grid);
  const before = JSON.stringify(grid.occupied);
  const spots = standbySpots(grid, 13);
  assert.equal(spots.length, 13);
  assert.equal(new Set(spots.map(p => p.x + "," + p.y)).size, 13);
  for (const p of spots) { assert.ok(grid.walkable(p.x, p.y)); assert.ok(Math.hypot(p.x - 28, p.y - 20) > 60); }
  assert.equal(JSON.stringify(grid.occupied), before);
});
test("Move does not render the Build catalog; Close clears all transient interaction", () => {
  assert.equal(buildPanelKind("move"), "move"); assert.equal(buildPanelKind("build"), "catalog");
  const state = { mode: "move" as const, lifting: { uid: "keep" }, ghostHub: "github", ghostProject: { name: "draft" }, selectedAgent: "codex", selectedBuilding: "keep" };
  let restored = 0;
  dismissInteraction(state, () => { restored++; });
  assert.equal(restored, 1); assert.equal(state.mode, "play");
  assert.equal(state.ghostHub, null); assert.equal(state.ghostProject, null); assert.equal(state.selectedBuilding, null); assert.equal(state.selectedAgent, null);
});
