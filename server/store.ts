import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS, HUBS, SEATS, SPEAKER_PAL, agentById, hubById, publicBase as siteBase, seatUrl, type Speaker } from "./catalog.ts";

export interface PlacedBuilding {
  uid: string;
  hubId: string;
  tx: number;
  ty: number;
}

export interface BaseSnapshot {
  buildings: PlacedBuilding[];
  assignments: Record<string, string | null>;
  equipped?: Record<string, string[]>;
}

export interface ArchitectNote {
  id: string;
  from: Speaker;
  palId: string | null;
  text: string;
  at: number;
}

export interface PalUtterance {
  palId: string;
  text: string;
  at: number;
}

export type BusEvent =
  | { type: "hello"; notes: ArchitectNote[]; base: BaseSnapshot | null }
  | { type: "architect"; note: ArchitectNote }
  | { type: "pal-say"; palId: string; text: string; at: number }
  | { type: "pal-assign"; palId: string; buildingUid: string | null; hubId: string | null }
  | { type: "base"; base: BaseSnapshot }
  | { type: "ping" };

interface DiskState {
  notes: ArchitectNote[];
  lastSay: Record<string, PalUtterance>;
  base: BaseSnapshot | null;
}

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "area67.json");
const MAX_NOTES = 200;

const listeners = new Set<(ev: BusEvent) => void>();

let state: DiskState = { notes: [], lastSay: {}, base: null };

function nid(): string {
  return "n" + Math.random().toString(36).slice(2, 10);
}

export function loadStore(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DiskState>;
    state = {
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      lastSay: parsed.lastSay && typeof parsed.lastSay === "object" ? parsed.lastSay : {},
      base: parsed.base ?? null,
    };
  } catch {
    mkdirSync(DATA_DIR, { recursive: true });
    persist();
  }
}

function persist(): void {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("area67 persist failed", err);
  }
}

export function subscribe(fn: (ev: BusEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publish(ev: BusEvent): void {
  for (const fn of listeners) fn(ev);
}

export function notes(limit = 40): ArchitectNote[] {
  return state.notes.slice(0, Math.max(1, limit));
}

export function base(): BaseSnapshot | null {
  return state.base;
}

export function lastSay(): Record<string, PalUtterance> {
  return state.lastSay;
}

export function setBase(next: BaseSnapshot): void {
  state.base = {
    buildings: next.buildings ?? [],
    assignments: next.assignments ?? {},
    equipped: next.equipped,
  };
  persist();
}

export function postArchitect(from: Speaker, text: string): ArchitectNote {
  const palId = SPEAKER_PAL[from];
  const note: ArchitectNote = { id: nid(), from, palId, text: text.trim(), at: Date.now() };
  state.notes.unshift(note);
  state.notes = state.notes.slice(0, MAX_NOTES);
  if (palId) {
    state.lastSay[palId] = { palId, text: note.text, at: note.at };
  }
  persist();
  publish({ type: "architect", note });
  return note;
}

export function say(palId: string, text: string): PalUtterance | { error: string } {
  if (!agentById(palId)) return { error: "unknown pal " + palId };
  const u: PalUtterance = { palId, text: text.trim(), at: Date.now() };
  state.lastSay[palId] = u;
  persist();
  publish({ type: "pal-say", palId, text: u.text, at: u.at });
  return u;
}

export function assignPal(
  palId: string,
  hubId: string | null,
): { ok: true; buildingUid: string | null; hubId: string | null } | { ok: false; error: string } {
  if (!agentById(palId)) return { ok: false, error: "unknown pal " + palId };
  if (!state.base) {
    return { ok: false, error: "No live base yet. Open AREA 67 in a browser so the Palbox posts its stations." };
  }
  if (!hubId || hubId === "unassign" || hubId === "idle") {
    state.base.assignments[palId] = null;
    persist();
    publish({ type: "pal-assign", palId, buildingUid: null, hubId: null });
    return { ok: true, buildingUid: null, hubId: null };
  }
  if (!hubById(hubId)) return { ok: false, error: "unknown station " + hubId };
  const b = state.base.buildings.find((x) => x.hubId === hubId);
  if (!b) return { ok: false, error: "Station " + hubId + " is not placed on this Palbox yet." };
  state.base.assignments[palId] = b.uid;
  persist();
  publish({ type: "pal-assign", palId, buildingUid: b.uid, hubId });
  return { ok: true, buildingUid: b.uid, hubId };
}

export function palList() {
  const assignments = state.base?.assignments ?? {};
  const buildings = state.base?.buildings ?? [];
  return AGENTS.map((a) => {
    const uid = assignments[a.id] ?? null;
    const b = uid ? buildings.find((x) => x.uid === uid) : undefined;
    const hub = b ? hubById(b.hubId) : undefined;
    const uttered = state.lastSay[a.id];
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      model: a.model,
      work: a.work,
      station: hub?.id ?? null,
      stationName: hub?.name ?? null,
      lastSay: uttered?.text ?? null,
    };
  });
}

export function stationList() {
  const placed = state.base?.buildings ?? [];
  return HUBS.map((h) => {
    const copies = placed.filter((b) => b.hubId === h.id);
    const occupants = AGENTS.filter((a) => {
      const uid = state.base?.assignments?.[a.id];
      return uid ? copies.some((b) => b.uid === uid) : false;
    }).map((a) => a.id);
    return {
      id: h.id,
      name: h.name,
      short: h.short,
      kind: h.kind,
      mcp: h.mcp,
      placeable: h.placeable,
      placed: copies.length > 0,
      count: copies.length,
      pals: occupants,
      blurb: h.blurb,
    };
  });
}

export function statusText(forSeat?: string): string {
  const publicBase = siteBase();
  const placed = stationList().filter((s) => s.placed);
  const recent = notes(8);
  const lines = [
    "AREA 67 architect desk",
    "You are talking THROUGH the game. Zeref directs. You architect here.",
    forSeat ? "Your locked MCP: " + seatUrl(forSeat) : "Generic MCP: " + publicBase + "/mcp  (pass from=)",
    "Connect guide: " + publicBase + "/connect",
    "Live board: " + publicBase,
    "",
    "Seats (each product uses its own URL):",
    ...SEATS.map((s) => "  - " + s.label + " → " + seatUrl(s.slug) + "  pal=" + (s.palId ?? "none")),
    "",
    "Pals (" + palList().length + "):",
    ...palList().map((p) => "  - " + p.id + " · " + p.name + " · " + p.model + " · " + (p.stationName ?? "unassigned")),
    "",
    "Stations on the Palbox:",
    ...(placed.length ? placed.map((s) => "  - " + s.id + " · " + s.name + (s.pals.length ? " ← " + s.pals.join(",") : "")) : ["  (none posted yet — open the site once)"]),
    "",
    "Radio:",
    ...(recent.length
      ? recent.map((n) => "  [" + n.from + "] " + n.text)
      : ["  (silent — post with architect_post)"]),
  ];
  return lines.join("\n");
}
