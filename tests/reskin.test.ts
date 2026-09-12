import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createArchitecture } from "../src/game/architecture.ts";
import { NIGHT_LOOK, STATE_LEDS } from "../src/game/World3D.ts";
import hubs from "../src/content/hubs.json";

test("the deck matches the Blender plates: near-black slab, one cyan accent, gold only as tint", () => {
  // A67-VISUAL-001. Source of record is Eng's Track B pack at freeze rev61.
  // CAMERA-NOTES "Materials / set" is the whole spec: deck near-black #13111c,
  // "cyan hairline edge (#00e5ff one-accent only)", gold on Bank/GE alone.
  assert.equal(NIGHT_LOOK.deck, 0x13111c);
  assert.equal(NIGHT_LOOK.accent, 0x00e5ff);
  assert.equal(NIGHT_LOOK.gold, 0xffc873);
  assert.equal(NIGHT_LOOK.background, 0x0d0d13);
  // The deck must be lighter than the void it sits in, or the plates' framed
  // slab collapses back into the abyss read Zeref rejected.
  const lum = (c: number) => (c >> 16 & 255) * .2126 + (c >> 8 & 255) * .7152 + (c & 255) * .0722;
  assert.ok(lum(NIGHT_LOOK.deck) > lum(NIGHT_LOOK.background), "deck must read above the void");
});

test("one accent means one: no second hue survives in the 3D palette", () => {
  // The slice before this ran four accents at once — gold key, cyan rim, cyan
  // practical, mint core — plus a six-colour district ring palette, and called
  // it cyan-dominant. The plates retire all of it. This test exists because
  // "mostly one accent" is how you get back to four.
  const hue = (c: number) => {
    const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (!d) return 0;
    const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const accent = hue(NIGHT_LOOK.accent);
  assert.ok(accent >= 180 && accent <= 195, `accent hue ${accent.toFixed(0)} must be the plates' hairline cyan`);
  assert.ok(hue(NIGHT_LOOK.gold) >= 15 && hue(NIGHT_LOOK.gold) <= 45, "gold stays in the amber band");
  // Every saturated colour the world file names must be the accent or the two
  // gold tints. A saturated literal that is neither is a second accent.
  const source = readFileSync(new URL("../src/game/World3D.ts", import.meta.url), "utf8");
  // Three exemption classes, each for a different reason:
  //  - the accent itself, and the two warm tints the plates keep (Bank/GE
  //    glazing, and the neutral-warm Sun_Key);
  //  - the five state LEDs, which are semantics, not palette: a roster that
  //    cannot tell working from failed is broken, and one hue cannot say that;
  //  - character skin. Same call the retired-literal test below already makes
  //    about a cactus: a palette rule that repaints a person cyan is a bug in
  //    the rule. Zeref is the only character in this file — body, skin and the
  //    warm floor marker that says which one on the map is you.
  const allowed = new Set([
    "00e5ff", "ffc873", "fdfbff",
    ...Object.values(STATE_LEDS).map(c => c.toString(16).padStart(6, "0")),
    "c69c51", "e6c48c", "f0cd85",
  ]);
  for (const [, hex] of source.matchAll(/0x([0-9a-f]{6})\b/g)) {
    const c = parseInt(hex, 16);
    const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 60) continue;
    assert.ok(allowed.has(hex), `0x${hex} is a second accent; the plates allow one`);
  }
});

test("the map frame and grid pitch come from the plates, and footprints are untouched", () => {
  const source = readFileSync(new URL("../src/game/World3D.ts", import.meta.url), "utf8");
  // CAMERA-NOTES: "cyan 8u grid". 96x72 at 8u is the 12x9 ruling in the plate.
  assert.match(source, /const GRID_STEP = 8;/);
  assert.match(source, /GRID_SPAN \/ GRID_STEP/);
  // Both campus plates frame exactly the saved extent. The frame is drawn from
  // MAP_W/MAP_H, never from literals, so it can never disagree with the freeze.
  assert.match(source, /new THREE\.LineLoop\(/);
  assert.match(source, /new THREE\.Vector3\(MAP_W, \.22, MAP_H\)/);
  // The pools and pad rings the plates do not have must stay gone.
  assert.doesNotMatch(source, /practicalPool/);
  assert.doesNotMatch(source, /NIGHT_LOOK\.practical/);
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
    // A67-VISUAL-001 retired the whole multi-accent cyan set for the plates'
    // single #00e5ff. These three were the previous palette's rim, practical
    // and mint-core; every one of them shipped live, so they are exactly the
    // kind of literal that survives a partial sweep in a file nobody reopened.
    "2be8ff", "33e8ff", "39ffd4",
    "0c131c", "070c14", "0a1018", // navy deck/tile band, now violet-black
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
    assert.match(source, /--mint: #00e5ff/, `${sheet} must resolve the shared cyan accent`);
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
