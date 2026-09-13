import { ATTENTIVE_MS, effectiveAttention, type Presence } from "../../shared/protocol.ts";
import { type WorkReport } from "../../shared/workspace.ts";
import { MAP_H, MAP_W } from "../../shared/map.ts";

export type AgentSignal = {
  status: "working" | "moving" | "blocked" | "done" | "idle" | "away" | "offline" | "disconnected";
  label: string; icon: string; detail: string; parked: boolean; animate: boolean;
};

/** Never turn a station assignment or a stale report into a claim of live work. */
export function agentSignal(connected: boolean, presence?: Presence, work?: WorkReport, moving = false, now = Date.now()): AgentSignal {
  if (!connected) return { status: "disconnected", label: "Unknown", icon: "?", detail: "Hub disconnected; live agent status unavailable", parked: true, animate: false };
  const attention = effectiveAttention(presence, now);
  if (attention === "offline") return { status: "offline", label: "Offline", icon: "zZ", detail: "Offline · parked in Standby; assignment retained", parked: true, animate: false };
  if (attention === "away") return { status: "away", label: "Away", icon: "Ⅱ", detail: "Away · no current attention", parked: false, animate: false };
  const fresh = work && work.sessionActive && !!presence && presence.lastSeen >= work.updatedAt && now - work.updatedAt < ATTENTIVE_MS;
  if (fresh && work.state === "blocked") return { status: "blocked", label: "Blocked", icon: "!", detail: work.taskId + ": " + work.activity, parked: false, animate: false };
  if (moving) return { status: "moving", label: "Moving", icon: "↗", detail: fresh ? "Moving · " + work.activity : "Moving on the map; no live work claim", parked: false, animate: false };
  if (fresh && work.state === "working") return { status: "working", label: "Working", icon: "⚒", detail: work.taskId + ": " + work.activity, parked: false, animate: true };
  if (fresh && work.state === "done") return { status: "done", label: "Done", icon: "✓", detail: "Reported done · " + work.activity, parked: false, animate: false };
  return { status: "idle", label: "Idle", icon: "·", detail: "Online · no fresh work report", parked: false, animate: false };
}

export const STANDBY_CENTER = { x: MAP_W - 10, y: MAP_H - 8 };

/** Display-only slots outside the build radius. No saved world/assignment mutation. */
export function standbySpots(grid: { walkable(x: number, y: number): boolean }, count: number): Array<{ x: number; y: number }> {
  const spots: Array<{ x: number; y: number }> = [];
  for (let y = MAP_H - 12; y < MAP_H - 2; y += 2) {
    for (let x = MAP_W - 14; x < MAP_W - 2; x += 2) {
      if (grid.walkable(x, y)) spots.push({ x, y });
      if (spots.length >= count) return spots;
    }
  }
  return spots;
}
