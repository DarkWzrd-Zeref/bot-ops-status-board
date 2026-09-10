import { z } from "zod";
import { BASELINE_SKILLS, memoryEntrySchema, memoryInputSchema, memoryResultSchema, usageResultSchema, type BoosterResult } from "../shared/boosters.ts";
import type { Speaker } from "../shared/protocol.ts";

type Kind = "quota" | "judgment";
function configuration(kind: Kind) {
  const prefix = kind === "quota" ? "HUB_QUOTA" : "HUB_JUDGMENT";
  const raw = process.env[prefix + "_URL"], token = process.env[prefix + "_TOKEN"];
  if (!raw || !token || token.length < 32) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname.endsWith(".railway.internal"))) return null;
    return { url, token };
  } catch { return null; }
}
export function boosterCapabilities() {
  return BASELINE_SKILLS.map(skill => ({ ...skill, access: "authenticated-seat", state:
    configuration(skill.id === "account-usage" ? "quota" : "judgment") ? "configured" : "unconfigured" }));
}
async function request<T>(kind: Kind, route: string, schema: z.ZodType<T>, body: unknown, fetchImpl: typeof fetch): Promise<BoosterResult<T>> {
  const config = configuration(kind);
  if (!config) return { state: "unconfigured", message: "This baseline service is not configured on this hub." };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(new URL(route, config.url), { method: body === undefined ? "GET" : "POST",
      headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
      redirect: "error", signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok || !response.body) throw new Error("Upstream unavailable");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let raw = "", bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 262144) { await reader.cancel(); throw new Error("Response too large"); }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    return { state: "ready", data: schema.parse(JSON.parse(raw)) };
  } catch {
    return { state: "unavailable", message: body === undefined
      ? "The service could not be read. No current result is available."
      : "The save could not be confirmed. Check shared memory before retrying." };
  } finally { clearTimeout(timer); }
}
export function readUsage(fetchImpl: typeof fetch = fetch) {
  return request("quota", "/api/usage", usageResultSchema, undefined, fetchImpl);
}
export function searchMemory(query = "", fetchImpl: typeof fetch = fetch) {
  const q = z.string().max(500).parse(query);
  return request("judgment", "/api/entries?q=" + encodeURIComponent(q), memoryResultSchema, undefined, fetchImpl);
}
export function recordMemory(seat: Speaker, input: unknown, fetchImpl: typeof fetch = fetch) {
  const body = { ...memoryInputSchema.parse(input), seat };
  return request("judgment", "/api/entries", memoryEntrySchema, body, fetchImpl);
}
