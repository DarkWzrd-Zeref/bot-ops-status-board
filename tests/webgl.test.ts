import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldUseCanvasFallback } from "../src/game/webgl.ts";

test("canvas fallback stays off when WebGL is healthy", () => {
  assert.equal(shouldUseCanvasFallback({ hasWebgl: true }), false);
});

test("canvas fallback loads when WebGL is absent, lost, or failed to start", () => {
  assert.equal(shouldUseCanvasFallback({ hasWebgl: false }), true);
  assert.equal(shouldUseCanvasFallback({ hasWebgl: true, contextLost: true }), true);
  assert.equal(shouldUseCanvasFallback({ hasWebgl: true, initError: new Error("context") }), true);
});
