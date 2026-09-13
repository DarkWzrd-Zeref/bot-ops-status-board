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
  assert.ok(typeof data.stampedBy === "string" && data.stampedBy.length > 0);
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

await test("every skill carries Box/Lane category, a copied owner/runner label, and a guide path", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  for (const s of data.skills) {
    assert.ok(s.category === "Box" || s.category === "Lane", `${s.id} missing category`);
    // Owner/runner/guide are verbatim stamp label strings (or the GAP marker) — never blank or seat-wrapped objects.
    assert.ok(typeof s.primaryOwner === "string" && s.primaryOwner.length > 0, `${s.id} owner empty`);
    assert.ok(typeof s.bestRunner === "string" && s.bestRunner.length > 0, `${s.id} runner empty`);
    assert.ok(typeof s.guidePath === "string" && s.guidePath.length > 0, `${s.id} guide empty`);
    assert.notEqual(s.guidePath, "same", `${s.id} guide is an unresolved placeholder`);
  }
});

await test("Box skills use the GUIDE-*-who-model-how naming pattern; memory upload/download share one", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const box = data.skills.filter((s: { category: string }) => s.category === "Box");
  for (const s of box) assert.match(s.guidePath, /^GUIDE-.+-who-model-how-2026-09-13\.md$/, `${s.id} guide off-pattern`);
  const memUp = data.skills.find((s: { id: string }) => s.id === "memory-upload");
  const memDown = data.skills.find((s: { id: string }) => s.id === "memory-download");
  assert.equal(memUp.guidePath, "GUIDE-memory-upload-download-who-model-how-2026-09-13.md");
  assert.equal(memDown.guidePath, memUp.guidePath);
});

await test("owner/runner labels are copied from the AM stamp examples", async () => {
  const data = await (await app.request("/api/ops/skills")).json();
  const by = (id: string) => data.skills.find((s: { id: string }) => s.id === id);
  assert.match(by("who-gets-this-job").primaryOwner, /AM.*CoS.*Police/);
  assert.equal(by("who-gets-this-job").bestRunner, "Any ops");
  assert.equal(by("done-means-artifact").primaryOwner, "Eng / Police / AM");
  assert.equal(by("memory-upload").primaryOwner, "All (skill toggle)");
  assert.equal(by("memory-upload").bestRunner, "Grok Bot ops");
  assert.match(by("code-changes").primaryOwner, /Cursor Cloud/);
  assert.match(by("code-changes").bestRunner, /Cursor Cloud/);
  assert.match(by("dream-loop").primaryOwner, /Claude Pro.*Cursor Cloud.*Heavy/);
  assert.equal(by("dream-loop").repo.name, "dream-loop");
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
