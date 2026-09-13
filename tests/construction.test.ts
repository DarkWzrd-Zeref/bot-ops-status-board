import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { WorldGrid, generateWorld } from "../src/core/grid.ts";
import { planConstruction } from "../server/construction.ts";
import { stationPlanSchema, type StationPlan } from "../shared/construction.ts";
import type { BaseSnapshot } from "../server/store.ts";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-build-"));
process.env.AREA67_TEST = "1"; process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");
const store = await import("../server/store.ts");
const keys = { codex: "test-codex-" + "c".repeat(32), claude: "test-claude-" + "a".repeat(32) };
const seed: BaseSnapshot = { buildings: [
  { uid: "core", hubId: "well", tx: 27, ty: 19 },
  { uid: "bank", hubId: "bank", tx: 27, ty: 11 },
  { uid: "exchange", hubId: "grand-exchange", tx: 36, ty: 19 },
  { uid: "discord", hubId: "discord", tx: 17, ty: 19 },
  { uid: "cursor", hubId: "cursor", tx: 27, ty: 28 },
  { uid: "spector", hubId: "skillspector", tx: 36, ty: 10 },
  { uid: "project", hubId: "project-site", tx: 21, ty: 27, project: { name: "AREA 67", repoUrl: "https://github.com/example/area67", workspace: "hub", summary: "Existing project", contents: ["src"] } },
], assignments: { claude: "bank", codex: "project", "cursor-ultra": "project" }, equipped: { claude: [] } };
const plan: StationPlan = { requestId: "comms-one", buildings: [{ hubId: "slack", tx: 13, ty: 19 }, { hubId: "gmail", tx: 17, ty: 15 }] };
let rpcId = 0;
async function call(seat: string, name: string, args = {}, token?: string) {
  const response = await app.request("/mcp/" + seat, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await response.text(); const body = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s => s.startsWith("data: "))!.slice(6));
  assert.ok(body.result, raw); return body.result;
}
const content = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const disk = () => readFileSync(join(process.env.DATA_DIR!, "area67.json"), "utf8");

await test("district expansion preserves legacy walkability except the explicit river bridges", () => {
  const grid = new WorldGrid(); generateWorld(grid);
  const mask = Array.from({ length: 48 }, (_, y) => Array.from({ length: 64 }, (_, x) => grid.walkable(x, y) ? "." : "#").join("")).join("\n");
  assert.equal(createHash("sha256").update(mask).digest("hex"), "6698c68b749e509f3a408d43a1cc878f337996cad30ddea3f0a56793d034fa31");
  for (const [tx, ty] of [[68,20], [72,50], [28,60], [76,50]]) {
    const result = planConstruction(seed, "codex", { requestId: "outer-check", buildings: [{ hubId: "neon", tx, ty }] });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  }
  store.setBase({ ...structuredClone(seed), buildings: [...structuredClone(seed.buildings), { uid: "outer-new", hubId: "neon", tx: 72, ty: 50 }] });
  store.loadStore(); assert.equal(store.base()!.buildings.find(b => b.uid === "outer-new")!.tx, 72);
});

await test("inventory and preview are read-only, usable without keys, and explain the actual map", async () => {
  assert.equal(planConstruction(null, "claude", plan).errors[0].code, "base_missing");
  store.setBase(structuredClone(seed)); delete process.env.AREA67_ECOSYSTEM_KEYS;
  const before = disk(); const rev = store.revision();
  const inventory = content(await call("claude", "station_inventory"));
  assert.equal(inventory.canWrite, false); assert.equal(inventory.revision, rev);
  assert.equal(inventory.map.width, 96); assert.equal(inventory.map.height, 72); assert.equal(inventory.map.districts.length, 6);
  assert.equal(inventory.missing.length, 19); assert.equal(inventory.stations.find((s: {id:string}) => s.id === "railway").w, 4);
  assert.ok(inventory.map.blockedTiles.length); assert.equal(inventory.stations[0].connectionStatus, "unverified");
  const preview = content(await call("claude", "station_build_preview", plan));
  assert.equal(preview.ok, true, JSON.stringify(preview.errors)); assert.equal(preview.canWrite, false);
  assert.equal(preview.planned[0].uid, "build:claude:comms-one:0");
  assert.equal(store.revision(), rev); assert.equal(disk(), before);
  assert.equal(content(await call("claude", "hub_sync", { limit: 1 })).revision, rev);
});
await test("station writes require this seat's key before changes or attention, even for retries", async () => {
  store.loadStore(); const before = disk(); const input = { ...plan, expectedRevision: store.revision() };
  assert.equal((await call("claude", "station_build", input)).isError, true);
  process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify(keys);
  assert.equal((await call("claude", "station_build", input, keys.codex)).isError, true);
  assert.equal(disk(), before); assert.ok(store.presence().every(p => p.state === "offline"));
});
await test("one atomic additive build preserves all existing state, emits live base, and safely retries after restart", async () => {
  store.reportWork("codex", { buildingUid: "project", taskId: "existing-task", activity: "Work in progress", state: "working", artifacts: [] });
  const existingWork = structuredClone(store.workReports()); const rev = store.revision(); const before = structuredClone(store.base()!);
  const events: string[] = []; const off = store.subscribe(e => events.push(e.type));
  const result = content(await call("claude", "station_build", { ...plan, expectedRevision: rev }, keys.claude)); off();
  assert.equal(result.ok, true); assert.equal(result.revision, rev + 1); assert.equal(result.seat, "claude");
  assert.deepEqual(store.base()!.buildings.slice(0, 7), before.buildings);
  assert.deepEqual(store.base()!.assignments, before.assignments); assert.deepEqual(store.base()!.equipped, before.equipped);
  assert.deepEqual(store.workReports(), existingWork); assert.equal(events.filter(e => e === "base").length, 1);
  store.loadStore(); const after = disk();
  const retry = content(await call("claude", "station_build", { ...plan, expectedRevision: rev }, keys.claude));
  assert.equal(retry.alreadyApplied, true); assert.equal(retry.revision, rev + 1); assert.equal(disk(), after);
  assert.equal(store.presence().find(p => p.seat === "codex")!.state, "offline");
  assert.equal((await call("claude", "station_build", { ...plan, expectedRevision: rev }, keys.codex)).isError, true);
});
await test("stale revision, changed plans and invalid batch members never partially overwrite a teammate", async () => {
  store.setBase(structuredClone(seed)); const revision = store.revision();
  store.assignPal("claude", "well"); const before = disk();
  const stale = await call("claude", "station_build", { ...plan, expectedRevision: revision }, keys.claude);
  assert.equal(stale.isError, true); assert.equal(content(stale).errors[0].code, "revision_conflict"); assert.equal(disk(), before);
  const bad = await call("claude", "station_build", { ...plan, buildings: [...plan.buildings, { hubId: "neon", tx: 27, ty: 19 }], expectedRevision: store.revision() }, keys.claude);
  assert.equal(bad.isError, true); assert.equal(disk(), before);
  store.buildStations("claude", { ...plan, expectedRevision: store.revision() }); const built = disk();
  const changed = store.buildStations("claude", { ...plan, buildings: [plan.buildings[0]], expectedRevision: store.revision() });
  assert.equal(changed.errors[0].code, "request_conflict"); assert.equal(disk(), built);
  const unrelated = store.previewStations("claude", { requestId: "comms", buildings: [{ hubId: "neon", tx: 40, ty: 25 }] });
  assert.ok(!unrelated.errors.some(e => e.code === "request_conflict"));
});
await test("placement rejects unknown/fixed structures, terrain, overlap, radius and reserved tiles", () => {
  const checks = [
    ["no-such-hub", 40, 25, "not_buildable"], ["bank", 40, 25, "not_buildable"],
    ["neon", -1, 20, "oob"], ["neon", 1, 46, "blocked"], ["neon", 27, 19, "palbox"],
    ["neon", 17, 19, "occupied"], ["neon", 88, 20, "radius"], ["neon", 45, 30, "blocked"],
    ["neon", 22, 15, "reserved_plaza"], ["neon", 27, 27, "occupied"],
  ] as const;
  for (const [hubId, tx, ty, code] of checks) {
    const result = planConstruction(seed, "claude", { requestId: "invalid", buildings: [{ hubId, tx, ty }] });
    assert.ok(result.errors.some(e => e.code === code), JSON.stringify({ hubId, tx, ty, expected: code, errors: result.errors }));
  }
  const empty = { ...seed, buildings: [seed.buildings[0]] };
  assert.equal(planConstruction(empty, "claude", { requestId: "spawn", buildings: [{ hubId: "neon", tx: 27, ty: 27 }] }).errors[0].code, "reserved_spawn");
});
await test("actual selected entrance must remain reachable, even if another side is accessible", () => {
  // Enclose Slack's preferred south entrance but leave the north side accessible.
  const additions = [
    { hubId: "slack", tx: 39, ty: 25 },
    { hubId: "x", tx: 40, ty: 30 }, { hubId: "x", tx: 38, ty: 28 }, { hubId: "x", tx: 41, ty: 28 },
  ];
  const result = planConstruction(seed, "claude", { requestId: "trap", buildings: additions });
  assert.ok(result.errors.some(e => e.code === "unreachable_dock"), JSON.stringify(result.errors));
});
await test("project metadata, bounded batches and complete retry identity are enforced", () => {
  const missing = planConstruction(seed, "claude", { requestId: "project", buildings: [{ hubId: "project-site", tx: 40, ty: 25 }] });
  assert.equal(missing.errors[0].code, "project_metadata");
  assert.equal(stationPlanSchema.safeParse({ ...plan, buildings: Array(25).fill(plan.buildings[0]) }).success, false);
  assert.equal(stationPlanSchema.safeParse({ ...plan, requestId: "other:seat" }).success, false);
  assert.equal(stationPlanSchema.safeParse({ ...plan, buildings: [{ hubId: "project-site", tx: 40, ty: 25, project: { name: "Bad", repoUrl: "https://secret:token@example.com" } }] }).success, false);
  const project = stationPlanSchema.parse({ requestId: "real-project", buildings: [{ hubId: "project-site", tx: 40, ty: 25, project: { name: "Existing repo", repoUrl: "https://github.com/example/real" } }] });
  store.setBase(structuredClone(seed));
  assert.equal(store.buildStations("claude", { ...project, expectedRevision: store.revision() }).ok, true);
  const changed = structuredClone(project); changed.buildings[0].project!.repoUrl = "https://github.com/example/different";
  assert.equal(store.buildStations("claude", { ...changed, expectedRevision: store.revision() }).errors[0].code, "request_conflict");
  const partial = { ...plan, requestId: "partial" }; store.buildStations("claude", { ...partial, expectedRevision: store.revision() });
  const base = structuredClone(store.base()!); base.buildings = base.buildings.filter(b => b.uid !== "build:claude:partial:1"); store.setBase(base);
  assert.equal(store.previewStations("claude", partial).errors[0].code, "request_conflict");
});
await test("all 19 missing types fit as a complete district plan around the unchanged seven-station base", () => {
  const layout = stationPlanSchema.parse(JSON.parse(readFileSync(new URL("../docs/station-layout.example.json", import.meta.url), "utf8")));
  store.setBase(structuredClone(seed));
  const result = store.buildStations("claude", { ...layout, expectedRevision: store.revision() });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(store.stationInventory().missing.length, 0);
  assert.equal(store.base()!.buildings.length, 26);
  assert.deepEqual(store.base()!.buildings.slice(0, 7), seed.buildings);
  assert.deepEqual(store.base()!.assignments, seed.assignments);
});
