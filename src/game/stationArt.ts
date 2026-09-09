import type Phaser from "phaser";

/** Claude's hashed kind silhouettes. Decorative only — missing files keep painted boxes. */
export type StationArtKind = {
  kind: string;
  sha12?: string;
  sha256?: string;
  file?: string;
};

type StationArtManifest = {
  kinds?: Record<string, Omit<StationArtKind, "kind">>;
  stations?: StationArtKind[];
};

/** Radio-posted hashes until Claude commits src/content/station-art.json / public/sprites/stations/manifest.json. */
const KIND_HASH: Record<string, string> = {
  code: "0c749d31c143",
  comms: "a0d15e11c7b3",
  core: "a1fa03ee410d",
  guard: "104077214401",
  infra: "e4280b6be805",
  media: "b675dfbb3a80",
  ops: "30c7fe5071ff",
  project: "263ee06bbed6",
  research: "4ad551025152",
};

const catalog = new Map<string, string>();

function sha12Of(entry: { sha12?: string; sha256?: string }): string | undefined {
  if (entry.sha12) return entry.sha12;
  if (entry.sha256 && entry.sha256.length >= 12) return entry.sha256.slice(0, 12);
  return undefined;
}

function hashedPath(kind: string, sha12: string): string {
  return "/sprites/stations/" + kind + "." + sha12 + ".png";
}

export function applyStationArtManifest(manifest: StationArtManifest | null | undefined): void {
  catalog.clear();
  if (!manifest) return;
  if (manifest.kinds) {
    for (const [kind, meta] of Object.entries(manifest.kinds)) {
      if (meta.file) catalog.set(kind, meta.file.startsWith("/") ? meta.file : "/sprites/stations/" + meta.file);
      else {
        const sha = sha12Of(meta);
        if (sha) catalog.set(kind, hashedPath(kind, sha));
      }
    }
  }
  for (const row of manifest.stations ?? []) {
    if (!row.kind) continue;
    if (row.file) catalog.set(row.kind, row.file.startsWith("/") ? row.file : "/sprites/stations/" + row.file);
    else {
      const sha = sha12Of(row);
      if (sha) catalog.set(row.kind, hashedPath(row.kind, sha));
    }
  }
}

export function resetStationArtCatalog(): void {
  catalog.clear();
}

export function kindSpritePath(kind: string): string | null {
  const fromManifest = catalog.get(kind);
  if (fromManifest) return fromManifest;
  const sha = KIND_HASH[kind];
  if (sha) return hashedPath(kind, sha);
  return null;
}

export function hubSpritePath(id: string): string {
  return "/sprites/stations/hub-" + id + ".png";
}

export function stationTextureKeys(id: string, kind: string) {
  return { hub: "sprite-hub-" + id, kind: "sprite-kind-" + kind, painted: id === "well" ? "well-mark" : "b-" + id };
}

export function pickStationTexture(scene: Phaser.Scene, id: string, kind: string): string {
  const keys = stationTextureKeys(id, kind);
  if (hasRealTexture(scene, keys.hub)) return keys.hub;
  if (hasRealTexture(scene, keys.kind)) return keys.kind;
  return keys.painted;
}

function hasRealTexture(scene: Phaser.Scene, key: string): boolean {
  if (!scene.textures.exists(key)) return false;
  const tex = scene.textures.get(key);
  return tex.source.some((src) => src.width > 2 && src.height > 2);
}

export async function hydrateStationArt(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl("/sprites/stations/manifest.json");
    if (!res.ok) return;
    applyStationArtManifest(await res.json() as StationArtManifest);
  } catch {
    /* PNGs are decorative; procedural boxes stay. */
  }
}
