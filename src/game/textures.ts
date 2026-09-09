import Phaser from "phaser";
import { TILE } from "../core/grid.ts";
import { HUBS } from "../core/runtime.ts";
import { AGENTS } from "../core/runtime.ts";

function hex(n: string): number {
  return Number.parseInt(n.replace("#", ""), 16);
}

export function cookTextures(scene: Phaser.Scene): void {
  paintTile(scene, "tile-grass", 0x3f7a3a, 0x2e5c2c);
  paintTile(scene, "tile-grass2", 0x366b34, 0x2a5429);
  paintTile(scene, "tile-path", 0xc4a574, 0xa88858);
  paintTile(scene, "tile-cobble", 0x8a8680, 0x6e6a64);
  paintTile(scene, "tile-plaza", 0xb9a57a, 0x9a865e);
  paintTile(scene, "tile-water", 0x2b6cb0, 0x1e4e8c);
  paintTree(scene);
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

function paintTile(scene: Phaser.Scene, key: string, a: number, b: number): void {
  g2t(scene, key, TILE, TILE, (g) => {
    g.fillStyle(a, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(b, 1);
    g.fillRect(0, TILE - 4, TILE, 4);
    g.fillRect(TILE - 4, 0, 4, TILE);
    g.fillStyle(0x000000, 0.08);
    g.fillRect(2, 2, 3, 3);
  });
}

function paintTree(scene: Phaser.Scene): void {
  g2t(scene, "tree", TILE, TILE, (g) => {
    g.fillStyle(0x5b3a1e, 1);
    g.fillRect(13, 18, 6, 12);
    g.fillStyle(0x1f6b32, 1);
    g.fillCircle(16, 14, 11);
    g.fillStyle(0x2f8a44, 1);
    g.fillCircle(12, 12, 7);
  });
}

function paintWell(scene: Phaser.Scene): void {
  g2t(scene, "well-mark", TILE * 2, TILE * 2, (g) => {
    g.fillStyle(0x6b4f2a, 1);
    g.fillCircle(32, 36, 22);
    g.fillStyle(0x1a140c, 1);
    g.fillCircle(32, 34, 14);
    g.fillStyle(0xf4d03f, 1);
    g.fillRect(30, 8, 4, 18);
    g.fillStyle(0x76b900, 1);
    g.fillCircle(32, 8, 5);
  });
}

function paintBuilding(scene: Phaser.Scene, id: string, tw: number, th: number, body: number, roof: number): void {
  const w = tw * TILE;
  const h = th * TILE;
  g2t(scene, "b-" + id, w, h, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillRect(4, 8, w - 4, h - 6);
    g.fillStyle(body, 1);
    g.fillRect(2, 10, w - 8, h - 12);
    g.fillStyle(roof, 1);
    g.fillTriangle(0, 14, w / 2, 0, w - 4, 14);
    g.fillStyle(0x1a140c, 1);
    g.fillRect(Math.floor(w / 2) - 6, h - 18, 12, 16);
    g.fillStyle(0xf0e6d2, 0.9);
    g.fillRect(8, 18, 10, 8);
    g.fillRect(w - 22, 18, 10, 8);
    if (id === "skillspector") {
      g.fillStyle(0x76b900, 1);
      g.fillCircle(w / 2, 22, 7);
      g.lineStyle(2, 0x102000, 1);
      g.strokeCircle(w / 2, 22, 7);
    }
  });
}

function paintChibi(scene: Phaser.Scene, key: string, color: number): void {
  g2t(scene, key, 24, 32, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(12, 30, 12, 4);
    g.fillStyle(color, 1);
    g.fillRect(6, 16, 12, 12);
    g.fillStyle(0xffe0bd, 1);
    g.fillCircle(12, 12, 8);
    g.fillStyle(0x1a140c, 1);
    g.fillCircle(9, 12, 1.6);
    g.fillCircle(15, 12, 1.6);
    g.fillStyle(color, 1);
    g.fillEllipse(12, 6, 14, 8);
  });
}

function paintGhost(scene: Phaser.Scene): void {
  g2t(scene, "ghost", TILE, TILE, (g) => {
    g.fillStyle(0x76b900, 0.35);
    g.fillRect(1, 1, TILE - 2, TILE - 2);
    g.lineStyle(2, 0xbef264, 1);
    g.strokeRect(1, 1, TILE - 2, TILE - 2);
  });
}
