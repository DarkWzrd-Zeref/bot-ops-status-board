import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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
import { enableGlbShadows, hubGlbPath, seatGlbInFootprint } from "./stationModels.ts";

const colors = { attentive: 0x80f5b8, busy: 0x80c8ff, away: 0xe4b76a, offline: 0x536570 };
/** Heavy visual-only night look. Same campus, no new kits. */
export const NIGHT_LOOK = {
  background: 0x0b100c,
  fog: 0x0a140e,
  hemiSky: 0x8aa89a,
  hemiGround: 0x1a2218,
  key: 0xffd5a6,
  rim: 0x43b7d5,
} as const;
const cx = CORE_X, cz = CORE_Y;
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
  private down = { x: 0, y: 0 };
  private previous = performance.now();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastSignals = 0;
  private parking: Array<{ x: number; y: number }> = [];
  private standbyLabel!: HTMLElement;
  private walk: WalkView;
  private walkTarget: string | null = null;
  private gltf = new GLTFLoader();

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    parent.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D AREA 67 base. Use crew and station controls for keyboard access.");
    this.labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    parent.append(this.labels.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enableRotate = true;
    this.controls.minPolarAngle = .45;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minZoom = .12;
    this.controls.maxZoom = 3;
    this.controls.mouseButtons = { LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.resetCamera();
    this.scene.background = new THREE.Color(NIGHT_LOOK.background);
    this.scene.fog = new THREE.FogExp2(NIGHT_LOOK.fog, .008);
    this.scene.add(new THREE.HemisphereLight(NIGHT_LOOK.hemiSky, NIGHT_LOOK.hemiGround, 1.35));
    const key = new THREE.DirectionalLight(NIGHT_LOOK.key, 2.85);
    key.position.set(cx - 14, 28, cz - 8); key.target.position.set(cx, 0, cz);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, far: 150 });
    key.shadow.normalBias = .04;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(NIGHT_LOOK.rim, 2.15);
    rim.position.set(cx + 20, 15, cz + 18); this.scene.add(rim);
    const wellLamp = new THREE.PointLight(NIGHT_LOOK.key, 3.2, 16, 1.8);
    wellLamp.position.set(cx, 3.1, cz);
    this.scene.add(wellLamp);
    this.createTerrain();
    this.createDistrictGrounds();
    this.syncStations();
    const comms = runtime.buildings.find(b => hubById(b.hubId).kind === "comms");
    if (comms) {
      const h = hubById(comms.hubId);
      const teal = new THREE.PointLight(NIGHT_LOOK.rim, 2.4, 14, 1.8);
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
      this.labels.setSize(w, h);
    };
    new ResizeObserver(resize).observe(parent); resize();
    this.bind();
    window.dispatchEvent(new Event("area67-3d-ready"));
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", e => { this.reduced = e.matches; });
    bus.on(e => {
      if (this.walk.active && runtime.mode !== "play") this.setView(false);
      if (e.type === "changed") this.syncStations();
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
    this.box(MAP_W + .6, .85, MAP_H + .6, 0x0d1410, 0, 0, 0, platform);
    this.box(MAP_W, .18, MAP_H, 0x1a2420, 0, .49, 0, platform);
    this.scene.add(platform);
    const tileGeo = new THREE.BoxGeometry(1, .04, 1);
    const tileMats: Record<string, THREE.MeshStandardMaterial> = {
      sand: this.material(0x1c2420, .28, .42), sand2: this.material(0x18201c, .28, .42),
      plaza: this.material(0x24302a, .32, .38), pad: this.material(0x2a3830, .35, .36),
      path: this.material(0x3a4238, .38, .34), water: this.material(0x0a1c14, .55, .18),
      fence: this.material(0x1a2218, .2, .5), blocked: this.material(0x141c18, .15, .55),
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
      tiles.forEach(([x, y], i) => batch.setMatrixAt(i, matrix.makeTranslation(x + .5, .12, y + .5)));
      batch.receiveShadow = true; this.scene.add(batch);
    }
    // Clip the build-limit arc to the map; outer terrain remains explorable.
    const boundary: THREE.Vector3[] = [];
    for (let i = 0; i < 360; i++) {
      const point = (a: number) => new THREE.Vector3(cx + Math.cos(a) * BASE_RADIUS, .2, cz + Math.sin(a) * BASE_RADIUS);
      const a = point(i * Math.PI / 180), b = point((i + 1) * Math.PI / 180);
      if ([a, b].every(p => p.x >= 0 && p.z >= 0 && p.x <= MAP_W && p.z <= MAP_H)) boundary.push(a, b);
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(boundary), new THREE.LineBasicMaterial({ color: 0x80f5cd, transparent: true, opacity: .45 })));
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      if (i % 8 === 0) continue;
      const x = cx + Math.cos(angle) * BASE_RADIUS, z = cz + Math.sin(angle) * BASE_RADIUS;
      if (x < 0 || z < 0 || x > MAP_W || z > MAP_H) continue;
      this.box(.18, .8, .18, 0x293f47, x, .4, z, this.scene);
      const lamp = this.mesh(new THREE.SphereGeometry(.08, 8, 6), 0x80f5cd, x, .86, z, this.scene);
      (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0x80f5cd);
    }
  }
  private label(text: string, cls: string, y: number, parent: THREE.Object3D) {
    const el = document.createElement("div"); el.className = cls; el.textContent = text;
    const obj = new CSS2DObject(el); obj.position.y = y; parent.add(obj); return el;
  }
  private createDistrictGrounds() {
    const palette = [0x82dfcc, 0x94baff, 0xe7ba79, 0x8cccb7, 0xb4a3e8, 0xceadc9];
    // Flush, non-colliding navigation inlays; no saved plot or road is moved.
    DISTRICTS.forEach((d, i) => {
      const group = new THREE.Group(); group.position.set(d.x, .18, d.y);
      this.glowRing(6.6, palette[i], .01, group, .2);
      this.scene.add(group);
    });
    // Water banks gain readable elevation; pathways remain flush and walkable.
    const strips = new THREE.Group();
    for (let x = 1; x < 63; x += 2) {
      if ([27, 29, 59, 61].includes(x)) continue;
      this.box(1.4, .09, .12, 0x8ca2ae, x, .22, 45.94, strips);
      this.box(1.4, .09, .12, 0x8ca2ae, x, .22, 48.04, strips);
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
    obj.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
  /** Claude/Blender Friday drop. 404 or oversize keeps the architecture kit. */
  private async trySeatGlb(group: THREE.Group, h: ReturnType<typeof hubById>) {
    const token = {};
    group.userData.glbToken = token;
    try {
      const gltf = await this.gltf.loadAsync(hubGlbPath(h.id));
      if (group.userData.glbToken !== token || !this.stations.has(group.userData.uid)) return;
      const model = gltf.scene;
      enableGlbShadows(model);
      if (!seatGlbInFootprint(model, h.w, h.h)) return;
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
    canvas.addEventListener("pointerdown", e => { this.down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointermove", e => { this.ghostTile = this.tile(e); });
    canvas.addEventListener("pointerleave", () => { this.ghostTile = null; });
    canvas.addEventListener("pointerup", e => {
      if (this.walk.active) return;
      if (e.button !== 0 || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) return;
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
      if (key === "escape") { if (runtime.lifting) cancelMove(); runtime.mode = "play"; runtime.ghostHub = null; }
      if (key === "b") runtime.mode = "build";
      if (key === "m") runtime.mode = "move";
      if (key === "x") runtime.mode = "demolish";
      if (["escape", "b", "m", "x"].includes(key)) bus.emit({ type: "changed" });
    });
    window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("area67-camera", e => {
      if (this.walk.active) this.setView(false);
      const action = (e as CustomEvent<string>).detail;
      if (action === "home") this.resetCamera();
      else this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === "in" ? 1.2 : 1 / 1.2), .12, 3);
      this.camera.updateProjectionMatrix();
    });
    window.addEventListener("area67-district", e => {
      if (this.walk.active) this.setView(false);
      const id = (e as CustomEvent<string>).detail;
      if (id === "standby") {
        this.resetCamera(); this.focus(STANDBY_CENTER.x, STANDBY_CENTER.y); this.camera.zoom = .8;
      } else if (id === "overview") {
        this.resetCamera(); this.focus(MAP_W / 2, MAP_H / 2);
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3(100, 120, 100));
        const aspect = (this.camera.right - this.camera.left) / (this.camera.top - this.camera.bottom);
        this.camera.zoom = Math.max(.12, Math.min(.28, 34 * aspect / ((MAP_W + MAP_H) * .8)));
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
      this.focus(b.tx, b.ty); this.camera.zoom = .95; this.camera.updateProjectionMatrix();
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
    this.camera.zoom = .65; this.camera.lookAt(cx, 0, cz); this.camera.updateProjectionMatrix();
  }
  private focus(x: number, z: number) {
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
    if (target.x < 0 || target.x > MAP_W || target.z < 0 || target.z > MAP_H) this.focus(THREE.MathUtils.clamp(target.x, 0, MAP_W), THREE.MathUtils.clamp(target.z, 0, MAP_H));
    const view = this.walk.active ? this.walk.camera : this.camera;
    if (!this.walk.active) this.layoutLabels();
    this.renderer.render(this.scene, view); this.labels.render(this.scene, view);
  }
}
