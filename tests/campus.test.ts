import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { canStand, findWalkStart, moveWalker, walkEscapeAction, walkLookStep, walkMovementBlocked } from "../src/game/walk.ts";
import { packLabels } from "../src/game/labelLayout.ts";
import { createArchitecture, createCharacter } from "../src/game/architecture.ts";
import hubs from "../src/content/hubs.json";

const grid = { walkable: (x: number, y: number) => x >= 0 && y >= 0 && x < 12 && y < 12 && x !== 5 };
test("walk radius respects borders and solid tiles", () => {
  assert.ok(canStand(grid, 1.5, 1.5));
  assert.equal(canStand(grid, .1, 1.5), false);
  assert.equal(canStand(grid, 4.9, 1.5), false);
  assert.equal(canStand(grid, NaN, 2), false);
});
test("walk substeps cannot tunnel through a wall and slide without crossing it", () => {
  const p = moveWalker(grid, { x: 3.5, z: 2.5 }, 5, 0);
  assert.ok(p.x < 4.8); assert.equal(p.z, 2.5);
  const diagonal = moveWalker(grid, { x: 4.5, z: 2.5 }, 1, 2);
  assert.ok(diagonal.x < 4.8); assert.ok(Math.abs(diagonal.z - 4.5) < .001);
});
test("walk recovers from newly occupied hydration tile; no safe tile fails closed", () => {
  const safe = findWalkStart(grid, 5.5, 5.5)!;
  assert.ok(safe); assert.ok(canStand(grid, safe.x, safe.z));
  assert.equal(findWalkStart({ walkable: () => false }, 5.5, 5.5), null);
});
test("walk helpers preserve input and reject unreasonable movement", () => {
  const p = { x: 1.5, z: 1.5 };
  assert.deepEqual(moveWalker(grid, p, 1000, 0), p);
  moveWalker(grid, p, .5, 0); assert.deepEqual(p, { x: 1.5, z: 1.5 });
});
test("Escape leaves first person only when no composer, overlay or dialog is open", () => {
  assert.equal(walkEscapeAction({}), "leave");
  assert.equal(walkEscapeAction({ composerFocused: true }), "defer");
  assert.equal(walkEscapeAction({ overlayOpen: true }), "defer");
  assert.equal(walkEscapeAction({ dialogOpen: true }), "defer");
  assert.equal(walkEscapeAction({ alreadyHandled: true }), "defer");
  assert.equal(walkEscapeAction({ composerFocused: false, overlayOpen: false, dialogOpen: false, alreadyHandled: false }), "leave");
});
test("look drag ignores tap-sized pointer noise then arms after the slop", () => {
  const start = { x: 10, y: 10, originX: 10, originY: 10, armed: false };
  const tap = walkLookStep(start, 12, 11, 6);
  assert.equal(tap.armed, false); assert.equal(tap.yaw, 0); assert.equal(tap.pitch, 0);
  const drag = walkLookStep(start, 20, 10, 6);
  assert.equal(drag.armed, true); assert.ok(drag.yaw < 0);
  const follow = walkLookStep({ x: drag.x, y: drag.y, originX: drag.originX, originY: drag.originY, armed: true }, 22, 10, 6);
  assert.equal(follow.armed, true); assert.ok(follow.yaw < 0);
});
test("slow successive look moves accumulate from pointerdown until the slop arms", () => {
  let p: { x: number; y: number; originX: number; originY: number; armed: boolean } = { x: 0, y: 0, originX: 0, originY: 0, armed: false };
  let yaw = 0;
  for (let i = 0; i < 20; i++) {
    const step = walkLookStep(p, p.x + 2, 0, 6);
    p = { x: step.x, y: step.y, originX: step.originX, originY: step.originY, armed: step.armed };
    yaw += step.yaw;
  }
  assert.equal(p.armed, true);
  assert.ok(Math.abs(p.x - 40) < .001);
  assert.ok(yaw < 0);
});
test("inspector pause blocks movement even when chat is only visible", () => {
  assert.equal(walkMovementBlocked({}), false);
  assert.equal(walkMovementBlocked({ inspectorOpen: true }), true);
  assert.equal(walkMovementBlocked({ composerFocused: true }), true);
  assert.equal(walkMovementBlocked({ dialogOpen: true }), true);
});
test("label packing suppresses collisions, bounds count and retains focused selection", () => {
  const base = { x: 200, y: 150, width: 100, height: 28, priority: 0 };
  const items = [{ ...base, id: "a" }, { ...base, id: "selected", pinned: true }, { ...base, id: "offscreen", x: -80 }, { ...base, id: "b", x: 360 }];
  assert.deepEqual([...packLabels(items, 500, 500, 2)], ["selected", "b"]);
  assert.equal(packLabels(Array.from({ length: 40 }, (_, i) => ({ ...base, id: String(i), x: 50 + i * 110 })), 6000, 600, 6).size, 6);
});
test("all25 architectural kits are finite, batched and fit their saved footprints", () => {
  assert.equal(hubs.hubs.length, 25);
  for (const h of hubs.hubs) {
    const g = createArchitecture(h, h.id === "project-site"); g.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(g);
    assert.ok(Number.isFinite(bounds.max.y), h.id);
    assert.ok(bounds.min.x >= -h.w / 2 && bounds.max.x <= h.w / 2, h.id + " x footprint");
    assert.ok(bounds.min.z >= -h.h / 2 && bounds.max.z <= h.h / 2, h.id + " z footprint");
    assert.ok(bounds.max.y > 1.5, h.id + " substantial architecture");
    let meshes = 0, vertices = 0;
    g.traverse(o => { if (o instanceof THREE.Mesh) { meshes++; vertices += o.geometry.getAttribute("position").count; o.geometry.dispose(); } });
    assert.ok(meshes >= 3 && meshes <= 12, h.id + " material batch count " + meshes);
    assert.ok(vertices < 50000, h.id + " vertex budget " + vertices);
    g.traverse(o => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose(); });
  }
});
test("robots and aliens have actual volumes and articulated work arms", () => {
  for (const robot of [true, false]) {
    const g = createCharacter(robot, robot, 0x80f5cd); g.updateMatrixWorld(true);
    assert.ok(g.getObjectByName("working-arm"));
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    assert.ok(size.z > .3 && size.y > 1.5);
    assert.equal(g.children.some(c => c instanceof THREE.Sprite), false);
    g.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  }
});
