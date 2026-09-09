import { z } from "zod";
import { safeLink } from "./workspace.ts";
import type { Speaker } from "./protocol.ts";
import type { TaskMemory } from "./memory.ts";

export const BOARD_KINDS = ["war-table", "vision-board", "pending-work", "bug-board"] as const;
export type BoardKind = typeof BOARD_KINDS[number];
export const BOARD_INFO = {
  "bug-board": { name: "Bug Board", purpose: "Track confirmed bugs, blockers and checks. Claim an issue before working; completed means reported fixed, not independently verified.", action: "Report issue", empty: "No open issues. Report a bug or a check that needs evidence.", color: "#ff9c94" },
  "war-table": { name: "War Table", purpose: "Discuss project advancements, evidence and decisions.", action: "Add advancement", empty: "Bring a project update to the table.", color: "#83caff" },
  "vision-board": { name: "Vision Board", purpose: "Collect the things we want to build together.", action: "Add idea", empty: "What should this ecosystem become?", color: "#d3a3ff" },
  "pending-work": { name: "Pending Work", purpose: "Park shared claimable work, and read remaining-task memories each bot saves for itself.", action: "Park work", empty: "Nothing parked. Bots also save their own remaining work with task_memory_save.", color: "#f5c16c" },
} as const;
export const cardSchema = z.object({
  board: z.enum(BOARD_KINDS), title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(4000), projectUid: z.string().min(1).max(80).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  finding: z.enum(["confirmed", "blocker", "needs-check"]).optional(),
});
export const cardActionSchema = z.object({
  id: z.string().min(1).max(80), revision: z.number().int().positive(),
  action: z.enum(["claim", "park", "complete", "reopen", "discuss", "archive"]),
});
export type CardInput = z.infer<typeof cardSchema>;
export type CardAction = z.infer<typeof cardActionSchema>;
export interface BoardCard extends CardInput {
  id: string; createdBy: Speaker; updatedBy: Speaker; claimedBy: Speaker | null;
  status: "open" | "parked" | "claimed" | "done" | "archived";
  createdAt: number; updatedAt: number; revision: number;
}
export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(2000),
  sourceUrl: z.string().trim().max(500).default("").refine(v => !v || safeLink(v), "Use an HTTPS link without credentials"),
  signature: z.string().trim().min(1).max(80),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;
export interface SkillRegistration extends RegistrationInput {
  id: string; owner: Speaker; signedAt: number; source: "mcp" | "browser";
  verification: "self-declared";
}
export interface Ecosystem { cards: BoardCard[]; skills: SkillRegistration[]; memories: TaskMemory[] }
