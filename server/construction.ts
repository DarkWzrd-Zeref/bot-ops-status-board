import { isDeepStrictEqual } from "node:util";
import { AGENTS, HUBS, hubById } from "./catalog.ts";
import type { BaseSnapshot, PlacedBuilding } from "./store.ts";
import type { Speaker } from "../shared/protocol.ts";
import type { StationPlan } from "../shared/construction.ts";
import { WorldGrid, generateWorld } from "../src/core/grid.ts";
import { BASE_RADIUS, CORE_X, CORE_Y, MAP_W, MAP_H } from "../shared/map.ts";

// Match bootRuntime's fixed player and pal starts. Keep the civic plaza open.
const spawnTiles = [{ x: CORE_X, y: CORE_Y + 4 }, ...AGENTS.map((_, i) => ({
  x: CORE_X + Math.round(Math.cos(i / AGENTS.length * Math.PI * 2) * 5),
  y: CORE_Y + 2 + Math.round(Math.sin(i / AGENTS.length * Math.PI * 2) * 5),
}))];

export function constructionInventory(base: BaseSnapshot | null, revision: number) {
  const grid = new WorldGrid(); const { plazaMin, plazaMax } = generateWorld(grid);
  const blockedTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!grid.walkable(x, y)) blockedTiles.push({ x, y });
  return {
    revision, base,
    map: { width: MAP_W, height: MAP_H, core: { x: CORE_X, y: CORE_Y }, radius: BASE_RADIUS, reservedPlaza: { min: plazaMin, max: plazaMax }, spawnTiles, blockedTiles },
    stations: HUBS.map(h => ({ ...h, placed: base?.buildings.filter(b => b.hubId === h.id) ?? [], connectionStatus: "unverified" as const })),
    missing: HUBS.filter(h => h.placeable && !base?.buildings.some(b => b.hubId === h.id)).map(h => h.id),
  };
}

export interface ConstructionIssue { code: string; message: string; buildingUid?: string }
export function planConstruction(base: BaseSnapshot | null, seat: Speaker, input: StationPlan) {
  const errors: ConstructionIssue[] = [];
  const prefix = `build:${seat}:${input.requestId}:`;
  const planned: PlacedBuilding[] = input.buildings.map((b, i) => ({ ...b, uid: prefix + i }));
  const result = (alreadyApplied = false) => ({ ok: errors.length === 0, errors, planned, alreadyApplied });
  if (!base) { errors.push({ code: "base_missing", message: "The operator must initialize the base before building stations." }); return result(); }
  // Whole-plan retries are read-only even after a lost response/restart. A changed
  // or partially removed plan must never silently become a different build.
  const prior = base.buildings.filter(b => b.uid.startsWith(prefix));
  if (prior.length) {
    const exact = prior.length === planned.length && planned.every(b => isDeepStrictEqual(prior.find(old => old.uid === b.uid), b));
    if (!exact) errors.push({ code: "request_conflict", message: "This requestId already identifies a different or partially removed plan. Inspect inventory and choose a new requestId." });
    return result(exact);
  }
  if (base.buildings.length + planned.length > 400) errors.push({ code: "capacity", message: "The base supports at most 400 buildings." });
  const grid = new WorldGrid(); const { well, plazaMin, plazaMax } = generateWorld(grid);
  for (const b of base.buildings) {
    const h = hubById(b.hubId);
    if (!h) errors.push({ code: "invalid_base", message: "Existing base contains an unknown station; ask the operator to repair it.", buildingUid: b.uid });
    else grid.occupy(b.tx, b.ty, h.w, h.h, true);
  }
  for (const b of planned) {
    const fail = (code: string, message: string) => errors.push({ code, message, buildingUid: b.uid });
    const h = hubById(b.hubId);
    if (!h || !h.placeable) { fail("not_buildable", "Choose a placeable hubId from station_inventory; fixed core structures cannot be added."); continue; }
    if ((b.hubId === "project-site") !== !!b.project) { fail("project_metadata", "Only project-site requires project metadata, including a real repository URL or workspace label."); continue; }
    const reason = grid.placeFail(b.tx, b.ty, h.w, h.h, well, BASE_RADIUS);
    if (reason) { fail(reason, `Cannot place ${h.name}: ${reason}. Check the footprint and terrain in station_inventory.`); continue; }
    const contains = (x: number, y: number) => x >= b.tx && x < b.tx + h.w && y >= b.ty && y < b.ty + h.h;
    if (b.tx <= plazaMax.x && b.tx + h.w > plazaMin.x && b.ty <= plazaMax.y && b.ty + h.h > plazaMin.y) {
      fail("reserved_plaza", "Keep the central civic plaza clear; build in the surrounding districts."); continue;
    }
    if (spawnTiles.some(p => contains(p.x, p.y))) { fail("reserved_spawn", "This footprint covers an agent or player spawn tile."); continue; }
    grid.occupy(b.tx, b.ty, h.w, h.h, true);
  }
  if (errors.length) return result();
  const start = spawnTiles[0]; const reachable = new Set<string>(); const queue = [start];
  if (grid.walkable(start.x, start.y)) reachable.add(start.x + ":" + start.y);
  for (let i = 0; i < queue.length && reachable.size; i++) {
    const p = queue[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const x = p.x + dx, y = p.y + dy, key = x + ":" + y;
      if (grid.walkable(x, y) && !reachable.has(key)) { reachable.add(key); queue.push({ x, y }); }
    }
  }
  for (const p of spawnTiles) if (!reachable.has(p.x + ":" + p.y)) errors.push({ code: "unreachable_spawn", message: `Keep the spawn at ${p.x},${p.y} connected to the plaza.` });
  for (const b of [...base.buildings, ...planned]) {
    const h = hubById(b.hubId)!; const dock = grid.dockFor(b.tx, b.ty, h.w, h.h);
    if (!reachable.has(dock.x + ":" + dock.y)) errors.push({ code: "unreachable_dock", message: `The game entrance for ${h.name} at ${dock.x},${dock.y} cannot be reached from the plaza.`, buildingUid: b.uid });
  }
  return result();
}
