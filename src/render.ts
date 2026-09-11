import { LABEL_COLS, SHEET_URL, normalizeKey, type Dataset, type Row } from "./data";
import { SECTIONS, matchFields, type Field, type Section } from "./sections";

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function labelColumn(headers: string[]): string | undefined {
  const norm = headers.map(normalizeKey);
  const idx = norm.findIndex((h) => LABEL_COLS.includes(h));
  return idx >= 0 ? headers[idx] : headers[0];
}

function isUrl(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
}

function renderValue(field: Field, value: string): string {
  const v = value.trim();
  if (!v) return `<span class="muted">—</span>`;
  if (field.kind === "url" || isUrl(v)) {
    if (!isUrl(v)) return `<span>${esc(v)}</span>`;
    let host = v;
    try {
      host = new URL(v).host;
    } catch {
      /* keep raw */
    }
    return `<a class="link" href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(host)} ↗</a>`;
  }
  const low = v.toLowerCase();
  switch (field.kind) {
    case "approve": {
      const approved = /^(approved|approve|yes|✅|true)$/.test(low);
      return approved
        ? `<span class="badge ok">APPROVED</span>`
        : `<span class="badge warn">PENDING</span>${low !== "pending" ? ` <span class="muted small">(${esc(v)})</span>` : ""}`;
    }
    case "live": {
      const live = /^(live|yes|true|✅|1)$/.test(low);
      return live ? `<span class="badge ok">LIVE</span>` : `<span class="badge dim">${esc(v.toUpperCase())}</span>`;
    }
    case "flag": {
      const clear = /^(0|none|no|clear|false|-|n\/a|ok)$/.test(low);
      return clear ? `<span class="badge dim">clear</span>` : `<span class="badge bad">⚑ ${esc(v)}</span>`;
    }
    case "queue": {
      if (low === "go") return `<span class="badge ok">GO</span>`;
      if (low === "park" || low === "parked") return `<span class="badge warn">PARK</span>`;
      return `<span class="badge dim">${esc(v)}</span>`;
    }
    case "money": {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      const over = !Number.isNaN(n) && n > 325;
      return `<span class="badge ${over ? "bad" : "ok"}">${esc(v)}</span>${over ? ` <span class="muted small">over $325</span>` : ""}`;
    }
    default: {
      if (/^(ok|green|ready|done|yes|synced|pass|passing|true)$/.test(low)) return `<span class="badge ok">${esc(v)}</span>`;
      if (/^(pending|open|waiting|amber|yellow|park)$/.test(low)) return `<span class="badge warn">${esc(v)}</span>`;
      if (/^(red|fail|failed|failing|blocked|error|no)$/.test(low)) return `<span class="badge bad">${esc(v)}</span>`;
      return `<span>${esc(v)}</span>`;
    }
  }
}

function sectionNotes(section: Section, rows: Row[], found: Map<string, string>): string {
  const notes: string[] = [];
  if (section.id === "track" && found.has("live")) {
    const col = found.get("live")!;
    const liveCount = rows.filter((r) => /^(live|yes|true|✅|1)$/i.test((r[col] ?? "").trim())).length;
    if (liveCount === 1) notes.push(`<span class="badge ok">one LIVE ✓</span>`);
    else if (liveCount === 0) notes.push(`<span class="badge warn">no LIVE row</span>`);
    else notes.push(`<span class="badge bad">${liveCount} LIVE — one-LIVE rule broken</span>`);
  }
  if (section.id === "researcher" && found.has("approve_status")) {
    const col = found.get("approve_status")!;
    const pending = rows.filter((r) => {
      const v = (r[col] ?? "").trim().toLowerCase();
      return r[col] !== undefined && !/^(approved|approve|yes|✅|true)$/.test(v) && rowTouches(r, found);
    }).length;
    if (pending) notes.push(`<span class="badge warn">${pending} pending approval</span>`);
  }
  if (section.id === "cos" && found.has("pending_handoffs")) {
    const col = found.get("pending_handoffs")!;
    const total = rows.reduce((acc, r) => acc + (Number((r[col] ?? "").replace(/[^0-9.-]/g, "")) || 0), 0);
    if (total) notes.push(`<span class="badge warn">${total} handoff${total === 1 ? "" : "s"} pending</span>`);
  }
  if (section.rule) notes.push(`<span class="muted small">${esc(section.rule)}</span>`);
  return notes.length ? `<div class="notes">${notes.join(" ")}</div>` : "";
}

function rowTouches(row: Row, found: Map<string, string>): boolean {
  for (const col of found.values()) if ((row[col] ?? "").trim()) return true;
  return false;
}

function renderSection(section: Section, data: Dataset | null): string {
  const found = data ? matchFields(section, data.headers) : new Map<string, string>();
  const expected = section.fields.map((f) => `<code>${esc(f.key)}</code>`).join(" ");
  let body: string;
  if (!data) {
    body = `<p class="muted">Waiting for data. Expected columns: ${expected}</p>`;
  } else if (!found.size) {
    body = `<p class="muted">No columns for this section in the current data. Looking for: ${expected}</p>`;
  } else {
    const labelCol = labelColumn(data.headers);
    const rows = data.rows.filter((r) => rowTouches(r, found));
    const cards = rows
      .map((row) => {
        const label = labelCol ? row[labelCol] : "";
        const items = section.fields
          .filter((f) => found.has(f.key))
          .map((f) => `<div class="kv"><dt>${esc(f.label)}</dt><dd>${renderValue(f, row[found.get(f.key)!] ?? "")}</dd></div>`)
          .join("");
        return `<article class="card">${label ? `<h3>${esc(label)}</h3>` : ""}<dl>${items}</dl></article>`;
      })
      .join("");
    const missing = section.fields.filter((f) => !found.has(f.key)).map((f) => `<code>${esc(f.key)}</code>`);
    body =
      (rows.length ? cards : `<p class="muted">Columns present but every row is blank.</p>`) +
      (missing.length ? `<p class="muted small">Not in data: ${missing.join(" ")}</p>` : "");
  }
  return `<section class="section" id="${section.id}">
    <header><h2>${esc(section.title)}</h2><p class="muted small">${esc(section.subtitle)}</p></header>
    ${data ? sectionNotes(section, data.rows, found) : ""}
    ${body}
  </section>`;
}

export function renderSections(data: Dataset | null): string {
  return SECTIONS.map((s) => renderSection(s, data)).join("");
}

export function renderLedger(data: Dataset | null): string {
  if (!data) return `<p class="muted">Ledger appears here once data is loaded.</p>`;
  const head = data.headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = data.rows
    .map((r) => `<tr>${data.headers.map((h) => `<td>${isUrl(r[h] ?? "") ? `<a class="link" href="${esc(r[h])}" target="_blank" rel="noopener noreferrer">${esc(r[h])}</a>` : esc(r[h] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderCoverage(data: Dataset | null): string {
  if (!data) return "";
  const covered = SECTIONS.filter((s) => matchFields(s, data.headers).size > 0).length;
  return `<div class="stats">
    <div><strong>${data.rows.length}</strong><span>rows</span></div>
    <div><strong>${data.headers.length}</strong><span>columns</span></div>
    <div><strong>${covered}/${SECTIONS.length}</strong><span>sections covered</span></div>
  </div>`;
}

function headerFor(headers: string[], aliases: string[]): string | undefined {
  const normalized = headers.map((header) => ({ header, key: normalizeKey(header) }));
  return normalized.find(({ key }) => aliases.includes(key))?.header;
}

/** Surface row-oriented ledger work that would otherwise only appear in the raw table. */
export function renderActionQueue(data: Dataset | null): string {
  if (!data) return "";
  const statusCol = headerFor(data.headers, ["approve_status", "approval_status", "approval"]);
  const nextCol = headerFor(data.headers, ["next_step", "next_action", "action"]);
  if (!statusCol || !nextCol) return "";

  const itemCol = headerFor(data.headers, ["bot_or_item", "item", "task", "title", "bot", "name"]);
  const ownerCol = headerFor(data.headers, ["owner", "assigned_to"]);
  const approverCol = headerFor(data.headers, ["approved_by", "approver"]);
  const notesCol = headerFor(data.headers, ["notes", "blocker", "risks"]);
  const pending = data.rows.filter((row) => {
    const status = (row[statusCol] ?? "").trim().toLowerCase();
    return /^(pending|waiting|blocked|needs approval|needs_approval)$/.test(status);
  });
  if (!pending.length) return "";

  const cards = pending
    .map((row) => {
      const status = (row[statusCol] ?? "pending").trim();
      const item = itemCol ? row[itemCol] : "";
      const owner = ownerCol ? row[ownerCol] : "";
      const approver = approverCol ? row[approverCol] : "";
      const next = row[nextCol] ?? "";
      const notes = notesCol ? row[notesCol] : "";
      const approvalWalled = !approver && status.toLowerCase() === "pending";
      return `<article class="queue-card">
        <div class="queue-card-head">
          <h3>${esc(item || "Unlabeled ledger item")}</h3>
          <span class="badge ${approvalWalled ? "bad" : "warn"}">${approvalWalled ? "WALLED · APPROVAL" : esc(status.toUpperCase())}</span>
        </div>
        ${owner ? `<p class="small"><span class="muted">Owner</span> ${esc(owner)}</p>` : ""}
        <p>${esc(next || "No next step recorded.")}</p>
        ${notes ? `<p class="muted small">${esc(notes)}</p>` : ""}
      </article>`;
    })
    .join("");

  return `<section class="action-queue" aria-labelledby="action-queue-title">
    <header>
      <div>
        <p class="eyebrow">Live ledger checkpoint</p>
        <h2 id="action-queue-title">Pending / walled queue</h2>
      </div>
      <span class="pill warn">${pending.length} pending</span>
    </header>
    <p class="muted small">Approval-gated items are marked walled. The hub will not integrate them until the recorded approver gives GO.</p>
    <div class="queue-grid">${cards}</div>
  </section>`;
}

export function renderBanner(kind: "blocked" | "blocked-snapshot" | "demo" | null, detail = ""): string {
  if (!kind) return "";
  if (kind === "demo") {
    return `<div class="banner info"><strong>DEMO data.</strong> Layout preview only — not the ledger. Load the sheet or paste a real snapshot.</div>`;
  }
  const fix = `AM must open the <a class="link" href="${SHEET_URL}" target="_blank" rel="noopener noreferrer">source sheet</a> → Share → General access → <strong>Anyone with the link · Viewer</strong>, then tap Refresh.`;
  if (kind === "blocked-snapshot") {
    return `<div class="banner warn"><strong>Sheet blocked (401 / not public).</strong> Showing your pasted snapshot instead. ${fix}</div>`;
  }
  return `<div class="banner bad"><strong>Sheet fetch blocked (401 / not public)${detail ? ` — ${esc(detail)}` : ""}.</strong> ${fix} Until then, paste a CSV/JSON snapshot below.</div>`;
}
