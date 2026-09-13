import { type Point, type WorldGrid } from "./grid.ts";

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function findPath(grid: WorldGrid, start: Point, goal: Point): Point[] {
  if (!grid.walkable(goal.x, goal.y)) {
    const near = nearestWalkable(grid, goal);
    if (!near) return [];
    goal = near;
  }
  if (start.x === goal.x && start.y === goal.y) return [start];

  const open: Node[] = [{ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) }];
  const best = new Map<string, number>();
  const came = new Map<string, Point>();
  best.set(key(start.x, start.y), 0);

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) return reconstruct(came, start, goal);

    for (const d of DIRS) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (!grid.walkable(nx, ny)) continue;
      if (d.x !== 0 && d.y !== 0) {
        if (!grid.walkable(cur.x + d.x, cur.y) || !grid.walkable(cur.x, cur.y + d.y)) continue;
      }
      const step = d.x !== 0 && d.y !== 0 ? 1.4 : 1;
      const g = cur.g + step;
      const k = key(nx, ny);
      const prev = best.get(k);
      if (prev !== undefined && g >= prev) continue;
      best.set(k, g);
      came.set(k, { x: cur.x, y: cur.y });
      open.push({ x: nx, y: ny, g, f: g + heuristic({ x: nx, y: ny }, goal) });
    }
  }
  return [];
}

function heuristic(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function reconstruct(came: Map<string, Point>, start: Point, goal: Point): Point[] {
  const out: Point[] = [goal];
  let cur = goal;
  while (cur.x !== start.x || cur.y !== start.y) {
    const p = came.get(key(cur.x, cur.y));
    if (!p) break;
    out.push(p);
    cur = p;
  }
  out.reverse();
  return out;
}

export function nearestWalkable(grid: WorldGrid, goal: Point): Point | null {
  if (grid.walkable(goal.x, goal.y)) return goal;
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = goal.x + dx;
        const y = goal.y + dy;
        if (grid.walkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}
