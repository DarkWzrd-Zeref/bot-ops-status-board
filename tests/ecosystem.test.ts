import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorldGrid, generateWorld } from "../src/core/grid.ts";
import { MAP_W, MAP_H, CORE_X, CORE_Y, BASE_RADIUS } from "../shared/map.ts";
import { SEATS } from "../shared/protocol.ts";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-ecosystem-"));
process.env.AREA67_TEST = "1"; process.env.SERVE_STATIC = "0";
delete process.env.AREA67_ECOSYSTEM_KEYS;
const { app } = await import("../server/index.ts");
const store = await import("../server/store.ts");
const keys = { codex: "test-codex-" + "c".repeat(32), claude: "test-claude-" + "a".repeat(32), zeref: "test-zeref-" + "z".repeat(32) };
const post = (path: string, body: unknown, token?: string) => app.request(path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
let rpcId = 0;
async function call(seat: string, name: string, args = {}, token?: string) {
  const response = await app.request("/mcp/" + seat, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await response.text();
  const body = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s => s.startsWith("data: "))!.slice(6));
  assert.ok(body.result, raw); return body.result;
}
const content = (r: { content: {text: string}[] }) => JSON.parse(r.content[0].text);
store.setBase({ buildings: [{ uid: "core", hubId: "well", tx: 27, ty: 19 }, { uid: "project", hubId: "project-site", tx: 21, ty: 27, project: { name: "Ecosystem", repoUrl: "https://github.com/example/hub", workspace: "hub", summary: "", contents: [] } }], assignments: {} });

await test("ecosystem mutations are closed by default while boards remain readable", async () => {
  assert.equal((await app.request("/api/ecosystem")).status, 200);
  assert.equal((await post("/api/ecosystem/cards", { actor: "codex", board: "vision-board", title: "Idea", body: "Details" })).status, 403);
  assert.equal((await post("/api/ecosystem/skills", { name: "Build", description: "Test", signature: "Zeref" })).status, 403);
  const read = content(await call("codex", "ecosystem_read")); assert.equal(read.canWrite, false);
  assert.equal((await call("codex", "board_post", { board: "vision-board", title: "Idea", body: "Details" })).isError, true);
  assert.equal((await call("codex", "skill_register", { name: "Build", description: "Test", signature: "Codex" })).isError, true);
  assert.deepEqual(store.ecosystem(), { cards: [], skills: [] });
});
await test("keys are seat-specific and client-supplied actor/owner values cannot impersonate", async () => {
  process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify(keys);
  assert.equal((await call("claude", "board_post", { board: "vision-board", title: "Idea", body: "Details" }, keys.codex)).isError, true);
  assert.equal((await post("/api/ecosystem/cards", { board: "vision-board", title: "Idea", body: "Details" }, keys.codex)).status, 403);
  const human = await post("/api/ecosystem/cards", { actor: "claude", createdBy: "codex", board: "vision-board", title: "Human idea", body: "Details" }, keys.zeref);
  assert.equal(human.status, 200); assert.equal((await human.json()).createdBy, "zeref");
  process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify({ codex: keys.codex, claude: keys.codex });
  assert.equal(content(await call("codex", "ecosystem_read", {}, keys.codex)).canWrite, false);
  process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify(keys);
});
await test("skill signatures require canonical names and persist independent owner registrations", async () => {
  const input = { name: "Repository verification", description: "Type-check and test changes", signature: "Codex", sourceUrl: "https://github.com/example/hub", owner: "claude" };
  assert.equal((await call("codex", "skill_register", { ...input, signature: "Claude" }, keys.codex)).isError, true);
  assert.equal((await call("codex", "skill_register", { ...input, sourceUrl: "javascript:alert(1)" }, keys.codex)).isError, true);
  const skill = content(await call("codex", "skill_register", input, keys.codex));
  assert.equal(skill.owner, "codex"); assert.equal(skill.signature, "Codex"); assert.equal(skill.verification, "self-declared");
  assert.equal(content(await call("codex", "skill_register", input, keys.codex)).id, skill.id);
  assert.equal((await call("claude", "skill_register", input, keys.claude)).isError, true);
  const other = content(await call("claude", "skill_register", { ...input, signature: "Claude" }, keys.claude));
  assert.notEqual(other.id, skill.id); assert.equal(other.owner, "claude");
  store.loadStore(); assert.equal(store.ecosystem().skills.length, 2); assert.equal(store.ecosystem().skills.find(s => s.id === skill.id)!.owner, "codex");
});
await test("parked work uses revisioned seat-owned claims and retains context across boards", async () => {
  const card = content(await call("codex", "board_post", { board: "pending-work", title: "Investigate adapter", body: "Context and next step", projectUid: "project" }, keys.codex));
  assert.equal(card.status, "parked"); assert.equal(card.createdBy, "codex");
  const claimed = content(await call("codex", "board_action", { id: card.id, revision: 1, action: "claim" }, keys.codex));
  assert.equal(claimed.claimedBy, "codex");
  const stale = await post("/api/ecosystem/cards/action", { id: card.id, revision: 1, action: "claim" }, keys.zeref); assert.equal(stale.status, 409);
  assert.equal((await call("claude", "board_action", { id: card.id, revision: 2, action: "park" }, keys.claude)).isError, true);
  const parked = content(await call("codex", "board_action", { id: card.id, revision: 2, action: "park" }, keys.codex)); assert.equal(parked.claimedBy, null);
  const discussed = content(await call("claude", "board_action", { id: card.id, revision: 3, action: "discuss" }, keys.claude));
  assert.equal(discussed.board, "war-table"); assert.equal(discussed.body, card.body); assert.equal(discussed.createdBy, "codex"); assert.equal(discussed.updatedBy, "claude");
  store.loadStore(); assert.equal(store.ecosystem().cards.find(c => c.id === card.id)!.projectUid, "project");
});
await test("ecosystem events, legacy migrations and board history do not invent attention", async () => {
  store.loadStore(); assert.ok(store.presence().every(p => p.state === "offline"));
  const events: string[] = []; const off = store.subscribe(e => events.push(e.type));
  const card = store.createCard("codex", { board: "vision-board", title: "Durable vision", body: "Keep this idea" });
  assert.ok(events.includes("ecosystem")); off();
  const old = store.base()!; store.setBase({ ...old, buildings: old.buildings.filter(b => b.uid !== "project") });
  assert.ok(store.ecosystem().cards.some(c => c.id === card.id)); assert.equal(store.ecosystem().skills.length, 2);
  assert.ok(store.presence().every(p => p.state === "offline"));
  for (const seat of SEATS) assert.equal(store.palList().find(p => p.id === seat.palId)!.name, seat.label);
});
await test("expanded map retains the original core and admits new outer plots", () => {
  const grid = new WorldGrid(); const { well } = generateWorld(grid);
  assert.deepEqual(well, { x: 27, y: 19 }); assert.equal(CORE_X, 28); assert.equal(CORE_Y, 20);
  assert.equal(MAP_W, 64); assert.equal(MAP_H, 48); assert.equal(BASE_RADIUS, 20);
  assert.equal(grid.canPlace(43, 24, 3, 3, well, BASE_RADIUS), true);
  store.setBase({ buildings: [{ uid: "core", hubId: "well", tx: 27, ty: 19 }, { uid: "outer", hubId: "skill-altar", tx: 43, ty: 24 }], assignments: {} });
  assert.equal(store.base()!.buildings[1].tx, 43);
});

await test("bug board retains findings and enforces revisioned claims across park, fix and reopen", async () => {
  const input = { board: "bug-board", title: "Sprite stretch", body: "Reproduce on draft; preserve image aspect", priority: "high", finding: "confirmed" };
  assert.equal((await call("codex", "board_post", input)).isError, true);
  const card = content(await call("codex", "board_post", input, keys.codex));
  assert.equal(card.status, "open"); assert.equal(card.finding, "confirmed");
  assert.equal((await call("claude", "board_action", { id: card.id, revision: 1, action: "complete" }, keys.claude)).isError, true);
  const claimed = content(await call("codex", "board_action", { id: card.id, revision: 1, action: "claim" }, keys.codex));
  assert.equal(claimed.claimedBy, "codex");
  assert.equal((await call("claude", "board_action", { id: card.id, revision: 1, action: "claim" }, keys.claude)).isError, true);
  assert.equal((await call("claude", "board_action", { id: card.id, revision: 2, action: "park" }, keys.claude)).isError, true);
  assert.equal((await call("codex", "board_action", { id: card.id, revision: 2, action: "discuss" }, keys.codex)).isError, true);
  const parked = content(await call("codex", "board_action", { id: card.id, revision: 2, action: "park" }, keys.codex));
  assert.equal(parked.board, "bug-board"); assert.equal(parked.claimedBy, null);
  await call("claude", "board_action", { id: card.id, revision: 3, action: "claim" }, keys.claude);
  const done = content(await call("claude", "board_action", { id: card.id, revision: 4, action: "complete" }, keys.claude));
  assert.equal(done.status, "done"); assert.equal(done.claimedBy, "claude");
  const reopened = await post("/api/ecosystem/cards/action", { id: card.id, revision: 5, action: "reopen" }, keys.zeref);
  assert.equal(reopened.status, 200);
  store.loadStore(); const saved = store.ecosystem().cards.find(c => c.id === card.id)!;
  assert.equal(saved.status, "open"); assert.equal(saved.board, "bug-board"); assert.equal(saved.priority, "high"); assert.equal(saved.body, input.body);
});
