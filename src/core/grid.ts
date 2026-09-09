export const TILE = 32;
import { MAP_W, MAP_H, CORE_X, CORE_Y, BASE_RADIUS } from "../../shared/map.ts";
export { MAP_W, MAP_H };

export type TileKind = "sand" | "sand2" | "path" | "pad" | "plaza" | "water" | "fence";

export interface Point {
  x: number;
  y: number;
}

export class WorldGrid {
  readonly kinds: TileKind[][];
  readonly blocked: boolean[][];
  readonly occupied: boolean[][];

  constructor() {
    this.kinds = Array.from({ length: MAP_H }, () => Array<TileKind>(MAP_W).fill("sand"));
    this.blocked = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
    this.occupied = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }

  walkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.blocked[y][x] || this.occupied[y][x]) return false;
    const k = this.kinds[y][x];
    return k !== "water" && k !== "fence";
  }

  canPlace(tx: number, ty: number, w: number, h: number, well: Point, radius: number): boolean {
    return this.placeFail(tx, ty, w, h, well, radius) === null;
  }

  placeFail(tx: number, ty: number, w: number, h: number, well: Point, radius: number): "oob" | "blocked" | "water" | "occupied" | "radius" | "palbox" | null {
    const cx = well.x + 1;
    const cy = well.y + 1;
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (!this.inBounds(x, y)) return "oob";
        if (x >= well.x && x < well.x + 2 && y >= well.y && y < well.y + 2) return "palbox";
        if (this.blocked[y][x]) return "blocked";
        if (this.occupied[y][x]) return "occupied";
        const k = this.kinds[y][x];
        if (k === "water") return "water";
        if (k === "fence") return "blocked";
        if (Math.hypot(x - cx, y - cy) > radius) return "radius";
      }
    }
    return null;
  }

  occupy(tx: number, ty: number, w: number, h: number, on: boolean): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (this.inBounds(x, y)) this.occupied[y][x] = on;
      }
    }
  }

  dockFor(tx: number, ty: number, w: number, h: number): Point {
    const spots: Point[] = [
      { x: tx + Math.floor(w / 2), y: ty + h },
      { x: tx + Math.floor(w / 2), y: ty - 1 },
      { x: tx + w, y: ty + Math.floor(h / 2) },
      { x: tx - 1, y: ty + Math.floor(h / 2) },
    ];
    for (const s of spots) {
      if (this.walkable(s.x, s.y)) return s;
    }
    return { x: tx, y: ty + h };
  }
}

export function generateWorld(grid: WorldGrid): { plazaMin: Point; plazaMax: Point; well: Point } {
  const cx = CORE_X;
  const cy = CORE_Y;
  const plazaMin = { x: cx - 6, y: cy - 6 };
  const plazaMax = { x: cx + 6, y: cy + 6 };
  const well = { x: cx - 1, y: cy - 1 };
  const radius = BASE_RADIUS;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      grid.kinds[y][x] = (x + y) % 9 === 0 ? "sand2" : "sand";
    }
  }

  for (let y = plazaMin.y; y <= plazaMax.y; y++) {
    for (let x = plazaMin.x; x <= plazaMax.x; x++) {
      const edge = x === plazaMin.x || x === plazaMax.x || y === plazaMin.y || y === plazaMax.y;
      grid.kinds[y][x] = edge ? "pad" : "plaza";
    }
  }

  const paintPath = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
      if (grid.inBounds(x, y) && (grid.kinds[y][x] === "sand" || grid.kinds[y][x] === "sand2")) {
        grid.kinds[y][x] = "path";
      }
      if (x < x1) x++;
      else if (x > x1) x--;
      else if (y < y1) y++;
      else if (y > y1) y--;
    }
  };

  paintPath(plazaMin.x, cy, 2, cy);
  paintPath(plazaMax.x, cy, MAP_W - 3, cy);
  paintPath(cx, plazaMin.y, cx, 2);
  paintPath(cx, plazaMax.y, cx, MAP_H - 5);

  for (let x = 0; x < MAP_W; x++) {
    grid.kinds[MAP_H - 2][x] = "water";
    grid.kinds[MAP_H - 1][x] = "water";
    grid.blocked[MAP_H - 2][x] = true;
    grid.blocked[MAP_H - 1][x] = true;
  }

  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(rad) * radius);
    const y = Math.round(cy + Math.sin(rad) * radius);
    if (!grid.inBounds(x, y)) continue;
    const gate = Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1;
    if (gate) continue;
    if (grid.kinds[y][x] === "plaza" || grid.kinds[y][x] === "pad") continue;
    grid.kinds[y][x] = "fence";
    grid.blocked[y][x] = true;
  }

  for (let i = 0; i < 28; i++) {
    const x = 1 + ((i * 13) % (MAP_W - 2));
    const y = 1 + ((i * 9) % (MAP_H - 6));
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) <= radius + 1) continue;
    if (grid.kinds[y][x] === "sand" || grid.kinds[y][x] === "sand2") grid.blocked[y][x] = true;
  }

  return { plazaMin, plazaMax, well };
}
