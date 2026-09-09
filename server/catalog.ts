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

export const SPEAKERS = ["claude", "grok", "zeref"] as const;
export type Speaker = (typeof SPEAKERS)[number];

/** Which pal walks to the plaza when that speaker posts on the architect radio. */
export const SPEAKER_PAL: Record<Speaker, string | null> = {
  claude: "claude",
  grok: "cursor-ultra",
  zeref: null,
};

export function isSpeaker(v: string): v is Speaker {
  return (SPEAKERS as readonly string[]).includes(v);
}

export function agentById(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function hubById(id: string): HubDef | undefined {
  return HUBS.find((h) => h.id === id);
}
