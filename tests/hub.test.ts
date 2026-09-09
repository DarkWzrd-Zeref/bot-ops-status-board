import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { effectiveAttention, SEATS, type Presence } from "../shared/protocol.ts";
import type { BusEvent } from "../server/store.ts";

const testDir = mkdtempSync(join(tmpdir(), "area67-test-"));
process.env.DATA_DIR = testDir;
process.env.AREA67_TEST = "1";
process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");
const store = await import("../server/store.ts");
const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const snapshot = () => ({ buildings: [
  { uid: "core", hubId: "well", tx: 27, ty: 19 },
  { uid: "lab", hubId: "cursor", tx: 27, ty: 28 },
  { uid: "vault", hubId: "bank", tx: 27, ty: 11 },
], assignments: {} as Record<string, string | null>, equipped: {} });
let rpcId = 0;
async function call(seat: string, name: string, args = {}) {
  const res = await app.request("/mcp/" + seat, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  assert.equal(res.status, 200);
  const raw = await res.text();
  const body = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s => s.startsWith("data: "))!.slice(6));
  assert.ok(body.result, raw);
  return body.result;
}

await test("reading the board does not make any AI appear online", async () => {
  const res = await app.request("/api/status");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.presence.length, SEATS.length + 1);
  assert.ok(data.presence.every((p: Presence) => p.state === "offline"));
});
await test("presence expires at exactly two and ten minutes, including busy seats", () => {
  const p: Presence = { seat: "codex", state: "busy", lastSeen: 1000, activity: "Testing", source: "mcp", lastReadAt: 0 };
  assert.equal(effectiveAttention(p, 120999), "busy");
  assert.equal(effectiveAttention(p, 121000), "away");
  assert.equal(effectiveAttention(p, 601000), "offline");
  assert.equal(effectiveAttention({ ...p, state: "offline" }, 1001), "offline");
  assert.equal(effectiveAttention(undefined, 1001), "offline");
});
await test("queued directive is seen only by its addressed inbox and tracks actual acknowledgements", async () => {
  const note = await (await post("/api/architect", { from: "zeref", to: "codex", directive: true, text: "Ship the command deck" })).json();
  assert.deepEqual(note.receipts, {});
  assert.deepEqual(note.recipients, ["codex"]);
  await app.request("/api/status");
  await app.request("/api/inbox/claude");
  assert.deepEqual(store.notes().find(n => n.id === note.id)!.receipts, {});
  const inbox = await (await app.request("/api/inbox/codex")).json();
  assert.equal(inbox.inbox.find((n: {id: string}) => n.id === note.id).receipts.codex.state, "seen");
  assert.equal((await post(`/api/directives/${note.id}/ack`, { seat: "claude", state: "completed" })).status, 400);
  const working = await (await post(`/api/directives/${note.id}/ack`, { seat: "codex", state: "accepted", detail: "Implementing" })).json();
  assert.equal(working.receipts.codex.state, "accepted");
  assert.equal(store.presence().find(p => p.seat === "codex")!.state, "busy");
  await post(`/api/directives/${note.id}/ack`, { seat: "codex", state: "blocked", detail: "Need review" });
  await post(`/api/directives/${note.id}/ack`, { seat: "codex", state: "completed", detail: "Tests passed" });
  assert.equal((await post(`/api/directives/${note.id}/ack`, { seat: "codex", state: "accepted" })).status, 400);
});
await test("broadcast directives snapshot all eight seats and preserve per-seat receipts", async () => {
  const n = store.postArchitect("zeref", "Everyone check in", { directive: true });
  assert.deepEqual(n.recipients, SEATS.map(s => s.id));
  store.inbox("codex");
  assert.equal(n.receipts.codex?.state, "seen");
  assert.equal(n.receipts.claude, undefined);
  assert.equal(n.recipients.includes("zeref"), false);
});
await test("messages validate sender, size, recipient, reply target and directive authority", async () => {
  for (const body of [{ from: "fake", text: "Hi" }, { from: "zeref", text: " " }, { from: "zeref", text: "x".repeat(2001) }, { from: "zeref", text: "Hi", to: "fake" }, { from: "zeref", text: "Hi", replyTo: "missing" }]) {
    assert.equal((await post("/api/architect", body)).status, 400);
  }
  const n = await (await post("/api/architect", { from: "codex", text: "Status", directive: true })).json();
  assert.equal(n.directive, false);
  assert.equal((await post("/api/say", { palId: "codex", text: "x".repeat(281) })).status, 400);
});
await test("old unfinished directives remain visible and retrievable after 200 newer messages", () => {
  const n = store.postArchitect("zeref", "Do not lose this command", { to: "codex", directive: true });
  for (let i = 0; i < 205; i++) store.postArchitect("claude", "Context " + i, { channel: "team" });
  assert.ok(store.notes(1).some(row => row.id === n.id));
  assert.ok(store.inbox("codex", 1).some(row => row.id === n.id));
  assert.equal(n.receipts.codex?.state, "seen");
});
await test("base saves reject stale browsers and preserve the latest revision", async () => {
  let res = await post("/api/base", { ...snapshot(), revision: 0 });
  assert.equal(res.status, 200, await res.text());
  const rev = store.revision();
  assert.equal(store.assignPal("codex", "cursor").ok, true);
  assert.equal(store.revision(), rev + 1);
  res = await post("/api/base", { ...snapshot(), revision: rev });
  assert.equal(res.status, 409);
  const conflict = await res.json();
  assert.equal(conflict.base.assignments.codex, "lab");
  assert.equal(conflict.revision, rev + 1);
});
await test("invalid station footprints, references, core changes and capacity fail without altering state", async () => {
  const before = JSON.stringify(store.base());
  const invalid = [
    { ...snapshot(), buildings: [{ uid: "bad", hubId: "fake", tx: 20, ty: 20 }] },
    { ...snapshot(), buildings: [...snapshot().buildings, { uid: "lab", hubId: "bank", tx: 20, ty: 20 }] },
    { ...snapshot(), buildings: [...snapshot().buildings, { uid: "overlap", hubId: "bank", tx: 27, ty: 19 }] },
    { ...snapshot(), buildings: [...snapshot().buildings, { uid: "oob", hubId: "bank", tx: 55, ty: 39 }] },
    { ...snapshot(), buildings: snapshot().buildings.filter(b => b.hubId !== "well") },
    { ...snapshot(), assignments: { codex: "missing" } },
    { ...snapshot(), assignments: { codex: "lab", claude: "lab", researcher: "lab" } },
    { ...snapshot(), equipped: { codex: ["unknown"] } },
  ];
  for (const body of invalid) {
    const res = await post("/api/base", { ...body, revision: store.revision() });
    assert.equal(res.status, 400, await res.text());
    assert.equal(JSON.stringify(store.base()), before);
  }
  assert.equal(store.assignPal("claude", "cursor").ok, true);
  assert.equal(store.assignPal("researcher", "cursor").ok, false);
});
await test("seat-scoped MCP uses Codex identity and rejects another pal or another seat's directive", async () => {
  const identity = await call("codex", "whoami");
  assert.match(identity.content[0].text, /Seat: Codex/);
  assert.equal((await call("codex", "pal_say", { palId: "director", text: "Impersonation" })).isError, true);
  assert.equal((await call("codex", "pal_assign", { palId: "claude", hubId: "cursor" })).isError, true);
  const other = store.postArchitect("zeref", "Claude task", { directive: true, to: "claude" });
  assert.equal((await call("codex", "directive_ack", { noteId: other.id, state: "completed" })).isError, true);
  const synced = JSON.parse((await call("codex", "hub_sync", { limit: 1 })).content[0].text);
  assert.equal(synced.seat, "codex");
  assert.ok(!synced.inbox.some((n: {id: string}) => n.id === other.id));
  await call("codex", "architect_post", { from: "grok-heavy", text: "Codex status" });
  assert.equal(store.notes()[0].from, "codex");
  await call("codex", "presence_update", { state: "offline", activity: "Finished" });
  assert.equal(store.presence().find(p => p.seat === "codex")!.state, "offline");
});
await test("event subscribers receive persisted directives, receipts and versioned assignments", () => {
  const events: BusEvent[] = [];
  const off = store.subscribe(event => events.push(event));
  const n = store.postArchitect("zeref", "Event delivery", { directive: true, to: "codex" });
  store.acknowledge("codex", n.id, "accepted");
  store.assignPal("codex", null);
  off();
  assert.ok(events.some(e => e.type === "architect" && e.note.id === n.id));
  assert.ok(events.some(e => e.type === "receipt" && e.note.id === n.id));
  assert.ok(events.some(e => e.type === "base" && e.revision === store.revision()));
});
await test("reload restores messages and receipts, never restores stale online lights", () => {
  const previous = JSON.stringify(store.notes());
  const rev = store.revision();
  store.loadStore();
  assert.equal(JSON.stringify(store.notes()), previous);
  assert.equal(store.revision(), rev);
  assert.ok(store.presence().every(p => p.state === "offline"));
});
await test("corrupt storage fails closed without overwriting the recoverable file", () => {
  const file = join(testDir, "area67.json");
  const good = readFileSync(file, "utf8");
  writeFileSync(file, "broken-test-data");
  assert.throws(() => store.loadStore());
  assert.equal(readFileSync(file, "utf8"), "broken-test-data");
  writeFileSync(file, good);
  store.loadStore();
});
await test("one-time bootstrap restores original IDs and base into a new volume", () => {
  const file = join(testDir, "area67.json");
  const backup = readFileSync(file, "utf8");
  renameSync(file, join(testDir, "before-bootstrap.json"));
  process.env.AREA67_BOOTSTRAP_STATE = backup;
  store.loadStore();
  const restored = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(restored.notes, JSON.parse(backup).notes);
  assert.deepEqual(restored.base, JSON.parse(backup).base);
  assert.ok(store.presence().every(p => p.state === "offline"));
  process.env.AREA67_BOOTSTRAP_STATE = "invalid-but-must-be-ignored-for-existing-volume";
  assert.doesNotThrow(() => store.loadStore());
  delete process.env.AREA67_BOOTSTRAP_STATE;
});
await test("cutover recovery adds historical messages once without replacing live state or claiming attention", () => {
  const existing = store.notes()[0];
  const beforeBase = JSON.stringify(store.base());
  const beforeSpeech = JSON.stringify(store.lastSay());
  const beforeRevision = store.revision();
  const recovered = { id: "cutover-history", from: "cursor", palId: "cursor-ultra", text: "Original saved message", at: 1000 };
  process.env.AREA67_RECOVERY_NOTES = JSON.stringify({ notes: [recovered, recovered, { ...existing, text: "Must not replace", directive: false, recipients: [], receipts: {} }] });
  store.loadStore();
  assert.equal(store.notes(1000).filter(n => n.id === recovered.id).length, 1);
  assert.deepEqual(store.notes(1000).find(n => n.id === existing.id), existing);
  assert.equal(JSON.stringify(store.base()), beforeBase);
  assert.equal(JSON.stringify(store.lastSay()), beforeSpeech);
  assert.equal(store.revision(), beforeRevision);
  assert.ok(store.presence().every(p => p.state === "offline"));
  store.loadStore();
  assert.equal(store.notes(1000).filter(n => n.id === recovered.id).length, 1);
  const file = join(testDir, "area67.json");
  const good = readFileSync(file, "utf8");
  process.env.AREA67_RECOVERY_NOTES = JSON.stringify({ notes: [{ ...recovered, id: "invalid", from: "unknown" }] });
  assert.throws(() => store.loadStore(), /Invalid historical/);
  assert.equal(readFileSync(file, "utf8"), good);
  delete process.env.AREA67_RECOVERY_NOTES;
  store.loadStore();
});

after(() => { console.log("Isolated test data: " + testDir); });
