import Phaser from "phaser";
import { TILE } from "../core/grid.ts";
import { AGENTS, HUBS } from "../core/runtime.ts";

function hex(n: string): number {
  return Number.parseInt(n.replace("#", ""), 16);
}

/** Slice 1 paint: night classified ground. Same texture keys. No data change. */
export function cookTextures(scene: Phaser.Scene): void {
  paintTile(scene, "tile-sand", 0x2a3238, 0x1c2228, 0x3a4650);
  paintTile(scene, "tile-sand2", 0x243038, 0x182028, 0x334048);
  paintTile(scene, "tile-path", 0x4a5560, 0x323840, 0x6a7884);
  paintTile(scene, "tile-pad", 0x3d4a52, 0x2a343c, 0x5a6a74);
  paintTile(scene, "tile-plaza", 0x2c3840, 0x1e282e, 0x4a5a64);
  paintTile(scene, "tile-water", 0x0c2430, 0x061820, 0x1a4a58);
  paintFence(scene);
  paintCactus(scene);
  paintWell(scene);

  for (const hub of HUBS) {
    paintBuilding(scene, hub.id, hub.w, hub.h, hex(hub.color), hex(hub.roof));
  }
  for (const a of AGENTS) {
    paintChibi(scene, "chibi-" + a.id, hex(a.color));
  }
  paintChibi(scene, "chibi-player", 0xf4d03f);
  paintGhost(scene);
}

function g2t(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  const g = scene.add.graphics();
  g.setVisible(false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function paintTile(scene: Phaser.Scene, key: string, a: number, b: number, grit: number): void {
  g2t(scene, key, TILE, TILE, (g) => {
    g.fillStyle(a, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(b, 1);
    g.fillRect(0, TILE - 3, TILE, 3);
    g.fillRect(TILE - 3, 0, 3, TILE);
    g.fillStyle(grit, 0.22);
    g.fillRect(1, 1, TILE - 5, 1);
    g.fillRect(1, 1, 1, TILE - 5);
    g.fillStyle(0x76b900, 0.1);
    g.fillRect(5, 7, 2, 2);
    g.fillRect(19, 15, 2, 2);
    g.fillStyle(0xc9a15b, 0.12);
    g.fillRect(11, 4, 2, 1);
    g.fillRect(22, 22, 2, 1);
  });
}

function paintFence(scene: Phaser.Scene): void {
  g2t(scene, "tile-fence", TILE, TILE, (g) => {
    g.fillStyle(0x141c22, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x3a4650, 1);
    g.fillRect(14, 4, 4, 24);
    g.fillStyle(0x76b900, 0.75);
    g.fillRect(2, 10, 28, 2);
    g.fillRect(2, 18, 28, 2);
  });
}

function paintCactus(scene: Phaser.Scene): void {
  g2t(scene, "cactus", TILE, TILE, (g) => {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(16, 28, 10, 4);
    g.fillStyle(0x2f5a3a, 1);
    g.fillRect(13, 10, 6, 18);
    g.fillRect(8, 14, 6, 4);
    g.fillRect(18, 16, 6, 4);
    g.fillStyle(0x76b900, 0.5);
    g.fillRect(14, 8, 4, 3);
  });
}

function paintWell(scene: Phaser.Scene): void {
  g2t(scene, "well-mark", TILE * 2, TILE * 2, (g) => {
    g.fillStyle(0x141c22, 1);
    g.fillCircle(32, 40, 24);
    g.fillStyle(0x0a1014, 1);
    g.fillCircle(32, 36, 16);
    g.fillStyle(0x76b900, 0.9);
    g.fillRect(30, 4, 4, 28);
    g.fillCircle(32, 8, 7);
    g.fillStyle(0xbef264, 1);
    g.fillCircle(32, 8, 3);
    g.fillStyle(0xc9a15b, 0.35);
    g.fillCircle(32, 40, 20);
  });
}

function paintBuilding(scene: Phaser.Scene, id: string, tw: number, th: number, body: number, roof: number): void {
  const w = tw * TILE;
  const h = th * TILE;
  g2t(scene, "b-" + id, w, h, (g) => {
    g.fillStyle(0x000000, 0.45);
    g.fillRect(5, 10, w - 6, h - 8);
    g.fillStyle(roof, 1);
    g.fillRect(0, 6, w - 2, 10);
    g.fillStyle(body, 1);
    g.fillRect(2, 14, w - 8, h - 16);
    g.fillStyle(0x071018, 1);
    g.fillRect(Math.floor(w / 2) - 7, h - 16, 14, 14);
    g.fillStyle(0x76b900, 0.85);
    g.fillRect(8, 20, 8, 6);
    g.fillRect(w - 20, 20, 8, 6);
    g.fillStyle(0xbef264, 1);
    g.fillRect(w - 10, 8, 4, 4);
    g.fillStyle(0xc9a15b, 0.35);
    g.fillRect(2, 14, w - 8, 2);
    if (id === "skillspector") {
      g.fillStyle(0x76b900, 1);
      g.fillCircle(w / 2, 22, 7);
    }
  });
}

function paintChibi(scene: Phaser.Scene, key: string, color: number): void {
  g2t(scene, key, 24, 32, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(12, 30, 12, 4);
    g.fillStyle(color, 1);
    g.fillRect(6, 16, 12, 12);
    g.fillStyle(0xe8f5c8, 1);
    g.fillCircle(12, 12, 8);
    g.fillStyle(0x071208, 1);
    g.fillCircle(9, 12, 1.6);
    g.fillCircle(15, 12, 1.6);
    g.fillStyle(color, 1);
    g.fillEllipse(12, 6, 14, 8);
    g.fillStyle(0x76b900, 0.9);
    g.fillRect(8, 22, 8, 2);
  });
}

function paintGhost(scene: Phaser.Scene): void {
  g2t(scene, "ghost", TILE, TILE, (g) => {
    g.fillStyle(0x76b900, 0.32);
    g.fillRect(1, 1, TILE - 2, TILE - 2);
    g.lineStyle(2, 0xbef264, 1);
    g.strokeRect(1, 1, TILE - 2, TILE - 2);
  });
}
