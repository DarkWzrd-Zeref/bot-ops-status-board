import { z } from "zod";

export const BASELINE_SKILLS = [
  { id: "account-usage", name: "Account usage", station: "well", tools: ["usage_read"],
    description: "Read the latest source-reported account usage, reset windows and missing coverage." },
  { id: "shared-memory", name: "Shared memory", station: "bank", tools: ["memory_search", "memory_record"],
    description: "Recall and record shared decisions, patterns and corrections with attribution." },
] as const;
export const memoryInputSchema = z.object({
  kind: z.enum(["decision", "pattern", "correction"]).default("decision"),
  title: z.string().trim().min(1).max(160), body: z.string().max(4000).default(""),
  tags: z.array(z.string().max(80)).max(12).default([]),
}).strict();
export const memoryEntrySchema = memoryInputSchema.extend({
  id: z.string().max(100), seat: z.string().max(80), at: z.string().datetime(),
  attribution: z.literal("operator-reported").optional(),
});
export const memoryResultSchema = z.object({
  entries: z.array(memoryEntrySchema).max(200), total: z.number().int().nonnegative(),
  retrieval: z.literal("keyword"),
});
const usageWindow = z.object({
  id: z.string().max(100), label: z.string().max(100), usedPercent: z.number().min(0).max(100),
  remainingPercent: z.number().min(0).max(100), windowMinutes: z.number().positive(),
  resetsAt: z.string().datetime().nullable(), status: z.enum(["reported", "manual", "stale"]),
  precision: z.literal("as-reported-by-source"),
}).refine(w => Math.abs(w.remainingPercent - (100 - w.usedPercent)) < 0.000001, "Inconsistent usage");
export const usageResultSchema = z.object({
  schemaVersion: z.literal(1), checkedAt: z.string().datetime(), coverage: z.literal("configured-accounts-only"),
  refresh: z.string().max(300),
  accounts: z.array(z.object({
    provider: z.enum(["codex", "chatgpt", "claude", "cursor", "grok"]), accountId: z.string().max(64),
    source: z.enum(["provider-api", "product-connector", "manual"]), observedAt: z.string().datetime(),
    windows: z.array(usageWindow).max(20), unavailableReason: z.string().max(300).nullable(),
    status: z.enum(["reported", "manual", "stale", "unavailable"]),
  })).max(100),
  unconfiguredProviders: z.array(z.enum(["codex", "chatgpt", "claude", "cursor", "grok"])).max(5),
});
export type UsageResult = z.infer<typeof usageResultSchema>;
export type MemoryResult = z.infer<typeof memoryResultSchema>;
export type BoosterResult<T> = { state: "ready"; data: T } | { state: "unconfigured" | "unavailable"; message: string };
