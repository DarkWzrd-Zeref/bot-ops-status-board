import type Phaser from "phaser";

/** Claude's Blender silhouettes land here. Missing files keep the painted boxes. */
export function kindSpritePath(kind: string): string {
  return "/sprites/" + kind + ".png";
}
export function hubSpritePath(id: string): string {
  return "/sprites/hub-" + id + ".png";
}
export function stationTextureKeys(id: string, kind: string) {
  return { hub: "sprite-hub-" + id, kind: "sprite-kind-" + kind, painted: id === "well" ? "well-mark" : "b-" + id };
}

export function pickStationTexture(scene: Phaser.Scene, id: string, kind: string): string {
  const keys = stationTextureKeys(id, kind);
  if (hasRealTexture(scene, keys.hub)) return keys.hub;
  if (hasRealTexture(scene, keys.kind)) return keys.kind;
  return keys.painted;
}

function hasRealTexture(scene: Phaser.Scene, key: string): boolean {
  if (!scene.textures.exists(key)) return false;
  const tex = scene.textures.get(key);
  return tex.source.some((src) => src.width > 2 && src.height > 2);
}
