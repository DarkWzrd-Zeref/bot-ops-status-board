export const CHAT_DRAFT_KEY = "area67-draft";
export const QUICK_DRAFT_KEY = "area67-quick-draft";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDraft(key: string, storage: DraftStorage = sessionStorage): string {
  try { return storage.getItem(key) ?? ""; } catch { return ""; }
}

/** Storage may be disabled. Keep typing usable even when persistence is unavailable. */
export function saveDraft(key: string, value: string, storage: DraftStorage = sessionStorage): void {
  try { if (value) storage.setItem(key, value); else storage.removeItem(key); } catch { /* Keep the in-memory draft. */ }
}
