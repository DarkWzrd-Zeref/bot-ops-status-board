import Phaser from "phaser";
import { cookTextures } from "./textures.ts";
import { HubScene } from "./HubScene.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }
  create(): void {
    cookTextures(this);
    this.scene.start("hub");
  }
}

export function makeGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#1a3a22",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 640,
    },
    scene: [BootScene, HubScene],
  });
}
