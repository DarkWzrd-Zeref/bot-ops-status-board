import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface RegistryRepo { org: string; name: string; url?: string | null; description?: string | null; language?: string | null }
interface RegistrySkill {
  id: string;
  name: string;
  category?: string | null;
  primaryOwner: string | null;
  bestRunner: string | null;
  blocked?: boolean;
  guidePath: string;
  repo?: RegistryRepo | null;
}
interface RegistryArsenal {
  org: string;
  name: string;
  url?: string | null;
  description?: string | null;
  language?: string | null;
  alias?: string | null;
  aliasUrl?: string | null;
  note?: string | null;
}
interface Registry {
  stamp: string;
  stampedBy: string;
  asOf: string;
  note: string;
  sources: string[];
  skills: RegistrySkill[];
  arsenal?: RegistryArsenal[];
}

const registry = JSON.parse(readFileSync(join(root, "src/content", "skill-registry.json"), "utf8")) as Registry;

const ARSENAL_ORG = "DarkWzrd-Zeref";

export interface StampedSkill {
  id: string;
  name: string;
  category: string | null;
  primaryOwner: string | null;
  bestRunner: string | null;
  blocked: boolean;
  guidePath: string;
  repo: RegistryRepo | null;
}

export interface ArsenalRepo {
  org: string;
  name: string;
  url: string | null;
  description: string | null;
  language: string | null;
  alias: string | null;
  aliasUrl: string | null;
  skills: string[];
}

export function stampedSkills(): StampedSkill[] {
  return registry.skills.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category ?? null,
    primaryOwner: s.primaryOwner ?? null,
    bestRunner: s.bestRunner ?? null,
    blocked: s.blocked === true,
    guidePath: s.guidePath,
    repo: s.repo ?? null,
  }));
}

// Skills that reference each DarkWzrd-Zeref repo, keyed by repo name.
function skillsByRepo(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of registry.skills) {
    if (!s.repo || s.repo.org !== ARSENAL_ORG) continue;
    const list = map.get(s.repo.name);
    if (list) list.push(s.id); else map.set(s.repo.name, [s.id]);
  }
  return map;
}

export function arsenalRepos(): ArsenalRepo[] {
  const linked = skillsByRepo();
  // Prefer the AM-stamped arsenal list when present; otherwise derive it from
  // the repos that stamped skills reference. The explicit list lets the map name
  // real arsenal repositories that are not themselves skills without inventing
  // skill-to-repo links.
  if (registry.arsenal && registry.arsenal.length) {
    return registry.arsenal
      .filter(r => r.org === ARSENAL_ORG)
      .map(r => ({
        org: r.org,
        name: r.name,
        url: r.url ?? null,
        description: r.description ?? null,
        language: r.language ?? null,
        alias: r.alias ?? null,
        aliasUrl: r.aliasUrl ?? null,
        skills: linked.get(r.name) ?? [],
      }));
  }
  const byName = new Map<string, ArsenalRepo>();
  for (const s of registry.skills) {
    if (!s.repo || s.repo.org !== ARSENAL_ORG) continue;
    const existing = byName.get(s.repo.name);
    if (existing) { existing.skills.push(s.id); continue; }
    byName.set(s.repo.name, {
      org: s.repo.org,
      name: s.repo.name,
      url: s.repo.url ?? null,
      description: s.repo.description ?? null,
      language: s.repo.language ?? null,
      alias: null,
      aliasUrl: null,
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
