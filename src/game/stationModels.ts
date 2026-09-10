import * as THREE from "three";

/** Claude Friday / Blender drop. Missing file keeps the architecture kit. */
export function hubGlbPath(id: string): string {
  return "/models/stations/hub-" + id + ".glb";
}

/** Claude contract: origin at footprint centre, tile W/H plus a small lip. */
export const GLB_LIP = 0.42;

export function glbFitsFootprint(
  size: { x: number; y: number; z: number },
  tileW: number,
  tileH: number,
  lip = GLB_LIP,
): boolean {
  return Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z)
    && size.x > 0 && size.z > 0 && size.y > 0 && size.y < 12
    && size.x <= tileW + lip + 1e-3 && size.z <= tileH + lip + 1e-3;
}

/** Uniform-fit a Blender mesh onto the saved tile footprint. Returns false to keep the kit. */
export function seatGlbInFootprint(root: THREE.Object3D, tileW: number, tileH: number, lip = GLB_LIP): boolean {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || !Number.isFinite(size.z) || size.x <= 0 || size.z <= 0 || size.y <= 0) return false;
  const maxW = tileW + lip;
  const maxD = tileH + lip;
  const scale = Math.min(maxW / size.x, maxD / size.z, 1);
  if (scale < 1) root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const fittedSize = fitted.getSize(new THREE.Vector3());
  if (!glbFitsFootprint(fittedSize, tileW, tileH, lip)) return false;
  const center = fitted.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);
  root.position.y -= new THREE.Box3().setFromObject(root).min.y;
  return true;
}

export function enableGlbShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}
