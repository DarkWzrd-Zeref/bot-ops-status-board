#!/usr/bin/env node
/**
 * Seat Heavy's Imagine stills onto stationArt hub sprites.
 *   node scripts/seat-imagine-stills.mjs
 * Reads artifacts/imagine-stations/{still} → public/sprites/stations/hub-<id>.png
 * Never writes Claude kind.{sha12}.png. Missing files stay painted boxes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const drop = JSON.parse(readFileSync(join(root, "scripts/imagine-drop.json"), "utf8"));
const srcDir = join(root, drop.sourceDir);
const destDir = join(root, drop.destDir);
mkdirSync(destDir, { recursive: true });

function convert(src, dest) {
  // Punch Imagine's black void to alpha so Phaser seats cutouts, not cards.
  execFileSync("ffmpeg", ["-y", "-i", src, "-vf", "colorkey=0x000000:0.14:0.12,format=rgba", dest], { stdio: "ignore" });
}

let seated = 0;
const missing = [];
for (const row of drop.stations) {
  const dest = join(destDir, row.hubPng);
  const candidates = [join(srcDir, row.still), join(srcDir, row.hubPng), join(srcDir, row.still.replace(/\.jpg$/, ".png"))];
  const src = candidates.find((p) => existsSync(p));
  if (!src) {
    missing.push(row.id + " (" + row.still + ")");
    continue;
  }
  convert(src, dest);
  seated++;
  console.log("seated", row.id, "←", src.replace(root + "/", ""));
}
console.log("seated", seated + "/" + drop.stations.length);
if (missing.length) console.log("missing stills:\n - " + missing.join("\n - "));
console.log("Imagine prompt prefix:\n" + drop.promptPrefix);
console.log("Ask Claude/Zeref for Blender GLB at public/models/stations/hub-<id>.glb (World3D fail-closed).");
