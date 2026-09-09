import type Phaser from "phaser";
import { TILE } from "../core/grid.ts";

/** Claude's hashed kind silhouettes. Decorative only — missing files keep painted boxes. */
export type StationArtKind = {
  kind: string;
  sha12?: string;
  sha256?: string;
  file?: string;
  src?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  anchorX?: number;
  anchorY?: number;
  groundBounds?: [number, number, number, number];
  groundQuad?: Array<[number, number]>;
};

type StationArtManifest = {
  version?: number;
  kinds?: Record<string, Omit<StationArtKind, "kind">>;
  stations?: StationArtKind[];
  entries?: Array<StationArtKind & { src?: string }>;
};

type GroundSeat = {
  anchorX: number;
  anchorY: number;
  pixelWidth?: number;
  pixelHeight?: number;
  groundBounds?: [number, number, number, number];
  groundQuad?: Array<[number, number]>;
};

export type StationSeatLayout = {
  originX: number;
  originY: number;
  displayWidth: number;
  displayHeight: number;
  painted: boolean;
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
const seats = new Map<string, GroundSeat>();

function sha12Of(entry: { sha12?: string; sha256?: string }): string | undefined {
  if (entry.sha12) return entry.sha12;
  if (entry.sha256 && entry.sha256.length >= 12) return entry.sha256.slice(0, 12);
  return undefined;
}

function hashedPath(kind: string, sha12: string): string {
  return "/sprites/stations/" + kind + "." + sha12 + ".png";
}

function rememberSeat(kind: string, row: Omit<StationArtKind, "kind">): void {
  const unit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  const bounds = Array.isArray(row.groundBounds) && row.groundBounds.length === 4 && row.groundBounds.every(unit)
    && row.groundBounds[2] > row.groundBounds[0] && row.groundBounds[3] > row.groundBounds[1]
    ? row.groundBounds
    : undefined;
  const quad = Array.isArray(row.groundQuad) && row.groundQuad.length === 4
    && row.groundQuad.every(p => Array.isArray(p) && p.length === 2 && p.every(unit))
    ? row.groundQuad
    : undefined;
  if (!bounds && !quad && typeof row.anchorX !== "number") return;
  seats.set(kind, {
    anchorX: unit(row.anchorX) ? row.anchorX : 0.5,
    anchorY: unit(row.anchorY) ? row.anchorY : 0.5,
    groundBounds: bounds,
    groundQuad: quad,
  });
}

function rememberPath(kind: string, row: Omit<StationArtKind, "kind">): void {
  if (!row || typeof row !== "object" || !/^[a-z][a-z0-9-]*$/.test(kind)) return;
  if (row.src && (typeof row.src !== "string" || !/^\/sprites\/stations\/[a-z0-9.-]+\.png$/.test(row.src))) return;
  if (row.file && (typeof row.file !== "string" || !/^(\/sprites\/stations\/)?[a-z0-9.-]+\.png$/.test(row.file))) return;
  if (row.sha12 && (typeof row.sha12 !== "string" || !/^[a-f0-9]{12}$/.test(row.sha12))) return;
  if (row.sha256 && (typeof row.sha256 !== "string" || !/^[a-f0-9]{12,64}$/.test(row.sha256))) return;
  if (row.src) catalog.set(kind, row.src);
  else if (row.file) catalog.set(kind, row.file.startsWith("/") ? row.file : "/sprites/stations/" + row.file);
  else {
    const sha = sha12Of(row);
    if (sha) catalog.set(kind, hashedPath(kind, sha));
  }
  rememberSeat(kind, row);
}

export function applyStationArtManifest(manifest: StationArtManifest | null | undefined): void {
  catalog.clear();
  seats.clear();
  if (!manifest) return;
  if (manifest.kinds) {
    for (const [kind, meta] of Object.entries(manifest.kinds)) rememberPath(kind, meta);
  }
  for (const row of Array.isArray(manifest.stations) ? manifest.stations : []) {
    if (!row || typeof row.kind !== "string") continue;
    rememberPath(row.kind, row);
  }
  for (const row of Array.isArray(manifest.entries) ? manifest.entries : []) {
    if (!row || typeof row.kind !== "string") continue;
    rememberPath(row.kind, row);
  }
}

export function resetStationArtCatalog(): void {
  catalog.clear();
  seats.clear();
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

function groundSize(seat: GroundSeat | undefined, pixelWidth: number, pixelHeight: number): { w: number; h: number } {
  const imgW = Math.max(1, pixelWidth);
  const imgH = Math.max(1, pixelHeight);
  if (seat?.groundBounds) {
    const [x0, y0, x1, y1] = seat.groundBounds;
    return { w: Math.max(1, (x1 - x0) * imgW), h: Math.max(1, (y1 - y0) * imgH) };
  }
  if (seat?.groundQuad && seat.groundQuad.length >= 4) {
    const xs = seat.groundQuad.map(p => p[0]);
    const ys = seat.groundQuad.map(p => p[1]);
    return {
      w: Math.max(1, (Math.max(...xs) - Math.min(...xs)) * imgW),
      h: Math.max(1, (Math.max(...ys) - Math.min(...ys)) * imgH),
    };
  }
  return { w: imgW, h: imgH };
}

/** Uniform scale from the plinth, not the full PNG bounds. Painted boxes still fill the tile footprint. */
export function stationSeatLayout(opts: {
  painted: boolean;
  pixelWidth: number;
  pixelHeight: number;
  footprintWidth: number;
  footprintHeight: number;
  kind: string;
}): StationSeatLayout {
  if (opts.painted) {
    return {
      originX: 0.5,
      originY: 0.5,
      displayWidth: opts.footprintWidth,
      displayHeight: opts.footprintHeight,
      painted: true,
    };
  }
  const seat = seats.get(opts.kind);
  const imgW = Math.max(1, opts.pixelWidth);
  const imgH = Math.max(1, opts.pixelHeight);
  const ground = groundSize(seat, imgW, imgH);
  const scale = Math.min(opts.footprintWidth / ground.w, opts.footprintHeight / ground.h);
  return {
    originX: seat?.anchorX ?? 0.5,
    originY: seat?.anchorY ?? 0.5,
    displayWidth: imgW * scale,
    displayHeight: imgH * scale,
    painted: false,
  };
}

export function seatStationImage(
  img: Phaser.GameObjects.Image,
  opts: {
    textureKey: string;
    paintedKey: string;
    tileX: number;
    tileY: number;
    tilesW: number;
    tilesH: number;
    kind: string;
  },
): void {
  const footprintWidth = opts.tilesW * TILE;
  const footprintHeight = opts.tilesH * TILE;
  const layout = stationSeatLayout({
    painted: opts.textureKey === opts.paintedKey,
    pixelWidth: img.frame?.realWidth || img.width || 1,
    pixelHeight: img.frame?.realHeight || img.height || 1,
    footprintWidth,
    footprintHeight,
    kind: opts.kind,
  });
  img.setOrigin(layout.originX, layout.originY);
  img.setPosition(opts.tileX * TILE + footprintWidth / 2, opts.tileY * TILE + footprintHeight / 2);
  img.setDisplaySize(layout.displayWidth, layout.displayHeight);
}

export async function hydrateStationArt(fetchImpl: typeof fetch = fetch): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetchImpl("/sprites/stations/manifest.json", { signal: controller.signal });
    if (!res.ok) return;
    applyStationArtManifest(await res.json() as StationArtManifest);
  } catch {
    /* PNGs are decorative; procedural boxes stay. */
  } finally { clearTimeout(timer); }
}
