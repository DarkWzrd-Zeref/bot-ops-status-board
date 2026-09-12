import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Speaker } from "../shared/protocol.ts";
import {
  MAX_ARTIFACT_BYTES, MAX_LOCKER_BYTES, type ArtifactMeta, type ArtifactPut,
} from "../shared/locker.ts";

/**
 * Disk-backed artifact storage, deliberately NOT part of the main store.
 *
 * store.ts re-serializes its entire state to JSON on every single write. Multi-
 * megabyte blobs in that object would make every radio message pay to rewrite
 * every GLB. Artifacts get their own directory: one .bin and one .json per
 * artifact, listed by reading the directory so there is no index to desync.
 */
const dataDir = () => process.env.DATA_DIR || join(process.cwd(), "data");
const lockerDir = () => join(dataDir(), "artifacts");

export class LockerError extends Error {}

function ensureDir(): string {
  const dir = lockerDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Content-addressed: identical bytes always land on the same id. */
function idFor(bytes: Buffer): { id: string; sha256: string } {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { id: sha256.slice(0, 16), sha256 };
}

export function lockerList(): ArtifactMeta[] {
  const dir = ensureDir();
  const rows: ArtifactMeta[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      rows.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as ArtifactMeta);
    } catch {
      // A half-written sidecar should hide one artifact, never break the listing.
    }
  }
  return rows.sort((a, b) => b.at - a.at);
}

export function lockerUsage(): { bytes: number; count: number } {
  const rows = lockerList();
  return { bytes: rows.reduce((sum, r) => sum + r.bytes, 0), count: rows.length };
}

export function lockerRead(id: string): { meta: ArtifactMeta; bytes: Buffer } | null {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const dir = ensureDir();
  try {
    const meta = JSON.parse(readFileSync(join(dir, id + ".json"), "utf8")) as ArtifactMeta;
    const bytes = readFileSync(join(dir, id + ".bin"));
    // The stored digest is the contract callers verify against; if the file on
    // disk no longer matches it, refuse rather than hand back wrong bytes.
    if (createHash("sha256").update(bytes).digest("hex") !== meta.sha256) return null;
    return { meta, bytes };
  } catch {
    return null;
  }
}

export function lockerPut(from: Speaker, input: ArtifactPut): ArtifactMeta {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.base64, "base64");
  } catch {
    throw new LockerError("Artifact body must be base64.");
  }
  if (!bytes.length) throw new LockerError("Artifact is empty.");
  if (bytes.length > MAX_ARTIFACT_BYTES) {
    throw new LockerError(`Artifact is ${bytes.length} bytes; the ceiling is ${MAX_ARTIFACT_BYTES}.`);
  }
  const { id, sha256 } = idFor(bytes);
  const dir = ensureDir();
  const existing = lockerRead(id);
  // Same bytes, same id: re-uploading a patch after a failed courier is a no-op
  // rather than a duplicate, and keeps the original uploader and timestamp.
  if (existing) return existing.meta;

  const usage = lockerUsage();
  if (usage.bytes + bytes.length > MAX_LOCKER_BYTES) {
    throw new LockerError("Locker is full. Nothing prunes itself yet; clear artifacts before adding more.");
  }
  const meta: ArtifactMeta = {
    id, sha256, name: input.name, kind: input.kind, bytes: bytes.length,
    ...(input.note ? { note: input.note } : {}), from, at: Date.now(),
  };
  // Bytes first, then the sidecar: a crash between the two leaves an orphan
  // .bin that no listing shows, never a metadata row pointing at nothing.
  writeFileSync(join(dir, id + ".bin.tmp"), bytes);
  renameSync(join(dir, id + ".bin.tmp"), join(dir, id + ".bin"));
  writeFileSync(join(dir, id + ".json.tmp"), JSON.stringify(meta, null, 2));
  renameSync(join(dir, id + ".json.tmp"), join(dir, id + ".json"));
  return meta;
}

/** Present only so tests and operators can measure the directory honestly. */
export function lockerDirSize(): number {
  const dir = ensureDir();
  let total = 0;
  for (const file of readdirSync(dir)) total += statSync(join(dir, file)).size;
  return total;
}
