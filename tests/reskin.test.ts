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

test("no source file still carries a colour from an abandoned palette", () => {
  // Written after shipping the same partial sweep three times: campus.css was
  // retinted while style.css, experience.css, mobile-clarity.css and two Phaser
  // canvases kept the old greens, and a SELECTED station chip stayed lime on a
  // cyan campus. Reviewers caught each round; a grep would have caught all of
  // them at once. Add any retired literal here when a palette changes.
  const retired = [
    "83f1d2", "80f5cd", // mint accents from the blue-hour/original decks
    "bef264", "76b900", "8fe049", "d8f0c4", // lime family
    "3a4a38", "4a5540", "0b100c", "10180f", "16201a", // green/olive chrome
    "13352f", "102b29", "153c3d", "0d2a22", // green-black text-on-accent
    "afffe8", "b7ffe9", // mint button hovers
  ];
  // NOTE, and it is the important part: a blocklist only catches what someone
  // remembered to list, which is why reviewers kept finding one more. A sweep
  // of the tree turns up ~50 further green-dominant literals, almost all of
  // them in style.css and experience.css — an intact mint design system the
  // cyan campus was bolted onto. They are deliberately NOT listed here.
  // Some are semantic (status greens that pair against the error red) and some
  // are illustrative (a cactus, a character's skin); recolouring them by hue
  // would destroy meaning and paint a plant cyan. Retiring the rest is the
  // shell decision, not a find-and-replace.
  // World3D and architecture were missing from this list on the first cut —
  // the two biggest colour-carrying files in the tree, omitted from the very
  // test written to stop partial sweeps. Caught in review, not by me.
  const files = [
    "../src/style.css", "../src/ui/campus.css", "../src/ui/experience.css",
    "../src/ui/mobile-clarity.css", "../src/ui/hud.ts", "../src/game/HubScene.ts",
    "../src/game/fallback.ts", "../src/game/textures.ts",
    "../src/game/World3D.ts", "../src/game/architecture.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").toLowerCase();
    for (const dead of retired) {
      assert.ok(!source.includes(dead), `${file} still carries retired colour #${dead}`);
    }
  }
});

test("every stylesheet resolves the same accent; layout anchors stay", () => {
  // Three files each declared their own --mint and the cascade picked a winner,
  // which is how a lime chip survived on a cyan campus.
  for (const sheet of ["../src/style.css", "../src/ui/campus.css", "../src/ui/experience.css"]) {
    const source = readFileSync(new URL(sheet, import.meta.url), "utf8");
    assert.match(source, /--mint: #2be8ff/, `${sheet} must resolve the shared cyan accent`);
  }
  const css = readFileSync(new URL("../src/ui/campus.css", import.meta.url), "utf8");
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
