import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStationArtManifest,
  hubSpritePath,
  kindSpritePath,
  resetStationArtCatalog,
  stationTextureKeys,
} from "../src/game/stationArt.ts";

test("kind sprites use hashed /sprites/stations/<kind>.<sha12>.png, not unversioned /sprites/{kind}.png", () => {
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

test("Claude station-art manifest overrides radio hashes and unknown kinds stay procedural", () => {
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
