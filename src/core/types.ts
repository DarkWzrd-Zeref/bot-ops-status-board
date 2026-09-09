import type { Point } from "./grid.ts";

export type Mode = "play" | "build" | "demolish";
export type AgentStatus = "idle" | "walk" | "work" | "scan" | "blocked";
export type Reco = "SAFE" | "CAUTION" | "DO_NOT_INSTALL";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface HubDef {
  id: string;
  name: string;
  short: string;
  kind: string;
  w: number;
  h: number;
  color: string;
  roof: string;
  mcp: string | null;
  placeable: boolean;
  blurb: string;
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  model: string;
  account: string;
  discordChannel: string | null;
  color: string;
  mimicOf: string | null;
  homeHub: string;
  bio: string;
}

export interface StationMod {
  work: string;
  slots: number;
  grants: string[];
  gate: string | null;
  aiChange: string;
}

export interface SkillDef {
  id: string;
  name: string;
  target: string;
  description: string;
  wantedBy: string[];
}

export interface ScanIssue {
  id: string;
  category: string;
  severity: string;
  confidence: number;
  location: { file: string; start_line: number };
}

export interface ScanReport {
  skill: { name: string; source: string; scanned_at: string };
  risk_assessment: { score: number; severity: Severity; recommendation: Reco };
  components: { path: string; type: string; lines: number; executable: boolean; size_bytes: number }[];
  issues: ScanIssue[];
  metadata: {
    has_executable_scripts: boolean;
    skillspector_version: string;
    llm_requested: boolean;
    llm_available: boolean;
    inference_usage: unknown[];
    llm_error?: string;
  };
}

export interface PlacedBuilding {
  uid: string;
  hubId: string;
  tx: number;
  ty: number;
}

export interface AgentRuntime {
  id: string;
  tx: number;
  ty: number;
  status: AgentStatus;
  detail: string;
  buildingUid: string | null;
  path: Point[];
  skills: string[];
}

export interface LogLine {
  at: number;
  text: string;
  tone: "ok" | "warn" | "bad" | "info";
}

export type GameEvent =
  | { type: "changed" }
  | { type: "log"; line: LogLine }
  | { type: "toast"; text: string; tone: LogLine["tone"] };
