export const TILE = 32;
export const MAP_W = 56;
export const MAP_H = 40;

export type TileKind = "grass" | "grass2" | "path" | "cobble" | "plaza" | "water";

export interface Point {
  x: number;
  y: number;
}

export class WorldGrid {
  readonly kinds: TileKind[][];
  readonly blocked: boolean[][];
  readonly occupied: boolean[][];

  constructor() {
    this.kinds = Array.from({ length: MAP_H }, () => Array<TileKind>(MAP_W).fill("grass"));
    this.blocked = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
    this.occupied = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }

  walkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.blocked[y][x] || this.occupied[y][x]) return false;
    return this.kinds[y][x] !== "water";
  }

  canPlace(tx: number, ty: number, w: number, h: number, plazaMin: Point, plazaMax: Point): boolean {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (!this.inBounds(x, y)) return false;
        if (this.blocked[y][x] || this.occupied[y][x]) return false;
        if (this.kinds[y][x] === "water") return false;
        if (x >= plazaMin.x && x <= plazaMax.x && y >= plazaMin.y && y <= plazaMax.y) return false;
      }
    }
    return true;
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
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
  const plazaMin = { x: cx - 6, y: cy - 6 };
  const plazaMax = { x: cx + 6, y: cy + 6 };

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      grid.kinds[y][x] = (x + y) % 7 === 0 ? "grass2" : "grass";
    }
  }

  for (let y = plazaMin.y; y <= plazaMax.y; y++) {
    for (let x = plazaMin.x; x <= plazaMax.x; x++) {
      const edge = x === plazaMin.x || x === plazaMax.x || y === plazaMin.y || y === plazaMax.y;
      grid.kinds[y][x] = edge ? "cobble" : "plaza";
    }
  }

  const paintPath = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
      if (grid.inBounds(x, y) && (grid.kinds[y][x] === "grass" || grid.kinds[y][x] === "grass2")) {
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

  for (let i = 0; i < 40; i++) {
    const x = 1 + ((i * 11) % (MAP_W - 2));
    const y = 1 + ((i * 7) % (MAP_H - 6));
    if (x >= plazaMin.x - 1 && x <= plazaMax.x + 1 && y >= plazaMin.y - 1 && y <= plazaMax.y + 1) continue;
    if (grid.kinds[y][x] === "grass" || grid.kinds[y][x] === "grass2") grid.blocked[y][x] = true;
  }

  return { plazaMin, plazaMax, well: { x: cx - 1, y: cy - 1 } };
}
