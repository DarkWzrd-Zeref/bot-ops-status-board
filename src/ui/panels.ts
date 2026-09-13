import type { Mode } from "../core/types.ts";

/** One cancellation path for touch Close, Cancel and keyboard Escape. */
export function dismissInteraction(state: {
  mode: Mode; lifting: unknown; ghostHub: string | null; ghostProject: unknown;
  selectedAgent: string | null; selectedBuilding: string | null;
}, restoreLift: () => void): void {
  if (state.lifting) restoreLift();
  state.mode = "play";
  state.ghostHub = null;
  state.ghostProject = null;
  state.selectedAgent = null;
  state.selectedBuilding = null;
}

export function buildPanelKind(mode: Mode): "catalog" | "move" | "tools" {
  return mode === "build" ? "catalog" : mode === "move" ? "move" : "tools";
}
