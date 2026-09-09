import * as THREE from "three";
import { canStand, findWalkStart, moveWalker, type WalkGrid } from "./walk.ts";

const blockedInput = () => !!document.activeElement?.closest("input,textarea,select,[contenteditable=true],dialog") || !!document.querySelector("dialog[open],#hud.operations-open,#hud:not(.chat-collapsed) #chat-panel:not([hidden]),#hud .crew-panel:not([hidden])");

/** Optional first-person spectator camera. No pointer-lock, permissions or shared writes. */
export class WalkView {
  readonly camera = new THREE.PerspectiveCamera(62, 1, .06, 220);
  active = false;
  private yaw = 0;
  private pitch = -.08;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  private touchKeys = new Map<number, string>();
  private ui = document.createElement("section");
  private target: HTMLButtonElement;
  private getGrid: () => WalkGrid;
  private inspect: () => void;
  private leave: () => void;
  constructor(canvas: HTMLCanvasElement, getGrid: () => WalkGrid, inspect: () => void, leave: () => void) {
    this.getGrid = getGrid; this.inspect = inspect; this.leave = leave;
    this.camera.rotation.order = "YXZ";
    this.ui.className = "walk-controls"; this.ui.hidden = true;
    this.ui.setAttribute("aria-label", "First-person controls");
    this.ui.innerHTML = `<div class="walk-reticle" aria-hidden="true"></div><div class="walk-guide">WASD to walk · drag to look · E to inspect · Esc to exit</div><div class="walk-pad" aria-label="Walk direction"><button data-walk="w" aria-label="Walk forward">↑</button><button data-walk="a" aria-label="Step left">←</button><button data-walk="s" aria-label="Walk backward">↓</button><button data-walk="d" aria-label="Step right">→</button></div><button class="walk-interact" disabled>Look at a station</button>`;
    document.getElementById("hud")!.append(this.ui);
    this.target = this.ui.querySelector<HTMLButtonElement>(".walk-interact")!;
    this.target.onclick = () => { if (this.active) this.inspect(); };
    this.ui.querySelectorAll<HTMLButtonElement>("[data-walk]").forEach(b => {
      b.addEventListener("pointerdown", e => { if (!this.active || blockedInput()) return; e.preventDefault(); b.setPointerCapture(e.pointerId); this.touchKeys.set(e.pointerId, b.dataset.walk!); });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(event, e => this.touchKeys.delete((e as PointerEvent).pointerId));
    });
    canvas.addEventListener("pointerdown", e => {
      if (!this.active || blockedInput() || e.button !== 0 || this.pointer) return;
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
      if (!this.active || this.pointer?.id !== e.pointerId || blockedInput()) return;
      this.yaw -= (e.clientX - this.pointer.x) * .004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.pointer.y) * .004, -1.2, 1.15);
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, e => { if (this.pointer?.id === (e as PointerEvent).pointerId) this.pointer = null; });
    window.addEventListener("keydown", e => {
      if (!this.active) return;
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) { this.leave(); e.preventDefault(); return; }
      if (blockedInput() || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { this.keys.add(k); e.preventDefault(); }
      if (k === "e" && !e.repeat) { e.preventDefault(); this.inspect(); }
    });
    window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.clear(); });
    document.addEventListener("focusin", () => { if (blockedInput()) this.clear(); });
  }
  private clear() { this.keys.clear(); this.touchKeys.clear(); this.pointer = null; }
  enter(x: number, z: number) {
    const start = findWalkStart(this.getGrid(), x, z); if (!start) return false;
    this.clear(); this.camera.position.set(start.x, 1.5, start.z); this.active = true; this.ui.hidden = false;
    document.documentElement.classList.add("walk-mode"); return true;
  }
  exit() { this.active = false; this.clear(); this.ui.hidden = true; document.documentElement.classList.remove("walk-mode"); }
  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setTarget(name?: string) {
    const text = name ? "Inspect " + name : "Look at a station";
    if (this.target.textContent !== text) this.target.textContent = text;
    this.target.disabled = !name;
  }
  update(dt: number) {
    if (!this.active) return;
    if (blockedInput()) this.clear();
    const has = (k: string) => this.keys.has(k) || [...this.touchKeys.values()].includes(k);
    const seconds = Math.min(Math.max(dt, 0), 50) / 1000;
    this.yaw += ((has("arrowleft") ? 1 : 0) - (has("arrowright") ? 1 : 0)) * seconds * 1.5;
    let forward = (has("w") || has("arrowup") ? 1 : 0) - (has("s") || has("arrowdown") ? 1 : 0);
    let side = (has("d") ? 1 : 0) - (has("a") ? 1 : 0);
    const length = Math.hypot(forward, side); if (length) { forward /= length; side /= length; }
    const speed = 3.2 * seconds;
    const grid = this.getGrid();
    const p = moveWalker(grid, this.camera.position, (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) * speed, (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) * speed);
    // A fresh map hydration may occupy the current tile; find a safe local spawn.
    const safe = canStand(grid, p.x, p.z) ? p : findWalkStart(grid, p.x, p.z);
    if (!safe) { this.leave(); return; }
    this.camera.position.set(safe.x, 1.5, safe.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
