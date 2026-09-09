import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources = JSON.parse(readFileSync(new URL("../public/sources.json", import.meta.url), "utf8"));
const connect = readFileSync(new URL("../public/connect.html", import.meta.url), "utf8");
const publicJson = JSON.stringify(sources);

test("public sources snapshot names only the public hub repo and does not publish private inventory", () => {
  assert.equal(sources.kind, "snapshot");
  assert.ok(sources.asOf);
  assert.equal(sources.publicGithub.name, "bot-ops-status-board");
  assert.equal(sources.publicGithub.hubStation, "project-area67");
  assert.equal(sources.unplacedCatalogTypes.length, 18);
  assert.equal(sources.onMap.length, 7);
  assert.equal(sources.githubRepos, undefined);
  assert.equal(sources.driveCanonical, undefined);
  assert.doesNotMatch(publicJson, /docs\.google\.com/);
  assert.doesNotMatch(publicJson, /drive\.google\.com/);
  assert.doesNotMatch(publicJson, /reserve-os/);
  assert.doesNotMatch(publicJson, /hub-quota/);
  assert.doesNotMatch(publicJson, /HARD-DRIVE/);
});

test("connect.html does not embed private repo names or Drive file URLs", () => {
  assert.doesNotMatch(connect, /docs\.google\.com/);
  assert.doesNotMatch(connect, /drive\.google\.com/);
  assert.doesNotMatch(connect, /hub-quota|reserve-os|HARD-DRIVE|atlas-apex/);
  assert.match(connect, /fetch\("\/sources\.json"\)/);
});
