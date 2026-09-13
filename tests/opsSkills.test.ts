import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-ops-"));
process.env.AREA67_TEST = "1";
process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");

const skillsJson = JSON.parse(readFileSync(new URL("../src/content/skills.json", import.meta.url), "utf8")) as { skills: { id: string; wantedBy: string[] }[] };
const registry = JSON.parse(readFileSync(new URL("../src/content/skill-registry.json", import.meta.url), "utf8")) as { skills: { id: string; repo: { org: string } }[] };

await test("/api/ops/skills returns the AM-STAMPED map with the four required columns", async () => {
  const res = await app.request("/api/ops/skills");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.stamp, "AM-STAMPED");
  assert.equal(data.stampedBy, "account-manager");
  assert.ok(Array.isArray(data.skills) && data.skills.length > 0);
  for (const s of data.skills) {
    assert.equal(typeof s.id, "string");
    assert.ok("primaryOwner" in s);
    assert.ok("bestRunner" in s);
    assert.equal(typeof s.guidePath, "string");
  }
});

await test("every skills.json id is stamped in the registry (map stays grounded)", () => {
  const registryIds = new Set(registry.skills.map(s => s.id));
  for (const s of skillsJson.skills) assert.ok(registryIds.has(s.id), `skills.json id ${s.id} missing from AM stamp`);
});

await test("owners and runners resolve to real seats with display names", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const discord = data.skills.find((s: { id: string }) => s.id === "discord-sync");
  assert.equal(discord.primaryOwner.id, "grok-am-a");
  assert.equal(discord.primaryOwner.name, "Grok Twin A");
  assert.equal(discord.bestRunner.id, "grok-am-b");
  const cursorPr = data.skills.find((s: { id: string }) => s.id === "cursor-pr");
  assert.equal(cursorPr.primaryOwner.id, "engineer");
  assert.equal(cursorPr.bestRunner.id, "cursor-ultra");
  const board = data.skills.find((s: { id: string }) => s.id === "bot-ops-status-board");
  assert.equal(board.primaryOwner.name, "Zeref");
});

await test("blocked fixtures keep null owner/runner and a blocked flag", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const rogue = data.skills.find((s: { id: string }) => s.id === "rogue-exfil");
  assert.equal(rogue.primaryOwner, null);
  assert.equal(rogue.bestRunner, null);
  assert.equal(rogue.blocked, true);
});

await test("arsenal lists only DarkWzrd-Zeref repos and dedupes by repo", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  assert.ok(data.arsenal.length >= 2);
  for (const repo of data.arsenal) assert.equal(repo.org, "DarkWzrd-Zeref");
  const names = data.arsenal.map((r: { name: string }) => r.name).sort();
  assert.deepEqual(names, ["bot-ops-status-board", "dream-loop"]);
  const dream = data.arsenal.find((r: { name: string }) => r.name === "dream-loop");
  assert.ok(dream.skills.includes("dream-loop"));
  assert.ok(dream.url.startsWith("https://github.com/DarkWzrd-Zeref/"));
});

await test("/ops/skills serves an openable HTML page wired to the registry API", async () => {
  const res = await app.request("/ops/skills");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Skill registration map/);
  assert.match(html, /fetch\("\/api\/ops\/skills"\)/);
  assert.match(html, /Back to command deck/);
});
