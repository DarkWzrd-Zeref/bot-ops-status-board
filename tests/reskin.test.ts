import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createArchitecture } from "../src/game/architecture.ts";
import { NIGHT_LOOK } from "../src/game/World3D.ts";
import hubs from "../src/content/hubs.json";

test("classified-night look is a black void, warm key and a restrained cool rim", () => {
  // Values measured from the 25-still Grok Imagine set on 2026-09-11.
  assert.equal(NIGHT_LOOK.background, 0x000000);
  assert.equal(NIGHT_LOOK.fog, 0x04060a);
  assert.equal(NIGHT_LOOK.key, 0xffc98a);
  assert.equal(NIGHT_LOOK.rim, 0x4a86a8);
  assert.equal(NIGHT_LOOK.practical, 0xffb163);
  assert.equal(NIGHT_LOOK.accent, 0x8fe049);
});

test("the palette holds its measured hue budget: warm key and practical, cool rim, lime accent", () => {
  const hue = (c: number) => {
    const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (!d) return 0;
    const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (const warm of [NIGHT_LOOK.key, NIGHT_LOOK.practical]) {
    const h = hue(warm);
    assert.ok(h >= 15 && h <= 45, `warm light hue ${h.toFixed(0)} must sit in the amber band 15-45`);
  }
  const rim = hue(NIGHT_LOOK.rim);
  assert.ok(rim >= 195 && rim <= 255, `rim hue ${rim.toFixed(0)} must sit in the cool band 195-255`);
  const accent = hue(NIGHT_LOOK.accent);
  assert.ok(accent >= 75 && accent <= 165, `accent hue ${accent.toFixed(0)} must sit in the lime band 75-165`);
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
