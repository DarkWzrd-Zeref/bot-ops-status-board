import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchStations, type StationSearchItem } from "../src/ui/districts.ts";

const stations: StationSearchItem[] = [
  { uid: "b", name: "Skill Altar", kind: "ecosystem", description: "Account usage and shared memory" },
  { uid: "a", name: "Cursor", kind: "code", description: "Repository development" },
  { uid: "c", name: "Cursor project", kind: "Project", description: "Account usage dashboard" },
];
test("station search covers names, capability descriptions and projects without mutating the map", () => {
  const before = structuredClone(stations);
  assert.deepEqual(searchStations(stations, "  USAGE account ").map(s => s.uid), ["c", "b"]);
  assert.deepEqual(searchStations(stations, "Cursor").map(s => s.uid), ["a", "c"]);
  assert.deepEqual(searchStations(stations, "ecosystem memory").map(s => s.uid), ["b"]);
  assert.deepEqual(searchStations(stations, "missing"), []);
  assert.equal(searchStations(stations, "").length, 3);
  assert.deepEqual(stations, before);
});
test("navigation shortcuts do not replace AI auth, draft inputs, or baseline skills", () => {
  const hud = readFileSync(new URL("../src/ui/hud.ts", import.meta.url), "utf8");
  for (const id of ["radio-text", "quick-text", "usage-launcher", "planning-launcher", "agents-launcher", "tools-launcher"]) assert.ok(hud.includes(`id="${id}"`));
  assert.match(hud, /id="usage-launcher" data-ecosystem="skill-altar"/);
  assert.match(hud, /id="planning-launcher" data-ecosystem="war-table"/);
  assert.match(hud, /saveDraft\(CHAT_DRAFT_KEY/);
  assert.match(hud, /saveDraft\(QUICK_DRAFT_KEY/);
});
test("camera presets are actions; only the actual walk mode claims a pressed state", () => {
  const source = readFileSync(new URL("../src/ui/viewControls.ts", import.meta.url), "utf8");
  for (const action of ["fit", "isometric", "top"]) assert.ok(source.includes(`data-view-camera="${action}"`));
  assert.doesNotMatch(source, /id="view-(?:top|overview)"[^>]*aria-pressed/);
  assert.match(source, /area67-view-change/);
  assert.match(source, /e.stopPropagation\(\)/);
});
test("directory renders project labels as text and provides keyboard navigation", () => {
  const source = readFileSync(new URL("../src/ui/districts.ts", import.meta.url), "utf8");
  assert.match(source, /name.textContent = item.name/);
  assert.match(source, /description.textContent/);
  assert.match(source, /event.key === "ArrowDown"/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /event.key.toLowerCase\(\) === "k"/);
  assert.doesNotMatch(source, /demolish\(|assignAgent\(|placeAt\(/);
});
test("experience keeps touch-size controls, mobile sizing and reduced-motion support", () => {
  const css = readFileSync(new URL("../src/ui/experience.css", import.meta.url), "utf8");
  assert.match(css, /min-height: 44px/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /#hud \.operations-panel[^}]+right: 16px/s);
  assert.match(css, /--mint: #83f1d2/);
});
