import Phaser from "phaser";
import { TILE, type TileKind } from "../core/grid.ts";
import { palboxCenter } from "../build/palworld.ts";
import {
  AGENTS,
  BASE_RADIUS,
  HUBS,
  MAP_H,
  MAP_W,
  assignAgent,
  beginMove,
  buildingAt,
  buildingName,
  cancelMove,
  demolish,
  finishMove,
  hubById,
  placementOk,
  runtime,
  stepAgents,
  tryPlace,
  walkPlayerTo,
} from "../core/runtime.ts";
import { bus } from "../core/events.ts";
import type { GameEvent } from "../core/types.ts";
import { attention, liveWork } from "../core/live.ts";
import { seatForPal } from "../../shared/protocol.ts";
import { DISTRICTS } from "../../shared/map.ts";
import { pickStationTexture, seatStationImage, stationTextureKeys } from "./stationArt.ts";

function typingInHud(): boolean {
  const el = document.activeElement;
  return !!el?.closest("input, textarea, select, dialog");
}

const TILE_KEY: Record<TileKind, string> = {
  sand: "tile-sand",
  sand2: "tile-sand2",
  path: "tile-path",
  pad: "tile-pad",
  plaza: "tile-plaza",
  water: "tile-water",
  fence: "tile-fence",
};

export class HubScene extends Phaser.Scene {
  private agentSprites = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private ghosts: Phaser.GameObjects.Image[] = [];
  private player!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private stepCool = 0;
  private bSprites = new Map<string, Phaser.GameObjects.Image>();
  private ring!: Phaser.GameObjects.Graphics;
  private bubbles = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super("hub");
  }

  create(): void {
    this.drawWorld();
    this.drawRadius();
    this.drawBuildings();
    this.spawnActors();
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(0.78);
    this.cameras.main.setBackgroundColor("#0b100c");
    const district = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const camera = this.cameras.main;
      const d = DISTRICTS.find(d => d.id === id);
      if (id !== "overview" && !d) return;
      camera.stopFollow();
      camera.setZoom(id === "overview" ? Math.min(camera.width / (MAP_W * TILE), camera.height / (MAP_H * TILE)) * .95 : .65);
      camera.centerOn((d?.x ?? MAP_W / 2) * TILE, (d?.y ?? MAP_H / 2) * TILE);
    };
    const cameraAction = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === "home") { this.cameras.main.startFollow(this.player, true, .12, .12); this.cameras.main.setZoom(.65); }
      else this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * (action === "in" ? 1.2 : 1 / 1.2), .1, 2.2));
    };
    window.addEventListener("area67-district", district);
    window.addEventListener("area67-camera", cameraAction);
    this.events.once("shutdown", () => { window.removeEventListener("area67-district", district); window.removeEventListener("area67-camera", cameraAction); });

    const kb = this.input.keyboard!;
    this.cursors = kb.addKeys(
      {
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      },
      false,
    ) as Phaser.Types.Input.Keyboard.CursorKeys;
    this.wasd = {
      W: kb.addKey("W", false),
      A: kb.addKey("A", false),
      S: kb.addKey("S", false),
      D: kb.addKey("D", false),
    };
    kb.disableGlobalCapture();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.event && (p.event.target as HTMLElement | null)?.closest?.("#hud")) return;
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      const tx = Math.floor(world.x / TILE);
      const ty = Math.floor(world.y / TILE);
      this.handleClick(tx, ty);
    });

    this.input.on("wheel", (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.1, 2.2);
      this.cameras.main.setZoom(z);
    });

    this.input.keyboard!.on("keydown-ESC", () => {
      if (typingInHud()) return;
      if (runtime.lifting) cancelMove();
      runtime.mode = "play";
      runtime.ghostHub = null;
      bus.emit({ type: "changed" });
    });
    this.input.keyboard!.on("keydown-B", () => {
      if (typingInHud()) return;
      runtime.mode = runtime.mode === "build" ? "play" : "build";
      if (runtime.lifting) cancelMove();
      bus.emit({ type: "changed" });
    });
    this.input.keyboard!.on("keydown-X", () => {
      if (typingInHud()) return;
      runtime.mode = runtime.mode === "demolish" ? "play" : "demolish";
      if (runtime.lifting) cancelMove();
      bus.emit({ type: "changed" });
    });
    this.input.keyboard!.on("keydown-M", () => {
      if (typingInHud()) return;
      runtime.mode = runtime.mode === "move" ? "play" : "move";
      if (runtime.mode !== "move" && runtime.lifting) cancelMove();
      bus.emit({ type: "changed" });
    });

    bus.on((e: GameEvent) => {
      if (e.type === "changed") this.syncBuildings();
      if (e.type === "say") this.showBubble(e.agentId, e.text);
    });

    const syncKb = () => {
      if (this.input.keyboard) this.input.keyboard.enabled = !typingInHud();
    };
    document.addEventListener("focusin", syncKb);
    document.addEventListener("focusout", syncKb);
  }

  private showBubble(agentId: string, text: string): void {
    this.bubbles.get(agentId)?.destroy();
    const spr = this.agentSprites.get(agentId);
    if (!spr) return;
    const clipped = text.length > 140 ? text.slice(0, 137) + "…" : text;
    const bubble = this.add
      .text(spr.x, spr.y - 36, clipped, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#071208",
        backgroundColor: "#d7f5b8",
        padding: { x: 6, y: 4 },
        wordWrap: { width: 180 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12);
    this.bubbles.set(agentId, bubble);
    this.time.delayedCall(9000, () => {
      bubble.destroy();
      if (this.bubbles.get(agentId) === bubble) this.bubbles.delete(agentId);
    });
  }

  private drawWorld(): void {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const kind = runtime.grid.kinds[y][x];
        this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE_KEY[kind]).setDepth(0);
        if (runtime.grid.blocked[y][x] && kind !== "water" && kind !== "fence") {
          this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, "cactus").setDepth(2);
        }
      }
    }
  }

  private drawRadius(): void {
    const c = palboxCenter(runtime.well);
    this.ring = this.add.graphics().setDepth(1);
    this.ring.lineStyle(2, 0x76b900, 0.55);
    this.ring.strokeCircle(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, BASE_RADIUS * TILE);
    this.ring.lineStyle(1, 0xbef264, 0.2);
    this.ring.strokeCircle(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, (BASE_RADIUS - 0.5) * TILE);
  }

  private drawBuildings(): void {
    for (const b of runtime.buildings) this.spawnBuilding(b.uid);
  }

  private spawnBuilding(uidStr: string): void {
    if (this.bSprites.has(uidStr)) return;
    const b = runtime.buildings.find((x) => x.uid === uidStr);
    if (!b) return;
    const hub = hubById(b.hubId);
    const keys = stationTextureKeys(b.hubId, hub.kind);
    const textureKey = pickStationTexture(this, b.hubId, hub.kind);
    const img = this.add.image(0, 0, textureKey).setDepth(3);
    seatStationImage(img, {
      textureKey,
      paintedKey: keys.painted,
      tileX: b.tx,
      tileY: b.ty,
      tilesW: hub.w,
      tilesH: hub.h,
      kind: hub.kind,
    });
    this.bSprites.set(uidStr, img);
    const label = this.add
      .text(img.x, b.ty * TILE - 4, buildingName(b), {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#b7f07a",
        backgroundColor: "#071208cc",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.labels.set("b-" + uidStr, label);
  }

  private syncBuildings(): void {
    for (const b of runtime.buildings) this.spawnBuilding(b.uid);
    for (const [id, spr] of this.bSprites) {
      const building = runtime.buildings.find(b => b.uid === id);
      if (!building) {
        spr.destroy();
        this.bSprites.delete(id);
        this.labels.get("b-" + id)?.destroy();
        this.labels.delete("b-" + id);
      } else {
        const hub = hubById(building.hubId);
        const keys = stationTextureKeys(building.hubId, hub.kind);
        const textureKey = pickStationTexture(this, building.hubId, hub.kind);
        spr.setTexture(textureKey);
        seatStationImage(spr, {
          textureKey,
          paintedKey: keys.painted,
          tileX: building.tx,
          tileY: building.ty,
          tilesW: hub.w,
          tilesH: hub.h,
          kind: hub.kind,
        });
        this.labels.get("b-" + id)?.setText(buildingName(building)).setPosition(spr.x, building.ty * TILE - 4);
      }
    }
  }

  private spawnActors(): void {
    for (const a of runtime.agents) {
      const model = AGENTS.find(d => d.id === a.id)?.model ?? "";
      const spr = this.add.image(a.tx * TILE + 16, a.ty * TILE + 10, /grok/i.test(model) ? "robot" : "alien").setDisplaySize(40, 40).setDepth(5);
      this.agentSprites.set(a.id, spr);
      const def = AGENTS.find((x) => x.id === a.id);
      const t = this.add
        .text(spr.x, spr.y - 18, def?.name ?? a.id, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#b7f07a",
          stroke: "#031405",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(7);
      this.labels.set(a.id, t);
    }
    this.player = this.add.image(runtime.player.x, runtime.player.y, "chibi-player").setDepth(5);
    const pt = this.add
      .text(this.player.x, this.player.y - 18, "Zeref", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#ff9810",
        stroke: "#031405",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(7);
    this.labels.set("player", pt);
  }

  private handleClick(tx: number, ty: number): void {
    if (runtime.mode === "build" && runtime.ghostHub) {
      tryPlace(runtime.ghostHub, tx, ty);
      return;
    }
    if (runtime.mode === "move") {
      if (runtime.lifting) {
        finishMove(tx, ty);
        return;
      }
      const liftTarget = buildingAt(tx, ty);
      if (liftTarget) beginMove(liftTarget.uid);
      return;
    }
    const b = buildingAt(tx, ty);
    if (runtime.mode === "demolish" && b) {
      if (confirm(b.project ? "Remove the map building only? Repository and files will NOT be deleted." : "Dismantle this station?")) demolish(b.uid);
      return;
    }
    const agent = runtime.agents.find((a) => a.tx === tx && a.ty === ty);
    if (agent) {
      runtime.selectedAgent = agent.id;
      runtime.selectedBuilding = null;
      bus.emit({ type: "changed" });
      return;
    }
    if (b) {
      if (runtime.selectedAgent && runtime.mode === "play") {
        assignAgent(runtime.selectedAgent, b.uid);
        return;
      }
      runtime.selectedBuilding = b.uid;
      runtime.selectedAgent = null;
      bus.emit({ type: "changed" });
      return;
    }
    if (runtime.mode === "play") walkPlayerTo(tx, ty);
  }

  update(_t: number, dt: number): void {
    if (this.input.keyboard) this.input.keyboard.enabled = !typingInHud();
    this.stepCool -= dt;
    const dx = (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) + (this.cursors.left.isDown || this.wasd.A.isDown ? -1 : 0);
    const dy = (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) + (this.cursors.up.isDown || this.wasd.W.isDown ? -1 : 0);
    if ((dx || dy) && this.stepCool <= 0) {
      const nx = runtime.player.tx + dx;
      const ny = runtime.player.ty + dy;
      if (runtime.grid.walkable(nx, ny)) {
        runtime.player.path = [];
        runtime.player.tx = nx;
        runtime.player.ty = ny;
        runtime.player.x = nx * TILE + TILE / 2;
        runtime.player.y = ny * TILE + TILE / 2;
      }
      this.stepCool = 110;
    }

    stepAgents(dt);
    this.player.x = runtime.player.x;
    this.player.y = runtime.player.y;
    this.labels.get("player")?.setPosition(this.player.x, this.player.y - 18);

    for (const a of runtime.agents) {
      const spr = this.agentSprites.get(a.id);
      if (!spr) continue;
      const ax = a.tx * TILE + 16;
      const ay = a.ty * TILE + 10;
      spr.x += (ax - spr.x) * 0.25;
      spr.y += (ay - spr.y) * 0.25;
      this.labels.get(a.id)?.setPosition(spr.x, spr.y - 18);
      const seat = seatForPal(a.id);
      const active = seat && ["attentive", "busy"].includes(attention(seat.id));
      spr.setAlpha(active ? 1 : .55);
      const working = seat && liveWork().some(w => w.seat === seat.id);
      this.labels.get(a.id)?.setColor(working ? "#9fdcff" : "#c5d5da");
      this.bubbles.get(a.id)?.setPosition(spr.x, spr.y - 36);
    }

    this.drawGhost();
  }

  private drawGhost(): void {
    for (const g of this.ghosts) g.destroy();
    this.ghosts = [];
    const ghostId = runtime.ghostHub;
    if ((runtime.mode !== "build" && runtime.mode !== "move") || !ghostId) return;
    const p = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    const hub = HUBS.find((h) => h.id === ghostId);
    if (!hub) return;
    const ok = placementOk(ghostId, tx, ty);
    for (let y = 0; y < hub.h; y++) {
      for (let x = 0; x < hub.w; x++) {
        const img = this.add.image((tx + x) * TILE + TILE / 2, (ty + y) * TILE + TILE / 2, "ghost").setDepth(8);
        img.setTint(ok ? 0x86efac : 0xef4444);
        this.ghosts.push(img);
      }
    }
  }
}
