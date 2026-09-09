export const CHAT_DRAFT_KEY = "area67-draft";
export const QUICK_DRAFT_KEY = "area67-quick-draft";
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDraft(key: string, storage: DraftStorage = sessionStorage): string {
  try { return storage.getItem(key) ?? ""; } catch { return ""; }
}

/** Storage may be disabled. Keep typing usable even when persistence is unavailable. */
export function saveDraft(key: string, value: string, storage: DraftStorage = sessionStorage): void {
  try { if (value) storage.setItem(key, value); else storage.removeItem(key); } catch { /* Keep the in-memory draft. */ }
}

/** Flush composers before reconnect/reload so an unflushed keystroke is not lost. */
export function persistComposerDrafts(chat: string, quick: string, storage: DraftStorage = sessionStorage): void {
  saveDraft(CHAT_DRAFT_KEY, chat, storage);
  saveDraft(QUICK_DRAFT_KEY, quick, storage);
}

export function snapshotDrafts(storage: DraftStorage = sessionStorage): Record<string, string> {
  return {
    [CHAT_DRAFT_KEY]: readDraft(CHAT_DRAFT_KEY, storage),
    [QUICK_DRAFT_KEY]: readDraft(QUICK_DRAFT_KEY, storage),
  };
}

/** Keep composer text unless a successful send still matches what was submitted. */
export function composerAfterAttempt(current: string, submitted: string, ok: boolean): string {
  return ok && current === submitted ? "" : current;
}
