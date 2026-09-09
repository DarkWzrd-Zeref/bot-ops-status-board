import { test } from "node:test";
import assert from "node:assert/strict";
const cache = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k: string) => cache.get(k) ?? null, setItem: (k: string, v: string) => cache.set(k, v), removeItem: (k: string) => cache.delete(k) } });
const game = await import("../src/core/runtime.ts");
const { canEquipSkill } = await import("../src/core/skillspector.ts");
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
