import Phaser from "phaser";
import { cookTextures } from "./textures.ts";
import { HubScene } from "./HubScene.ts";
import { HUBS } from "../core/runtime.ts";
import { hydrateStationArt, hubSpritePath, kindSpritePath } from "./stationArt.ts";

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  preload(): void {
    this.load.image("robot", "/characters/robot.png");
    this.load.image("alien", "/characters/alien.png");
    this.load.on("loaderror", () => { /* Missing hub/kind PNG keeps the painted box. */ });
    for (const hub of HUBS) {
      this.load.image("sprite-hub-" + hub.id, hubSpritePath(hub.id));
    }
    for (const kind of new Set(HUBS.map(h => h.kind))) {
      const path = kindSpritePath(kind);
      if (path) this.load.image("sprite-kind-" + kind, path);
    }
  }
  create(): void { cookTextures(this); this.scene.start("hub"); }
}

function withTimeout(task: Promise<unknown>, ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    void task.then(done, done);
  });
}

export async function makeFallback(parent: HTMLElement) {
  await withTimeout(hydrateStationArt(), 1500);
  return new Phaser.Game({ type: Phaser.CANVAS, parent, backgroundColor: "#0d0d13", pixelArt: false, roundPixels: true,
    loader: { timeout: 2500, maxParallelDownloads: 12 },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 640 }, scene: [BootScene, HubScene] });
}
