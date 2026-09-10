import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLB_LIP, disposeObject3D, glbFitsFootprint, hubGlbPath, rejectLoadedGlb, seatGlbInFootprint } from "../src/game/stationModels.ts";
import hubs from "../src/content/hubs.json";

test("Blender GLB paths are hub-scoped and never Claude kind hashes", () => {
  assert.equal(hubGlbPath("cursor"), "/models/stations/hub-cursor.glb");
  assert.equal(hubGlbPath("well"), "/models/stations/hub-well.glb");
  const world = readFileSync(new URL("../src/game/World3D.ts", import.meta.url), "utf8");
  assert.match(world, /hubGlbPath/);
  assert.match(world, /GLTFLoader/);
  assert.match(world, /rejectLoadedGlb/);
  assert.doesNotMatch(world, /kind\.\w+\.glb/);
});

test("Imagine drop map covers all 25 hubs and never targets hashed kind PNGs", () => {
  const drop = JSON.parse(readFileSync(new URL("../scripts/imagine-drop.json", import.meta.url), "utf8"));
  assert.equal(drop.stations.length, 25);
  assert.equal(hubs.hubs.length, 25);
  const ids = new Set(drop.stations.map((s: { id: string }) => s.id));
  for (const h of hubs.hubs) assert.ok(ids.has(h.id), h.id);
  for (const row of drop.stations) {
    assert.match(row.hubPng, /^hub-.+\.png$/);
    assert.doesNotMatch(row.hubPng, /\.[a-f0-9]{12}\.png$/);
  }
  const seater = readFileSync(new URL("../scripts/seat-imagine-stills.mjs", import.meta.url), "utf8");
  assert.match(seater, /colorkey=0x000000/);
  assert.doesNotMatch(seater, /kind\.\w+\.png/);
});

test("oversized Blender mesh is uniformly scaled into the saved footprint; junk is rejected", () => {
  const big = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8));
  assert.equal(seatGlbInFootprint(big, 4, 3), true);
  const size = new THREE.Box3().setFromObject(big).getSize(new THREE.Vector3());
  assert.ok(glbFitsFootprint(size, 4, 3, GLB_LIP));
  const empty = new THREE.Group();
  assert.equal(seatGlbInFootprint(empty, 4, 3), false);
});

test("rejected or late GLB loads dispose geometry, materials and owned textures; keep is a no-op", () => {
  let geo = 0, mat = 0, tex = 0;
  const map = new THREE.Texture();
  map.dispose = () => { tex++; };
  const material = new THREE.MeshStandardMaterial({ map });
  material.dispose = () => { mat++; };
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.dispose = () => { geo++; };
  const mesh = new THREE.Mesh(geometry, material);
  assert.equal(rejectLoadedGlb(mesh, false), true);
  assert.equal(geo, 1);
  assert.equal(mat, 1);
  assert.equal(tex, 1);
  const kept = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const before = kept.geometry.uuid;
  assert.equal(rejectLoadedGlb(kept, true), false);
  assert.equal(kept.geometry.uuid, before);
  disposeObject3D(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })));
});
