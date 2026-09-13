import type Phaser from "phaser";
import { TILE } from "../core/grid.ts";

/** Kind-sprite contract. A path is not a file — src is only honored when the PNG exists. */
export const BROKEN_ART_KEY = "broken-art";

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
  tileW?: number;
  tileH?: number;
  bytes?: number;
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
  tileW?: number;
  tileH?: number;
  bytes?: number;
  sha256?: string;
  src?: string;
};

export type StationSeatLayout = {
  originX: number;
  originY: number;
  displayWidth: number;
  displayHeight: number;
  painted: boolean;
  broken: boolean;
};

const catalog = new Map<string, string>();
const seats = new Map<string, GroundSeat>();

function positiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
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
  if (!bounds && !quad && typeof row.anchorX !== "number" && !positiveInt(row.tileW) && !positiveInt(row.bytes)) return;
  seats.set(kind, {
    anchorX: unit(row.anchorX) ? row.anchorX : 0.5,
    anchorY: unit(row.anchorY) ? row.anchorY : 0.5,
    groundBounds: bounds,
    groundQuad: quad,
    ...(positiveInt(row.pixelWidth) ? { pixelWidth: row.pixelWidth } : {}),
    ...(positiveInt(row.pixelHeight) ? { pixelHeight: row.pixelHeight } : {}),
    ...(positiveInt(row.tileW) ? { tileW: row.tileW } : {}),
    ...(positiveInt(row.tileH) ? { tileH: row.tileH } : {}),
    ...(positiveInt(row.bytes) ? { bytes: row.bytes } : {}),
    ...(typeof row.sha256 === "string" ? { sha256: row.sha256 } : {}),
    ...(typeof row.src === "string" ? { src: row.src } : {}),
  });
}

export function stationArtEntry(kind: string): GroundSeat | undefined {
  return seats.get(kind);
}

function rememberPath(kind: string, row: Omit<StationArtKind, "kind">): void {
  if (!row || typeof row !== "object" || !/^[a-z][a-z0-9-]*$/.test(kind)) return;
  if (row.src && (typeof row.src !== "string" || !/^\/sprites\/stations\/[a-z0-9.-]+\.png$/.test(row.src))) return;
  if (row.file && (typeof row.file !== "string" || !/^(\/sprites\/stations\/)?[a-z0-9.-]+\.png$/.test(row.file))) return;
  if (row.sha12 && (typeof row.sha12 !== "string" || !/^[a-f0-9]{12}$/.test(row.sha12))) return;
  if (row.sha256 && (typeof row.sha256 !== "string" || !/^[a-f0-9]{12,64}$/.test(row.sha256))) return;
  if (row.src) catalog.set(kind, row.src);
  else if (row.file) catalog.set(kind, row.file.startsWith("/") ? row.file : "/sprites/stations/" + row.file);
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
  return catalog.get(kind) ?? null;
}

export function hubSpritePath(id: string): string {
  return "/sprites/stations/hub-" + id + ".png";
}

export function stationTextureKeys(id: string, kind: string) {
  return {
    hub: "sprite-hub-" + id,
    kind: "sprite-kind-" + kind,
    painted: id === "well" ? "well-mark" : "b-" + id,
    broken: BROKEN_ART_KEY,
  };
}

export function pickStationTexture(scene: Phaser.Scene, id: string, kind: string): string {
  const keys = stationTextureKeys(id, kind);
  if (hasRealTexture(scene, keys.hub)) return keys.hub;
  if (hasRealTexture(scene, keys.kind)) return keys.kind;
  return keys.broken;
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

function seatForTexture(kind: string, textureKey?: string): GroundSeat | undefined {
  if (textureKey?.startsWith("sprite-hub-")) {
    const hubId = textureKey.slice("sprite-hub-".length);
    return seats.get("hub:" + hubId) ?? seats.get(hubId);
  }
  return seats.get(kind);
}

/** Uniform scale from the plinth, not the full PNG bounds. Painted boxes still fill the tile footprint. */
export function stationSeatLayout(opts: {
  painted: boolean;
  broken?: boolean;
  pixelWidth: number;
  pixelHeight: number;
  footprintWidth: number;
  footprintHeight: number;
  kind: string;
  textureKey?: string;
}): StationSeatLayout {
  if (opts.broken || opts.textureKey === BROKEN_ART_KEY) {
    return {
      originX: 0.5,
      originY: 0.5,
      displayWidth: TILE,
      displayHeight: TILE,
      painted: false,
      broken: true,
    };
  }
  if (opts.painted) {
    return {
      originX: 0.5,
      originY: 0.5,
      displayWidth: opts.footprintWidth,
      displayHeight: opts.footprintHeight,
      painted: true,
      broken: false,
    };
  }
  const seat = seatForTexture(opts.kind, opts.textureKey);
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
    broken: false,
  };
}

export function seatStationImage(
  img: Phaser.GameObjects.Image,
  opts: {
    textureKey: string;
    paintedKey: string;
    brokenKey?: string;
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
    broken: opts.textureKey === (opts.brokenKey ?? BROKEN_ART_KEY),
    pixelWidth: img.frame?.realWidth || img.width || 1,
    pixelHeight: img.frame?.realHeight || img.height || 1,
    footprintWidth,
    footprintHeight,
    kind: opts.kind,
    textureKey: opts.textureKey,
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
    /* Missing manifest or PNG is a broken-art badge, not a guessed path. */
  } finally { clearTimeout(timer); }
}
