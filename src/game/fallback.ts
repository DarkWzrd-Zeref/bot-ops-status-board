import Phaser from "phaser";
import { cookTextures } from "./textures.ts";
import { HubScene } from "./HubScene.ts";
import { HUBS } from "../core/runtime.ts";
import { hubSpritePath, kindSpritePath } from "./stationArt.ts";

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  preload(): void {
    this.load.image("robot", "/characters/robot.png");
    this.load.image("alien", "/characters/alien.png");
    this.load.on("loaderror", () => { /* Claude has not committed the PNG yet; painted boxes stay. */ });
    for (const kind of new Set(HUBS.map(h => h.kind))) this.load.image("sprite-kind-" + kind, kindSpritePath(kind));
    for (const h of HUBS) this.load.image("sprite-hub-" + h.id, hubSpritePath(h.id));
  }
  create(): void { cookTextures(this); this.scene.start("hub"); }
}
export function makeFallback(parent: HTMLElement) {
  return new Phaser.Game({ type: Phaser.CANVAS, parent, backgroundColor: "#0b100c", pixelArt: false, roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 640 }, scene: [BootScene, HubScene] });
}
