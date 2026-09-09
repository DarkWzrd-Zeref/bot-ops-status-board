import { bus } from "../core/events.ts";
import { radioLive, reconnectLive } from "../core/live.ts";

export const CHAT_DRAFT_KEY = "area67-draft";
export const QUICK_DRAFT_KEY = "area67-quick-draft";

export type HealthPayload = {
  ok?: boolean;
  name?: string;
  version?: string;
  commit?: string | null;
};

export type ReleaseKind = "live" | "offline" | "stale" | "bad";

export type ReleaseStatus = {
  kind: ReleaseKind;
  label: string;
  detail: string;
  showReconnect: boolean;
  showUpdate: boolean;
};

let bootCommit: string | null = null;
let health: HealthPayload | null = null;
let healthError: string | null = null;
let checking = false;
let reconnecting = false;
let watching = false;
let reloadImpl: () => void = () => { location.reload(); };

export function setReleaseReload(fn: () => void): void {
  reloadImpl = fn;
}

export function resetReleaseWatchForTests(): void {
  bootCommit = null;
  health = null;
  healthError = null;
  checking = false;
  reconnecting = false;
  watching = false;
}

export function shortCommit(commit: string | null | undefined): string {
  if (!commit) return "unknown";
  return commit.slice(0, 7);
}

export function releaseStatus(opts: {
  radioLive: boolean;
  health: HealthPayload | null;
  bootCommit: string | null;
  healthError?: string | null;
  checking?: boolean;
  reconnecting?: boolean;
}): ReleaseStatus {
  const version = opts.health?.version ?? "—";
  const commit = opts.health?.commit ?? null;
  const build = version + " · " + shortCommit(commit);
  const detail = [
    opts.health?.ok === false ? "health.ok=false" : opts.radioLive ? "stream open" : "stream closed",
    opts.health ? "version " + version : "no /health yet",
    commit ? "commit " + commit : "commit unknown",
  ].join(" · ");

  if (opts.reconnecting) {
    return { kind: "offline", label: "Reconnecting", detail, showReconnect: false, showUpdate: false };
  }
  if (opts.healthError || opts.health?.ok === false) {
    return { kind: "bad", label: opts.checking ? "Checking…" : "Hub unhealthy", detail: opts.healthError || detail, showReconnect: true, showUpdate: false };
  }
  if (!opts.radioLive) {
    return { kind: "offline", label: opts.checking ? "Checking…" : "Disconnected", detail, showReconnect: true, showUpdate: false };
  }
  if (opts.bootCommit && commit && opts.bootCommit !== commit) {
    return { kind: "stale", label: "Update " + shortCommit(commit), detail, showReconnect: false, showUpdate: true };
  }
  return { kind: "live", label: opts.checking && !opts.health ? "Checking…" : build, detail, showReconnect: false, showUpdate: false };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function releaseChipHtml(status: ReleaseStatus): string {
  const light = status.kind === "live" ? "attentive" : status.kind === "stale" ? "busy" : "offline";
  const reconnect = status.showReconnect
    ? `<button type="button" id="hub-reconnect" class="subtle release-action">Reconnect</button>`
    : "";
  const update = status.showUpdate
    ? `<button type="button" id="hub-update" class="subtle release-action">Update</button>`
    : "";
  return `<span class="release-chip" data-kind="${status.kind}" title="${esc(status.detail)}"><span class="status-light ${light}" aria-hidden="true"></span><span class="release-copy">${esc(status.label)}</span>${reconnect}${update}</span>`;
}

export function currentReleaseStatus(): ReleaseStatus {
  return releaseStatus({ radioLive, health, bootCommit, healthError, checking, reconnecting });
}

export function currentReleaseChip(): string {
  return releaseChipHtml(currentReleaseStatus());
}

export async function pollHealth(fetchImpl: typeof fetch = fetch): Promise<HealthPayload | null> {
  checking = true;
  bus.emit({ type: "changed" });
  try {
    const res = await fetchImpl("/health", { cache: "no-store" });
    const data = await res.json() as HealthPayload;
    health = data;
    healthError = !res.ok || data.ok === false ? "Hub /health is not ok" : null;
    if (bootCommit === null && typeof data.commit === "string" && data.commit) bootCommit = data.commit;
    return data;
  } catch (error) {
    healthError = error instanceof Error ? error.message : "health failed";
    return null;
  } finally {
    checking = false;
    bus.emit({ type: "changed" });
  }
}

export async function reconnectHub(opts: { reconnectStream?: () => void; fetchImpl?: typeof fetch } = {}): Promise<void> {
  if (reconnecting) return;
  reconnecting = true;
  bus.emit({ type: "changed" });
  try {
    (opts.reconnectStream ?? reconnectLive)();
    await pollHealth(opts.fetchImpl);
    bus.emit({ type: "toast", tone: "info", text: "Hub stream reopened. Agent lights still follow live check-ins." });
  } finally {
    reconnecting = false;
    bus.emit({ type: "changed" });
  }
}

/** User-clicked update only. Drafts stay in sessionStorage across the reload. Never call from a timer. */
export function applyHubUpdate(): void {
  reloadImpl();
}

export function startReleaseWatch(fetchImpl: typeof fetch = fetch): void {
  if (watching) return;
  watching = true;
  void pollHealth(fetchImpl);
  window.setInterval(() => void pollHealth(fetchImpl), 30_000);
}

export function draftsStillHeld(storage: Pick<Storage, "getItem">, snapshot: Record<string, string>): boolean {
  return Object.entries(snapshot).every(([key, value]) => storage.getItem(key) === value);
}
