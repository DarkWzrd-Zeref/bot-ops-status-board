import { bus } from "./events.ts";
import { applyBaseSnapshot, exportSave, onPersist, palSay, syncWorkTargets } from "./runtime.ts";
import { effectiveAttention, SEATS, type RadioNote, type Speaker, type Presence, type Channel } from "../../shared/protocol.ts";
import { workIsLive, type WorkReport } from "../../shared/workspace.ts";

export const radioNotes: RadioNote[] = [];
export const presenceBySeat = new Map<Speaker, Presence>();
export const workReports: WorkReport[] = [];
export let radioLive = false;
let revision = 0;
let ready = false;
let remoteChange = false;
let persistTimer = 0;
let started = false;
let lastInteraction = Date.now();

export function attention(seat: Speaker) {
  return radioLive ? effectiveAttention(presenceBySeat.get(seat)) : "offline";
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Hub request failed");
  return data as T;
}
function remember(note: RadioNote, announce: boolean) {
  const i = radioNotes.findIndex(n => n.id === note.id);
  if (i >= 0) radioNotes[i] = note;
  else radioNotes.unshift(note);
  if (announce) bus.emit({ type: "radio", note });
  else bus.emit({ type: "changed" });
}
function hydrate(data: { base?: Parameters<typeof applyBaseSnapshot>[0] | null; revision?: number }) {
  remoteChange = true;
  window.clearTimeout(persistTimer);
  revision = data.revision ?? revision;
  try {
    if (data.base) {
      const current = exportSave();
      const same = JSON.stringify([current.buildings, current.assignments, current.equipped]) === JSON.stringify([data.base.buildings, data.base.assignments, data.base.equipped ?? {}]);
      if (!same) applyBaseSnapshot(data.base);
    }
  } finally { remoteChange = false; }
}
function updatePresence(rows: Presence[]) {
  for (const p of rows) presenceBySeat.set(p.seat, p);
  updateWorkTargets();
  bus.emit({ type: "presence" });
}
function updateWork(rows: WorkReport[]) {
  workReports.splice(0, workReports.length, ...rows);
  updateWorkTargets();
  bus.emit({ type: "changed" });
}
function updateWorkTargets() {
  const targets = new Map<string, string>();
  for (const work of liveWork()) { const pal = SEATS.find(s => s.id === work.seat)?.palId; if (pal) targets.set(pal, work.buildingUid); }
  syncWorkTargets(targets);
}
export function liveWork(buildingUid?: string): WorkReport[] {
  return workReports.filter(w => (!buildingUid || w.buildingUid === buildingUid) && radioLive && workIsLive(w, presenceBySeat.get(w.seat)));
}
async function pushBase() {
  if (!ready || !radioLive || remoteChange) return;
  const data = exportSave();
  try {
    const res = await fetch("/api/base", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, buildings: data.buildings, assignments: data.assignments, equipped: data.equipped }) });
    const result = await res.json();
    if (res.status === 409) {
      hydrate(result);
      bus.emit({ type: "toast", tone: "warn", text: result.error });
    } else if (!res.ok) throw new Error(result.error);
    else revision = result.revision;
  } catch {
    bus.emit({ type: "toast", tone: "bad", text: "Base change was not saved. Reconnect and try again." });
  }
}
export async function postRadio(from: Speaker, text: string, options: { channel?: Channel; to?: Speaker | "all"; directive?: boolean; replyTo?: string; ping?: boolean; projectUid?: string } = {}) {
  const note = await request<RadioNote>("/api/architect", { method: "POST", body: JSON.stringify({ from, text, ...options }) });
  remember(note, false);
  return note;
}
export async function markHumanPingSeen(id: string) {
  const note = await request<RadioNote>(`/api/directives/${encodeURIComponent(id)}/ack`, { method: "POST", body: JSON.stringify({ seat: "zeref", state: "seen" }) });
  remember(note, false);
}
function userHeartbeat() {
  if (!radioLive) return;
  const active = document.visibilityState === "visible" && Date.now() - lastInteraction < 120_000;
  void request("/api/presence/zeref", { method: "POST", body: JSON.stringify({ state: active ? "attentive" : "away", activity: active ? "At the command deck" : "Away from the command deck" }) }).catch(() => {});
}
export function connectLive() {
  if (started) return;
  started = true;
  onPersist(data => {
    if (data.lifting) return;
    if (remoteChange || !ready) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => void pushBase(), 400);
  });
  const es = new EventSource("/api/events");
  es.onopen = () => { radioLive = true; bus.emit({ type: "presence" }); userHeartbeat(); };
  es.onmessage = event => {
    try {
      const ev = JSON.parse(event.data);
      if (ev.type === "hello") {
        radioNotes.splice(0, radioNotes.length, ...(ev.notes ?? []));
        hydrate(ev); updatePresence(ev.presence ?? []); updateWork(ev.work ?? []); ready = true;
        if (!ev.base) void pushBase();
        bus.emit({ type: "changed" });
      } else if (ev.type === "presence") updatePresence(ev.presence);
      else if (ev.type === "work") updateWork(ev.work);
      else if (ev.type === "architect") {
        remember(ev.note, true);
        if (ev.note.palId) palSay(ev.note.palId, ev.note.text);
      } else if (ev.type === "receipt") remember(ev.note, false);
      else if (ev.type === "base") hydrate(ev);
      else if (ev.type === "pal-say") palSay(ev.palId, ev.text);
      // Assignments arrive as revisioned base snapshots. The server retains
      // pal-assign events only for older clients; do not republish them here.
    } catch (error) { console.error("Hub event failed", error); }
  };
  es.onerror = () => { radioLive = false; updateWorkTargets(); bus.emit({ type: "presence" }); };
  document.addEventListener("pointerdown", () => { lastInteraction = Date.now(); }, { passive: true });
  document.addEventListener("keydown", () => { lastInteraction = Date.now(); });
  document.addEventListener("visibilitychange", userHeartbeat);
  window.setInterval(userHeartbeat, 30_000);
  window.setInterval(() => { updateWorkTargets(); bus.emit({ type: "presence" }); }, 10_000);
  window.addEventListener("pagehide", () => navigator.sendBeacon("/api/presence/zeref",
    new Blob([JSON.stringify({ state: "away", activity: "Closed the command deck" })], { type: "application/json" })));
}
