export type Row = Record<string, string>;

export type Source = "sheet" | "snapshot" | "demo";

export interface Dataset {
  headers: string[];
  rows: Row[];
  source: Source;
  loadedAt: number;
}

export const SHEET_ID = "18O7x24CJmE9qRwNBndNXi8SYrvUkU0woeutWOW-ce7k";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

const LS_SNAPSHOT = "bp.snapshot.v1";
const LS_GID = "bp.gid.v1";

export function normalizeKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .replace(/[↔→]/g, "_to_")
    .replace(/[^a-z0-9$]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "," || c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function tableToDataset(table: string[][]): { headers: string[]; rows: Row[] } {
  if (!table.length) return { headers: [], rows: [] };
  const rawHeaders = table[0].map((h, i) => (h.trim() ? h.trim() : `col_${i + 1}`));
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const h of rawHeaders) {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    headers.push(n ? `${h} (${n + 1})` : h);
  }
  const rows = table.slice(1).map((r) => {
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = (r[i] ?? "").trim()));
    return row;
  });
  return { headers, rows };
}

function fromJson(value: unknown): { headers: string[]; rows: Row[] } {
  let data: unknown = value;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    data = obj.rows ?? obj.data ?? obj.values ?? obj.items ?? obj.records ?? Object.values(obj).find(Array.isArray);
  }
  if (!Array.isArray(data)) throw new Error("JSON must be an array of objects, an array of arrays, or {rows:[...]}.");
  if (data.length && Array.isArray(data[0])) {
    return tableToDataset((data as unknown[][]).map((r) => r.map((v) => String(v ?? ""))));
  }
  const headers: string[] = [];
  const rows: Row[] = (data as Record<string, unknown>[]).map((o) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(o ?? {})) {
      if (!headers.includes(k)) headers.push(k);
      row[k] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return row;
  });
  return { headers, rows };
}

const LONG_KEY_COLS = ["field", "key", "metric", "column", "attribute", "item"];
const LONG_VALUE_COLS = ["value", "status", "val"];
export const LABEL_COLS = ["bot", "agent", "role", "name", "owner", "id", "entry", "title", "task"];

/** Long-format ledgers (bot | field | value) are pivoted into one wide row per bot. */
function pivotIfLong(headers: string[], rows: Row[]): { headers: string[]; rows: Row[] } {
  const norm = headers.map(normalizeKey);
  const keyCol = headers[norm.findIndex((h) => LONG_KEY_COLS.includes(h))];
  const valCol = headers[norm.findIndex((h) => LONG_VALUE_COLS.includes(h))];
  if (!keyCol || !valCol || keyCol === valCol) return { headers, rows };
  const labelCol = headers[norm.findIndex((h) => LABEL_COLS.includes(h))];
  const groups = new Map<string, Row>();
  const outHeaders: string[] = labelCol ? [labelCol] : [];
  for (const r of rows) {
    const label = labelCol ? r[labelCol] || "(unlabeled)" : "ledger";
    const target = groups.get(label) ?? (labelCol ? { [labelCol]: label } : {});
    const field = r[keyCol];
    if (!field) continue;
    if (!outHeaders.includes(field)) outHeaders.push(field);
    target[field] = r[valCol] ?? "";
    groups.set(label, target);
  }
  return { headers: outHeaders, rows: [...groups.values()] };
}

export function parseSnapshot(text: string, source: Source): Dataset {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Snapshot is empty.");
  let parsed: { headers: string[]; rows: Row[] };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) parsed = fromJson(JSON.parse(trimmed));
  else parsed = tableToDataset(parseCSV(trimmed));
  if (!parsed.headers.length) throw new Error("No header row found.");
  const pivoted = pivotIfLong(parsed.headers, parsed.rows);
  return { ...pivoted, source, loadedAt: Date.now() };
}

export class SheetAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetAccessError";
  }
}

/** Reads the sheet as CSV. Private sheets 401/redirect to a login page, which surfaces as a CORS/network failure. */
export async function fetchSheet(gid: string): Promise<Dataset> {
  const gidParam = gid ? `&gid=${encodeURIComponent(gid)}` : "";
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv${gidParam}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv${gidParam}`,
  ];
  let lastError = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (res.status === 401 || res.status === 403) throw new SheetAccessError(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/<html/i.test(text.slice(0, 500))) throw new SheetAccessError("login page returned");
      return parseSnapshot(text, "sheet");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof SheetAccessError) throw err;
    }
  }
  throw new SheetAccessError(lastError || "blocked");
}

export const storage = {
  getSnapshot: (): string | null => localStorage.getItem(LS_SNAPSHOT),
  setSnapshot: (text: string) => localStorage.setItem(LS_SNAPSHOT, text),
  clearSnapshot: () => localStorage.removeItem(LS_SNAPSHOT),
  getGid: (): string => localStorage.getItem(LS_GID) ?? "",
  setGid: (gid: string) => localStorage.setItem(LS_GID, gid),
};

export const DEMO_CSV = `bot,mcp_first,no_clone,model_tier,coding_handoff,waste_flags,vision_board_url,web_insight_url,proposal_summary,approve_status,boarding_packet,cloud_agent_handoff,pr_ci_pulse,merge_ask,board_to_cloud_to_pr,pulse_noise,mcp_or_gh_status,live_book,live,syllabus,done_artifact,jumped_asks,absorbs,am_ios_mirror,mcp_parity,last_discord_sync,global_queue,pending_handoffs,network_burn
Police,yes,enforced,sonnet,to Engineer,,,,,,,,,,,,,,,,,,,,,,,,
Researcher,,,,,,https://example.com/vision-board,https://example.com/web-insight,Ledger-first PWA mirror for AM,pending,,,,,,,,,,,,,,,,,,,
Engineer,,,,,,,,,,ready,sent 21:40,green,open,board->cloud->pr,low,MCP ok / GH ok,,,,,,,,,,,,
Stay on Track,,,,,,,,,,,,,,,,,Bot Passport,LIVE,week 3 of 6,status-board.up.railway.app,1,0,,,,,,
AM twin,,,,,,,,,,,,,,,,,,,,,,,synced,desktop=mobile,2026-09-05 21:12,,,
CoS,,,,,,,,,,,,,,,,,,,,,,,,,,GO,2,$325`;
