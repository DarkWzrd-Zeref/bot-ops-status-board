import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-locker-"));
process.env.AREA67_TEST = "1"; process.env.SERVE_STATIC = "0";
const keys = { claude: "test-claude-" + "a".repeat(32), cursor: "test-cursor-" + "c".repeat(32), zeref: "test-zeref-" + "z".repeat(32) };
process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify(keys);
const { app } = await import("../server/index.ts");
const { MAX_ARTIFACT_BYTES } = await import("../shared/locker.ts");

const put = (seat: string, body: unknown, token?: string) =>
  app.request("/api/locker/" + seat, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body),
  });
const get = (path: string, token?: string) =>
  app.request(path, { headers: token ? { Authorization: "Bearer " + token } : {} });

const patch = "diff --git a/x b/x\n-old\n+new\n";
const patchBody = { name: "A67-SLICE.patch", kind: "patch", base64: Buffer.from(patch).toString("base64") };

test("an artifact round-trips and is addressed by the hash of its own bytes", async () => {
  const stored = await (await put("claude", patchBody, keys.claude)).json();
  assert.equal(stored.sha256, createHash("sha256").update(patch).digest("hex"));
  assert.equal(stored.id, stored.sha256.slice(0, 16));
  assert.equal(stored.from, "claude");
  assert.equal(stored.bytes, Buffer.byteLength(patch));

  const fetched = await get("/api/locker/" + stored.id, keys.cursor);
  assert.equal(fetched.status, 200);
  assert.equal(await fetched.text(), patch);
  // The receiver verifies bytes instead of eyeballing a diffstat.
  assert.equal(fetched.headers.get("x-artifact-sha256"), stored.sha256);
});

test("uploaded bytes are never served as renderable content on the hub origin", async () => {
  const evil = { name: "page.html", kind: "text", base64: Buffer.from("<script>alert(1)</script>").toString("base64") };
  const stored = await (await put("claude", evil, keys.claude)).json();
  const fetched = await get("/api/locker/" + stored.id, keys.claude);
  assert.equal(fetched.headers.get("content-type"), "application/octet-stream");
  assert.equal(fetched.headers.get("x-content-type-options"), "nosniff");
  assert.match(fetched.headers.get("content-disposition") ?? "", /^attachment;/);
});

test("re-uploading identical bytes is a no-op, not a duplicate", async () => {
  const first = await (await put("claude", patchBody, keys.claude)).json();
  const again = await (await put("cursor", patchBody, keys.cursor)).json();
  assert.equal(again.id, first.id);
  // Original uploader and timestamp survive a re-courier by someone else.
  assert.equal(again.from, "claude");
  assert.equal(again.at, first.at);
  const listed = await (await get("/api/locker", keys.zeref)).json();
  assert.equal(listed.artifacts.filter((a: { id: string }) => a.id === first.id).length, 1);
});

test("the locker is closed without a key and cannot be written as another seat", async () => {
  assert.equal((await put("claude", patchBody)).status, 403);
  // Cursor's key must not be able to upload under Claude's name.
  assert.equal((await put("claude", patchBody, keys.cursor)).status, 403);
  const stored = await (await put("claude", patchBody, keys.claude)).json();
  assert.equal((await get("/api/locker/" + stored.id)).status, 403);
  assert.equal((await get("/api/locker")).status, 403);
});

test("oversize, empty and malformed artifacts are refused", async () => {
  const huge = { name: "big.glb", kind: "model", base64: "A".repeat(Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4 + 8) };
  assert.equal((await put("claude", huge, keys.claude)).status, 400);
  assert.equal((await put("claude", { ...patchBody, base64: "" }, keys.claude)).status, 400);
  // A traversal attempt in the name must not reach the filesystem.
  assert.equal((await put("claude", { ...patchBody, name: "../../etc/passwd" }, keys.claude)).status, 400);
  assert.equal((await get("/api/locker/not-a-real-id", keys.claude)).status, 404);
});

test("a patch comes back inline over MCP; the id is what the radio carries", async () => {
  const stored = await (await put("claude", patchBody, keys.claude)).json();
  const response = await app.request("/mcp/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer " + keys.claude },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "artifact_get", arguments: { id: stored.id } } }),
  });
  const raw = await response.text();
  const body = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s => s.startsWith("data: "))!.slice(6));
  const result = JSON.parse(body.result.content[0].text);
  assert.equal(result.text, patch);
  assert.equal(result.sha256, stored.sha256);
  assert.match(result.url, /\/api\/locker\/[0-9a-f]{16}$/);
});
