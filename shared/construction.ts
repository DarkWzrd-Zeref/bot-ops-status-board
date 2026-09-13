import { z } from "zod";
import { projectSchema } from "./workspace.ts";

export const stationPlanSchema = z.object({
  requestId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/).describe("Stable unique plan ID; reuse exactly for retries, use a new ID for a changed plan"),
  buildings: z.array(z.object({
    hubId: z.string().min(1).max(80),
    tx: z.number().int(),
    ty: z.number().int(),
    project: projectSchema.optional(),
  }).strict()).min(1).max(24),
}).strict();
export const stationBuildSchema = stationPlanSchema.extend({
  expectedRevision: z.number().int().min(0).describe("Current base revision returned by preview; refresh the preview on conflict"),
});
export type StationPlan = z.infer<typeof stationPlanSchema>;
export type StationBuild = z.infer<typeof stationBuildSchema>;
