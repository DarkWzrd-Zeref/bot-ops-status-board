import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources = JSON.parse(readFileSync(new URL("../public/sources.json", import.meta.url), "utf8"));

test("sources.json lists every DarkWzrd-Zeref repo and flags the 16 missing project buildings", () => {
  assert.equal(sources.githubRepos.length, 17);
  const onMap = sources.githubRepos.filter((r: { hubStation: string | null }) => r.hubStation);
  assert.deepEqual(onMap.map((r: { name: string }) => r.name), ["bot-ops-status-board"]);
  assert.equal(sources.githubRepos.filter((r: { hubStation: string | null }) => !r.hubStation).length, 16);
  for (const repo of sources.githubRepos) {
    assert.match(repo.url, /^https:\/\/github.com\/DarkWzrd-Zeref\//);
  }
});

test("sources.json points at canonical Drive ledgers and does not treat Goals forks as live", () => {
  const names = sources.driveCanonical.map((f: { name: string }) => f.name);
  assert.ok(names.includes("Goals and Task"));
  assert.ok(names.includes("Bot Passport"));
  assert.ok(names.includes("HUB — App MCP Shortcuts"));
  const forks = sources.driveIgnoreForks.map((f: { name: string }) => f.name);
  assert.ok(forks.includes("HUB — Goals and Tasks"));
  assert.ok(forks.includes("GOALS AND TASKS"));
  assert.equal(sources.unplacedCatalog.length, 18);
  assert.equal(sources.placedBuildings.length, 7);
});
