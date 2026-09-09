import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS, HUBS, MODS, SKILL_IDS, SEATS, SPEAKER_PAL, agentById, hubById, publicBase as siteBase, seatUrl, type Speaker } from "./catalog.ts";
import { randomUUID } from "node:crypto";
import { projectSchema, workSchema, type ProjectInfo, type WorkInput, type WorkReport } from "../shared/workspace.ts";
import { effectiveAttention, isSpeaker, speakerLabel, seatForPal, type RadioNote, type Presence, type Attention, type Channel, type ReceiptState } from "../shared/protocol.ts";
import { MAP_W, MAP_H, CORE_X, CORE_Y, BASE_RADIUS } from "../shared/map.ts";
import { cardSchema, cardActionSchema, registrationSchema, type Ecosystem, type CardInput, type CardAction, type BoardCard, type RegistrationInput, type SkillRegistration } from "../shared/ecosystem.ts";

export interface PlacedBuilding {
  uid: string;
  hubId: string;
  tx: number;
  ty: number;
  project?: ProjectInfo;
}

export interface BaseSnapshot {
  buildings: PlacedBuilding[];
  assignments: Record<string, string | null>;
  equipped?: Record<string, string[]>;
}

export type ArchitectNote = RadioNote;

export interface PalUtterance {
  palId: string;
  text: string;
  at: number;
}

export type BusEvent =
  | { type: "hello"; notes: ArchitectNote[]; base: BaseSnapshot | null; presence: Presence[]; revision: number; work: WorkReport[]; ecosystem: Ecosystem }
  | { type: "ecosystem"; ecosystem: Ecosystem }
  | { type: "work"; work: WorkReport[] }
  | { type: "presence"; presence: Presence[] }
  | { type: "receipt"; note: ArchitectNote }
  | { type: "architect"; note: ArchitectNote }
  | { type: "pal-say"; palId: string; text: string; at: number }
  | { type: "pal-assign"; palId: string; buildingUid: string | null; hubId: string | null }
  | { type: "base"; base: BaseSnapshot; revision: number }
  | { type: "ping" };

interface DiskState {
  notes: ArchitectNote[];
  lastSay: Record<string, PalUtterance>;
  base: BaseSnapshot | null;
  revision: number;
  work: WorkReport[];
  ecosystem: Ecosystem;
}

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "area67.json");
const MAX_NOTES = 200;

const listeners = new Set<(ev: BusEvent) => void>();

let state: DiskState = { notes: [], lastSay: {}, base: null, revision: 0, work: [], ecosystem: { cards: [], skills: [] } };
// Presence is never restored from disk or inferred from an animated pal.
const heartbeats = new Map<Speaker, Presence>();
let committedState = JSON.stringify(state);

function nid(): string {
  return randomUUID();
}

function readState(raw: string): DiskState {
  const parsed = JSON.parse(raw) as Partial<DiskState>;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.notes)) throw new Error("Invalid AREA 67 state: expected a notes array");
  return {
    notes: parsed.notes.map(n => ({ ...n, channel: n.channel ?? "command", to: n.to ?? "all", directive: n.directive ?? false, recipients: n.recipients ?? [], receipts: n.receipts ?? {} })),
    lastSay: parsed.lastSay && typeof parsed.lastSay === "object" ? parsed.lastSay : {},
    base: parsed.base ?? null,
    revision: parsed.revision ?? 0,
    work: Array.isArray(parsed.work) ? parsed.work.map(w => ({ ...w, sessionActive: false })) : [],
    ecosystem: { cards: parsed.ecosystem?.cards ?? [], skills: parsed.ecosystem?.skills ?? [] },
  };
}

export function loadStore(): void {
  heartbeats.clear();
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(DATA_FILE, "utf8");
    state = readState(raw);
    committedState = JSON.stringify(state);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // One-time migration into a newly mounted volume. Existing durable state
    // always wins; invalid bootstrap data stops startup rather than erasing it.
    if (process.env.AREA67_BOOTSTRAP_STATE) state = readState(process.env.AREA67_BOOTSTRAP_STATE);
    mkdirSync(DATA_DIR, { recursive: true });
    persist();
  }
  // Operator-only cutover repair: add missing historical messages, never replace
  // existing records, assignments, receipts, speech or attention. No public API.
  if (process.env.AREA67_RECOVERY_NOTES) {
    const recovery = readState(process.env.AREA67_RECOVERY_NOTES).notes;
    if (recovery.some(n => !n || typeof n.id !== "string" || !n.id || !isSpeaker(n.from)
      || n.palId !== SPEAKER_PAL[n.from] || typeof n.text !== "string" || !n.text.trim()
      || !Number.isFinite(n.at) || n.directive || n.recipients.length || Object.keys(n.receipts).length
      || !["command", "team"].includes(n.channel) || (n.to !== "all" && !isSpeaker(n.to)))) {
      throw new Error("Invalid historical recovery notes");
    }
    const ids = new Set(state.notes.map(n => n.id));
    const missing = recovery.filter(n => { if (ids.has(n.id)) return false; ids.add(n.id); return true; });
    if (missing.length) {
      state.notes = [...state.notes, ...missing].sort((a, b) => b.at - a.at);
      persist();
    }
  }
}

function persist(): void {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const serialized = JSON.stringify(state, null, 2);
    writeFileSync(DATA_FILE + ".tmp", serialized);
    renameSync(DATA_FILE + ".tmp", DATA_FILE);
    committedState = serialized;
  } catch (err) {
    state = JSON.parse(committedState) as DiskState;
    console.error("area67 persist failed", err);
    throw new Error("Hub storage unavailable. Your change was not saved; please retry.");
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
  // Open directives never disappear behind the recent-message window.
  return state.notes.filter((n, i) => i < Math.max(1, limit) || isOpen(n));
}
function isOpen(n: ArchitectNote): boolean { return n.ping ? n.recipients.some(s => !n.receipts[s]) : n.directive && n.recipients.some(s => n.receipts[s]?.state !== "completed"); }

export function base(): BaseSnapshot | null {
  return state.base;
}
export function revision(): number { return state.revision; }
export function presence(): Presence[] {
  return [...SEATS.map(s => s.id), "zeref" as Speaker].map(seat => {
    const p = heartbeats.get(seat);
    return { seat, state: effectiveAttention(p), lastSeen: p?.lastSeen ?? 0, activity: p?.activity ?? "No check-in yet", source: p?.source ?? "mcp", lastReadAt: p?.lastReadAt ?? 0 };
  });
}
export function heartbeat(seat: Speaker, attention: Attention = "attentive", activity = "Reading the hub", source: Presence["source"] = "mcp"): Presence {
  const p: Presence = { seat, state: attention, activity: activity.slice(0, 200), source, lastSeen: Date.now(), lastReadAt: heartbeats.get(seat)?.lastReadAt ?? 0 };
  heartbeats.set(seat, p);
  publish({ type: "presence", presence: presence() });
  return p;
}
export function inbox(seat: Speaker, limit = 80): ArchitectNote[] {
  const addressed = state.notes.filter(n => n.from !== seat && (n.to === "all" || n.to === seat));
  // The limit bounds context, never unfinished directives.
  const rows = addressed.filter((n, i) => i < limit || (n.recipients.includes(seat) && isOpen(n)));
  let changed = false;
  for (const n of rows) {
    if (n.recipients.includes(seat) && !n.receipts[seat]) {
      n.receipts[seat] = { state: "seen", at: Date.now() };
      changed = true;
    }
  }
  if (changed) { persist(); for (const n of rows) publish({ type: "receipt", note: n }); }
  const p = heartbeats.get(seat);
  if (p) p.lastReadAt = Date.now();
  return rows;
}
export function acknowledge(seat: Speaker, noteId: string, next: ReceiptState, detail = ""): ArchitectNote {
  const n = state.notes.find(n => n.id === noteId);
  if (!n || !n.recipients.includes(seat)) throw new Error("Directive not addressed to this seat");
  if (n.ping && next !== "seen") throw new Error("A ping requests attention, not task acceptance");
  const previous = n.receipts[seat]?.state;
  if (previous === "completed" && next !== "completed") throw new Error("Completed directives cannot regress");
  if (previous && previous !== "seen" && next === "seen") return n;
  n.receipts[seat] = { state: next, at: Date.now(), detail: detail.slice(0, 500) };
  persist(); heartbeat(seat, next === "accepted" ? "busy" : "attentive", detail || next);
  publish({ type: "receipt", note: n }); return n;
}

export function lastSay(): Record<string, PalUtterance> {
  return state.lastSay;
}

export function setBase(next: BaseSnapshot): void {
  const ids = new Set<string>();
  const occupied = new Set<string>();
  for (const b of next.buildings) {
    const hub = hubById(b.hubId);
    if (!hub || ids.has(b.uid)) throw new Error("Unknown station or duplicate building ID");
    ids.add(b.uid);
    if (b.hubId === "project-site") b.project = projectSchema.parse(b.project);
    else if (b.project) throw new Error("Project metadata requires a project building");
    if (!Number.isInteger(b.tx) || !Number.isInteger(b.ty) || b.tx < 0 || b.ty < 0 || b.tx + hub.w > MAP_W || b.ty + hub.h > MAP_H) throw new Error("Station footprint is outside the map");
    if (b.hubId === "well" && (b.tx !== CORE_X - 1 || b.ty !== CORE_Y - 1)) throw new Error("The command core cannot be moved");
    for (let x = b.tx; x < b.tx + hub.w; x++) for (let y = b.ty; y < b.ty + hub.h; y++) {
      const key = x + ":" + y;
      if (occupied.has(key)) throw new Error("Station footprints overlap");
      if (Math.hypot(x - CORE_X, y - CORE_Y) > BASE_RADIUS) throw new Error("Station is outside the Palbox radius");
      occupied.add(key);
    }
  }
  if (next.buildings.filter(b => b.hubId === "well").length !== 1) throw new Error("The base needs exactly one command core");
  for (const [pal, uid] of Object.entries(next.assignments)) {
    if (!agentById(pal) || (uid !== null && !ids.has(uid))) throw new Error("Unknown pal or assignment target");
  }
  for (const b of next.buildings) {
    const slots = MODS[b.hubId]?.slots ?? 1;
    if (slots && Object.values(next.assignments).filter(uid => uid === b.uid).length > slots) throw new Error("Station capacity exceeded: " + b.hubId);
  }
  for (const [pal, skills] of Object.entries(next.equipped ?? {})) {
    if (!agentById(pal) || skills.some(id => !SKILL_IDS.has(id))) throw new Error("Unknown pal or skill loadout");
  }
  const changedScopes = new Set(next.buildings.filter(b => {
    const old = state.base?.buildings.find(previous => previous.uid === b.uid);
    return old && (old.project?.repoUrl !== b.project?.repoUrl || old.project?.workspace !== b.project?.workspace);
  }).map(b => b.uid));
  state.base = {
    buildings: next.buildings ?? [],
    assignments: next.assignments ?? {},
    equipped: next.equipped,
  };
  state.work = state.work.filter(w => ids.has(w.buildingUid) && !changedScopes.has(w.buildingUid));
  state.revision++;
  persist();
  publish({ type: "base", base: state.base, revision: state.revision });
  publish({ type: "work", work: state.work });
}

export function postArchitect(from: Speaker, text: string, options: { channel?: Channel; to?: Speaker | "all"; directive?: boolean; replyTo?: string; ping?: boolean; projectUid?: string } = {}): ArchitectNote {
  const palId = SPEAKER_PAL[from];
  if (!text.trim() || text.trim().length > 2000) throw new Error("Message must contain 1–2000 characters");
  const parent = options.replyTo ? state.notes.find(n => n.id === options.replyTo) : undefined;
  if (options.replyTo && !parent) throw new Error("Reply target no longer exists");
  if (parent?.projectUid) {
    if (options.projectUid && options.projectUid !== parent.projectUid) throw new Error("Reply belongs to a different project");
    options = { ...options, projectUid: parent.projectUid };
  }
  const to = options.to ?? "all";
  if (options.projectUid && !state.base?.buildings.some(b => b.uid === options.projectUid)) throw new Error("Project building no longer exists");
  if (options.ping && to === from) throw new Error("Choose another teammate to ping");
  if (options.ping) {
    const recent = state.notes.find(n => n.ping && n.from === from && n.to === to && n.projectUid === options.projectUid && Date.now() - n.at < 60_000);
    if (recent) return recent;
  }
  const directive = !options.ping && from === "zeref" && (options.directive ?? false);
  const note: ArchitectNote = { id: nid(), from, palId, text: text.trim(), at: Date.now(), channel: options.channel ?? "command", to, directive, replyTo: options.replyTo,
    ping: options.ping, projectUid: options.projectUid,
    recipients: directive || options.ping ? (to === "all" ? SEATS.map(s => s.id) : [to]).filter(s => s !== from) : [], receipts: {} };
  state.notes.unshift(note);
  state.notes = state.notes.filter((n, i) => i < MAX_NOTES || isOpen(n));
  if (palId) {
    state.lastSay[palId] = { palId, text: note.text, at: note.at };
  }
  persist();
  publish({ type: "architect", note });
  heartbeat(from, "attentive", "Posted to " + note.channel, "rest");
  return note;
}

export function workReports(): WorkReport[] { return state.work; }
export function reportWork(seat: Speaker, input: WorkInput): WorkReport {
  if (!SEATS.some(s => s.id === seat)) throw new Error("Only an AI seat can report its own work");
  const data = workSchema.parse(input);
  if (!state.base?.buildings.some(b => b.uid === data.buildingUid)) throw new Error("Work target no longer exists");
  const report: WorkReport = { ...data, seat, updatedAt: Date.now(), sessionActive: true };
  state.work = [...state.work.filter(w => w.seat !== seat), report];
  persist();
  heartbeat(seat, data.state === "working" ? "busy" : "attentive", data.activity);
  publish({ type: "work", work: state.work });
  return report;
}

export function say(palId: string, text: string): PalUtterance | { error: string } {
  if (!agentById(palId)) return { error: "unknown pal " + palId };
  if (!text.trim() || text.trim().length > 280) return { error: "Speech must contain 1–280 characters" };
  const u: PalUtterance = { palId, text: text.trim(), at: Date.now() };
  state.lastSay[palId] = u;
  persist();
  publish({ type: "pal-say", palId, text: u.text, at: u.at });
  return u;
}

export function assignPal(
  palId: string,
  hubId: string | null,
  buildingUid?: string,
): { ok: true; buildingUid: string | null; hubId: string | null } | { ok: false; error: string } {
  if (!agentById(palId)) return { ok: false, error: "unknown pal " + palId };
  if (!state.base) {
    return { ok: false, error: "No live base yet. Open AREA 67 in a browser so the Palbox posts its stations." };
  }
  if (!hubId || hubId === "unassign" || hubId === "idle") {
    state.base.assignments[palId] = null;
    state.revision++;
    persist();
    publish({ type: "base", base: state.base, revision: state.revision });
    publish({ type: "pal-assign", palId, buildingUid: null, hubId: null });
    return { ok: true, buildingUid: null, hubId: null };
  }
  if (!hubById(hubId)) return { ok: false, error: "unknown station " + hubId };
  if (hubId === "project-site" && !buildingUid) return { ok: false, error: "Choose an exact project buildingUid from hub_sync.base" };
  const b = state.base.buildings.find((x) => x.hubId === hubId && (!buildingUid || x.uid === buildingUid));
  if (!b) return { ok: false, error: "Station " + hubId + " is not placed on this Palbox yet." };
  const slots = MODS[hubId]?.slots ?? 1;
  const used = Object.entries(state.base.assignments).filter(([id, uid]) => id !== palId && uid === b.uid).length;
  if (slots && used >= slots) return { ok: false, error: "Station is full: " + hubId };
  state.base.assignments[palId] = b.uid;
  state.revision++;
  persist();
  publish({ type: "base", base: state.base, revision: state.revision });
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
      name: seatForPal(a.id)?.label ?? a.name,
      role: a.role,
      model: a.model,
      work: a.work,
      station: hub?.id ?? null,
      stationName: b?.project?.name ?? hub?.name ?? null,
      lastSay: uttered?.text ?? null,
      presence: presence().find(p => SPEAKER_PAL[p.seat] === a.id) ?? null,
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

export class RecordConflict extends Error {}
export function ecosystem(): Ecosystem { return state.ecosystem; }
function ecosystemChanged() { persist(); publish({ type: "ecosystem", ecosystem: state.ecosystem }); }
export function createCard(actor: Speaker, input: CardInput): BoardCard {
  if (!isSpeaker(actor)) throw new Error("Unknown author");
  const data = cardSchema.parse(input);
  if (data.projectUid && !state.base?.buildings.some(b => b.uid === data.projectUid && b.project)) throw new Error("Choose an existing project workspace");
  if (state.ecosystem.cards.length >= 1000) throw new Error("Board storage is full; contact the hub owner");
  const at = Date.now();
  const card: BoardCard = { ...data, id: nid(), createdBy: actor, updatedBy: actor, claimedBy: null, status: data.board === "pending-work" ? "parked" : "open", createdAt: at, updatedAt: at, revision: 1 };
  state.ecosystem.cards.unshift(card); ecosystemChanged(); return card;
}
export function actOnCard(actor: Speaker, input: CardAction): BoardCard {
  if (!isSpeaker(actor)) throw new Error("Unknown author");
  const data = cardActionSchema.parse(input);
  const card = state.ecosystem.cards.find(c => c.id === data.id);
  if (!card) throw new Error("Card no longer exists");
  if (card.revision !== data.revision) throw new RecordConflict("Someone updated this card. Read the latest version and try again.");
  if (card.claimedBy && card.claimedBy !== actor && actor !== "zeref") throw new Error("This task is claimed by " + speakerLabel(card.claimedBy));
  if (data.action === "claim") {
    if (card.board !== "pending-work" || !["parked", "open"].includes(card.status)) throw new Error("Only parked work can be picked up");
    card.claimedBy = actor; card.status = "claimed";
  } else if (data.action === "park") {
    card.board = "pending-work"; card.status = "parked"; card.claimedBy = null;
  } else if (data.action === "discuss") {
    card.board = "war-table"; card.status = "open"; card.claimedBy = null;
  } else if (data.action === "complete") {
    if (card.board === "pending-work" && card.claimedBy !== actor && actor !== "zeref") throw new Error("Pick up this work before completing it");
    card.status = "done";
  } else if (data.action === "archive") {
    if (actor !== card.createdBy && actor !== "zeref" && actor !== card.claimedBy) throw new Error("Only the author, claimant or Zeref can archive this card");
    card.status = "archived";
  } else {
    if (!["done", "archived"].includes(card.status)) throw new Error("This card is already open");
    card.status = card.board === "pending-work" ? "parked" : "open"; card.claimedBy = null;
  }
  card.updatedAt = Date.now(); card.updatedBy = actor; card.revision++;
  ecosystemChanged(); return card;
}
export function registerSkill(owner: Speaker, input: RegistrationInput, source: SkillRegistration["source"]): SkillRegistration {
  if (!isSpeaker(owner)) throw new Error("Unknown skill owner");
  const data = registrationSchema.parse(input);
  if (data.signature !== speakerLabel(owner)) throw new Error("Sign with your seat's exact name: " + speakerLabel(owner));
  const old = state.ecosystem.skills.find(s => s.owner === owner && s.name.toLocaleLowerCase() === data.name.toLocaleLowerCase());
  if (old) {
    if (old.description === data.description && old.sourceUrl === data.sourceUrl) return old;
    throw new Error("This name is already signed by your seat. Use a versioned name for a changed skill.");
  }
  if (state.ecosystem.skills.length >= 500) throw new Error("Skill registry is full; contact the hub owner");
  const skill: SkillRegistration = { ...data, signature: speakerLabel(owner), id: nid(), owner, signedAt: Date.now(), source, verification: "self-declared" };
  state.ecosystem.skills.unshift(skill); ecosystemChanged(); return skill;
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
  lines.push("", "Attention (away after 2 minutes without a check-in, offline after 10):", ...presence().map(p => p.seat + ": " + p.state + " — " + p.activity));
  lines.push("Use hub_sync for your directive inbox, directive_ack to accept/complete/report blockers, and presence_update to check in. The hub cannot start an external AI client.");
  return lines.join("\n");
}
