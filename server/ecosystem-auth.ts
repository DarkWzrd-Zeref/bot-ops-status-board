import { timingSafeEqual } from "node:crypto";
import { SPEAKERS, isSpeaker, type Speaker } from "../shared/protocol.ts";

/** New ecosystem writes are closed by default. Never infer an author from a body. */
export class EcosystemAccessError extends Error {}
export function ecosystemAuthorized(request: Request, seat: Speaker): boolean {
  try {
    const keys: unknown = JSON.parse(process.env.AREA67_ECOSYSTEM_KEYS ?? "{}");
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) return false;
    const entries = Object.entries(keys);
    if (entries.some(([id, value]) => !isSpeaker(id) || typeof value !== "string" || value.length < 32)) return false;
    if (new Set(entries.map(([, value]) => value)).size !== entries.length) return false;
    const expected = (keys as Record<string, string>)[seat];
    const header = request.headers.get("authorization") ?? "";
    if (!expected || !header.startsWith("Bearer ")) return false;
    const received = Buffer.from(header.slice(7)); const wanted = Buffer.from(expected);
    return received.length === wanted.length && timingSafeEqual(received, wanted);
  } catch { return false; }
}
export function requireEcosystemWriter(request: Request, seat: Speaker): void {
  if (!ecosystemAuthorized(request, seat)) throw new EcosystemAccessError("Board writes are locked. Connect this seat's private write key.");
}
/**
 * True when the bearer matches ANY configured seat key.
 *
 * Writes are always bound to one seat, because authorship has to be real. Some
 * reads are shared team property instead: the artifact locker is only useful if
 * the seat receiving a patch can fetch it with its own key rather than needing
 * the operator's. This still requires a real key — it is not public access.
 */
export function anySeatAuthorized(request: Request): boolean {
  return SPEAKERS.some(seat => ecosystemAuthorized(request, seat));
}
export function requireAnySeat(request: Request): void {
  if (!anySeatAuthorized(request)) throw new EcosystemAccessError("The locker is closed. Connect your seat's private key.");
}
