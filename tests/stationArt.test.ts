import { test } from "node:test";
import assert from "node:assert/strict";
import { hubSpritePath, kindSpritePath, stationTextureKeys } from "../src/game/stationArt.ts";

test("Claude silhouettes load from public/sprites by kind, with optional hub override", () => {
  assert.equal(kindSpritePath("code"), "/sprites/code.png");
  assert.equal(hubSpritePath("cursor"), "/sprites/hub-cursor.png");
  assert.deepEqual(stationTextureKeys("github", "code"), {
    hub: "sprite-hub-github",
    kind: "sprite-kind-code",
    painted: "b-github",
  });
  assert.equal(stationTextureKeys("well", "core").painted, "well-mark");
});
