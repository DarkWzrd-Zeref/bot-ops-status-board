import { MAP_H, MAP_W, TILE, WorldGrid, generateWorld, type Point } from "./grid.ts";
import { findPath } from "./pathfinder.ts";
import { bus } from "./events.ts";
import { canEquipSkill, recoTone, scanSkill } from "./skillspector.ts";
import type { AgentDef, AgentRuntime, HubDef, LogLine, Mode, PlacedBuilding, ScanReport, SkillDef, StationMod } from "./types.ts";
import agentsFile from "../content/agents.json";
import hubsFile from "../content/hubs.json";
import modsFile from "../content/modifiers.json";
import skillsFile from "../content/skills.json";

const SAVE_KEY = "cbb-base-v1";

export const HUBS: HubDef[] = hubsFile.hubs as HubDef[];
export const AGENTS: AgentDef[] = agentsFile.agents as AgentDef[];
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
  scans: {} as Record<string, ScanReport>,
  equipped: {} as Record<string, string[]>,
  mode: "play" as Mode,
  ghostHub: null as string | null,
  selectedAgent: null as string | null,
  selectedBuilding: null as string | null,
  cautionBlocks: false,
  pulseOn: true,
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
    for (const b of saved.buildings) placeAt(b.hubId, b.tx, b.ty, b.uid, true);
    runtime.equipped = saved.equipped ?? {};
    runtime.scans = saved.scans ?? {};
    runtime.cautionBlocks = saved.cautionBlocks ?? false;
  } else {
    seedStarter();
  }

  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
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

  log("Base online. Place stations to change what pals can do. Spector Gate scans skills first.", "ok");
}

function ringSpot(i: number): Point {
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
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
}

function forcePlace(hubId: string, tx: number, ty: number): void {
  const hub = hubById(hubId);
  const b: PlacedBuilding = { uid: uid(), hubId, tx, ty };
  runtime.grid.occupy(tx, ty, hub.w, hub.h, true);
  runtime.buildings.push(b);
}

export function placeAt(hubId: string, tx: number, ty: number, reuseUid?: string, skipPlaza = false): boolean {
  const hub = hubById(hubId);
  if (!skipPlaza && hubId !== "well") {
    if (!runtime.grid.canPlace(tx, ty, hub.w, hub.h, runtime.plazaMin, runtime.plazaMax)) return false;
  }
  if (skipPlaza) runtime.grid.occupy(tx, ty, hub.w, hub.h, true);
  else runtime.grid.occupy(tx, ty, hub.w, hub.h, true);
  const b: PlacedBuilding = { uid: reuseUid ?? uid(), hubId, tx, ty };
  runtime.buildings.push(b);
  persist();
  bus.emit({ type: "changed" });
  return true;
}

export function tryPlace(hubId: string, tx: number, ty: number): boolean {
  const hub = hubById(hubId);
  if (!runtime.grid.canPlace(tx, ty, hub.w, hub.h, runtime.plazaMin, runtime.plazaMax)) {
    log("Can't plant that here. Keep the plaza clear (Palbox radius / GE floor).", "warn");
    return false;
  }
  placeAt(hubId, tx, ty);
  const mod = MODS[hubId];
  log("Placed " + hub.name + ". " + (mod?.aiChange ?? "Station online."), "ok");
  return true;
}

export function demolish(uidStr: string): void {
  const b = runtime.buildings.find((x) => x.uid === uidStr);
  if (!b) return;
  const hub = hubById(b.hubId);
  if (!hub.placeable && b.hubId === "well") {
    log("The Command Well is the Palbox. It stays.", "warn");
    return;
  }
  runtime.grid.occupy(b.tx, b.ty, hub.w, hub.h, false);
  runtime.buildings = runtime.buildings.filter((x) => x.uid !== uidStr);
  for (const a of runtime.agents) {
    if (a.buildingUid === uidStr) {
      a.buildingUid = null;
      a.status = "idle";
      a.detail = "station demolished";
    }
  }
  persist();
  log("Removed " + hub.name + ". Assigned pals lost that AI change.", "warn");
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
  a.buildingUid = buildingUid;
  if (!buildingUid) {
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
  const used = runtime.agents.filter((x) => x.buildingUid === buildingUid).length;
  if (slots > 0 && used > slots) {
    a.buildingUid = null;
    log(hub.name + " is full (" + slots + " pal slots).", "warn");
    return;
  }
  walkToBuilding(agentId, buildingUid);
  log(agentName(agentId) + " assigned to " + hub.name + ". AI now: " + (MODS[b.hubId]?.aiChange ?? hub.blurb), "ok");
  const source = AGENTS.find((x) => x.id === agentId);
  const twin = AGENTS.find((x) => x.mimicOf === agentId);
  if (twin) {
    window.setTimeout(() => {
      assignAgent(twin.id, buildingUid);
      log(twin.name + " mimics " + (source?.name ?? agentId) + " (Grok twin leash).", "info");
    }, 700);
  }
  persist();
}

function agentName(id: string): string {
  return AGENTS.find((x) => x.id === id)?.name ?? id;
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
    runtime.pulseAcc += dt;
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
  const idle = runtime.agents.filter((a) => !a.buildingUid);
  if (idle.length && Math.random() < 0.4) {
    const a = idle[Math.floor(Math.random() * idle.length)];
    const wander = ringSpot(Math.floor(Math.random() * 10));
    if (runtime.grid.walkable(wander.x, wander.y)) {
      a.path = findPath(runtime.grid, { x: a.tx, y: a.ty }, wander);
      a.status = "walk";
      a.detail = "patrolling plaza";
    }
    bus.emit({ type: "changed" });
    return;
  }
  const workers = runtime.agents.filter((a) => a.buildingUid);
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

interface SaveShape {
  buildings: PlacedBuilding[];
  equipped: Record<string, string[]>;
  scans: Record<string, ScanReport>;
  assignments: Record<string, string | null>;
  cautionBlocks: boolean;
}

function persist(): void {
  const data: SaveShape = {
    buildings: runtime.buildings,
    equipped: runtime.equipped,
    scans: runtime.scans,
    assignments: Object.fromEntries(runtime.agents.map((a) => [a.id, a.buildingUid])),
    cautionBlocks: runtime.cautionBlocks,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
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

export { TILE, MAP_W, MAP_H };
