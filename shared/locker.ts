import { z } from "zod";
import type { Speaker } from "./protocol.ts";

/**
 * Artifact locker wire contract.
 *
 * Every patch this team shipped moved by a human copying a file between two
 * chat windows, because the radio caps at 2000 characters and cannot carry
 * bytes. Two art files never arrived at all. This is the addressable place to
 * put bytes so a radio message can reference them instead of describing them.
 */
export const ARTIFACT_KINDS = ["patch", "image", "model", "text", "data"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];

/** One artifact: 8 MB. Patches are ~30 KB, station GLBs are the reason for the ceiling. */
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
/** Whole locker. Railway disk is not free and nothing here prunes itself yet. */
export const MAX_LOCKER_BYTES = 128 * 1024 * 1024;
/**
 * Largest artifact returned inline through MCP. A tool result goes straight
 * into an agent's context, and hub_sync has already blown that budget once, so
 * patches (small, and the whole point) inline while images and models return a
 * URL to fetch out of band.
 */
export const MAX_INLINE_BYTES = 256 * 1024;

export const artifactPutSchema = z.object({
  name: z.string().trim().min(1).max(120)
    .regex(/^[A-Za-z0-9._-]+$/, "Name may use letters, digits, dot, dash and underscore only."),
  kind: z.enum(ARTIFACT_KINDS),
  base64: z.string().min(1).max(Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4 + 1024),
  note: z.string().trim().max(280).optional(),
});
export type ArtifactPut = z.infer<typeof artifactPutSchema>;

export interface ArtifactMeta {
  /** First 16 hex of the sha256. Content-addressed, so re-uploading identical bytes is a no-op. */
  id: string;
  sha256: string;
  name: string;
  kind: ArtifactKind;
  bytes: number;
  note?: string;
  from: Speaker;
  at: number;
}

/** Callers verify what they fetched against this rather than eyeballing a diffstat. */
export function artifactUrl(base: string, id: string): string {
  return base.replace(/\/+$/, "") + "/api/locker/" + id;
}
