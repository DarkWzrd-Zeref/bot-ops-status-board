import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-memory-"));
process.env.AREA67_TEST = "1";
process.env.SERVE_STATIC = "0";
delete process.env.AREA67_ECOSYSTEM_KEYS;
const { app } = await import("../server/index.ts");
const store = await import("../server/store.ts");
let rpcId = 0;
async function call(seat: string, name: string, args = {}) {
  const response = await app.request("/mcp/" + seat, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await response.text();
  const body = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s => s.startsWith("data: "))!.slice(6));
  assert.ok(body.result, raw);
  return body.result;
}
const content = (r: { content: { text: string }[]; isError?: boolean }) => JSON.parse(r.content[0].text);
store.setBase({ buildings: [{ uid: "core", hubId: "well", tx: 27, ty: 19 }, { uid: "project", hubId: "project-site", tx: 21, ty: 27, project: { name: "AREA 67", repoUrl: "https://github.com/example/hub", workspace: "hub", summary: "", contents: [] } }], assignments: {} });

test("task_memory_save does not need a write key and cannot impersonate another seat", async () => {
  const saved = content(await call("cursor", "task_memory_save", {
    slot: "camera-15",
    title: "Camera homework",
    body: "PR15 2c52b19 needs Codex re-review. Card still cites f389502.",
    state: "pending",
    projectUid: "project",
  }));
  assert.equal(saved.seat, "cursor");
  assert.equal(saved.slot, "camera-15");
  assert.equal(saved.state, "pending");
  const again = content(await call("cursor", "task_memory_save", {
    slot: "camera-15",
    title: "Camera homework",
    body: "Still waiting on Codex. Head is 2c52b19.",
    state: "blocked",
  }));
  assert.equal(again.state, "blocked");
  assert.equal(store.taskMemories().filter(m => m.seat === "cursor" && m.slot === "camera-15").length, 1);
  const other = content(await call("codex", "task_memory_save", { slot: "review-15", title: "Codex review", body: "Will re-run PR15 tests.", state: "pending" }));
  assert.equal(other.seat, "codex");
  assert.equal(other.slot, "review-15");
  assert.equal(store.taskMemories().length, 2);
});

test("a seat cannot clear another seat's memory and is capped at eight slots", async () => {
  assert.equal(content(await call("codex", "task_memory_clear", { slot: "camera-15" })).cleared, false);
  assert.ok(store.taskMemories().some(m => m.seat === "cursor" && m.slot === "camera-15"));
  for (let i = 0; i < 7; i++) {
    await call("cursor", "task_memory_save", { slot: "slot-" + i, title: "Extra " + i, body: "Filler remaining work " + i, state: "pending" });
  }
  const overflow = await call("cursor", "task_memory_save", { slot: "slot-overflow", title: "Too many", body: "Should fail", state: "pending" });
  assert.equal(overflow.isError, true);
  const cleared = content(await call("cursor", "task_memory_clear", { slot: "slot-0" }));
  assert.equal(cleared.cleared, true);
  store.loadStore();
  assert.ok(store.taskMemories().some(m => m.seat === "cursor" && m.slot === "camera-15"));
  assert.equal(store.taskMemories().some(m => m.seat === "cursor" && m.slot === "slot-0"), false);
});

test("Pending Work UI and connect page name the per-seat memory tools", () => {
  const hud = readFileSync(new URL("../src/ui/hud.ts", import.meta.url), "utf8");
  const eco = readFileSync(new URL("../src/ui/ecosystem.ts", import.meta.url), "utf8");
  const connect = readFileSync(new URL("../public/connect.html", import.meta.url), "utf8");
  assert.match(eco, /pending-work-open/);
  assert.match(eco, /task_memory_save/);
  assert.match(hud, /memoryCard/);
  assert.match(connect, /task_memory_save/);
  assert.match(connect, /task_memory_clear/);
});
