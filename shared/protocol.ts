/** Wire contract shared by the hub UI, REST API and MCP clients. */
export const SPEAKERS = ["codex", "claude", "grok", "cursor", "grok-a", "grok-b", "chatgpt", "grok-heavy", "engineer", "account-manager", "chief-of-staff", "police", "stay-on-track", "zeref"] as const;
export type Speaker = (typeof SPEAKERS)[number];
export type Channel = "command" | "team";
export type Attention = "attentive" | "busy" | "away" | "offline";
export type ReceiptState = "seen" | "accepted" | "completed" | "blocked";
export interface Receipt { state: ReceiptState; at: number; detail?: string }
export interface RadioNote {
  id: string; from: Speaker; palId: string | null; text: string; at: number;
  channel: Channel; to: Speaker | "all"; directive: boolean;
  recipients: Speaker[]; receipts: Partial<Record<Speaker, Receipt>>;
  replyTo?: string;
  ping?: boolean;
  projectUid?: string;
}
export interface Presence {
  seat: Speaker; state: Attention; lastSeen: number; activity: string;
  source: "mcp" | "rest" | "browser"; lastReadAt: number;
}
export interface Seat {
  id: Speaker; slug: string; palId: string | null; label: string; model: string; youAre: string;
}
export const ATTENTIVE_MS = 120_000;
export const OFFLINE_MS = 600_000;
export function effectiveAttention(p?: Presence, now = Date.now()): Attention {
  if (!p || p.state === "offline" || now - p.lastSeen >= OFFLINE_MS) return "offline";
  if (p.state === "away" || now - p.lastSeen >= ATTENTIVE_MS) return "away";
  return p.state;
}
export const SEATS: Seat[] = [
  { id: "codex", slug: "codex", palId: "codex", label: "Codex", model: "Codex desktop", youAre: "You are Codex in the desktop app. Your pal and seat are codex. Build, verify and report. Zeref directs." },
  { id: "claude", slug: "claude", palId: "claude", label: "Claude", model: "Claude Pro", youAre: "You are Claude, the architect. Zeref directs." },
  { id: "grok-heavy", slug: "grok-heavy", palId: "director", label: "Grok Heavy", model: "Grok Heavy", youAre: "You are Grok Heavy, the Director. Your pal is director. Zeref directs." },
  { id: "grok-a", slug: "grok-a", palId: "grok-am-a", label: "Grok Twin A", model: "Grok · account 1", youAre: "You are Grok Twin A. Your pal is grok-am-a. Zeref directs." },
  { id: "grok-b", slug: "grok-b", palId: "grok-am-b", label: "Grok Twin B", model: "Grok · account 2", youAre: "You are Grok Twin B. Your pal is grok-am-b. Zeref directs." },
  { id: "grok", slug: "grok", palId: "grok", label: "Grok", model: "Grok", youAre: "You are Grok on grok.com chat. Not Engineer Bot pc, not the Cursor cloud agent, not Twin A/B, not Heavy. Zeref directs." },
  { id: "chatgpt", slug: "chatgpt", palId: "researcher", label: "ChatGPT", model: "ChatGPT Pro", youAre: "You are ChatGPT Researcher. Scout, cite and propose. Zeref directs." },
  { id: "cursor", slug: "cursor", palId: "cursor-ultra", label: "Cursor Ultra", model: "Cursor Ultra", youAre: "You are Cursor Ultra. This Cursor account and its cloud agents. You are Cursor, not Grok. Your pal is cursor-ultra. Build and ship. Zeref directs." },
  { id: "engineer", slug: "engineer", palId: "engineer", label: "Engineer Bot pc", model: "Grok Bot · Engineer", youAre: "You are Engineer Bot pc, Head of Ops / PM on AREA 67. Your pal is engineer. Claude codes; Cursor ships; you sequence GO/critique. Zeref directs." },
  { id: "account-manager", slug: "account-manager", palId: "account-manager", label: "Account Manager pc", model: "Grok Bot · AM", youAre: "You are Account Manager pc. Your pal is account-manager. Track accounts/MCP roster. Never store secrets. Zeref directs." },
  { id: "chief-of-staff", slug: "chief-of-staff", palId: "chief-of-staff", label: "Chief of Staff pc", model: "Grok Bot · CoS", youAre: "You are Chief of Staff pc. Your pal is chief-of-staff. Queue, park/go, handoffs. Zeref directs." },
  { id: "police", slug: "police", palId: "police", label: "Police pc", model: "Grok Bot · Police", youAre: "You are Police pc. Your pal is police. MCP-first, no in-chat clone grind. Zeref directs." },
  { id: "stay-on-track", slug: "stay-on-track", palId: "stay-on-track", label: "Stay on Track pc", model: "Grok Bot · SOT", youAre: "You are Stay on Track pc. Your pal is stay-on-track. One LIVE, syllabus, done artifacts. Zeref directs." },
];
export const SPEAKER_PAL = Object.fromEntries([...SEATS.map(s => [s.id, s.palId]), ["zeref", null]]) as Record<Speaker, string | null>;
export function isSpeaker(value: string): value is Speaker { return (SPEAKERS as readonly string[]).includes(value); }
export function seatForPal(id: string): Seat | undefined { return SEATS.find(s => s.palId === id); }
export function speakerLabel(id: Speaker): string { return id === "zeref" ? "Zeref" : SEATS.find(s => s.id === id)?.label ?? id; }
