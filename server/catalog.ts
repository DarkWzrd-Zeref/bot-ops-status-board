import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEATS } from "../shared/protocol.ts";
export { SEATS, SPEAKERS, SPEAKER_PAL, isSpeaker } from "../shared/protocol.ts";
export type { Seat, Speaker } from "../shared/protocol.ts";
export interface AgentDef { id: string; name: string; role: string; model: string; account: string; color: string; work: string[] }
export interface HubDef { id: string; name: string; short: string; kind: string; mcp: string | null; placeable: boolean; blurb: string; w: number; h: number }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function load<T>(name: string): T { return JSON.parse(readFileSync(join(root, "src/content", name), "utf8")) as T; }
export const AGENTS = load<{agents: AgentDef[]}>("agents.json").agents;
export const HUBS = load<{hubs: HubDef[]}>("hubs.json").hubs;
export const MODS = load<{stations: Record<string, {slots: number; grants: string[]}>}>("modifiers.json").stations;
export const SKILL_IDS = new Set(load<{skills: {id: string}[]}>("skills.json").skills.map(s => s.id));
export function seatBySlug(slug: string) { return SEATS.find(s => s.slug === slug); }
export function agentById(id: string) { return AGENTS.find(a => a.id === id); }
export function hubById(id: string) { return HUBS.find(h => h.id === id); }
export function publicBase() { return (process.env.PUBLIC_BASE_URL || "https://status-board-production-806b.up.railway.app").replace(/\/$/, ""); }
export function seatUrl(slug: string) { return publicBase() + "/mcp/" + slug; }
