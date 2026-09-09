/**
 * Palworld building methodology as a gameplay template (original AREA 67 skin, not Pocketpair IP).
 *
 * Palworld loop we copy as rules, not art:
 * 1. Palbox first — one core per base. Nothing places outside its radius.
 * 2. Build mode (B) — catalog item, ghost snaps to the grid, green = valid / red = blocked.
 * 3. Tabs — Production, Infrastructure, Comms, Storage, Pal, Defense.
 * 4. Workstations have pal SLOTS. Assign = Palworld "throw pal at structure" (select pal, click building).
 * 5. Work suitability — a pal's work types should match the station. Mismatch is a warning, not a hard lock.
 * 6. Move (M) — pick the structure up, ghost it, place it again.
 * 7. Dismantle (X) — plot goes back to dirt, assigned pals lose that station's grants.
 * 8. Palbox slots — max pals allowed on the base (level 1 = 15).
 */
import type { Point } from "../core/grid.ts";
import type { HubDef } from "../core/types.ts";

export const PALBOX_ID = "well";
import { BASE_RADIUS } from "../../shared/map.ts";
export { BASE_RADIUS };
export const PALBOX_SLOTS = 15;
export const PALBOX_LEVEL = 1;

export const BUILD_TABS = [
  { id: "ecosystem", label: "Ecosystem", hint: "War Table, Vision Board, Pending Work and Skill Altar" },
  { id: "projects", label: "Projects", hint: "Your repositories and workspaces as buildings" },
  { id: "production", label: "Production", hint: "Workbenches — Cursor, GitHub, Firecrawl, Apify" },
  { id: "infra", label: "Infra", hint: "Power & pipes — Railway, Neon, Cloudflare" },
  { id: "comms", label: "Comms", hint: "Radios — Discord, Mail, Slack, X, Voice" },
  { id: "storage", label: "Storage", hint: "Chests — Bank, Drive, Calendar" },
  { id: "pal", label: "Pal", hint: "Ranch — Spector Gate, Skill Rack" },
  { id: "defense", label: "Defense", hint: "Watch posts — Police / GitHub guild" },
] as const;

export type BuildTabId = (typeof BUILD_TABS)[number]["id"];

export function tabFor(hub: HubDef): BuildTabId | "core" {
  if (hub.kind === "ecosystem") return "ecosystem";
  if (hub.kind === "project") return "projects";
  if (hub.id === "github") return "defense";
  if (hub.id === "calendar" || hub.id === "drive" || hub.id === "bank" || hub.id === "grand-exchange") return "storage";
  switch (hub.kind) {
    case "code":
    case "research":
      return "production";
    case "infra":
      return "infra";
    case "comms":
    case "media":
      return "comms";
    case "ops":
      return "storage";
    case "guard":
      return "pal";
    default:
      return "core";
  }
}

export function palboxCenter(well: Point): Point {
  return { x: well.x + 1, y: well.y + 1 };
}

export function inBaseRadius(x: number, y: number, well: Point, radius = BASE_RADIUS): boolean {
  const c = palboxCenter(well);
  const dx = x - c.x;
  const dy = y - c.y;
  return Math.hypot(dx, dy) <= radius;
}

export type PlaceFail = "oob" | "blocked" | "water" | "occupied" | "radius" | "palbox";

export function placeFailMessage(fail: PlaceFail): string {
  switch (fail) {
    case "radius":
      return "Outside Palbox radius. AREA 67 rule: stations stay inside the ring.";
    case "palbox":
      return "Can't cover the Palbox. That's the core.";
    case "occupied":
      return "Plot occupied. Move or dismantle first.";
    case "water":
      return "Can't found on the moat.";
    case "blocked":
      return "Fence / terrain in the way.";
    default:
      return "Can't plant that here.";
  }
}
