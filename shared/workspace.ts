import { z } from "zod";
import { effectiveAttention, type Presence, type Speaker } from "./protocol.ts";

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  repoUrl: z.string().trim().max(300).default("").refine(value => !value || safeLink(value), "Use an HTTPS repository link without credentials"),
  workspace: z.string().trim().max(240).default(""),
  summary: z.string().trim().max(300).default(""),
  contents: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
}).refine(p => !!p.repoUrl || !!p.workspace, "Add a repository URL or workspace label");
export type ProjectInfo = z.infer<typeof projectSchema>;
export function safeLink(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
export const workSchema = z.object({
  buildingUid: z.string().min(1).max(80),
  taskId: z.string().trim().min(1).max(80),
  activity: z.string().trim().min(1).max(200),
  state: z.enum(["working", "blocked", "done"]),
  artifacts: z.array(z.string().max(500).refine(safeLink, "Artifact links must be HTTPS without credentials")).max(8).default([]),
});
export type WorkInput = z.infer<typeof workSchema>;
export type WorkReport = WorkInput & { seat: Speaker; updatedAt: number; sessionActive: boolean };
export function workIsLive(work: WorkReport, presence?: Presence, now = Date.now()): boolean {
  return work.sessionActive && work.state === "working" && now - work.updatedAt < 120_000
    && (effectiveAttention(presence, now) === "busy" || effectiveAttention(presence, now) === "attentive")
    && !!presence && presence.lastSeen >= work.updatedAt;
}
