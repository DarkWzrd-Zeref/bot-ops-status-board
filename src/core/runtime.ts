import { MAP_H, MAP_W, TILE, WorldGrid, generateWorld, type Point } from "./grid.ts";
import { findPath } from "./pathfinder.ts";
import { bus } from "./events.ts";
import { canEquipSkill, recoTone, scanSkill } from "./skillspector.ts";
import type { AgentDef, AgentRuntime, HubDef, LiftedBuilding, LogLine, Mode, PlacedBuilding, ScanReport, SkillDef, StationMod } from "./types.ts";
import { BASE_RADIUS, BUILD_TABS, PALBOX_SLOTS, PALBOX_ID, placeFailMessage, tabFor } from "../build/palworld.ts";
import agentsFile from "../content/agents.json";
import hubsFile from "../content/hubs.json";
import modsFile from "../content/modifiers.json";
import skillsFile from "../content/skills.json";
import { projectSchema, type ProjectInfo } from "../../shared/workspace.ts";
import { CORE_X, CORE_Y } from "../../shared/map.ts";
import { seatForPal } from "../../shared/protocol.ts";

const SAVE_KEY = "area67-base-v1";

export const HUBS: HubDef[] = hubsFile.hubs as HubDef[];
export const AGENTS: AgentDef[] = agentsFile.agents.map(a => ({ ...a, name: seatForPal(a.id)?.label ?? a.name })) as AgentDef[];
export const SKILLS: SkillDef[] = skillsFile.skills as SkillDef[];
export const MODS = modsFile.stations as Record<string, StationMod>;

export function hubById(id: string): HubDef {
  const h = HUBS.find((x) => x.id === id);
  if (!h) throw new Error("unknown hub " + id);
  return h;
}

function uid(): string {
  return "b" + Math.random().toString(36).slice(2, 9);
}

function log(text: string, tone: LogLine["tone"] = "info"): void {
  const line = { at: Date.now(), text, tone };
  runtime.logs.unshift(line);
  runtime.logs = runtime.logs.slice(0, 40);
  bus.emit({ type: "log", line });
  bus.emit({ type: "toast", text, tone });
  bus.emit({ type: "changed" });
}

export const runtime = {
  grid: new WorldGrid(),
  plazaMin: { x: 0, y: 0 } as Point,
  plazaMax: { x: 0, y: 0 } as Point,
  well: { x: 0, y: 0 } as Point,
  buildings: [] as PlacedBuilding[],
  agents: [] as AgentRuntime[],
  workTargets: new Map<string, string>(),
  scans: {} as Record<string, ScanReport>,
  equipped: {} as Record<string, string[]>,
  mode: "play" as Mode,
  buildTab: BUILD_TABS[0].id as (typeof BUILD_TABS)[number]["id"],
  ghostHub: null as string | null,
  ghostProject: null as ProjectInfo | null,
  lifting: null as LiftedBuilding | null,
  selectedAgent: null as string | null,
  selectedBuilding: null as string | null,
  cautionBlocks: false,
  pulseOn: true,
  movementAcc: 0,
  pulseAcc: 0,
  logs: [] as LogLine[],
  player: { x: 0, y: 0, tx: 0, ty: 0, path: [] as Point[] },
};

export function bootRuntime(): void {
  const world = generateWorld(runtime.grid);
  runtime.plazaMin = world.plazaMin;
  runtime.plazaMax = world.plazaMax;
  runtime.well = world.well;

  const saved = loadSave();
  if (saved) {
    for (const b of saved.buildings) placeAt(b.hubId, b.tx, b.ty, b.uid, true, b.project);
    runtime.equipped = saved.equipped ?? {};
    runtime.scans = saved.scans ?? {};
    runtime.cautionBlocks = saved.cautionBlocks ?? false;
    if (saved.lifting && !runtime.buildings.some(b => b.uid === saved.lifting!.uid)) {
      placeAt(saved.lifting.hubId, saved.lifting.fromTx, saved.lifting.fromTy, saved.lifting.uid, true, saved.lifting.project);
    }
  } else {
    seedStarter();
  }

  const cx = CORE_X;
  const cy = CORE_Y;
  runtime.player.tx = cx;
  runtime.player.ty = cy + 4;
  runtime.player.x = runtime.player.tx * TILE + TILE / 2;
  runtime.player.y = runtime.player.ty * TILE + TILE / 2;

  runtime.agents = AGENTS.map((a, i) => {
    const ring = ringSpot(i);
    return {
      id: a.id,
      tx: ring.x,
      ty: ring.y,
      status: "idle",
      detail: "wandering the hub",
      buildingUid: saved?.assignments?.[a.id] ?? null,
      path: [],
      skills: runtime.equipped[a.id] ?? [],
    };
  });

  for (const a of runtime.agents) {
    if (a.buildingUid) walkToBuilding(a.id, a.buildingUid);
  }

  log("AREA 67 online. Palbox is live. Build inside the ring. Assign pals to change what they can do.", "ok");
}

function ringSpot(i: number): Point {
  const cx = CORE_X;
  const cy = CORE_Y;
  const ang = (i / Math.max(AGENTS.length, 1)) * Math.PI * 2;
  const r = 5;
  return {
    x: Math.round(cx + Math.cos(ang) * r),
    y: Math.round(cy + Math.sin(ang) * r + 2),
  };
}

function seedStarter(): void {
  const { plazaMin, plazaMax, well } = runtime;
  forcePlace("well", well.x, well.y);
  forcePlace("bank", Math.floor((plazaMin.x + plazaMax.x) / 2) - 1, plazaMin.y - 3);
  forcePlace("grand-exchange", plazaMax.x + 2, Math.floor((plazaMin.y + plazaMax.y) / 2) - 1);
  forcePlace("discord", plazaMin.x - 5, Math.floor((plazaMin.y + plazaMax.y) / 2) - 1);
  forcePlace("cursor", Math.floor((plazaMin.x + plazaMax.x) / 2) - 1, plazaMax.y + 2);
  forcePlace("skillspector", plazaMax.x + 2, plazaMin.y - 4);
  forcePlace("war-table", 18, 10);
  forcePlace("vision-board", 15, 27);
  forcePlace("pending-work", 34, 28);
  forcePlace("efficiency-guide", 22, 32);
  forcePlace("skill-altar", 42, 18);
}

function forcePlace(hubId: string, tx: number, ty: number): void {
  const hub = hubById(hubId);
  const b: PlacedBuilding = { uid: uid(), hubId, tx, ty };
  runtime.grid.occupy(tx, ty, hub.w, hub.h, true);
  runtime.buildings.push(b);
}

export function catalogForTab(tab = runtime.buildTab): HubDef[] {
  return HUBS.filter((h) => h.placeable && tabFor(h) === tab);
}

export function placementOk(hubId: string, tx: number, ty: number): boolean {
  const hub = hubById(hubId);
  return runtime.grid.canPlace(tx, ty, hub.w, hub.h, runtime.well, BASE_RADIUS);
}

export function placeAt(hubId: string, tx: number, ty: number, reuseUid?: string, skipRules = false, project?: ProjectInfo): boolean {
  const hub = hubById(hubId);
  if (!skipRules && hubId !== PALBOX_ID) {
    if (!runtime.grid.canPlace(tx, ty, hub.w, hub.h, runtime.well, BASE_RADIUS)) return false;
  }
  runtime.grid.occupy(tx, ty, hub.w, hub.h, true);
  const b: PlacedBuilding = { uid: reuseUid ?? uid(), hubId, tx, ty, ...(project ? { project } : {}) };
  runtime.buildings.push(b);
  persist();
  bus.emit({ type: "changed" });
  return true;
}

export function tryPlace(hubId: string, tx: number, ty: number): boolean {
  const hub = hubById(hubId);
  if (hubId === PALBOX_ID) {
    log("Palbox stays at the core. That's the AREA 67 well.", "warn");
    return false;
  }
  const fail = runtime.grid.placeFail(tx, ty, hub.w, hub.h, runtime.well, BASE_RADIUS);
  if (fail) {
    log(placeFailMessage(fail), "warn");
    return false;
  }
  if (hubId === "project-site" && !runtime.ghostProject) { log("Name your repository or workspace first.", "warn"); return false; }
  placeAt(hubId, tx, ty, undefined, false, hubId === "project-site" ? runtime.ghostProject! : undefined);
  if (hubId === "project-site") { runtime.ghostProject = null; runtime.ghostHub = null; runtime.mode = "play"; runtime.selectedBuilding = runtime.buildings.at(-1)!.uid; runtime.selectedAgent = null; }
  const mod = MODS[hubId];
  log("Founded " + hub.name + ". " + (mod?.aiChange ?? "Station online."), "ok");
  return true;
}

export function beginMove(uidStr: string): boolean {
  const b = runtime.buildings.find((x) => x.uid === uidStr);
  if (!b) return false;
  const hub = hubById(b.hubId);
  if (!hub.placeable) {
    log("Core structures stay put.", "warn");
    return false;
  }
  runtime.lifting = { uid: b.uid, hubId: b.hubId, fromTx: b.tx, fromTy: b.ty, project: b.project };
  runtime.grid.occupy(b.tx, b.ty, hub.w, hub.h, false);
  runtime.buildings = runtime.buildings.filter((x) => x.uid !== uidStr);
  runtime.ghostHub = b.hubId;
  runtime.mode = "move";
  persist();
  log("Picked up " + hub.name + ". Click a plot inside the Palbox ring.", "info");
  bus.emit({ type: "changed" });
  return true;
}

export function finishMove(tx: number, ty: number): boolean {
  const lift = runtime.lifting;
  if (!lift) return false;
  const hub = hubById(lift.hubId);
  const fail = runtime.grid.placeFail(tx, ty, hub.w, hub.h, runtime.well, BASE_RADIUS);
  if (fail) {
    log(placeFailMessage(fail), "warn");
    return false;
  }
  placeAt(lift.hubId, tx, ty, lift.uid, false, lift.project);
  for (const a of runtime.agents) {
    if (a.buildingUid === lift.uid) walkToBuilding(a.id, lift.uid);
  }
  runtime.lifting = null;
  runtime.ghostHub = null;
  runtime.mode = "play";
  log("Replanted " + hub.name + ".", "ok");
  persist();
  return true;
}

export function cancelMove(): void {
  const lift = runtime.lifting;
  if (!lift) return;
  placeAt(lift.hubId, lift.fromTx, lift.fromTy, lift.uid, true, lift.project);
  runtime.lifting = null;
  runtime.ghostHub = null;
  runtime.mode = "play";
  log("Move cancelled.", "info");
  persist();
}

export function demolish(uidStr: string): void {
  const b = runtime.buildings.find((x) => x.uid === uidStr);
  if (!b) return;
  const hub = hubById(b.hubId);
  if (!hub.placeable && b.hubId === PALBOX_ID) {
    log("The Palbox stays. AREA 67 has no base without it.", "warn");
    return;
  }
  runtime.grid.occupy(b.tx, b.ty, hub.w, hub.h, false);
  runtime.buildings = runtime.buildings.filter((x) => x.uid !== uidStr);
  if (runtime.selectedBuilding === uidStr) runtime.selectedBuilding = null;
  for (const a of runtime.agents) {
    if (a.buildingUid === uidStr) {
      a.buildingUid = null;
      a.status = "idle";
      a.detail = "station demolished";
    }
  }
  persist();
  log(b.project ? "Removed the project building. Repository and files are untouched." : "Removed " + hub.name + ". Pals are unassigned.", "warn");
}

export function prepareProject(info: ProjectInfo): void {
  if (runtime.lifting) cancelMove();
  runtime.ghostProject = projectSchema.parse(info);
  runtime.ghostHub = "project-site"; runtime.mode = "build"; runtime.buildTab = "projects";
  bus.emit({ type: "changed" });
}
export function updateProject(uid: string, info: ProjectInfo): void {
  const building = runtime.buildings.find(b => b.uid === uid && b.hubId === "project-site");
  if (!building) throw new Error("Project building no longer exists");
  building.project = projectSchema.parse(info); persist();
}
export function buildingName(building: PlacedBuilding): string { return building.project?.name ?? hubById(building.hubId).name; }

/** Collapsed map chip: catalog short name, or the project title. Selected/inspector still use buildingName. */
export function stationMapLabel(building: PlacedBuilding, selected = false): string {
  if (selected) return buildingName(building);
  return building.project?.name ?? hubById(building.hubId).short;
}

export function buildingAt(tx: number, ty: number): PlacedBuilding | null {
  for (const b of runtime.buildings) {
    const h = hubById(b.hubId);
    if (tx >= b.tx && tx < b.tx + h.w && ty >= b.ty && ty < b.ty + h.h) return b;
  }
  return null;
}

export function grantsFor(agentId: string): string[] {
  const a = runtime.agents.find((x) => x.id === agentId);
  if (!a?.buildingUid) return [];
  const b = runtime.buildings.find((x) => x.uid === a.buildingUid);
  if (!b) return [];
  return MODS[b.hubId]?.grants ?? [];
}

export function assignAgent(agentId: string, buildingUid: string | null): void {
  const a = runtime.agents.find((x) => x.id === agentId);
  if (!a) return;
  if (!buildingUid) {
    a.buildingUid = null;
    a.path = [];
    a.status = "idle";
    a.detail = "unassigned";
    persist();
    bus.emit({ type: "changed" });
    return;
  }
  const b = runtime.buildings.find((x) => x.uid === buildingUid);
  if (!b) return;
  const hub = hubById(b.hubId);
  const slots = MODS[b.hubId]?.slots ?? 1;
  const used = runtime.agents.filter((x) => x.id !== agentId && x.buildingUid === buildingUid).length;
  if (slots > 0 && used >= slots) {
    log(hub.name + " is full (" + slots + " pal slots).", "warn");
    return;
  }
  a.buildingUid = buildingUid;
  const def = AGENTS.find((x) => x.id === agentId);
  const work = MODS[b.hubId]?.work;
  if (def && work && def.work.length && !def.work.includes(work)) {
    log(def.name + " work-suitability mismatch (" + def.work.join("/") + " vs " + work + "). Assigning anyway.", "warn");
  }
  walkToBuilding(agentId, buildingUid);
  log(agentName(agentId) + " assigned to " + hub.name + ". AI now: " + (MODS[b.hubId]?.aiChange ?? hub.blurb), "ok");
  const twin = AGENTS.find((x) => x.mimicOf === agentId);
  if (twin) {
    assignAgent(twin.id, buildingUid);
    log(twin.name + " follows the station assignment when capacity allows. This does not run its AI.", "info");
  }
  persist();
}

function agentName(id: string): string {
  return AGENTS.find((x) => x.id === id)?.name ?? id;
}

export function walkAgentToHub(agentId: string, hubId: string): void {
  const b = runtime.buildings.find((x) => x.hubId === hubId);
  if (!b) return;
  const a = runtime.agents.find((x) => x.id === agentId);
  if (!a) return;
  const hub = hubById(b.hubId);
  const dock = runtime.grid.dockFor(b.tx, b.ty, hub.w, hub.h);
  a.path = findPath(runtime.grid, { x: a.tx, y: a.ty }, dock);
  a.status = a.path.length ? "walk" : "work";
  a.detail = "on radio at " + hub.short;
  bus.emit({ type: "changed" });
}

export function palSay(agentId: string, text: string): void {
  const a = runtime.agents.find((x) => x.id === agentId);
  if (!a) return;
  if (!runtime.workTargets.has(agentId)) walkAgentToHub(agentId, "grand-exchange");
  a.detail = text.length > 72 ? text.slice(0, 69) + "…" : text;
  bus.emit({ type: "say", agentId, text });
}

export function syncWorkTargets(targets: Map<string, string>): void {
  const old = runtime.workTargets;
  runtime.workTargets = targets;
  for (const a of runtime.agents) {
    const target = targets.get(a.id);
    const building = runtime.buildings.find(b => b.uid === target);
    if (building) {
      const h = hubById(building.hubId);
      const dock = runtime.grid.dockFor(building.tx, building.ty, h.w, h.h);
      const goal = a.path.at(-1);
      if (old.get(a.id) !== target || (!goal && (a.tx !== dock.x || a.ty !== dock.y)) || (goal && (goal.x !== dock.x || goal.y !== dock.y))) walkToBuilding(a.id, building.uid);
    } else if (old.has(a.id)) {
      a.path = []; a.status = "idle"; a.detail = "Work report no longer live";
      if (a.buildingUid) walkToBuilding(a.id, a.buildingUid);
    }
  }
}

export function walkToBuilding(agentId: string, buildingUid: string): void {
  const a = runtime.agents.find((x) => x.id === agentId);
  const b = runtime.buildings.find((x) => x.uid === buildingUid);
  if (!a || !b) return;
  const hub = hubById(b.hubId);
  const dock = runtime.grid.dockFor(b.tx, b.ty, hub.w, hub.h);
  a.path = findPath(runtime.grid, { x: a.tx, y: a.ty }, dock);
  a.status = a.path.length ? "walk" : "work";
  a.detail = a.path.length ? "walking to " + hub.short : "at " + hub.short;
  bus.emit({ type: "changed" });
}

export function walkPlayerTo(tx: number, ty: number): void {
  if (!runtime.grid.walkable(tx, ty)) return;
  runtime.player.path = findPath(runtime.grid, { x: runtime.player.tx, y: runtime.player.ty }, { x: tx, y: ty });
}

export function stepAgents(dt: number): void {
  runtime.movementAcc += dt;
  if (runtime.movementAcc < 160) return;
  runtime.movementAcc = 0;
  for (const a of runtime.agents) {
    if (!a.path.length) {
      if (a.buildingUid && a.status === "walk") {
        a.status = workStatus(a);
        const b = runtime.buildings.find((x) => x.uid === a.buildingUid);
        a.detail = b ? workDetail(a, b) : "idle";
      }
      continue;
    }
    const n = a.path[0];
    if (a.tx === n.x && a.ty === n.y) a.path.shift();
    else {
      a.tx = n.x;
      a.ty = n.y;
      a.path.shift();
    }
  }

  if (runtime.player.path.length) {
    const n = runtime.player.path[0];
    runtime.player.tx = n.x;
    runtime.player.ty = n.y;
    runtime.player.x = n.x * TILE + TILE / 2;
    runtime.player.y = n.y * TILE + TILE / 2;
    runtime.player.path.shift();
  }

  if (runtime.pulseOn) {
    runtime.pulseAcc += 160;
    if (runtime.pulseAcc > 4500) {
      runtime.pulseAcc = 0;
      pulseOnce();
    }
  }
}

function workStatus(a: AgentRuntime): AgentRuntime["status"] {
  const b = runtime.buildings.find((x) => x.uid === a.buildingUid);
  if (!b) return "idle";
  if (b.hubId === "skillspector") return "scan";
  return "work";
}

function workDetail(a: AgentRuntime, b: PlacedBuilding): string {
  const hub = hubById(b.hubId);
  if (b.hubId === "skillspector") return a.id + " scanning skills (SkillSpector)";
  return "working: " + (MODS[b.hubId]?.work ?? hub.short);
}

function pulseOnce(): void {
  const idle = runtime.agents.filter((a) => !a.buildingUid && !runtime.workTargets.has(a.id));
  if (idle.length && Math.random() < 0.4) {
    const a = idle[Math.floor(Math.random() * idle.length)];
    const wander = ringSpot(Math.floor(Math.random() * 10));
    if (runtime.grid.walkable(wander.x, wander.y)) {
      a.path = findPath(runtime.grid, { x: a.tx, y: a.ty }, wander);
      a.status = "walk";
      a.detail = "patrolling AREA 67";
    }
    bus.emit({ type: "changed" });
    return;
  }
  const workers = runtime.agents.filter((a) => !runtime.workTargets.has(a.id) && runtime.buildings.some(b => b.uid === a.buildingUid));
  if (!workers.length) return;
  const a = workers[Math.floor(Math.random() * workers.length)];
  a.detail = workDetail(a, runtime.buildings.find((x) => x.uid === a.buildingUid)!);
  bus.emit({ type: "changed" });
}

export async function runScan(skillId: string): Promise<void> {
  const hasGate = runtime.buildings.some((b) => b.hubId === "skillspector");
  if (!hasGate) {
    log("Place a Spector Gate first. That's the Palworld rule: no station, no work.", "bad");
    return;
  }
  const skill = SKILLS.find((s) => s.id === skillId);
  if (!skill) return;
  const police = runtime.agents.find((a) => a.id === "police");
  const gate = runtime.buildings.find((b) => b.hubId === "skillspector");
  if (police && gate) walkToBuilding("police", gate.uid);
  log("SkillSpector scanning " + skill.name + "…", "info");
  const report = await scanSkill(skillId, skill.target);
  runtime.scans[skillId] = report;
  persist();
  const reco = report.risk_assessment.recommendation;
  log(
    skill.name + " → " + reco + " (" + report.risk_assessment.score + "/100, " + report.issues.length + " findings)",
    recoTone(reco),
  );
}

export function equipSkill(agentId: string, skillId: string): void {
  const hasRack = runtime.buildings.some((b) => b.hubId === "skill-rack");
  const hasGate = runtime.buildings.some((b) => b.hubId === "skillspector");
  if (!hasGate) {
    log("Need a Spector Gate on the base before skills can change an AI.", "bad");
    return;
  }
  if (!hasRack) {
    log("Place a Skill Rack, then assign a pal to install.", "warn");
    return;
  }
  const gate = canEquipSkill(runtime.scans[skillId], runtime.cautionBlocks);
  if (!gate.ok) {
    log(gate.reason, "bad");
    return;
  }
  const a = runtime.agents.find((x) => x.id === agentId);
  if (!a) return;
  if (!a.skills.includes(skillId)) a.skills.push(skillId);
  runtime.equipped[agentId] = a.skills;
  persist();
  log("Installed " + (SKILLS.find((s) => s.id === skillId)?.name ?? skillId) + " on " + agentName(agentId) + ". " + gate.reason, gate.reason.includes("CAUTION") ? "warn" : "ok");
}

export interface SaveShape {
  buildings: PlacedBuilding[];
  equipped: Record<string, string[]>;
  scans: Record<string, ScanReport>;
  assignments: Record<string, string | null>;
  cautionBlocks: boolean;
  lifting: LiftedBuilding | null;
}

let persistHook: ((data: SaveShape) => void) | null = null;

export function onPersist(fn: (data: SaveShape) => void): void {
  persistHook = fn;
}

/** Apply the shared base without re-publishing it back to the server. */
export function applyBaseSnapshot(next: Pick<SaveShape, "buildings" | "assignments"> & { equipped?: Record<string, string[]> }): void {
  runtime.grid = new WorldGrid();
  generateWorld(runtime.grid);
  runtime.buildings = [];
  for (const b of next.buildings) {
    const h = HUBS.find(h => h.id === b.hubId);
    if (!h || !runtime.grid.inBounds(b.tx, b.ty)) continue;
    runtime.buildings.push(b);
    runtime.grid.occupy(b.tx, b.ty, h.w, h.h, true);
  }
  runtime.equipped = next.equipped ?? {};
  if (runtime.lifting) { runtime.mode = "play"; runtime.ghostHub = null; }
  runtime.lifting = null;
  for (const a of runtime.agents) {
    const candidate = next.assignments[a.id];
    const assigned = runtime.buildings.some(b => b.uid === candidate) ? candidate : null;
    const changed = a.buildingUid !== assigned;
    a.buildingUid = assigned;
    a.skills = runtime.equipped[a.id] ?? [];
    if (changed || assigned) {
      a.path = [];
      if (runtime.workTargets.has(a.id) && runtime.buildings.some(b => b.uid === runtime.workTargets.get(a.id))) walkToBuilding(a.id, runtime.workTargets.get(a.id)!);
      else if (assigned) walkToBuilding(a.id, assigned);
      else { a.status = "idle"; a.detail = "unassigned"; }
    }
  }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(exportSave())); } catch { /* local cache optional */ }
  bus.emit({ type: "changed" });
}

export function exportSave(): SaveShape {
  // A move preview is local; retain the original station until it is replanted.
  const buildings = runtime.buildings.slice();
  if (runtime.lifting && !buildings.some(b => b.uid === runtime.lifting!.uid)) {
    const l = runtime.lifting;
    buildings.push({ uid: l.uid, hubId: l.hubId, tx: l.fromTx, ty: l.fromTy, ...(l.project ? { project: l.project } : {}) });
  }
  return {
    buildings,
    equipped: runtime.equipped,
    scans: runtime.scans,
    assignments: Object.fromEntries(runtime.agents.map((a) => [a.id, a.buildingUid])),
    cautionBlocks: runtime.cautionBlocks,
    lifting: runtime.lifting,
  };
}

function persist(): void {
  const data = exportSave();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
  persistHook?.(data);
  bus.emit({ type: "changed" });
}

function loadSave(): SaveShape | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveShape;
  } catch {
    return null;
  }
}

export function resetBase(): void {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

export { TILE, MAP_W, MAP_H, BASE_RADIUS, BUILD_TABS, PALBOX_SLOTS };
