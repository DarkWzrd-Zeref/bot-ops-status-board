import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

interface StationShape { id: string; kind: string; w: number; h: number; color: string }
const shell = 0x263b50, edge = 0x678491, dark = 0x101f30, glass = 0x315e73;

/** Native 3D architectural kit. All geometry stays within the station's saved footprint. */
export function createArchitecture(h: StationShape, project = false) {
  const root = new THREE.Group();
  const ink = parseInt(h.color.slice(1), 16);
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: number, glow = false) => {
    const key = color + ":" + glow;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({
      color,
      metalness: glow ? .18 : .42,
      roughness: glow ? .26 : .48,
      emissive: glow ? color : 0,
      emissiveIntensity: glow ? .88 : 0,
    }));
    return mats.get(key)!;
  };
  const mesh = (geo: THREE.BufferGeometry, c: number, x: number, y: number, z: number, glow = false) => {
    const m = new THREE.Mesh(geo, mat(c, glow)); m.position.set(x, y, z); root.add(m); return m;
  };
  const box = (w: number, ht: number, d: number, c: number, x: number, y: number, z: number, glow = false) => mesh(new THREE.BoxGeometry(w, ht, d), c, x, y, z, glow);
  const cyl = (top: number, bottom: number, ht: number, c: number, x: number, y: number, z: number, n = 16, glow = false) => mesh(new THREE.CylinderGeometry(top, bottom, ht, n), c, x, y, z, glow);
  const ring = (r: number, tube: number, c: number, y: number, vertical = false) => {
    const m = mesh(new THREE.TorusGeometry(r, tube, 6, 24), c, 0, y, 0, true); if (!vertical) m.rotation.x = Math.PI / 2; return m;
  };
  const beam = (a: THREE.Vector3, b: THREE.Vector3, c = edge, radius = .04) => {
    const m = mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6), c, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m;
  };
  const door = (z: number) => {
    box(.45, .78, .045, dark, 0, .64, z);
    box(.025, .64, .06, ink, -.23, .65, z + .025, true); box(.025, .64, .06, ink, .23, .65, z + .025, true);
    box(.5, .025, .06, ink, 0, 1, z + .025, true);
  };
  // Work in a common three-metre kit, then fit x/z without stretching height.
  cyl(1.48, 1.55, .18, dark, 0, .09, 0, 8);
  cyl(1.43, 1.47, .08, edge, 0, .22, 0, 8);
  const id = h.id;
  if (project || h.kind === "code" || id === "cursor" || id === "github") {
    // Twin-wing fabrication hangar with a central glazed atrium and exposed roof trusses.
    for (const side of [-1, 1]) {
      box(.68, 1.35, 2.2, shell, side * .96, .95, 0);
      const roof = box(.9, .12, 2.32, edge, side * .92, 1.68, 0); roof.rotation.z = side * .22;
      for (let i = 0; i < 4; i++) box(.035, .35, .3, glass, side * 1.315, 1.14, -.72 + i * .48, true);
      for (let i = 0; i < 5; i++) box(.55, .05, .05, ink, side * .96, 1.05 + i * .1, 1.12, i === 4);
    }
    box(1.12, 1.42, 1.86, glass, 0, .98, 0);
    for (const z of [-1, -.3, .4, 1.05]) {
      beam(new THREE.Vector3(-.6, 1.66, z), new THREE.Vector3(0, 2.2, z));
      beam(new THREE.Vector3(.6, 1.66, z), new THREE.Vector3(0, 2.2, z));
    }
    box(.12, .1, 2.2, ink, 0, 2.2, 0, true); door(.96);
    box(.4, .08, .6, edge, 1, 1.85, -.6);
    cyl(.03, .045, .7, edge, 1, 2.25, -.6, 6);
  } else if (id === "well" || id === "skill-altar") {
    const altar = id === "skill-altar";
    cyl(1.08, 1.28, .3, shell, 0, .45, 0, 8);
    cyl(.6, .92, .45, edge, 0, .82, 0, 8);
    cyl(.74, .65, .14, dark, 0, 1.12, 0, 12);
    const crystal = mesh(new THREE.OctahedronGeometry(altar ? .46 : .62), ink, 0, 1.9, 0, true); crystal.name = "core";
    ring(.9, .035, ink, 1.45); ring(.58, .025, ink, 2.56);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + .7, x = Math.cos(a), z = Math.sin(a);
      cyl(.08, .17, .9, edge, x, .82, z, 6); cyl(.085, .085, .12, ink, x, 1.3, z, 6, true);
    }
  } else if (id === "war-table") {
    // Open command pavilion, with a floating tactical lattice over the table.
    cyl(.82, 1, .6, shell, 0, .64, 0, 8); cyl(1.1, 1.05, .13, edge, 0, 1, 0, 12);
    cyl(.96, .96, .035, dark, 0, 1.09, 0, 12); ring(.86, .025, ink, 1.13);
    for (const x of [-1.12, 1.12]) for (const z of [-.95, .95]) {
      cyl(.055, .09, 2.45, edge, x, 1.5, z, 6);
      box(.34, .3, .38, shell, x, .48, z);
    }
    ring(1.38, .07, ink, 2.65);
    for (let i = 0; i < 3; i++) { const m = mesh(new THREE.OctahedronGeometry(.12), ink, (i - 1) * .44, 1.42 + i * .15, 0, true); m.rotation.y = i; }
  } else if (id === "vision-board") {
    // Curved presentation wall, a stage and slim light fins.
    box(2.4, .16, 1.7, shell, 0, .34, .1);
    for (let i = -2; i <= 2; i++) {
      const a = i * .2, x = Math.sin(a) * 2.5, z = -.68 + (1 - Math.cos(a)) * 2.5;
      const screen = box(.51, 1.5, .1, i % 2 ? glass : ink, x, 1.5, z, true); screen.rotation.y = -a;
      box(.035, 1.9, .13, edge, x - .24, 1.45, z);
    }
    box(2.5, .07, .24, ink, 0, 2.32, -.55, true);
    cyl(.19, .28, .65, edge, 0, .72, .74, 8);
  } else if (id === "pending-work" || id === "skill-rack") {
    // Archive capsules sit under a pitched shelter, visibly distinct from the civic buildings.
    for (const x of [-1.15, 1.15]) box(.1, 1.9, 1.8, edge, x, 1.17, 0);
    for (let row = 0; row < 3; row++) {
      box(2.4, .08, 1.75, shell, 0, .43 + row * .52, 0);
      for (let col = -1; col <= 1; col++) {
        box(.58, .35, 1.2, glass, col * .73, .65 + row * .52, 0);
        box(.35, .06, .03, ink, col * .73, .68 + row * .52, .62, true);
      }
    }
    const roof = box(2.55, .12, 2, edge, 0, 2.2, 0); roof.rotation.z = -.12;
  } else if (id === "skillspector" || h.kind === "guard") {
    // Faceted scan gate, recessed energy aperture and paired control pedestals.
    const arch = ring(1.05, .18, edge, 1.4, true); arch.material = mat(edge);
    ring(.84, .035, ink, 1.4, true);
    for (const x of [-1.12, 1.12]) {
      box(.42, .85, .85, shell, x, .67, .2); box(.28, .08, .48, ink, x, 1.13, .25, true);
    }
    cyl(.65, .9, .15, dark, 0, .34, 0, 12);
  } else if (id === "bank" || id === "drive") {
    // Armored vault with a circular door and radial locking bolts.
    box(2.2, 1.55, 1.7, shell, 0, 1.05, -.1);
    const vault = cyl(.67, .67, .22, edge, 0, 1.12, .84, 12); vault.rotation.x = Math.PI / 2;
    const inner = cyl(.49, .49, .25, dark, 0, 1.12, .91, 12); inner.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(.09, .09, .08, ink, Math.cos(a) * .57, 1.12 + Math.sin(a) * .57, 1, true); }
    for (const x of [-1.15, 1.15]) box(.15, 1.7, 1.95, edge, x, 1.07, -.1);
    box(2.4, .17, 1.95, edge, 0, 1.97, -.1);
    for (let i = -1; i <= 1; i++) box(.4, .1, .8, dark, i * .65, 2.12, -.1);
  } else if (h.kind === "infra") {
    // Central reactor, ribbed cooling towers and a three-tier luminous containment ring.
    cyl(.66, .85, 1.55, shell, 0, 1.1, 0, 12);
    cyl(.51, .51, 1.4, glass, 0, 1.18, 0, 16);
    for (let level = 0; level < 3; level++) ring(.74, .055, ink, .7 + level * .6);
    cyl(.3, .7, .45, edge, 0, 2.1, 0, 12);
    for (const x of [-1.05, 1.05]) {
      cyl(.24, .34, 1.65, edge, x, 1.08, -.24, 12);
      for (let i = 0; i < 5; i++) cyl(.28, .28, .06, dark, x, .6 + i * .27, -.24, 12);
      cyl(.26, .26, .09, ink, x, 1.96, -.24, 12, true);
    }
    door(.73);
  } else if (h.kind === "research") {
    // Observatory dome with an offset telescope and glazed circular laboratory.
    cyl(1.1, 1.2, 1.05, shell, 0, .82, 0, 20);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      const w = box(.36, .42, .035, glass, Math.sin(a) * 1.11, .95, Math.cos(a) * 1.11, true); w.rotation.y = a;
    }
    mesh(new THREE.SphereGeometry(1.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), edge, 0, 1.4, 0);
    const lens = cyl(.17, .28, 1.1, dark, .3, 2.15, .4, 12); lens.rotation.x = Math.PI / 3;
    const eye = mesh(new THREE.SphereGeometry(.18, 12, 8), ink, .3, 2.43, .87, true); eye.scale.y = .5;
    door(1.17);
  } else if (h.kind === "comms" || h.kind === "media") {
    // Rounded signal house, asymmetric transmitter and open colonnade.
    cyl(1.1, 1.22, 1.1, shell, 0, .86, 0, 12);
    cyl(1.25, 1.15, .14, edge, 0, 1.49, 0, 12);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const w = box(.43, .5, .035, glass, Math.sin(a) * 1.12, .95, Math.cos(a) * 1.12, true); w.rotation.y = a;
    }
    cyl(.04, .1, 1.05, edge, -.37, 2.05, -.24, 8);
    const dish = mesh(new THREE.SphereGeometry(.67, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), ink, -.37, 2.58, -.24);
    dish.rotation.z = .55;
    beam(new THREE.Vector3(-.37, 2.58, -.24), new THREE.Vector3(-.73, 3.15, -.24), dark, .035);
    mesh(new THREE.SphereGeometry(.08, 8, 6), ink, -.73, 3.15, -.24, true);
    door(1.17);
  } else if (id === "grand-exchange") {
    // Open exchange pavilion: four vaulted market bays, no generic closed box.
    for (const x of [-.85, .85]) for (const z of [-.75, .75]) cyl(.04, .09, 1.65, edge, x, 1.12, z, 6);
    const canopy = mesh(new THREE.ConeGeometry(1.58, .65, 4), ink, 0, 2.02, 0); canopy.rotation.y = Math.PI / 4;
    box(1.9, .55, .48, shell, 0, .58, -.65);
    for (const x of [-.65, 0, .65]) box(.45, .07, .33, glass, x, .91, -.6, true);
    cyl(.05, .05, .4, edge, 0, 2.5, 0, 6); mesh(new THREE.OctahedronGeometry(.16), ink, 0, 2.8, 0, true);
  } else {
    // Logistics workshop, with layered roof fins and a recessed front console.
    cyl(.95, 1.15, 1.3, shell, 0, .95, 0, 6);
    for (let i = 0; i < 4; i++) box(2.05 - i * .2, .09, 1.6, i === 3 ? ink : edge, 0, 1.64 + i * .15, 0);
    door(1);
  }
  // Each footprint gets an obvious front threshold and two inset navigation lights.
  box(.8, .06, .23, edge, 0, .28, 1.32);
  for (const x of [-.58, .58]) box(.12, .04, .2, ink, x, .3, 1.3, true);
  root.scale.set(h.w * .29, 1, h.h * .29);
  root.updateMatrixWorld(true);
  // Static architecture becomes a handful of draws per building rather than dozens.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...root.children]) {
    if (!(child instanceof THREE.Mesh) || child.name === "core") continue;
    child.updateMatrix(); const geo = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
    const key = child.material as THREE.Material; const list = batches.get(key) ?? []; list.push(geo); batches.set(key, list);
    child.geometry.dispose(); root.remove(child);
  }
  for (const [material, geometries] of batches) {
    const geo = mergeGeometries(geometries); geometries.forEach(g => g.dispose()); if (!geo) continue;
    const batch = new THREE.Mesh(geo, material); batch.castShadow = true; batch.receiveShadow = true; root.add(batch);
  }
  return root;
}

/** Actual volumetric characters, readable from eye level as well as overhead. */
export function createCharacter(robot: boolean, heavy: boolean, color: number) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: robot ? 0x738898 : 0x779fa0, metalness: robot ? .7 : .1, roughness: .55 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x203447, metalness: .6, roughness: .5 });
  const light = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .7, roughness: .35 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x070e1b, roughness: .18 });
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
  };
  const sphere = (r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => add(new THREE.SphereGeometry(r, 12, 10), m, x, y, z, sx, sy, sz);
  for (const x of [-.14, .14]) {
    add(new THREE.CapsuleGeometry(.08, .28, 3, 8), armor, x, .35, 0);
    sphere(.11, skin, x, .16, .06, 1, .65, 1.5);
  }
  add(new THREE.CapsuleGeometry(robot ? .25 : .2, .25, 4, 12), armor, 0, .78, 0, 1, 1, .75);
  sphere(.08, light, 0, .85, .2, 1, .8, .4);
  for (const side of [-1, 1]) {
    sphere(.12, skin, side * .31, .94, 0);
    const arm = add(new THREE.CapsuleGeometry(.07, .25, 3, 8), skin, side * .34, .72, 0); arm.rotation.z = side * .15; arm.name = side === 1 ? "working-arm" : "other-arm";
    sphere(.08, armor, side * .37, .5, .02);
  }
  if (robot) {
    add(new THREE.BoxGeometry(.43, .35, .35), skin, 0, 1.3, 0);
    add(new THREE.BoxGeometry(.35, .11, .035), eye, 0, 1.32, .19);
    for (const x of [-.1, .1]) sphere(.035, light, x, 1.33, .22);
    add(new THREE.CylinderGeometry(.018, .02, .24, 6), armor, .15, 1.6, 0); sphere(.035, light, .15, 1.73, 0);
    if (heavy) { sphere(.2, armor, -.38, 1, 0); sphere(.2, armor, .38, 1, 0); g.scale.setScalar(1.2); }
  } else {
    // Enlarged cranial lobes and a visible central brain ridge; not a flat billboard.
    sphere(.34, skin, 0, 1.34, 0, 1.15, 1.18, .9);
    for (const x of [-.15, .15]) { sphere(.18, skin, x, 1.58, -.015, 1, .65, 1.2); const e = sphere(.1, eye, x * .85, 1.33, .26, .8, 1.3, .4); e.rotation.z = x > 0 ? -.35 : .35; }
    for (let i = 0; i < 3; i++) { const ridge = add(new THREE.TorusGeometry(.22 - i * .025, .012, 4, 12, Math.PI), light, 0, 1.62, -.1 + i * .1); ridge.rotation.x = -.35; }
    sphere(.08, skin, 0, 1.08, .08, 1, .75, .9);
  }
  return g;
}
