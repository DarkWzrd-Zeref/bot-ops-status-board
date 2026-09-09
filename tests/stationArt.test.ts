import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyStationArtManifest,
  hubSpritePath,
  kindSpritePath,
  resetStationArtCatalog,
  stationSeatLayout,
  stationTextureKeys,
} from "../src/game/stationArt.ts";

test("HubScene keeps district camera controls and does not stretch sprites to the tile box", () => {
  const src = readFileSync(new URL("../src/game/HubScene.ts", import.meta.url), "utf8");
  assert.match(src, /area67-district/);
  assert.match(src, /area67-camera/);
  assert.match(src, /DISTRICTS/);
  assert.match(src, /seatStationImage/);
  assert.doesNotMatch(src, /setDisplaySize\(hub\.w \* TILE, hub\.h \* TILE\)/);
});

test("BootScene loads hub-<id>.png first so Imagine stills seat without touching kind hashes", () => {
  const src = readFileSync(new URL("../src/game/fallback.ts", import.meta.url), "utf8");
  assert.match(src, /hubSpritePath/);
  assert.match(src, /sprite-hub-/);
  assert.match(src, /kindSpritePath/);
  assert.doesNotMatch(src, /hubs\.json/);
});

test("hub sprites prefer hub-<id>.png over Claude kind hashes", () => {
  resetStationArtCatalog();
  assert.equal(kindSpritePath("code"), "/sprites/stations/code.0c749d31c143.png");
  assert.equal(kindSpritePath("project"), "/sprites/stations/project.263ee06bbed6.png");
  assert.equal(kindSpritePath("ecosystem"), null);
  assert.equal(hubSpritePath("cursor"), "/sprites/stations/hub-cursor.png");
  assert.deepEqual(stationTextureKeys("github", "code"), {
    hub: "sprite-hub-github",
    kind: "sprite-kind-code",
    painted: "b-github",
  });
  assert.equal(stationTextureKeys("well", "core").painted, "well-mark");
});

test("Claude entries[].src manifest is the live Drive contract", () => {
  resetStationArtCatalog();
  applyStationArtManifest({
    version: 1,
    entries: [{ kind: "code", src: "/sprites/stations/code.0c749d31c143.png", sha256: "0c749d31c1432297" }],
  });
  assert.equal(kindSpritePath("code"), "/sprites/stations/code.0c749d31c143.png");
  assert.equal(kindSpritePath("ecosystem"), null);
});

test("sprite seating uses uniform groundQuad scale; painted boxes still fill the tile footprint", () => {
  resetStationArtCatalog();
  applyStationArtManifest({
    version: 1,
    entries: [{
      kind: "code",
      src: "/sprites/stations/code.0c749d31c143.png",
      pixelWidth: 320,
      pixelHeight: 320,
      anchorX: 0.5,
      anchorY: 0.60345,
      groundBounds: [0.09653, 0.3705, 0.90347, 0.83639],
    }],
  });
  const sprite = stationSeatLayout({
    painted: false,
    pixelWidth: 320,
    pixelHeight: 320,
    footprintWidth: 128,
    footprintHeight: 96,
    kind: "code",
  });
  assert.equal(sprite.painted, false);
  assert.equal(sprite.originX, 0.5);
  assert.equal(sprite.originY, 0.60345);
  assert.ok(Math.abs(sprite.displayWidth / sprite.displayHeight - 1) < 1e-6);
  assert.notEqual(sprite.displayWidth, 128);
  assert.notEqual(sprite.displayHeight, 96);
  const painted = stationSeatLayout({
    painted: true,
    pixelWidth: 128,
    pixelHeight: 96,
    footprintWidth: 128,
    footprintHeight: 96,
    kind: "code",
  });
  assert.equal(painted.displayWidth, 128);
  assert.equal(painted.displayHeight, 96);
});

test("legacy kinds/stations manifest still overrides radio hashes", () => {
  resetStationArtCatalog();
  applyStationArtManifest({
    kinds: { code: { sha256: "abcdef1234569999" }, ecosystem: { file: "ecosystem.deadbeefcafe.png" } },
  });
  assert.equal(kindSpritePath("code"), "/sprites/stations/code.abcdef123456.png");
  assert.equal(kindSpritePath("ecosystem"), "/sprites/stations/ecosystem.deadbeefcafe.png");
  assert.equal(kindSpritePath("guard"), "/sprites/stations/guard.104077214401.png");
  resetStationArtCatalog();
  assert.equal(kindSpritePath("code"), "/sprites/stations/code.0c749d31c143.png");
});

test("malformed geometry cannot crash or stretch decoded art and remote paths are ignored", () => {
  resetStationArtCatalog();
  applyStationArtManifest({ entries: [{ kind: "code", src: "https://unapproved.example/art.png", groundQuad: [null, null, null, null] } as never] });
  assert.equal(kindSpritePath("code"), "/sprites/stations/code.0c749d31c143.png");
  applyStationArtManifest({ entries: [{ kind: "code", src: "/sprites/stations/test.png", anchorX: 900, anchorY: -2, pixelWidth: 9999, pixelHeight: 1, groundBounds: ["bad", 0, 1, 1], groundQuad: [null, null, null, null] } as never] });
  const layout = stationSeatLayout({ painted: false, kind: "code", pixelWidth: 320, pixelHeight: 320, footprintWidth: 128, footprintHeight: 96 });
  assert.equal(layout.originX, 0.5);
  assert.equal(layout.originY, 0.5);
  assert.equal(layout.displayWidth, layout.displayHeight);
  assert.ok(Number.isFinite(layout.displayWidth));
});
