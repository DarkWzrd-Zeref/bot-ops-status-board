import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createArchitecture } from "../src/game/architecture.ts";
import { NIGHT_LOOK } from "../src/game/World3D.ts";
import hubs from "../src/content/hubs.json";

test("night look matches the visual-only spec (dusk gold key, teal rim, forest fog)", () => {
  assert.equal(NIGHT_LOOK.background, 0x0b100c);
  assert.equal(NIGHT_LOOK.fog, 0x0a140e);
  assert.equal(NIGHT_LOOK.key, 0xffd5a6);
  assert.equal(NIGHT_LOOK.rim, 0x43b7d5);
});

test("HUD night tokens retint colors only; layout anchors stay", () => {
  const css = readFileSync(new URL("../src/ui/campus.css", import.meta.url), "utf8");
  assert.match(css, /--mint: #bef264/);
  assert.match(css, /--line: #3a4a38/);
  assert.match(css, /--header: 64px/);
  assert.match(css, /#quick-chat \{[^}]*left: 50%/s);
  assert.doesNotMatch(css, /hud\.ts/);
});

test("2D night tiles keep the same Phaser keys", () => {
  const src = readFileSync(new URL("../src/game/textures.ts", import.meta.url), "utf8");
  for (const key of ["tile-sand", "tile-sand2", "tile-path", "tile-pad", "tile-plaza", "tile-water", "tile-fence"]) {
    assert.match(src, new RegExp(key.replace("-", "\\-")));
  }
  assert.match(src, /paintTile\(scene, "tile-sand"/);
  assert.doesNotMatch(src, /hubs\.json/);
});

test("kit materials are wetter glass/stone; kit shapes stay inside footprints", () => {
  const sample = hubs.hubs.find(h => h.id === "cursor")!;
  const g = createArchitecture(sample, true);
  g.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(g);
  assert.ok(bounds.min.x >= -sample.w / 2 && bounds.max.x <= sample.w / 2);
  assert.ok(bounds.min.z >= -sample.h / 2 && bounds.max.z <= sample.h / 2);
  const mats: THREE.MeshStandardMaterial[] = [];
  g.traverse(o => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) mats.push(o.material);
  });
  assert.ok(mats.length >= 3);
  assert.ok(mats.some(m => m.emissiveIntensity >= .8));
  assert.ok(mats.every(m => m.roughness <= .55));
  assert.ok(mats.every(m => m.metalness <= .5));
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
});
