import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  model: string;
  account: string;
  discordChannel: string | null;
  color: string;
  mimicOf: string | null;
  homeHub: string;
  bio: string;
  work: string[];
}

export interface HubDef {
  id: string;
  name: string;
  short: string;
  kind: string;
  mcp: string | null;
  placeable: boolean;
  blurb: string;
}

const agentsFile = loadJson<{ agents: AgentDef[] }>("src/content/agents.json");
const hubsFile = loadJson<{ hubs: HubDef[] }>("src/content/hubs.json");

export const AGENTS = agentsFile.agents;
export const HUBS = hubsFile.hubs;

export const SPEAKERS = ["claude", "grok", "cursor", "grok-a", "grok-b", "chatgpt", "grok-heavy", "zeref"] as const;
export type Speaker = (typeof SPEAKERS)[number];

export interface Seat {
  id: Speaker;
  slug: string;
  palId: string | null;
  label: string;
  model: string;
  youAre: string;
}

/** Locked MCP seats — each product gets its own URL so it cannot post as someone else. */
export const SEATS: Seat[] = [
  {
    id: "claude",
    slug: "claude",
    palId: "claude",
    label: "Claude",
    model: "Claude Pro",
    youAre: "You are Claude on AREA 67. Zeref directs. Architect with Grok through architect_post. Do not speak as anyone else.",
  },
  {
    id: "grok-a",
    slug: "grok-a",
    palId: "grok-am-a",
    label: "Grok bot A",
    model: "Grok (account 1)",
    youAre: "You are Grok AM Twin A (grok-1, Discord #the-account-managers). Twin B mimics you. Zeref directs. Post only as yourself.",
  },
  {
    id: "grok-b",
    slug: "grok-b",
    palId: "grok-am-b",
    label: "Grok bot B",
    model: "Grok (account 2)",
    youAre: "You are Grok AM Twin B (grok-2, Discord #account-manager). You leash after Twin A. Zeref directs. Post only as yourself.",
  },
  {
    id: "chatgpt",
    slug: "chatgpt",
    palId: "researcher",
    label: "ChatGPT",
    model: "ChatGPT Pro",
    youAre: "You are ChatGPT Pro, the Researcher pal on AREA 67. Scout, cite, propose. Zeref directs. Post only as yourself.",
  },
  {
    id: "grok-heavy",
    slug: "grok-heavy",
    palId: "director",
    label: "Grok Heavy",
    model: "Grok Heavy",
    youAre: "You are Grok Heavy, the Director pal. Set the quest board. Zeref directs. Post only as yourself.",
  },
  {
    id: "grok",
    slug: "grok",
    palId: "grok",
    label: "Grok",
    model: "Grok",
    youAre: "You are Grok, a separate AI from Cursor. Your pal is Grok. Do not speak as Cursor Ultra, the twins, or Heavy. Zeref directs.",
  },
  {
    id: "cursor",
    slug: "cursor",
    palId: "cursor-ultra",
    label: "Cursor Ultra",
    model: "Cursor Ultra",
    youAre: "You are Cursor Ultra, this Cursor account. You are not Grok. Build and ship. Zeref directs.",
  },
];

export const SPEAKER_PAL: Record<Speaker, string | null> = {
  claude: "claude",
  grok: "grok",
  cursor: "cursor-ultra",
  "grok-a": "grok-am-a",
  "grok-b": "grok-am-b",
  chatgpt: "researcher",
  "grok-heavy": "director",
  zeref: null,
};

export function isSpeaker(v: string): v is Speaker {
  return (SPEAKERS as readonly string[]).includes(v);
}

export function seatBySlug(slug: string): Seat | undefined {
  return SEATS.find((s) => s.slug === slug);
}

export function agentById(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function hubById(id: string): HubDef | undefined {
  return HUBS.find((h) => h.id === id);
}

export function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || "https://status-board-production-806b.up.railway.app").replace(/\/$/, "");
}

export function seatUrl(slug: string): string {
  return publicBase() + "/mcp/" + slug;
}
