import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { AGENTS, HUBS, BASE_RADIUS, MAP_W, MAP_H, assignAgent, beginMove, buildingAt, buildingName, cancelMove, demolish, finishMove, hubById, placementOk, runtime, stationMapLabel, stepAgents, tryPlace, walkPlayerTo } from "../core/runtime.ts";
import { bus } from "../core/events.ts";
import { attention, liveWork, presenceBySeat, workReports, radioLive } from "../core/live.ts";
import { agentSignal, standbySpots, STANDBY_CENTER } from "../core/agentPresentation.ts";
import { seatForPal, speakerLabel } from "../../shared/protocol.ts";
import { CORE_X, CORE_Y, DISTRICTS } from "../../shared/map.ts";
import { WalkView } from "./WalkView.ts";
import { createArchitecture, createCharacter } from "./architecture.ts";
import { packLabels, type LabelCandidate } from "./labelLayout.ts";
import { disposeObject3D, enableGlbShadows, hubGlbPath, rejectLoadedGlb, seatGlbInFootprint } from "./stationModels.ts";
import { fitCampusCamera, MapClickGesture } from "./campusCamera.ts";

const colors = { attentive: 0x80f5b8, busy: 0x80c8ff, away: 0xe4b76a, offline: 0x536570 };
/**
 * Cyberpunk command-deck campus.
 *
 * The old header here specified the opposite rig — a measured hue budget off
 * 25 Grok Imagine stills, amber-dominant against a pure black void, ambient
 * "near zero". That direction shipped, was reviewed live and was rejected for
 * being dark and flat. Nothing in this file follows it any more; the note is
 * recorded rather than silently deleted so the next person does not rediscover
 * the hue census and assume it is still the target.
 */
// Slice 1-2 chased Grok Imagine's measured stills into a black-void-plus-dim-pools
// look. Zeref saw it live, hated it, then handed a reference: a teal/cyan
// holographic sci-fi command deck — dark grid floor, glowing ring pads under
// each station, cyan-dominant light, gold reserved for a couple of "treasure"
// buildings (Bank, Grand Exchange), a mint-teal energy core at the Well. This
// is that reversal: near-black-navy void instead of violet, electric cyan as
// the dominant color instead of amber, gold demoted to a rare accent.
export const NIGHT_LOOK = {
  background: 0x05080f,
  fog: 0x0a1620,
  hemiSky: 0x1c4a55,
  hemiGround: 0x040a10,
  /** Gold — rare now: the key light's subtle warm fill, and the Bank/GE glazing. */
  key: 0xffc873,
  /** Electric cyan: the dominant rim/fill light. */
  rim: 0x33e8ff,
  /** Cyan ground-pool decals under every station: the hologram's base color. */
  practical: 0x2be8ff,
  /** Mint-teal energy core — Well vortex, Spector/Altar ring trim. */
  accent: 0x39ffd4,
} as const;
const cx = CORE_X, cz = CORE_Y;
/**
 * How far the non-buildable outer world extends past the saved map, in map
 * widths. At 4 the fade fell entirely outside the camera frame and the grid
 * read as uniform graph paper; the horizon has to die inside the shot.
 */
const OUTER_WORLD = 2;
/** Square span of the outer world/grid, in world units, centred on the map. */
const GRID_SPAN = Math.max(MAP_W, MAP_H) * OUTER_WORLD;
/** One shared radial falloff for every station's light pool. Built on first use. */
let poolTexture: THREE.CanvasTexture | null = null;
function practicalPool() {
  if (poolTexture) return poolTexture;
  const size = 128, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,.85)");
  g.addColorStop(.26, "rgba(255,255,255,.34)");
  g.addColorStop(.58, "rgba(255,255,255,.07)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  poolTexture = new THREE.CanvasTexture(canvas);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  return poolTexture;
}
/**
 * Radial falloff that holds full strength over the built campus and dies well
 * before the outer ground's own edge. This is what removes the "slab in the
 * abyss" read: the world does not stop, it fades, which also reads as room
 * the campus can still grow into.
 */
function horizonGradient(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(.28, "rgba(255,255,255,1)");
  g.addColorStop(.45, "rgba(255,255,255,.5)");
  g.addColorStop(.66, "rgba(255,255,255,.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  return g;
}
let horizonTexture: THREE.CanvasTexture | null = null;
function horizonFade() {
  if (horizonTexture) return horizonTexture;
  const size = 512, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = horizonGradient(ctx, size);
  ctx.fillRect(0, 0, size, size);
  horizonTexture = new THREE.CanvasTexture(canvas);
  horizonTexture.colorSpace = THREE.SRGBColorSpace;
  return horizonTexture;
}
/**
 * The whole grid floor as one non-repeating texture with its horizon falloff
 * already multiplied in.
 *
 * A small tiling texture plus an alphaMap looks like the obvious way to do
 * this and does not work: the alpha map inherits the grid's repeat, so every
 * cell gets its own copy of the gradient and the net result is a perfectly
 * uniform sheet of graph paper to the edge of the screen. Baking the falloff
 * into one big texture is the version that actually fades.
 */
let gridTexture: THREE.CanvasTexture | null = null;
function gridFloorTexture() {
  if (gridTexture) return gridTexture;
  const size = 2048, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cells = GRID_SPAN / 3;
  const step = size / cells;
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= cells; i++) {
    const p = Math.round(i * step) + .5;
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
  }
  ctx.stroke();
  // Multiply the horizon falloff straight into the alpha channel.
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = horizonGradient(ctx, size);
  ctx.fillRect(0, 0, size, size);
  gridTexture = new THREE.CanvasTexture(canvas);
  gridTexture.colorSpace = THREE.SRGBColorSpace;
  return gridTexture;
}
type Actor = { group: THREE.Group; body: THREE.Group; light: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; ring: THREE.Mesh; label: HTMLElement; signal: HTMLElement; action: HTMLElement };
const typing = () => !!document.activeElement?.closest("input, textarea, select, dialog");

/** The existing grid, building rules and pathfinder drive a real 3D presentation. */
export class World3D {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-20, 20, 15, -15, .1, 400);
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private stations = new Map<string, THREE.Group>();
  private actors = new Map<string, Actor>();
  private player = new THREE.Group();
  private ghost = new THREE.Group();
  private ghostTile: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private lastStep = 0;
  private clickGesture = new MapClickGesture();
  private initialHydrationFit = true;
  private cameraNavigated = false;
  private fittedView = true;
  private previous = performance.now();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastSignals = 0;
  private parking: Array<{ x: number; y: number }> = [];
  private standbyLabel!: HTMLElement;
  private walk: WalkView;
  private walkTarget: string | null = null;
  private gltf = new GLTFLoader();
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloom!: UnrealBloomPass;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.65;
    parent.append(this.renderer.domElement);
    // Holographic sci-fi read comes from bloom, not raw color: neon trim and
    // window glow need to visibly haze/bleed the way a real glass emitter
    // does, or the scene reads as flat lit geometry instead of a hologram.
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // Strength .85 at threshold .32 blew every station into a white smear and
    // buried the geometry. Bloom belongs on actual emitters — windows, pools,
    // the Well — not on every lit surface, so the threshold sits above what
    // tone-mapped stone returns and the strength only haloes, never floods.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .28, .7, .82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Bloom is the one genuinely per-pixel cost added here (measured ~12% of
    // frame time). On phones it runs at 1x while the scene still renders at
    // the device ratio — a blur is the last thing that needs the extra pixels,
    // and this is a PWA people open on an iPhone.
    if (matchMedia("(pointer: coarse)").matches) this.composer.setPixelRatio(1);
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D AREA 67 base. Use crew and station controls for keyboard access.");
    this.labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    parent.append(this.labels.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enableRotate = true;
    this.controls.minPolarAngle = .015;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minZoom = .08;
    this.controls.maxZoom = 4;
    this.controls.screenSpacePanning = false;
    this.controls.panSpeed = 1;
    this.controls.zoomSpeed = .85;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.resetCamera();
    // Holographic command-deck backdrop: near-black navy, not a photographic
    // sky (still fights the art direction) and not the violet or black-void
    // fields the earlier slices shipped.
    parent.style.background = "#05080f";
    this.scene.background = null;
    this.renderer.setClearColor(NIGHT_LOOK.background, 0);
    this.scene.fog = new THREE.FogExp2(NIGHT_LOOK.fog, .0018);
    // Ambient does real work here — the whole deck is meant to look lit, not
    // just the pools — but it's cyan-tinted, so it reads as hologram fill
    // rather than daylight.
    this.scene.add(new THREE.HemisphereLight(NIGHT_LOOK.hemiSky, NIGHT_LOOK.hemiGround, 2.2));
    const key = new THREE.DirectionalLight(NIGHT_LOOK.key, .4);
    key.position.set(cx - 14, 28, cz - 8); key.target.position.set(cx, 0, cz);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, far: 150 });
    key.shadow.normalBias = .12;
    key.shadow.bias = -.00015;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(NIGHT_LOOK.rim, 1.9);
    rim.position.set(cx + 20, 15, cz + 18); this.scene.add(rim);
    const wellLamp = new THREE.PointLight(NIGHT_LOOK.key, 1.8, 16, 1.8);
    wellLamp.position.set(cx, 3.1, cz);
    this.scene.add(wellLamp);
    // Mint-teal containment ring at the Well — the campus's one energy core.
    const wellRing = new THREE.Group(); wellRing.position.set(cx, 0, cz);
    this.glowRing(3.4, NIGHT_LOOK.accent, 1.35, wellRing, 1);
    this.glowRing(3.28, NIGHT_LOOK.accent, 1.35, wellRing, .7);
    this.glowRing(3.5, NIGHT_LOOK.accent, .32, wellRing, .75);
    this.scene.add(wellRing);
    const wellGlow = new THREE.PointLight(NIGHT_LOOK.accent, 6.5, 14, 1.8);
    wellGlow.position.set(cx, 1.5, cz); this.scene.add(wellGlow);
    this.createTerrain();
    this.createDistrictGrounds();
    this.syncStations();
    const comms = runtime.buildings.find(b => hubById(b.hubId).kind === "comms");
    if (comms) {
      const h = hubById(comms.hubId);
      const teal = new THREE.PointLight(NIGHT_LOOK.rim, 2.2, 14, 1.8);
      teal.position.set(comms.tx + h.w / 2, 3.4, comms.ty + h.h / 2);
      this.scene.add(teal);
    }
    this.createActors();
    this.walk = new WalkView(this.renderer.domElement, () => runtime.grid, () => this.inspectWalkTarget(), () => this.setView(false));
    this.scene.add(this.ghost);
    const resize = () => {
      const w = parent.clientWidth, h = parent.clientHeight;
      if (!w || !h) return;
      const span = 17;
      this.camera.left = -span * w / h; this.camera.right = span * w / h;
      this.camera.top = span; this.camera.bottom = -span;
      this.camera.updateProjectionMatrix();
      this.walk.resize(w, h);
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.labels.setSize(w, h);
      if (this.fittedView) this.fitCampus();
    };
    new ResizeObserver(resize).observe(parent); resize();
    this.bind();
    window.dispatchEvent(new Event("area67-3d-ready"));
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", e => { this.reduced = e.matches; });
    bus.on(e => {
      if (this.walk.active && runtime.mode !== "play") this.setView(false);
      if (e.type === "changed") {
        this.syncStations();
        // The first server snapshot can replace the local starter map. Never reframe
        // subsequent presence, work, selection, or building events behind the user.
        if (this.initialHydrationFit && radioLive) {
          this.initialHydrationFit = false;
          if (!this.cameraNavigated) this.fitCampus();
        }
      }
      if (e.type === "changed" || e.type === "presence") this.updateSignals();
      if (e.type === "focus-agent") {
        if (this.walk.active) this.setView(false);
        const actor = this.actors.get(e.agentId);
        if (actor) this.focus(actor.group.position.x, actor.group.position.z);
      }
      if (e.type === "say") {
        const actor = this.actors.get(e.agentId);
        if (actor) {
          actor.label.title = e.text;
          actor.label.classList.add("speaking");
          window.setTimeout(() => actor.label.classList.remove("speaking"), 5000);
        }
      }
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }
  private material(color: number, metalness = .4, roughness = .6) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }
  private mesh(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, parent: THREE.Object3D, metal = .4) {
    const m = new THREE.Mesh(geometry, this.material(color, metal));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, p: THREE.Object3D) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, p);
  }
  private glowRing(radius: number, color: number, y: number, parent: THREE.Object3D, opacity = .8) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius - .035, radius, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; parent.add(m); return m;
  }
  private createTerrain() {
    const platform = new THREE.Group(); platform.position.set(MAP_W / 2, -.44, MAP_H / 2);
    const foundation = this.box(MAP_W + .6, .85, MAP_H + .6, 0x020304, 0, 0, 0, platform);
    foundation.castShadow = false;
    // The previous deck top and tile top both sat at y=.14: coplanarity made
    // the whole map stripe/z-fight. Keep the structural deck below tile bottoms.
    const deck = this.box(MAP_W, .12, MAP_H, 0x070c14, 0, .45, 0, platform);
    deck.castShadow = false;
    this.scene.add(platform);
    const tileGeo = new THREE.BoxGeometry(1, .04, 1);
    // Dark tech-deck panels. Low roughness plus a little metalness is what
    // turns each pool into the vertical specular streak the reference reads
    // by; the grid overlay layered on top carries the actual "hologram" seams.
    const tileMats: Record<string, THREE.MeshStandardMaterial> = {
      sand: this.material(0x0c131c, .22, .55), sand2: this.material(0x0a0f17, .22, .58),
      plaza: this.material(0x101924, .28, .42), pad: this.material(0x121b27, .28, .40),
      path: this.material(0x15212f, .32, .36), water: this.material(0x060d16, .50, .15),
      fence: this.material(0x090e16, .18, .68), blocked: this.material(0x070b11, .15, .72),
    };
    // Instancing keeps the raised tile deck light enough for laptop GPUs.
    for (const [kind, material] of Object.entries(tileMats)) {
      const tiles: [number, number][] = [];
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const groundKind = runtime.grid.kinds[y][x];
        const displayed = runtime.grid.blocked[y][x] && !["water", "fence"].includes(groundKind) ? "blocked" : groundKind;
        if (displayed === kind) tiles.push([x, y]);
      }
      const batch = new THREE.InstancedMesh(tileGeo, material, tiles.length);
      const matrix = new THREE.Matrix4();
      tiles.forEach(([x, y], i) => batch.setMatrixAt(i, matrix.makeTranslation(x + .5, .14, y + .5)));
      batch.castShadow = false; batch.receiveShadow = true; this.scene.add(batch);
    }
    // The buildable plate used to end in a hard edge with pure black past it,
    // which read as a slab floating in an abyss. The world now continues well
    // past the build limit as unlit outer ground and fades out, so the campus
    // is a lit district inside something larger. None of this is buildable or
    // walkable — no saved coordinate, footprint or path is touched.
    // The falloff rides in the texture's own alpha channel (used as `map`, not
    // `alphaMap`) so the ground dissolves into the background instead of
    // ending on a square edge.
    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SPAN, GRID_SPAN),
      new THREE.MeshBasicMaterial({
        color: 0x0a1018, map: horizonFade(), transparent: true, depthWrite: false,
      }),
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.set(MAP_W / 2, .05, MAP_H / 2);
    outerGround.renderOrder = -3;
    this.scene.add(outerGround);
    // Holographic grid seams, carried across the outer ground too: the grid
    // running off into the fade is what says "there is room to expand here"
    // instead of "this is all there is".
    const gridOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SPAN, GRID_SPAN),
      new THREE.MeshBasicMaterial({
        color: NIGHT_LOOK.rim, map: gridFloorTexture(),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .3,
      }),
    );
    gridOverlay.rotation.x = -Math.PI / 2;
    gridOverlay.position.set(MAP_W / 2, .17, MAP_H / 2);
    // One line every 3 tiles, not every tile: at full-campus zoom a
    // once-per-tile grid aliases into a moire under bloom.
    (gridOverlay.material.map as THREE.Texture).anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    gridOverlay.renderOrder = -2;
    this.scene.add(gridOverlay);
    // Clip the build-limit arc to the map; outer terrain remains explorable.
    const boundary: THREE.Vector3[] = [];
    for (let i = 0; i < 360; i++) {
      const point = (a: number) => new THREE.Vector3(cx + Math.cos(a) * BASE_RADIUS, .2, cz + Math.sin(a) * BASE_RADIUS);
      const a = point(i * Math.PI / 180), b = point((i + 1) * Math.PI / 180);
      if ([a, b].every(p => p.x >= 0 && p.z >= 0 && p.x <= MAP_W && p.z <= MAP_H)) boundary.push(a, b);
    }
    // Dimmed from .9: under bloom the build-limit arc blew out into a stray
    // white stroke across the shot. It is a boundary hint, not a light source.
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(boundary), new THREE.LineBasicMaterial({ color: NIGHT_LOOK.rim, transparent: true, opacity: .14 })));
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      if (i % 8 === 0) continue;
      const x = cx + Math.cos(angle) * BASE_RADIUS, z = cz + Math.sin(angle) * BASE_RADIUS;
      if (x < 0 || z < 0 || x > MAP_W || z > MAP_H) continue;
      this.box(.18, .8, .18, 0x14191d, x, .4, z, this.scene);
      const lamp = this.mesh(new THREE.SphereGeometry(.17, 10, 8), NIGHT_LOOK.accent, x, .92, z, this.scene);
      (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(NIGHT_LOOK.accent);
    }
  }
  private label(text: string, cls: string, y: number, parent: THREE.Object3D) {
    const el = document.createElement("div"); el.className = cls; el.textContent = text;
    const obj = new CSS2DObject(el); obj.position.y = y; parent.add(obj); return el;
  }
  private createDistrictGrounds() {
    // District inlays are wayfinding, not lighting: keep them dim so they do not
    // compete with the practicals for the scene's colour budget. Bloom makes
    // even a dim ring read as a saturated color, so these stay inside the
    // cyan/teal family instead of the old muted-rainbow set — a red or gold
    // wayfinding ring now fights the palette instead of blending into it.
    const palette = [0x2be8ff, 0x39ffd4, 0x1c9fd6, 0x5ad1e0, 0x2680b8, 0x46e0c4];
    // Flush, non-colliding navigation inlays; no saved plot or road is moved.
    DISTRICTS.forEach((d, i) => {
      const group = new THREE.Group(); group.position.set(d.x, .18, d.y);
      this.glowRing(6.6, palette[i], .01, group, .12);
      this.scene.add(group);
    });
    // Water banks gain readable elevation; pathways remain flush and walkable.
    const strips = new THREE.Group();
    for (let x = 1; x < 63; x += 2) {
      if ([27, 29, 59, 61].includes(x)) continue;
      this.box(1.4, .09, .12, 0x39434a, x, .22,45.94, strips);
      this.box(1.4, .09, .12, 0x39434a, x, .22,48.04, strips);
    }
    this.scene.add(strips);
  }
  private layoutLabels() {
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const candidates: LabelCandidate[] = [];
    const elements = new Map<string, HTMLElement>();
    const project = (id: string, group: THREE.Group, y: number, el: HTMLElement, width: number, priority: number, pinned: boolean) => {
      const p = group.position.clone().add(new THREE.Vector3(0, y, 0)).project(this.camera);
      elements.set(id, el);
      if (p.z < -1 || p.z > 1) return;
      candidates.push({ id, x: (p.x + 1) * w / 2, y: (1 - p.y) * h / 2, width, height: 30, priority, pinned });
    };
    for (const [uid, group] of this.stations) {
      const el = group.userData.banner as HTMLElement;
      const pinned = uid === runtime.selectedBuilding || el.contains(document.activeElement) || el.matches(":hover");
      const distance = group.position.distanceTo(this.controls.target);
      project(uid, group, 3.3, el, 114, (group.userData.working ? 100 : 0) - distance, pinned);
    }
    for (const [uid, actor] of this.actors) {
      if (actor.group.userData.parked && runtime.selectedAgent !== uid) continue;
      project(uid, actor.group, 2, actor.label, 146, 20 - actor.group.position.distanceTo(this.controls.target), uid === runtime.selectedAgent || actor.label.contains(document.activeElement));
    }
    const visible = packLabels(candidates, w, h, w < 760 ? 6 : 12);
    for (const [id, el] of elements) el.dataset.culled = String(!visible.has(id));
  }
  private station(uid: string) {
    const b = runtime.buildings.find(b => b.uid === uid)!;
    const h = hubById(b.hubId);
    const group = new THREE.Group(); group.position.set(b.tx + h.w / 2, .19, b.ty + h.h / 2);
    group.userData = { uid, signature: JSON.stringify([b.tx, b.ty, b.hubId, b.project]) };
    const architecture = createArchitecture(h, !!b.project);
    architecture.name = "kit";
    group.add(architecture);
    // Every station spills a cyan practical pool onto the deck — the hologram
    // base color, not the amber the abandoned direction was built on.
    //
    // These were real PointLights for a few passes and they looked right, but
    // MeshStandardMaterial loops every light per fragment, so 26 of them cost
    // 2.3x the frame time on a software rasteriser. On an iOS PWA that is not
    // affordable for a static pool of light that never moves. An unlit additive
    // decal buys the same wash for one transparent quad and no shading cost;
    // the few real lights that remain (key, rim, Well, comms) still carry the
    // specular and the shadows. Named so a seated GLB never takes it away.
    // Sized 4.6x the footprint these read as fog banks, not light pools: a
    // 4-unit building threw a 25-unit smear, and under bloom 26 of them merged
    // into one white wash. A pool should sit close to the thing casting it.
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(h.w, h.h) * 2.2 + 3, Math.max(h.w, h.h) * 2.2 + 3),
      new THREE.MeshBasicMaterial({
        color: NIGHT_LOOK.practical, map: practicalPool(), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: .45,
      }),
    );
    pool.name = "practical";
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -.02;
    pool.renderOrder = -1;
    group.add(pool);
    // Every station stands on a landing-pad ring, the way each structure in
    // the reference sits inside its own projected circle. Two thin concentric
    // rings read as deliberate engineering; the soft pool alone read as haze.
    const pad = Math.max(h.w, h.h);
    this.glowRing(pad * .78, NIGHT_LOOK.practical, .035, group, .42);
    this.glowRing(pad * .96, NIGHT_LOOK.practical, .035, group, .22);
    // Mint-teal earns a seat only at the stations that read as "special" in
    // the fiction (the Well already has its ring) — Spector's scan gate and
    // the Altar's registry — not on every building, or it stops being an accent.
    if (h.id === "skillspector" || h.id === "skill-altar") {
      this.glowRing(pad * .55, NIGHT_LOOK.accent, .04, group, .6);
    }
    void this.trySeatGlb(group, h);
    const banner = this.label("", "map-station-label station-banner", b.project ? 3.5 : 3.3, group);
    const chip = document.createElement("span"); chip.className = "station-chip";
    const name = document.createElement("strong"); name.textContent = stationMapLabel(b, runtime.selectedBuilding === uid);
    chip.append(name);
    const details = document.createElement("span"); details.className = "station-details";
    details.id = "station-preview-" + uid; details.setAttribute("role", "tooltip");
    const card = document.createElement("span"); card.className = "station-detail-card";
    const heading = document.createElement("strong"); heading.textContent = buildingName(b);
    const scope = document.createElement("span"); scope.className = "station-scope";
    scope.textContent = b.project?.workspace || (b.project?.repoUrl ? new URL(b.project.repoUrl).pathname.slice(1) : h.kind + " · " + h.short);
    const contents = document.createElement("span"); contents.className = "station-contents";
    contents.textContent = b.project?.contents.slice(0, 3).join(" · ") || b.project?.summary || h.blurb;
    const signal = document.createElement("span"); signal.className = "station-signal";
    const hint = document.createElement("span"); hint.className = "station-hint"; hint.textContent = "Select to open workspace";
    card.append(heading, scope, contents, signal, hint); details.append(card);
    banner.append(chip, details);
    banner.style.setProperty("--station-color", h.color);
    banner.addEventListener("click", event => { event.stopPropagation(); runtime.selectedAgent = null; runtime.selectedBuilding = uid; bus.emit({ type: "changed" }); });
    banner.setAttribute("role", "button"); banner.tabIndex = 0;
    banner.setAttribute("aria-label", "Inspect " + buildingName(b));
    banner.setAttribute("aria-describedby", details.id);
    banner.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); banner.click(); } });
    // Escape dismisses the preview without moving the pointer or keyboard focus.
    const dismissPreview = (e: KeyboardEvent) => { if (e.key === "Escape") banner.classList.add("preview-dismissed"); };
    banner.addEventListener("pointerenter", () => { banner.classList.remove("preview-dismissed"); window.addEventListener("keydown", dismissPreview); });
    banner.addEventListener("pointerleave", () => { if (document.activeElement !== banner) window.removeEventListener("keydown", dismissPreview); });
    banner.addEventListener("focus", () => { banner.classList.remove("preview-dismissed"); window.addEventListener("keydown", dismissPreview); });
    banner.addEventListener("blur", () => { banner.classList.add("preview-dismissed"); window.removeEventListener("keydown", dismissPreview); });
    group.userData.disposeLabel = () => window.removeEventListener("keydown", dismissPreview);
    const beacon = this.glowRing(Math.max(h.w, h.h) * .62, 0x82c9ff, .3, group, .9);
    beacon.name = "work-beacon"; beacon.visible = false;
    group.userData.banner = banner; group.userData.signal = signal; group.userData.chipName = name;
    this.scene.add(group); this.stations.set(uid, group);
  }
  private disposeNode(obj: THREE.Object3D) {
    disposeObject3D(obj);
  }
  /** Claude/Blender Friday drop. 404 or oversize keeps the architecture kit. */
  private async trySeatGlb(group: THREE.Group, h: ReturnType<typeof hubById>) {
    const token = {};
    group.userData.glbToken = token;
    try {
      const gltf = await this.gltf.loadAsync(hubGlbPath(h.id));
      const model = gltf.scene;
      enableGlbShadows(model);
      const keep = group.userData.glbToken === token && this.stations.has(group.userData.uid) && seatGlbInFootprint(model, h.w, h.h);
      if (rejectLoadedGlb(model, keep)) return;
      const kit = group.getObjectByName("kit");
      if (kit) { this.disposeNode(kit); group.remove(kit); }
      model.name = "kit";
      group.add(model);
    } catch {
      /* Missing GLB is expected until Claude's Blender drop. */
    }
  }
  private disposeGroup(group: THREE.Group) {
    group.userData.glbToken = null;
    group.userData.disposeLabel?.();
    group.traverse(o => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.scene.remove(group);
  }
  private syncStations() {
    for (const [uid, g] of this.stations) {
      const b = runtime.buildings.find(b => b.uid === uid);
      if (!b || g.userData.signature !== JSON.stringify([b.tx, b.ty, b.hubId, b.project])) { this.disposeGroup(g); this.stations.delete(uid); }
    }
    for (const b of runtime.buildings) if (!this.stations.has(b.uid)) this.station(b.uid);
  }
  private updateSignals() {
    this.parking = standbySpots(runtime.grid, runtime.agents.length);
    for (const [uid, group] of this.stations) {
      const active = liveWork(uid);
      const assigned = runtime.agents.filter(a => a.buildingUid === uid);
      const banner = group.userData.banner as HTMLElement;
      const signal = group.userData.signal as HTMLElement;
      const building = runtime.buildings.find(b => b.uid === uid);
      if (building) group.userData.chipName.textContent = stationMapLabel(building, runtime.selectedBuilding === uid);
      banner.classList.toggle("working", active.length > 0);
      banner.classList.toggle("selected", runtime.selectedBuilding === uid);
      signal.textContent = active.length ? active.map(w => speakerLabel(w.seat) + " · " + w.taskId).join(" + ") : assigned.length ? assigned.length + " assigned · no live work report" : "Open workspace";
      signal.title = active.map(w => speakerLabel(w.seat) + ": " + w.activity).join("\n");
      group.getObjectByName("work-beacon")!.visible = active.length > 0;
      group.userData.working = active.length > 0;
    }
  }
  private createActors() {
    for (const a of runtime.agents) {
      const def = AGENTS.find(d => d.id === a.id)!;
      const group = new THREE.Group(); group.position.set(a.tx + .5, .25, a.ty + .5); group.userData = { agentId: a.id };
      const size = a.id === "director" ? 1.65 : 1.45;
      const body = createCharacter(/grok/i.test(def.model), a.id === "director", parseInt(def.color.slice(1), 16));
      group.add(body);
      const ring = this.glowRing(.46, parseInt(def.color.slice(1), 16), .005, group, .3);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 8), new THREE.MeshBasicMaterial({ color: colors.offline }));
      dot.position.set(.55, size * .95, 0); group.add(dot);
      const label = this.label("", "map-agent-label", size + .45, group);
      const gem = document.createElement("span"); gem.className = "agent-gem"; gem.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.className = "agent-name"; name.textContent = def.name;
      const signal = document.createElement("span"); signal.className = "agent-icon"; signal.setAttribute("aria-hidden", "true");
      const action = document.createElement("span"); action.className = "agent-action";
      label.append(gem, name, signal, action);
      label.setAttribute("role", "button"); label.tabIndex = 0;
      const select = () => { runtime.selectedAgent = a.id; runtime.selectedBuilding = null; bus.emit({ type: "changed" }); };
      label.addEventListener("click", select);
      label.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
      this.actors.set(a.id, { group, body, light: dot, ring, label, signal, action }); this.scene.add(group);
    }
    const standby = new THREE.Group(); standby.position.set(STANDBY_CENTER.x, .2, STANDBY_CENTER.y - 5);
    this.standbyLabel = this.label("Standby", "standby-label", .5, standby); this.scene.add(standby);
    this.parking = standbySpots(runtime.grid, runtime.agents.length);
    // Zeref is the human commander at the table.
    this.mesh(new THREE.CapsuleGeometry(.22, .4, 5, 12), 0xc69c51, 0, .65, 0, this.player);
    this.mesh(new THREE.SphereGeometry(.28, 18, 12), 0xe6c48c, 0, 1.2, 0, this.player);
    this.box(.38, .15, .15, 0x162e38, 0, 1.24, .22, this.player);
    this.glowRing(.5, 0xf0cd85, .2, this.player);
    this.label("ZEREF", "map-player-label", 1.7, this.player);
    this.scene.add(this.player);
  }
  private tile(event: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, point)) return null;
    return { x: Math.floor(point.x), y: Math.floor(point.z) };
  }
  private bind() {
    const canvas = this.renderer.domElement;
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", e => {
      this.cameraNavigated = true; this.fittedView = false;
      this.clickGesture.down(e.pointerId, e.clientX, e.clientY, e.button);
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("wheel", () => { this.cameraNavigated = true; this.fittedView = false; }, { passive: true });
    canvas.addEventListener("pointermove", e => { this.clickGesture.move(e.pointerId, e.clientX, e.clientY); this.ghostTile = this.tile(e); });
    canvas.addEventListener("pointercancel", e => { this.clickGesture.cancel(e.pointerId); canvas.style.cursor = "grab"; });
    canvas.addEventListener("pointerleave", () => { this.ghostTile = null; });
    canvas.addEventListener("pointerup", e => {
      canvas.style.cursor = "grab";
      const click = this.clickGesture.up(e.pointerId, e.clientX, e.clientY, e.button);
      if (this.walk.active) return;
      if (!click) return;
      const t = this.tile(e); if (!t) return;
      if (runtime.mode === "build" && runtime.ghostHub) { tryPlace(runtime.ghostHub, t.x, t.y); return; }
      if (runtime.mode === "move" && runtime.lifting) { finishMove(t.x, t.y); return; }
      const hits = this.ray.intersectObjects([...this.stations.values(), ...[...this.actors.values()].filter(a => a.group.visible).map(a => a.group)], true);
      let hit: THREE.Object3D | null = hits[0]?.object ?? null;
      while (hit && !hit.userData.uid && !hit.userData.agentId) hit = hit.parent;
      const b = hit?.userData.uid ? runtime.buildings.find(b => b.uid === hit!.userData.uid) : buildingAt(t.x, t.y);
      if (runtime.mode === "move" && b) { beginMove(b.uid); return; }
      if (runtime.mode === "demolish" && b) { if (confirm(b.project ? "Remove this building from the map? Repository and files will NOT be deleted." : "Dismantle this station?")) demolish(b.uid); return; }
      if (hit?.userData.agentId) { runtime.selectedAgent = hit.userData.agentId; runtime.selectedBuilding = null; }
      else if (b) {
        if (runtime.selectedAgent) assignAgent(runtime.selectedAgent, b.uid);
        else { runtime.selectedBuilding = b.uid; runtime.selectedAgent = null; }
      } else { walkPlayerTo(t.x, t.y); }
      bus.emit({ type: "changed" });
    });
    window.addEventListener("keydown", e => {
      if (this.walk.active || typing()) return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { this.keys.add(key); e.preventDefault(); }
      if (key === "f" || key === "home") { this.resetCamera(); e.preventDefault(); }
      if (key === "escape") { if (runtime.lifting) cancelMove(); runtime.mode = "play"; runtime.ghostHub = null; }
      if (key === "b") runtime.mode = "build";
      if (key === "m") runtime.mode = "move";
      if (key === "x") runtime.mode = "demolish";
      if (["escape", "b", "m", "x"].includes(key)) bus.emit({ type: "changed" });
    });
    window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => { this.keys.clear(); this.clickGesture.cancel(); canvas.style.cursor = "grab"; });
    window.addEventListener("area67-camera", e => {
      if (this.walk.active) this.setView(false);
      const action = (e as CustomEvent<string>).detail;
      this.cameraNavigated = true;
      if (action === "home" || action === "isometric") this.resetCamera();
      else if (action === "fit") this.fitCampus();
      else if (action === "top") {
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, 90, .1));
        this.camera.lookAt(this.controls.target); this.controls.update(); this.fitCampus();
      } else if (action === "in" || action === "out") {
        this.fittedView = false;
        this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === "in" ? 1.25 : 1 / 1.25), this.controls.minZoom, this.controls.maxZoom);
      }
      this.camera.updateProjectionMatrix();
    });
    window.addEventListener("area67-district", e => {
      if (this.walk.active) this.setView(false);
      const id = (e as CustomEvent<string>).detail;
      this.cameraNavigated = true;
      if (id === "standby") {
        this.resetCamera(); this.focus(STANDBY_CENTER.x, STANDBY_CENTER.y); this.camera.zoom = .8;
      } else if (id === "overview") {
        this.resetCamera();
      } else {
        const d = DISTRICTS.find(d => d.id === id); if (!d) return;
        this.resetCamera(); this.focus(d.x, d.y); this.camera.zoom = .7;
      }
      this.camera.updateProjectionMatrix();
    });
    window.addEventListener("area67-view", e => this.setView((e as CustomEvent<string>).detail === "walk"));
    window.addEventListener("area67-focus-building", e => {
      const b = runtime.buildings.find(b => b.uid === (e as CustomEvent<string>).detail); if (!b) return;
      if (this.walk.active) this.setView(false);
      const h = hubById(b.hubId);
      this.focus(b.tx + h.w / 2, b.ty + h.h / 2); this.camera.zoom = 1.7; this.camera.updateProjectionMatrix();
      runtime.selectedAgent = null; runtime.selectedBuilding = b.uid; bus.emit({ type: "changed" });
    });
  }
  private setView(walk: boolean) {
    if (walk === this.walk.active) return;
    if (walk) {
      if (runtime.lifting) { bus.emit({ type: "toast", text: "Cancel the building move before entering first person.", tone: "warn" }); return; }
      if (!this.walk.enter(runtime.player.tx + .5, runtime.player.ty + .5)) { bus.emit({ type: "toast", text: "No safe walking spot nearby.", tone: "warn" }); return; }
      runtime.player.path = []; runtime.mode = "play"; runtime.ghostHub = null;
    } else this.walk.exit();
    this.keys.clear(); this.controls.enabled = !walk; this.player.visible = !walk;
    window.dispatchEvent(new CustomEvent("area67-view-change", { detail: walk ? "walk" : "overview" }));
  }
  private inspectWalkTarget() {
    if (!this.walk.active || !this.walkTarget || !runtime.buildings.some(b => b.uid === this.walkTarget)) return;
    runtime.selectedAgent = null; runtime.selectedBuilding = this.walkTarget;
    bus.emit({ type: "changed" });
  }
  private updateWalkTarget() {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.walk.camera);
    const hits = this.ray.intersectObjects([...this.stations.values()], true);
    let hit: THREE.Object3D | null = hits.find(h => h.distance < 7)?.object ?? null;
    while (hit && !hit.userData.uid) hit = hit.parent;
    this.walkTarget = hit?.userData.uid ?? null;
    const b = runtime.buildings.find(b => b.uid === this.walkTarget);
    this.walk.setTarget(b ? buildingName(b) : undefined);
  }
  private resetCamera() {
    this.camera.position.set(cx + 25, 30, cz + 25);
    this.controls.target.set(cx, 0, cz);
    this.camera.lookAt(cx, 0, cz); this.controls.update(); this.fitCampus();
  }
  private fitCampus() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const padding = { left: 36, right: 36, top: 90, bottom: rect.width < 760 ? 150 : 110 };
    // Fit around open edge panels; do not assume the whole browser is usable map.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".crew-panel, #operations-panel, #chat-panel, .district-nav[open]"))) {
      if (el.hidden || !el.getClientRects().length) continue;
      const p = el.getBoundingClientRect();
      if (p.right <= rect.left || p.left >= rect.right || p.bottom <= rect.top || p.top >= rect.bottom) continue;
      if (p.width < rect.width * .6) {
        if (p.left < rect.left + rect.width * .25) padding.left = Math.max(padding.left, p.right - rect.left + 20);
        else if (p.right > rect.right - rect.width * .25) padding.right = Math.max(padding.right, rect.right - p.left + 20);
      } else padding.bottom = Math.max(padding.bottom, Math.min(rect.height * .6, rect.bottom - p.top + 20));
    }
    const fit = fitCampusCamera(runtime.buildings.map(b => {
      const h = hubById(b.hubId); return { x: b.tx, z: b.ty, width: h.w, depth: h.h };
    }), { width: rect.width, height: rect.height, ...padding }, this.camera.position.clone().sub(this.controls.target));
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(fit.target);
    this.camera.position.copy(fit.target).addScaledVector(direction, 100);
    this.camera.zoom = fit.zoom;
    this.controls.minZoom = fit.minZoom;
    this.camera.lookAt(fit.target); this.camera.updateProjectionMatrix(); this.controls.update();
    this.fittedView = true;
  }
  private focus(x: number, z: number) {
    this.cameraNavigated = true; this.fittedView = false;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(x, 0, z); this.camera.position.copy(this.controls.target).add(offset);
  }
  private drawGhost() {
    const id = runtime.ghostHub, t = this.ghostTile;
    this.ghost.visible = !!id && !!t && (runtime.mode === "build" || runtime.mode === "move");
    if (!this.ghost.visible || !id || !t) return;
    const h = HUBS.find(h => h.id === id); if (!h) return;
    if (this.ghost.userData.id !== id) {
      for (const c of [...this.ghost.children]) { if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); } this.ghost.remove(c); }
      const m = new THREE.Mesh(new THREE.BoxGeometry(h.w, .4, h.h), new THREE.MeshBasicMaterial({ transparent: true, opacity: .4, depthWrite: false }));
      this.ghost.add(m); this.ghost.userData.id = id;
    }
    ((this.ghost.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(placementOk(id, t.x, t.y) ? 0x75ffc4 : 0xff7369);
    this.ghost.position.set(t.x + h.w / 2, .4, t.y + h.h / 2);
  }
  private frame() {
    const now = performance.now(), dt = Math.min(now - this.previous, 100);
    this.previous = now;
    if (now - this.lastSignals > 1000) { this.updateSignals(); this.lastSignals = now; }
    if (!this.walk.active && !typing() && now - this.lastStep > 160) {
      const dx = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
      const dz = (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) - (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0);
      if (dx || dz) { walkPlayerTo(runtime.player.tx + dx, runtime.player.ty + dz); this.lastStep = now; this.focus(runtime.player.tx, runtime.player.ty); }
    }
    stepAgents(dt);
    this.player.position.lerp(new THREE.Vector3(runtime.player.tx + .5, .18, runtime.player.ty + .5), .18);
    let parkedCount = 0;
    for (const [index, a] of runtime.agents.entries()) {
      const actor = this.actors.get(a.id)!;
      const seat = seatForPal(a.id);
      const state = seat ? attention(seat.id) : "offline";
      const signal = agentSignal(radioLive, seat ? presenceBySeat.get(seat.id) : undefined, workReports.find(w => w.seat === seat?.id), a.path.length > 0);
      const parked = signal.parked;
      const spot = parked ? this.parking[index] : { x: a.tx, y: a.ty };
      actor.group.visible = !!spot;
      if (!spot) continue;
      if (parked || actor.group.userData.parked) { actor.group.position.set(spot.x + .5, .25, spot.y + .5); if (parked) parkedCount++; }
      else actor.group.position.lerp(new THREE.Vector3(spot.x + .5, .25, spot.y + .5), .16);
      actor.group.userData.parked = parked;
      actor.group.scale.setScalar(parked ? .72 : 1);
      actor.light.material.color.setHex(colors[state]);
      const active = state === "busy" || state === "attentive";
      const working = signal.animate;
      const arm = actor.body.getObjectByName("working-arm");
      if (arm) arm.rotation.x = working && !this.reduced ? -.55 + Math.sin(now * .005 + a.tx) * .25 : 0;
      actor.body.position.y = !parked && a.path.length && !this.reduced ? Math.sin(now * .012) * .025 : 0;
      if (actor.label.dataset.status !== signal.status) { actor.signal.textContent = signal.icon; actor.action.textContent = signal.label; actor.label.dataset.status = signal.status; }
      actor.label.title = signal.detail;
      actor.label.setAttribute("aria-label", (seat?.label ?? a.id) + ": " + signal.label + ". " + signal.detail);
      actor.label.hidden = parked && runtime.selectedAgent !== a.id;
      actor.label.classList.toggle("working", working);
      (actor.ring.material as THREE.MeshBasicMaterial).opacity = runtime.selectedAgent === a.id ? 1 : active ? .55 : .15;
      actor.label.classList.toggle("selected", runtime.selectedAgent === a.id);
      actor.label.dataset.attention = state;
    }
    this.standbyLabel.textContent = "Standby · " + parkedCount + " parked";
    for (const group of this.stations.values()) {
      const crystal = group.getObjectByName("core");
      if (crystal && !this.reduced) crystal.rotation.y = now * .0003;
      const beacon = group.getObjectByName("work-beacon")!;
      const scale = !this.reduced && group.userData.working ? 1 + Math.sin(now * .003) * .09 : 1;
      beacon.scale.set(scale, scale, 1);
    }
    this.drawGhost();
    if (this.walk.active) { this.walk.update(dt); this.updateWalkTarget(); this.ghost.visible = false; }
    else this.controls.update();
    const target = this.controls.target;
    // Camera breathing room is independent of saved-grid/build limits. Edge plots
    // must be movable into the center of the screen without hitting a camera wall,
    // and now that real ground exists past the build limit the leash reaches it —
    // a wall 24 units out made a large world feel like a box.
    const roam = 90;
    if (target.x < -roam || target.x > MAP_W + roam || target.z < -roam || target.z > MAP_H + roam) this.focus(THREE.MathUtils.clamp(target.x, -roam, MAP_W + roam), THREE.MathUtils.clamp(target.z, -roam, MAP_H + roam));
    const view = this.walk.active ? this.walk.camera : this.camera;
    if (!this.walk.active) this.layoutLabels();
    this.renderPass.camera = view;
    this.composer.render();
    this.labels.render(this.scene, view);
  }
}
