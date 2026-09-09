import Phaser from "phaser";
import { cookTextures } from "./textures.ts";
import { HubScene } from "./HubScene.ts";

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  preload(): void { this.load.image("robot", "/characters/robot.png"); this.load.image("alien", "/characters/alien.png"); }
  create(): void { cookTextures(this); this.scene.start("hub"); }
}
export function makeFallback(parent: HTMLElement) {
  return new Phaser.Game({ type: Phaser.CANVAS, parent, backgroundColor: "#0b100c", pixelArt: false, roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 640 }, scene: [BootScene, HubScene] });
}
