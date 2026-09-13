import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-ops-"));
process.env.AREA67_TEST = "1";
process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");

const registryRaw = readFileSync(new URL("../src/content/skill-registry.json", import.meta.url), "utf8");

const BOX_SKILLS = [
  "who-gets-this-job", "goal-syllabus-queue", "order-book-audit", "done-means-artifact",
  "working-now-queue-next", "interrupt-triage", "resume-from-parked", "right-to-left-finish",
  "lane-handoff-packet", "pc-hand-off-file", "reference-lock-consistency", "memory-upload",
  "memory-download", "session-close-system-summary", "routines", "code-changes", "box-desktop", "dream-loop",
];
const LANE_SKILLS = [
  "discord-agentmail-login", "bull-wizards-art-pipeline", "hard-drive-controller-skin-pack",
  "blender-controller-deck", "controller-skin-decals", "ue5-import-controller-skin-pngs",
];
const ARSENAL_REPOS = [
  "dream-loop", "hub-app-mcps", "hub-judgment", "hub-quota", "bot-ops-status-board", "media-money-printer",
];
const REMOVED_FIXTURES = ["discord-sync", "firecrawl-research", "cursor-pr", "rogue-exfil"];

await test("/api/ops/skills stamps exactly the SoT Box + Lane skill ids", async () => {
  const res = await app.request("/api/ops/skills");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.stamp, "AM-STAMPED");
  assert.equal(data.stampedBy, "account-manager");
  const ids = data.skills.map((s: { id: string }) => s.id);
  assert.deepEqual([...ids].sort(), [...BOX_SKILLS, ...LANE_SKILLS].sort());
});

await test("removed fixtures and example repos are gone from the map", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const ids = new Set(data.skills.map((s: { id: string }) => s.id));
  for (const fixture of REMOVED_FIXTURES) assert.equal(ids.has(fixture), false, `fixture ${fixture} still present`);
  assert.doesNotMatch(registryRaw, /example\.(com|org)/);
  assert.doesNotMatch(JSON.stringify(data), /example\.(com|org)/);
});

await test("skills carry their Box/Lane category and columns; owner/runner are GAP without invention", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  for (const s of data.skills) {
    assert.ok(s.category === "Box" || s.category === "Lane", `${s.id} missing category`);
    assert.ok("primaryOwner" in s && "bestRunner" in s);
    assert.equal(typeof s.guidePath, "string");
  }
  // Nothing is stamped with an owner/runner yet: soft-hold invent keeps them GAP.
  assert.ok(data.skills.every((s: { primaryOwner: unknown; bestRunner: unknown }) => s.primaryOwner === null && s.bestRunner === null));
  const dream = data.skills.find((s: { id: string }) => s.id === "dream-loop");
  assert.equal(dream.guidePath, "docs/dream-loop/");
  assert.equal(dream.repo.name, "dream-loop");
  assert.equal(dream.repo.org, "DarkWzrd-Zeref");
});

await test("arsenal lists exactly the SoT DarkWzrd-Zeref repos", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  for (const repo of data.arsenal) assert.equal(repo.org, "DarkWzrd-Zeref");
  assert.deepEqual(data.arsenal.map((r: { name: string }) => r.name).sort(), [...ARSENAL_REPOS].sort());
  const dream = data.arsenal.find((r: { name: string }) => r.name === "dream-loop");
  assert.ok(dream.skills.includes("dream-loop"));
});

await test("turbo-machine is recorded as an alias GAP with no invented URL", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const printer = data.arsenal.find((r: { name: string }) => r.name === "media-money-printer");
  assert.equal(printer.alias, "turbo-machine");
  assert.equal(printer.aliasUrl, null);
  assert.doesNotMatch(JSON.stringify(data), /DarkWzrd-Zeref\/turbo-machine/);
});

await test("/ops/skills serves an openable HTML page wired to the registry API", async () => {
  const res = await app.request("/ops/skills");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Skill registration map/);
  assert.match(html, /fetch\("\/api\/ops\/skills"\)/);
  assert.match(html, /Back to command deck/);
});
