import * as THREE from "three";

export interface CampusPlot { x: number; z: number; width: number; depth: number; height?: number }
export interface CampusViewport { width: number; height: number; left?: number; right?: number; top?: number; bottom?: number }

/** Fit the occupied campus, including building height, into the unobscured viewport. */
export function fitCampusCamera(plots: CampusPlot[], viewport: CampusViewport, direction: THREE.Vector3, halfHeight = 17) {
  const bounds = new THREE.Box3();
  for (const p of plots) {
    if (![p.x, p.z, p.width, p.depth, p.height ?? 4.5].every(Number.isFinite) || p.width <= 0 || p.depth <= 0) continue;
    bounds.expandByPoint(new THREE.Vector3(p.x - 1, 0, p.z - 1));
    bounds.expandByPoint(new THREE.Vector3(p.x + p.width + 1, p.height ?? 4.5, p.z + p.depth + 1));
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 4.5, 8));
  const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
  const left = Math.max(0, viewport.left ?? 0), right = Math.max(0, viewport.right ?? 0);
  const top = Math.max(0, viewport.top ?? 0), bottom = Math.max(0, viewport.bottom ?? 0);
  const forward = direction.clone().normalize();
  if (forward.lengthSq() < .5) forward.set(1, 1, 1).normalize();
  const horizontal = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  if (horizontal.lengthSq() < .5) horizontal.set(1, 0, 0);
  const vertical = new THREE.Vector3().crossVectors(forward, horizontal).normalize();
  const center = bounds.getCenter(new THREE.Vector3());
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(center);
    const sx = p.dot(horizontal), sy = p.dot(vertical);
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const pixelsPerUnit = Math.min(Math.max(width * .15, width - left - right) / Math.max(1, maxX - minX), Math.max(height * .15, height - top - bottom) / Math.max(1, maxY - minY));
  const zoom = Math.min(2.5, pixelsPerUnit * halfHeight * 2 / height);
  const unitsPerPixel = halfHeight * 2 / (height * zoom);
  const target = center.addScaledVector(horizontal, (minX + maxX) / 2 - (left - right) * unitsPerPixel / 2)
    .addScaledVector(vertical, (minY + maxY) / 2 - (bottom - top) * unitsPerPixel / 2);
  return { target, zoom, minZoom: Math.max(.035, Math.min(.25, zoom * .6)) };
}

/** A pan that returns to its origin, canceled pointer, or pinch must never select/build. */
export class MapClickGesture {
  private pointers = new Map<number, { x: number; y: number; button: number; moved: boolean }>();
  private multiple = false;
  down(id: number, x: number, y: number, button: number) {
    if (this.pointers.size) this.multiple = true;
    this.pointers.set(id, { x, y, button, moved: false });
  }
  move(id: number, x: number, y: number) {
    const p = this.pointers.get(id);
    if (p && Math.hypot(x - p.x, y - p.y) > 6) p.moved = true;
  }
  up(id: number, x: number, y: number, button: number) {
    this.move(id, x, y);
    const p = this.pointers.get(id);
    const click = !!p && !this.multiple && this.pointers.size === 1 && !p.moved && p.button === 0 && button === 0;
    this.pointers.delete(id);
    if (!this.pointers.size) this.multiple = false;
    return click;
  }
  cancel(id?: number) {
    if (id === undefined) this.pointers.clear(); else this.pointers.delete(id);
    this.multiple = this.pointers.size > 0;
  }
}
