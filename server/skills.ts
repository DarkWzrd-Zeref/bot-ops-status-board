import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS } from "./catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface RegistryRepo { org: string; name: string; url: string; description?: string; language?: string }
interface RegistrySkill {
  id: string;
  name: string;
  primaryOwner: string | null;
  bestRunner: string | null;
  blocked?: boolean;
  guidePath: string;
  repo: RegistryRepo;
}
interface Registry {
  stamp: string;
  stampedBy: string;
  asOf: string;
  note: string;
  sources: string[];
  skills: RegistrySkill[];
}

const registry = JSON.parse(readFileSync(join(root, "src/content", "skill-registry.json"), "utf8")) as Registry;
const player = JSON.parse(readFileSync(join(root, "src/content", "agents.json"), "utf8")).player as { id: string; name: string; title: string };

const ARSENAL_ORG = "DarkWzrd-Zeref";

export interface Seat { id: string; name: string; role: string }
function seatOf(id: string | null): Seat | null {
  if (!id) return null;
  if (id === player.id) return { id: player.id, name: player.name, role: player.title };
  const agent = AGENTS.find(a => a.id === id);
  return agent ? { id: agent.id, name: agent.name, role: agent.role } : { id, name: id, role: "unknown" };
}

export interface StampedSkill {
  id: string;
  name: string;
  primaryOwner: Seat | null;
  bestRunner: Seat | null;
  blocked: boolean;
  guidePath: string;
  repo: RegistryRepo;
}

export interface ArsenalRepo {
  org: string;
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  skills: string[];
}

export function stampedSkills(): StampedSkill[] {
  return registry.skills.map(s => ({
    id: s.id,
    name: s.name,
    primaryOwner: seatOf(s.primaryOwner),
    bestRunner: seatOf(s.bestRunner),
    blocked: s.blocked === true,
    guidePath: s.guidePath,
    repo: s.repo,
  }));
}

export function arsenalRepos(): ArsenalRepo[] {
  const byName = new Map<string, ArsenalRepo>();
  for (const s of registry.skills) {
    if (s.repo.org !== ARSENAL_ORG) continue;
    const existing = byName.get(s.repo.name);
    if (existing) { existing.skills.push(s.id); continue; }
    byName.set(s.repo.name, {
      org: s.repo.org,
      name: s.repo.name,
      url: s.repo.url,
      description: s.repo.description ?? null,
      language: s.repo.language ?? null,
      skills: [s.id],
    });
  }
  return [...byName.values()];
}

export function skillRegistry() {
  return {
    stamp: registry.stamp,
    stampedBy: registry.stampedBy,
    asOf: registry.asOf,
    note: registry.note,
    sources: registry.sources,
    arsenalOrg: ARSENAL_ORG,
    skills: stampedSkills(),
    arsenal: arsenalRepos(),
  };
}
