import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { AGENTS, HUBS, BASE_RADIUS, MAP_W, MAP_H, assignAgent, beginMove, buildingAt, buildingName, cancelMove, demolish, finishMove, hubById, placementOk, runtime, stationMapLabel, stepAgents, tryPlace, walkPlayerTo } from "../core/runtime.ts";
import { bus } from "../core/events.ts";
import { attention, liveWork, presenceBySeat, workReports, radioLive } from "../core/live.ts";
import { agentSignal, standbySpots, STANDBY_CENTER } from "../core/agentPresentation.ts";
import { seatForPal, speakerLabel } from "../../shared/protocol.ts";
import { CORE_X, CORE_Y, DISTRICTS } from "../../shared/map.ts";

const colors = { attentive: 0x80f5b8, busy: 0x80c8ff, away: 0xe4b76a, offline: 0x536570 };
const cx = CORE_X, cz = CORE_Y;
type Actor = { group: THREE.Group; sprite: THREE.Sprite; light: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; ring: THREE.Mesh; label: HTMLElement; signal: HTMLElement; action: HTMLElement };
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

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
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
    this.scene.fog = new THREE.FogExp2(0x0c171e, .004);
    this.scene.add(new THREE.HemisphereLight(0xbde8e5, 0x182832, 2));
    const key = new THREE.DirectionalLight(0xe5fff2, 3.5);
    key.position.set(cx - 14, 28, cz - 8); key.target.position.set(cx, 0, cz);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, far: 150 });
    key.shadow.normalBias = .04;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x43b7d5, 2);
    rim.position.set(cx + 20, 15, cz + 18); this.scene.add(rim);
    this.createTerrain();
    this.syncStations();
    this.createActors();
    this.scene.add(this.ghost);
    const resize = () => {
      const w = parent.clientWidth, h = parent.clientHeight;
      if (!w || !h) return;
      const span = 17;
      this.camera.left = -span * w / h; this.camera.right = span * w / h;
      this.camera.top = span; this.camera.bottom = -span;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.labels.setSize(w, h);
    };
    new ResizeObserver(resize).observe(parent); resize();
    this.bind();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", e => { this.reduced = e.matches; });
    bus.on(e => {
      if (e.type === "changed") this.syncStations();
      if (e.type === "changed" || e.type === "presence") this.updateSignals();
      if (e.type === "focus-agent") {
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
  private material(color: number, metalness = .4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness: .6 });
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
    this.box(MAP_W + .6, .85, MAP_H + .6, 0x14252a, 0, 0, 0, platform);
    this.box(MAP_W, .18, MAP_H, 0x314b4a, 0, .49, 0, platform);
    this.scene.add(platform);
    const tileGeo = new THREE.BoxGeometry(.97, .09, .97);
    const tileMats: Record<string, THREE.MeshStandardMaterial> = {
      sand: this.material(0x304c46, .1), sand2: this.material(0x34514b, .1),
      plaza: this.material(0x415d59), pad: this.material(0x55716a),
      path: this.material(0x718b7d), water: this.material(0x123b49), fence: this.material(0x293f47),
      blocked: this.material(0x14252a),
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
  private station(uid: string) {
    const b = runtime.buildings.find(b => b.uid === uid)!;
    const h = hubById(b.hubId);
    const group = new THREE.Group(); group.position.set(b.tx + h.w / 2, .19, b.ty + h.h / 2);
    group.userData = { uid, signature: JSON.stringify([b.tx, b.ty, b.hubId, b.project]) };
    const color = parseInt(h.color.slice(1), 16);
    this.box(h.w + .2, .2, h.h + .2, 0x233a40, 0, .1, 0, group);
    if (b.project) {
      this.box(2.65, .2, 2.65, 0x3d6288, 0, .26, 0, group);
      this.box(2.25, 1.55, 1.9, 0x213b53, 0, 1.1, 0, group);
      this.box(2.55, .2, 2.2, color, 0, 1.96, 0, group);
      for (let i = -1; i <= 1; i++) {
        const screen = this.box(.45, .65, .06, 0x82c9ef, i * .65, 1.24, 1, group);
        (screen.material as THREE.MeshStandardMaterial).emissive.setHex(0x1a557e);
      }
      this.box(.18, 1.1, .18, 0x557aa1, 1, 2.5, 0, group);
      this.box(.95, .5, .1, color, .6, 2.85, 0, group);
    } else if (b.hubId === "war-table") {
      this.mesh(new THREE.CylinderGeometry(1.65, 1.8, .18, 12), 0x29435e, 0, .3, 0, group);
      this.mesh(new THREE.CylinderGeometry(.75, .95, .7, 8), 0x34516a, 0, .75, 0, group);
      this.mesh(new THREE.CylinderGeometry(1.35, 1.4, .17, 12), color, 0, 1.17, 0, group);
      this.mesh(new THREE.CylinderGeometry(1.15, 1.15, .04, 12), 0x183c56, 0, 1.28, 0, group);
      this.glowRing(1.08, color, 1.32, group);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; this.box(.42, .45, .42, 0x426882, Math.cos(a) * 1.7, .6, Math.sin(a) * 1.7, group); }
    } else if (b.hubId === "vision-board") {
      this.box(3.5, .15, 2.5, 0x433954, 0, .3, 0, group);
      this.box(.15, 2.3, .2, 0x7c6a9b, -1.3, 1.4, -.5, group);
      this.box(.15, 2.3, .2, 0x7c6a9b, 1.3, 1.4, -.5, group);
      this.box(3, 1.65, .2, 0x614785, 0, 1.9, -.5, group);
      for (let i = 0; i < 6; i++) this.box(.65, .5, .05, i % 2 ? 0xc8b5e2 : color, (i % 3 - 1) * .9, 1.56 + Math.floor(i / 3) * .72, -.37, group);
    } else if (b.hubId === "pending-work") {
      for (const x of [-1.5, 1.5]) this.box(.15, 2, 1.8, 0x765a35, x, 1.2, 0, group);
      for (let row = 0; row < 3; row++) {
        this.box(3.2, .1, 2, color, 0, .4 + row * .7, 0, group);
        for (let col = -1; col <= 1; col++) { this.box(.7, .45, 1.2, 0x526373, col, .66 + row * .7, 0, group); this.box(.42, .13, .02, color, col, .7 + row * .7, .61, group); }
      }
    } else if (b.hubId === "skill-altar") {
      this.mesh(new THREE.CylinderGeometry(1.25, 1.45, .3, 8), 0x2b594f, 0, .4, 0, group);
      this.mesh(new THREE.CylinderGeometry(.75, 1, .6, 8), 0x42746b, 0, .85, 0, group);
      this.mesh(new THREE.OctahedronGeometry(.6), color, 0, 1.8, 0, group);
      this.glowRing(.9, color, 1.25, group); this.glowRing(.65, color, 2.55, group, .4);
    } else if (b.hubId === "well") {
      this.mesh(new THREE.CylinderGeometry(.85, 1.1, .6, 12), 0x426b68, 0, .5, 0, group);
      this.mesh(new THREE.CylinderGeometry(.55, .55, .15, 32), 0x102c2c, 0, .87, 0, group);
      const crystal = this.mesh(new THREE.OctahedronGeometry(.65), 0x85ffcf, 0, 1.8, 0, group);
      (crystal.material as THREE.MeshStandardMaterial).emissive.setHex(0x258461); crystal.name = "core";
      this.glowRing(1.1, 0x80f5cd, 1.1, group); this.glowRing(.8, 0x80f5cd, 2.65, group, .25);
    } else if (h.kind === "comms" || h.kind === "media") {
      this.box(h.w * .85, 1.1, h.h * .75, 0x2c4654, 0, .75, 0, group);
      this.box(h.w * .92, .18, h.h * .82, color, 0, 1.39, 0, group);
      const mast = this.mesh(new THREE.CylinderGeometry(.06, .1, 1.7, 8), 0x9ab6bc, -.5, 2.2, 0, group);
      mast.rotation.z = -.2;
      const dish = this.mesh(new THREE.SphereGeometry(.65, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, -.6, 2.9, 0, group);
      dish.rotation.z = .65;
      this.glowRing(.4, 0x8acfff, 3.1, group, .25);
    } else if (h.kind === "infra" || b.hubId === "bank") {
      for (let i = -1; i <= 1; i++) {
        this.mesh(new THREE.CylinderGeometry(.36, .45, 1.8, 12), 0x3a5464, i * .8, 1.1, 0, group);
        this.mesh(new THREE.CylinderGeometry(.37, .37, .18, 12), color, i * .8, 2.05, 0, group);
      }
      this.box(h.w * .8, .2, .45, 0x617d83, 0, .5, h.h * .35, group);
    } else if (b.hubId === "skillspector") {
      this.box(.35, 2.4, .55, color, -.9, 1.4, 0, group);
      this.box(.35, 2.4, .55, color, .9, 1.4, 0, group);
      this.box(2.2, .4, .65, 0x547273, 0, 2.5, 0, group);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8), new THREE.MeshBasicMaterial({ color: 0x72ffd5, transparent: true, opacity: .2, side: THREE.DoubleSide }));
      field.position.y = 1.3; group.add(field);
    } else {
      this.box(h.w * .8, 1.15, h.h * .75, 0x37525a, 0, .8, 0, group);
      this.box(h.w * .9, .22, h.h * .85, color, 0, 1.52, 0, group);
      this.mesh(new THREE.CylinderGeometry(.42, .6, .65, 6), 0x8ca9aa, -.5, 1.9, 0, group);
      this.box(.6, .68, .7, 0x233d44, .65, 1.95, 0, group);
      const monitor = this.box(.44, .33, .03, 0x81f5cd, .65, 2.04, .37, group);
      (monitor.material as THREE.MeshStandardMaterial).emissive.setHex(0x285e49);
    }
    for (let x = -.6; x <= .6; x += .6) {
      const window = this.box(.23, .24, .025, 0x92e4d8, x, .85, h.h * .38 + .02, group);
      (window.material as THREE.MeshStandardMaterial).emissive.setHex(0x3d8e82);
    }
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
  private disposeGroup(group: THREE.Group) {
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
      const chipName = group.userData.chipName as HTMLElement | undefined;
      const building = runtime.buildings.find(b => b.uid === uid);
      banner.classList.toggle("working", active.length > 0);
      banner.classList.toggle("selected", runtime.selectedBuilding === uid);
      if (chipName && building) chipName.textContent = stationMapLabel(building, runtime.selectedBuilding === uid);
      signal.textContent = active.length ? active.map(w => speakerLabel(w.seat) + " · " + w.taskId).join(" + ") : assigned.length ? assigned.length + " assigned · no live work report" : "Open workspace";
      signal.title = active.map(w => speakerLabel(w.seat) + ": " + w.activity).join("\n");
      group.getObjectByName("work-beacon")!.visible = active.length > 0;
      group.userData.working = active.length > 0;
    }
  }
  private createActors() {
    const loader = new THREE.TextureLoader();
    const textures = { robot: loader.load("/characters/robot.png"), alien: loader.load("/characters/alien.png") };
    Object.values(textures).forEach(t => { t.colorSpace = THREE.SRGBColorSpace; });
    for (const a of runtime.agents) {
      const def = AGENTS.find(d => d.id === a.id)!;
      const group = new THREE.Group(); group.position.set(a.tx + .5, .25, a.ty + .5); group.userData = { agentId: a.id };
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[/grok/i.test(def.model) ? "robot" : "alien"], transparent: true, alphaTest: .08 }));
      const size = a.id === "director" ? 1.65 : 1.45;
      sprite.scale.set(size, size, 1); sprite.position.y = size * .48;
      if (a.id === "director") sprite.material.color.setHex(0xffc088);
      if (a.id === "claude") sprite.material.color.setHex(0xffd5aa);
      if (a.id === "researcher") sprite.material.color.setHex(0xd5baff);
      group.add(sprite);
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
      this.actors.set(a.id, { group, sprite, light: dot, ring, label, signal, action }); this.scene.add(group);
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
      if (typing()) return;
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
      const action = (e as CustomEvent<string>).detail;
      if (action === "home") this.resetCamera();
      else this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === "in" ? 1.2 : 1 / 1.2), .12, 3);
      this.camera.updateProjectionMatrix();
    });
    window.addEventListener("area67-district", e => {
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
    if (!typing() && now - this.lastStep > 160) {
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
      actor.sprite.material.opacity = state === "offline" ? .53 : state === "away" ? .72 : 1;
      const active = state === "busy" || state === "attentive";
      const working = signal.animate;
      actor.sprite.position.y = actor.sprite.scale.y * .48 + (working && !this.reduced ? Math.sin(now * .009 + a.tx) * .07 : 0);
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
    this.drawGhost(); this.controls.update();
    const target = this.controls.target;
    if (target.x < 0 || target.x > MAP_W || target.z < 0 || target.z > MAP_H) this.focus(THREE.MathUtils.clamp(target.x, 0, MAP_W), THREE.MathUtils.clamp(target.z, 0, MAP_H));
    this.renderer.render(this.scene, this.camera); this.labels.render(this.scene, this.camera);
  }
}
