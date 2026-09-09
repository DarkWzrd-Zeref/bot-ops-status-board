import { z } from "zod";
import type { Speaker } from "./protocol.ts";

export const MAX_MEMORIES_PER_SEAT = 8;
export const memorySchema = z.object({
  slot: z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9-]{0,39}$/, "Use a lowercase slot like camera-15 or resume"),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(1500),
  state: z.enum(["pending", "blocked", "done"]).default("pending"),
  projectUid: z.string().min(1).max(80).optional(),
});
export type MemoryInput = z.infer<typeof memorySchema>;
export interface TaskMemory extends MemoryInput {
  seat: Speaker;
  updatedAt: number;
}
