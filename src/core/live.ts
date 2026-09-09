import { bus } from "./events.ts";
import { assignAgent, exportSave, onPersist, palSay } from "./runtime.ts";
import type { RadioNote, Speaker } from "./types.ts";

export const radioNotes: RadioNote[] = [];
export let radioLive = false;

let persistTimer = 0;
let started = false;

type LiveEvent =
  | { type: "hello"; notes?: RadioNote[] }
  | { type: "architect"; note: RadioNote }
  | { type: "pal-say"; palId: string; text: string }
  | { type: "pal-assign"; palId: string; buildingUid: string | null }
  | { type: "ping" };

function remember(note: RadioNote): void {
  if (radioNotes.some((n) => n.id === note.id)) return;
  radioNotes.unshift(note);
  if (radioNotes.length > 80) radioNotes.length = 80;
  bus.emit({ type: "radio", note });
}

function apply(ev: LiveEvent): void {
  if (ev.type === "ping") return;
  if (ev.type === "hello") {
    if (ev.notes?.length) {
      radioNotes.splice(0, radioNotes.length, ...ev.notes);
      bus.emit({ type: "changed" });
    }
    return;
  }
  if (ev.type === "architect") {
    remember(ev.note);
    if (ev.note.palId) palSay(ev.note.palId, ev.note.text);
    return;
  }
  if (ev.type === "pal-say") {
    palSay(ev.palId, ev.text);
    return;
  }
  if (ev.type === "pal-assign") {
    assignAgent(ev.palId, ev.buildingUid);
  }
}

function pushBase(): void {
  const data = exportSave();
  void fetch("/api/base", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildings: data.buildings, assignments: data.assignments, equipped: data.equipped }),
  }).catch(() => {
    /* bus down */
  });
}

export async function postRadio(from: Speaker, text: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  const res = await fetch("/api/architect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, text: body }),
  });
  if (!res.ok) throw new Error("radio failed");
}

export function connectLive(): void {
  if (started) return;
  started = true;

  onPersist(() => {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(pushBase, 400);
  });

  const es = new EventSource("/api/events");
  es.onopen = () => {
    radioLive = true;
    pushBase();
    bus.emit({ type: "changed" });
  };
  es.onmessage = (e) => {
    try {
      apply(JSON.parse(e.data) as LiveEvent);
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => {
    if (radioLive) {
      radioLive = false;
      bus.emit({ type: "changed" });
    }
  };
}
