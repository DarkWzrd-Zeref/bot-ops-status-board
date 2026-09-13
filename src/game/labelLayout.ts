export interface LabelCandidate { id: string; x: number; y: number; width: number; height: number; priority: number; pinned?: boolean }
/** Stable screen-space packing. Models remain visible; only overlapping text is suppressed. */
export function packLabels(items: LabelCandidate[], width: number, height: number, limit: number) {
  const kept: LabelCandidate[] = [];
  for (const item of [...items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (!Number.isFinite(item.x + item.y) || item.x < 10 || item.x > width - 10 || item.y < 60 || item.y > height - 80) continue;
    if (!item.pinned && (kept.length >= limit || kept.some(k => Math.abs(k.x - item.x) < (k.width + item.width) / 2 + 8 && Math.abs(k.y - item.y) < (k.height + item.height) / 2 + 8))) continue;
    kept.push(item);
  }
  return new Set(kept.map(k => k.id));
}
