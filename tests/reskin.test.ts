import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createArchitecture } from "../src/game/architecture.ts";
import { NIGHT_LOOK } from "../src/game/World3D.ts";
import hubs from "../src/content/hubs.json";

test("cyberpunk look is a lit navy field, cyan-dominant, gold as a rare accent, mint-teal energy core", () => {
  // Slice 1-2 chased the Grok Imagine stills into a black-then-violet void;
  // Zeref rejected both and handed a reference: a teal/cyan holographic
  // command deck with gold reserved for Bank/GE and a mint-teal Well core.
  assert.equal(NIGHT_LOOK.background, 0x05080f);
  assert.equal(NIGHT_LOOK.fog, 0x0a1620);
  assert.equal(NIGHT_LOOK.key, 0xffc873);
  assert.equal(NIGHT_LOOK.rim, 0x33e8ff);
  assert.equal(NIGHT_LOOK.practical, 0x2be8ff);
  assert.equal(NIGHT_LOOK.accent, 0x39ffd4);
});

test("the palette holds its cyberpunk hue budget: cyan dominant, gold rare, mint-teal core", () => {
  const hue = (c: number) => {
    const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (!d) return 0;
    const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const key = hue(NIGHT_LOOK.key);
  assert.ok(key >= 15 && key <= 45, `key hue ${key.toFixed(0)} must sit in the rare-gold amber band 15-45`);
  for (const cool of [NIGHT_LOOK.rim, NIGHT_LOOK.practical]) {
    const h = hue(cool);
    assert.ok(h >= 175 && h <= 200, `dominant light hue ${h.toFixed(0)} must sit in the electric-cyan band 175-200`);
  }
  const accent = hue(NIGHT_LOOK.accent);
  assert.ok(accent >= 150 && accent <= 175, `accent hue ${accent.toFixed(0)} must sit in the mint-teal band 150-175`);
});

test("HUD cyberpunk tokens retint colors only; layout anchors stay", () => {
  const css = readFileSync(new URL("../src/ui/campus.css", import.meta.url), "utf8");
  assert.match(css, /--mint: #2be8ff/);
  assert.match(css, /--line: #1c3a44/);
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
