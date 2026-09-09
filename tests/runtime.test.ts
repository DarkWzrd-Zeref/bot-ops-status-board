import { test } from "node:test";
import assert from "node:assert/strict";
const cache = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k: string) => cache.get(k) ?? null, setItem: (k: string, v: string) => cache.set(k, v), removeItem: (k: string) => cache.delete(k) } });
const game = await import("../src/core/runtime.ts");
const { canEquipSkill } = await import("../src/core/skillspector.ts");
const { dismissInteraction } = await import("../src/ui/panels.ts");
game.bootRuntime();
await test("starter base includes Codex separately from ChatGPT, Heavy and Cursor", () => {
  for (const id of ["codex", "researcher", "director", "cursor-ultra"]) assert.ok(game.runtime.agents.some(a => a.id === id));
  assert.equal(game.runtime.buildings.filter(b => b.hubId === "well").length, 1);
});
await test("full station rejects reassignment without discarding the prior assignment", () => {
  const cursor = game.runtime.buildings.find(b => b.hubId === "cursor")!;
  const bank = game.runtime.buildings.find(b => b.hubId === "bank")!;
  game.assignAgent("codex", cursor.uid);
  game.assignAgent("claude", cursor.uid);
  game.assignAgent("researcher", bank.uid);
  game.assignAgent("researcher", cursor.uid);
  assert.equal(game.runtime.agents.find(a => a.id === "researcher")!.buildingUid, bank.uid);
});
await test("move previews retain the original station in shared snapshots and cancellation never duplicates it", () => {
  const b = { ...game.runtime.buildings.find(b => b.hubId === "cursor")! };
  assert.equal(game.beginMove(b.uid), true);
  assert.equal(game.runtime.buildings.some(row => row.uid === b.uid), false);
  assert.deepEqual(game.exportSave().buildings.find(row => row.uid === b.uid), b);
  game.cancelMove();
  assert.equal(game.runtime.buildings.filter(row => row.uid === b.uid).length, 1);
});
await test("remote snapshots do not echo a save, and stale assignment references are cleared", () => {
  let saves = 0;
  game.onPersist(() => { saves++; });
  game.applyBaseSnapshot({ ...game.exportSave(), assignments: { codex: "missing" } });
  assert.equal(saves, 0);
  assert.equal(game.runtime.agents.find(a => a.id === "codex")!.buildingUid, null);
});
await test("walking advances by simulation ticks rather than one tile every frame", () => {
  game.runtime.pulseOn = false;
  game.runtime.movementAcc = 0;
  const a = game.runtime.agents.find(a => a.id === "codex")!;
  a.path = [{ x: a.tx + 1, y: a.ty }];
  const x = a.tx;
  game.stepAgents(16);
  assert.equal(a.tx, x);
  game.stepAgents(144);
  assert.equal(a.tx, x + 1);
});
await test("the Palbox cannot be covered or dismantled; unscanned skills are blocked", () => {
  const core = game.runtime.buildings.find(b => b.hubId === "well")!;
  assert.equal(game.placementOk("bank", core.tx, core.ty), false);
  game.demolish(core.uid);
  assert.ok(game.runtime.buildings.some(b => b.uid === core.uid));
  assert.equal(canEquipSkill(undefined, false).ok, false);
});
await test("project metadata survives placement, move, cancel, reload and safe in-game removal", () => {
  const info = { name: "Workspace", repoUrl: "https://github.com/example/hub", workspace: "project-folder", summary: "Our code", contents: ["src", "tests"] };
  game.prepareProject(info);
  let plot: { x: number; y: number } | undefined;
  for (let y = 8; y < 34 && !plot; y++) for (let x = 12; x < 42; x++) if (game.placementOk("project-site", x, y)) { plot = { x, y }; break; }
  assert.ok(plot);
  assert.equal(game.tryPlace("project-site", plot.x, plot.y), true);
  const building = game.runtime.buildings.at(-1)!;
  assert.deepEqual(building.project, info);
  assert.equal(game.runtime.ghostProject, null);
  game.beginMove(building.uid);
  assert.deepEqual(game.exportSave().buildings.find(b => b.uid === building.uid)!.project, info);
  game.cancelMove();
  assert.deepEqual(game.runtime.buildings.find(b => b.uid === building.uid)!.project, info);
  game.beginMove(building.uid);
  assert.equal(game.finishMove(plot.x, plot.y), true);
  game.applyBaseSnapshot(game.exportSave());
  assert.deepEqual(game.runtime.buildings.find(b => b.uid === building.uid)!.project, info);
  game.updateProject(building.uid, { ...info, name: "Edited sign" });
  assert.equal(game.buildingName(game.runtime.buildings.find(b => b.uid === building.uid)!), "Edited sign");
  game.assignAgent("codex", building.uid);
  game.demolish(building.uid);
  assert.equal(game.runtime.buildings.some(b => b.uid === building.uid), false);
  assert.equal(game.runtime.agents.find(a => a.id === "codex")!.buildingUid, null);
});
await test("a fresh work target survives radio speech and base hydration without changing assignment", () => {
  const a = game.runtime.agents.find(a => a.id === "codex")!;
  const b = game.runtime.buildings.find(b => b.hubId === "cursor")!;
  game.assignAgent(a.id, null);
  game.syncWorkTargets(new Map([[a.id, b.uid]]));
  const path = JSON.stringify(a.path);
  game.palSay(a.id, "Progress reported from my workspace");
  assert.equal(JSON.stringify(a.path), path);
  game.applyBaseSnapshot(game.exportSave());
  assert.equal(game.runtime.workTargets.get(a.id), b.uid);
  assert.equal(a.buildingUid, null);
  game.syncWorkTargets(new Map());
  assert.equal(a.path.length, 0);
});
await test("touch Close during a lifted project restores its exact data and assignments", () => {
  const b = game.runtime.buildings.find(b => b.hubId === "cursor")!;
  const before = structuredClone(game.exportSave());
  game.runtime.selectedBuilding = b.uid;
  assert.equal(game.beginMove(b.uid), true);
  dismissInteraction(game.runtime, game.cancelMove);
  const after = game.exportSave();
  assert.deepEqual(after.buildings.find(row => row.uid === b.uid), before.buildings.find(row => row.uid === b.uid));
  assert.equal(after.buildings.filter(row => row.uid === b.uid).length, 1);
  assert.deepEqual(after.assignments, before.assignments);
  assert.deepEqual(after.equipped, before.equipped);
  assert.equal(game.runtime.lifting, null);
  assert.equal(game.runtime.selectedBuilding, null);
  assert.equal(game.runtime.mode, "play");
});
await test("touch Cancel for a new project removes the ghost without creating a building", () => {
  const before = game.runtime.buildings.length;
  game.prepareProject({ name: "Unplaced draft", repoUrl: "", workspace: "preview", summary: "", contents: [] });
  dismissInteraction(game.runtime, game.cancelMove);
  assert.equal(game.runtime.ghostProject, null);
  assert.equal(game.runtime.ghostHub, null);
  assert.equal(game.runtime.buildings.length, before);
});
