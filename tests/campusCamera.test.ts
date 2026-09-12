import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { fitCampusCamera, MapClickGesture, type CampusPlot, type CampusViewport } from "../src/game/campusCamera.ts";

function assertFits(plots: CampusPlot[], viewport: CampusViewport, direction: THREE.Vector3) {
  const fit = fitCampusCamera(plots, viewport, direction);
  const aspect = viewport.width / viewport.height;
  const camera = new THREE.OrthographicCamera(-17 * aspect, 17 * aspect, 17, -17, .1, 400);
  camera.position.copy(fit.target).addScaledVector(direction.clone().normalize(), 100);
  camera.lookAt(fit.target); camera.zoom = fit.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  for (const p of plots) for (const x of [p.x, p.x + p.width]) for (const y of [0, p.height ?? 4.5]) for (const z of [p.z, p.z + p.depth]) {
    const screen = new THREE.Vector3(x, y, z).project(camera);
    const px = (screen.x + 1) * viewport.width / 2, py = (1 - screen.y) * viewport.height / 2;
    assert.ok(px >= (viewport.left ?? 0) - .01 && px <= viewport.width - (viewport.right ?? 0) + .01, `x=${px}`);
    assert.ok(py >= (viewport.top ?? 0) - .01 && py <= viewport.height - (viewport.bottom ?? 0) + .01, `y=${py}`);
  }
  return fit;
}

test("occupied campus fits desktop between open panels without the old .28 overview cap", () => {
  const fit = assertFits([{ x: 18, z: 10, width: 5, depth: 4 }, { x: 42, z: 31, width: 4, depth: 3 }],
    { width: 1440, height: 836, left: 330, right: 400, top: 90, bottom: 110 }, new THREE.Vector3(25, 30, 25));
  assert.ok(fit.zoom > .28);
  assert.ok(fit.minZoom < fit.zoom);
});

test("expanded campus fits narrow phone and top-down, including tall buildings", () => {
  const plots = [{ x: 2, z: 5, width: 5, depth: 5, height: 9 }, { x: 83, z: 63, width: 6, depth: 4 }];
  for (const direction of [new THREE.Vector3(25, 30, 25), new THREE.Vector3(0, 90, .1)]) {
    assertFits(plots, { width: 390, height: 784, left: 24, right: 24, top: 90, bottom: 150 }, direction);
  }
});

test("empty or invalid plots still produce finite fallback camera framing", () => {
  for (const plots of [[], [{ x: NaN, z: 1, width: 3, depth: 3 }]]) {
    const fit = fitCampusCamera(plots, { width: 0, height: 0 }, new THREE.Vector3());
    assert.ok(Number.isFinite(fit.zoom) && fit.zoom > 0);
    assert.ok(fit.target.toArray().every(Number.isFinite));
  }
});

test("true left click selects; a dragged loop back to its origin cannot place or select", () => {
  const pointer = new MapClickGesture();
  pointer.down(1, 10, 10, 0); assert.equal(pointer.up(1, 12, 12, 0), true);
  pointer.down(1, 10, 10, 0); pointer.move(1, 40, 40); pointer.move(1, 10, 10);
  assert.equal(pointer.up(1, 10, 10, 0), false);
  pointer.down(1, 10, 10, 2); assert.equal(pointer.up(1, 10, 10, 2), false);
  assert.equal(pointer.up(42, 10, 10, 0), false);
});

test("pinch, canceled pointers, and focus loss never synthesize clicks", () => {
  const pointer = new MapClickGesture();
  pointer.down(1, 10, 10, 0); pointer.down(2, 20, 20, 0);
  assert.equal(pointer.up(1, 10, 10, 0), false); assert.equal(pointer.up(2, 20, 20, 0), false);
  pointer.down(1, 10, 10, 0); pointer.down(2, 20, 20, 0); pointer.cancel(2);
  assert.equal(pointer.up(1, 10, 10, 0), false);
  pointer.down(1, 10, 10, 0); pointer.cancel(); assert.equal(pointer.up(1, 10, 10, 0), false);
  pointer.down(1, 10, 10, 0); assert.equal(pointer.up(1, 10, 10, 0), true);
});

test("cyberpunk ground fixes the coplanar deck, retains semantic terrain, and sits on a lit navy field", () => {
  const source = readFileSync(new URL("../src/game/World3D.ts", import.meta.url), "utf8");
  assert.match(source, /MAP_W, \.12, MAP_H, 0x070c14, 0, \.45/);
  assert.match(source, /makeTranslation\(x \+ \.5, \.14, y \+ \.5\)/);
  assert.match(source, /batch\.castShadow = false/);
  // The photographic backdrop is retired: it fights the art direction and
  // lights nothing, whatever color the field behind it is.
  assert.doesNotMatch(source, /area67-bluehour-panorama\.png/);
  assert.match(source, /parent\.style\.background = "#05080f"/);
  assert.match(source, /this\.scene\.background = null/);
  assert.match(source, /setClearColor\(NIGHT_LOOK\.background, 0\)/);
  assert.match(source, /LEFT: THREE\.MOUSE\.PAN/);
  assert.doesNotMatch(source, /Math\.min\(\.28/);
});

test("the cyberpunk rig is ambient-lit, with practicals still carrying real punch", () => {
  const source = readFileSync(new URL("../src/game/World3D.ts", import.meta.url), "utf8");
  const hemi = source.match(/HemisphereLight\(NIGHT_LOOK\.hemiSky, NIGHT_LOOK\.hemiGround, ([\d.]+)\)/);
  assert.ok(hemi, "hemisphere light should be built from NIGHT_LOOK");
  const ambient = parseFloat(hemi![1]);
  // Slice 1-2's invariant was "ambient must stay low." That produced the void
  // look Zeref rejected. The reversal: ambient is meant to light the campus,
  // so this only guards against going pitch dark again, not against flooding.
  assert.ok(ambient >= 1.5, `ambient ${ambient} is too low for a lit cyberpunk field`);
  // Practicals still need to read as neon pools/windows, not just tint the fill.
  const practical = source.match(/opacity: \.(\d+),/);
  assert.ok(practical, "each station should carry a practical pool");
  assert.match(source, /blending: THREE\.AdditiveBlending/);
  assert.match(source, /background: 0x05080f/);
  // Named so a seated GLB swapping the "kit" child never takes the light with it.
  assert.match(source, /pool\.name = "practical"/);
});
