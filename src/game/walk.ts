/** Local spectator movement only. Never writes a base, assignment or work report. */
export interface WalkPosition { x: number; z: number }
export interface WalkGrid { walkable(x: number, y: number): boolean }
export interface WalkEscapeState {
  dialogOpen?: boolean;
  overlayOpen?: boolean;
  composerFocused?: boolean;
  alreadyHandled?: boolean;
}
export interface WalkLookPointer { x: number; y: number; originX: number; originY: number; armed: boolean }

/** First Escape closes dialogs/overlays/composer. A consumed Escape never also leaves POV. */
export function walkEscapeAction(state: WalkEscapeState): "leave" | "defer" {
  return state.alreadyHandled || state.dialogOpen || state.overlayOpen || state.composerFocused ? "defer" : "leave";
}

/** WASD/look yield to composer, dialogs, and an open inspector. Unfocused chat may stay visible. */
export function walkMovementBlocked(state: { composerFocused?: boolean; dialogOpen?: boolean; inspectorOpen?: boolean }): boolean {
  return !!(state.composerFocused || state.dialogOpen || state.inspectorOpen);
}

/** Ignore tap noise; arm from pointerdown origin so slow drags still rotate. */
export function walkLookStep(prev: WalkLookPointer, x: number, y: number, slop = 6): WalkLookPointer & { yaw: number; pitch: number } {
  const originX = prev.originX, originY = prev.originY;
  const armed = prev.armed || Math.hypot(x - originX, y - originY) >= slop;
  const dx = x - prev.x, dy = y - prev.y;
  return { x, y, originX, originY, armed, yaw: armed ? -dx * .004 : 0, pitch: armed ? -dy * .004 : 0 };
}
export function canStand(grid: WalkGrid, x: number, z: number, radius = .22): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return [-radius, radius].every(dx => [-radius, radius].every(dz => grid.walkable(Math.floor(x + dx), Math.floor(z + dz))));
}
export function moveWalker(grid: WalkGrid, start: WalkPosition, dx: number, dz: number): WalkPosition {
  const p = { ...start };
  if (![p.x, p.z, dx, dz].every(Number.isFinite)) return p;
  // Substeps prevent tunnelling; axis separation lets the director slide along walls.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .1));
  if (steps > 100) return p;
  for (let i = 0; i < steps; i++) {
    if (canStand(grid, p.x + dx / steps, p.z)) p.x += dx / steps;
    if (canStand(grid, p.x, p.z + dz / steps)) p.z += dz / steps;
  }
  return p;
}
export function findWalkStart(grid: WalkGrid, x: number, z: number): WalkPosition | null {
  if (canStand(grid, x, z)) return { x, z };
  for (let r = 1; r <= 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const p = { x: Math.floor(x) + dx + .5, z: Math.floor(z) + dz + .5 };
    if (canStand(grid, p.x, p.z)) return p;
  }
  return null;
}
