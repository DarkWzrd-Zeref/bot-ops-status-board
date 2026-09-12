import { test } from "node:test";
import assert from "node:assert/strict";
import hubs from "../src/content/hubs.json";

/**
 * A67-VISUAL-001 roof lettering, against Eng's Track B pack at freeze rev61.
 *
 * roofLabelTexture touches the DOM, and this suite has no DOM, so the canvas
 * is shimmed here rather than pulling in a whole browser environment for two
 * assertions. The shim records the order calls arrive in, because the bug this
 * guards is an ordering bug you cannot see by reading the output.
 */
type Call = { op: string; value?: unknown };
function installCanvasShim() {
  const calls: Call[] = [];
  const ctx = {
    _font: "",
    set font(v: string) { calls.push({ op: "font", value: v }); this._font = v; },
    get font() { return this._font; },
    set textAlign(v: string) { calls.push({ op: "textAlign", value: v }); },
    set textBaseline(v: string) { calls.push({ op: "textBaseline", value: v }); },
    set shadowColor(v: string) { calls.push({ op: "shadowColor", value: v }); },
    set shadowBlur(v: number) { calls.push({ op: "shadowBlur", value: v }); },
    set shadowOffsetY(v: number) { calls.push({ op: "shadowOffsetY", value: v }); },
    set fillStyle(v: string) { calls.push({ op: "fillStyle", value: v }); },
    fillText: (t: string) => calls.push({ op: "fillText", value: t }),
    // 26px a character is close enough to a real 72px condensed-ish advance to
    // make short and long labels measure differently, which is all this needs.
    measureText: (t: string) => ({ width: t.length * 26 }),
  };
  const canvas = {
    _w: 300, _h: 150,
    get width() { return this._w; },
    set width(v: number) { calls.push({ op: "resize", value: v }); this._w = v; },
    get height() { return this._h; },
    set height(v: number) { this._h = v; },
    getContext: () => ctx,
  };
  (globalThis as Record<string, unknown>).document = { createElement: () => canvas };
  return calls;
}

test("roof lettering is sized from the text, and the canvas is configured after the resize", async () => {
  const calls = installCanvasShim();
  const { roofLabelTexture } = await import("../src/game/World3D.ts");
  roofLabelTexture("Discord");

  // Setting canvas.width RESETS the 2D context in a real browser: every draw
  // setting applied before the resize is silently discarded. Measure-then-size
  // makes that trap unavoidable, so the order is pinned here. If this fails,
  // the roofs render in a default 10px sans with no shadow and nobody notices
  // until they are looking at a screenshot.
  const resize = calls.findIndex(c => c.op === "resize");
  const draw = calls.findIndex(c => c.op === "fillText");
  assert.ok(resize >= 0, "the canvas must be sized from the measured text");
  for (const op of ["font", "textAlign", "textBaseline", "fillStyle"]) {
    const applied = calls.map((c, i) => c.op === op ? i : -1).filter(i => i > resize);
    assert.ok(applied.length > 0, `${op} must be re-applied after the resize`);
  }
  assert.ok(draw > resize, "the text is drawn after the canvas is sized");

  // A fixed canvas would letterbox "GE" and crush "War Table"; the plane is
  // built from this aspect, so a wrong aspect is a stretched word on a roof.
  const short = roofLabelTexture("GE").aspect;
  const long = roofLabelTexture("War Table").aspect;
  assert.ok(long > short, `"War Table" (${long}) must be wider than "GE" (${short})`);
  assert.ok(short > 0 && Number.isFinite(long));
  // Cached: a second call must not rebuild, or 26 stations rebuild every sync.
  assert.equal(roofLabelTexture("GE").aspect, short);
  const before = calls.length;
  roofLabelTexture("GE");
  assert.equal(calls.length, before, "a repeated label must come from the cache");
});

test("roof lettering names exactly the ten stations CAMERA-NOTES lists, and they all exist", async () => {
  installCanvasShim();
  const { ROOF_LABELS } = await import("../src/game/World3D.ts");
  // Verbatim from CAMERA-NOTES "Labels (flat +Z)". Ten, not twenty-six: in the
  // ortho plate the lettered roofs are how landmarks separate from service
  // blocks, so lettering everything would destroy what the list is for.
  assert.deepEqual(
    Object.values(ROOF_LABELS).sort(),
    ["AREA 67", "Bank", "Bridge", "Cursor", "Discord", "GE", "Pending", "Vision", "War Table", "Well"],
  );
  const known = new Set(hubs.hubs.map(h => h.id));
  for (const id of Object.keys(ROOF_LABELS)) {
    assert.ok(known.has(id), `${id} is not a hub id; the label would never render`);
  }
});
