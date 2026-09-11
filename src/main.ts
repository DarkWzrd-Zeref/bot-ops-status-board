import "./style.css";
import { DEMO_CSV, SHEET_URL, fetchSheet, parseSnapshot, storage, type Dataset } from "./data";
import { efficiencyGuideJson, renderEfficiencyGuide } from "./efficiency";
import { bindHandoffBridge, renderHandoffBridge } from "./handoff";
import { esc, renderActionQueue, renderBanner, renderCoverage, renderLedger, renderSections } from "./render";
import { renderRoadmap } from "./roadmap";

type SheetState = "idle" | "loading" | "ok" | "blocked";

interface State {
  data: Dataset | null;
  sheet: SheetState;
  sheetError: string;
  panelOpen: boolean;
  message: string;
}

const state: State = { data: null, sheet: "idle", sheetError: "", panelOpen: false, message: "" };
const app = document.querySelector<HTMLDivElement>("#app")!;

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sourcePill(): string {
  if (state.sheet === "loading") return `<span class="pill loading">SHEET · fetching</span>`;
  const d = state.data;
  if (!d) return `<span class="pill bad">NO DATA</span>`;
  if (d.source === "sheet") return `<span class="pill ok">LIVE SHEET · ${fmtTime(d.loadedAt)}</span>`;
  if (d.source === "demo") return `<span class="pill info">DEMO</span>`;
  return `<span class="pill warn">SNAPSHOT · ${fmtTime(d.loadedAt)}</span>`;
}

function bannerKind(): "blocked" | "blocked-snapshot" | "demo" | null {
  if (state.data?.source === "demo") return "demo";
  if (state.sheet !== "blocked") return null;
  return state.data ? "blocked-snapshot" : "blocked";
}

function render(): void {
  const gid = storage.getGid();
  const snapshot = storage.getSnapshot() ?? "";
  app.innerHTML = `
    <header class="top">
      <div>
        <p class="eyebrow">Bot Passport · Area 67</p>
        <h1>Area 67 · The Hub</h1>
        <p class="muted small">Ledger-first · source of truth is the <a class="link" href="${SHEET_URL}" target="_blank" rel="noopener noreferrer">Google Sheet</a></p>
      </div>
      <div class="controls">
        ${sourcePill()}
        <button id="refresh" class="btn" ${state.sheet === "loading" ? "disabled" : ""}>Refresh</button>
        <button id="toggle-panel" class="btn ghost" aria-expanded="${state.panelOpen}">${state.panelOpen ? "Hide data" : "Data"}</button>
      </div>
    </header>
    <nav class="hub-nav" aria-label="Area 67 sections">
      <a href="#efficiency-guide">Bridge</a>
      <a href="#compose">Compose</a>
      <a href="#inbox">Inbox</a>
      <a href="#roadmap">Roadmap</a>
      <a href="#action-queue">Pending</a>
      <a href="#bots">Bots</a>
      <a href="#ledger">Ledger</a>
    </nav>

    ${renderBanner(bannerKind(), state.sheetError)}
    ${state.message ? `<div class="banner info">${esc(state.message)}</div>` : ""}

    ${renderEfficiencyGuide()}
    ${renderHandoffBridge()}
    ${renderRoadmap()}

    <section class="panel" ${state.panelOpen ? "" : "hidden"}>
      <h2>Data</h2>
      <p class="muted small">Paste a CSV or JSON export of the sheet (wide rows, or a long <code>bot | field | value</code> ledger). Stored only in this device's browser storage. Never paste secrets.</p>
      <label class="field">
        <span>Sheet tab gid (optional, from the sheet URL <code>#gid=…</code>)</span>
        <input id="gid" type="text" inputmode="numeric" placeholder="0" value="${esc(gid)}" />
      </label>
      <textarea id="snapshot" rows="8" placeholder="bot,approve_status,live,...&#10;Researcher,pending,,...">${esc(snapshot)}</textarea>
      <div class="row">
        <button id="load-snapshot" class="btn">Load snapshot</button>
        <button id="load-demo" class="btn ghost">Load demo</button>
        <button id="clear-snapshot" class="btn ghost danger">Clear</button>
      </div>
    </section>

    ${renderCoverage(state.data)}
    ${renderActionQueue(state.data)}
    <main class="grid" id="bots">${renderSections(state.data)}</main>

    <details class="ledger" id="ledger" ${state.data && state.data.rows.length <= 12 ? "open" : ""}>
      <summary>Ledger — every column, every row</summary>
      ${renderLedger(state.data)}
    </details>

    <footer class="muted small">
      No secrets in this app. Sheet is read directly from Google in your browser; snapshots live in localStorage only.
      Add to Home Screen from Safari's share sheet for the standalone app.
    </footer>
  `;
  bind();
}

function bind(): void {
  bindHandoffBridge(render);
  document.querySelector<HTMLSelectElement>("#queue-owner-filter")?.addEventListener("change", (event) => {
    const owner = (event.currentTarget as HTMLSelectElement).value;
    document.querySelectorAll<HTMLElement>(".queue-card").forEach((card) => {
      card.hidden = Boolean(owner) && card.dataset.owner !== owner;
    });
  });
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => void loadSheet());
  document.querySelector<HTMLButtonElement>("#copy-guide")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(efficiencyGuideJson());
      state.message = "Area 67 efficiency guide copied as bot-readable JSON.";
    } catch {
      state.message = "Clipboard access was blocked. Use Download instead.";
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#download-guide")?.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([efficiencyGuideJson()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "area-67-efficiency-guide.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector<HTMLButtonElement>("#toggle-panel")?.addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    render();
  });
  document.querySelector<HTMLInputElement>("#gid")?.addEventListener("change", (e) => {
    storage.setGid((e.target as HTMLInputElement).value.trim());
  });
  document.querySelector<HTMLButtonElement>("#load-snapshot")?.addEventListener("click", () => {
    const text = document.querySelector<HTMLTextAreaElement>("#snapshot")!.value;
    try {
      state.data = parseSnapshot(text, "snapshot");
      storage.setSnapshot(text);
      state.message = "";
    } catch (err) {
      state.message = `Could not parse snapshot: ${err instanceof Error ? err.message : String(err)}`;
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#load-demo")?.addEventListener("click", () => {
    state.data = parseSnapshot(DEMO_CSV, "demo");
    state.message = "";
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-snapshot")?.addEventListener("click", () => {
    storage.clearSnapshot();
    if (state.data && state.data.source !== "sheet") state.data = null;
    state.message = "";
    render();
  });
}

async function loadSheet(): Promise<void> {
  state.sheet = "loading";
  state.message = "";
  render();
  try {
    state.data = await fetchSheet(storage.getGid());
    state.sheet = "ok";
    state.sheetError = "";
  } catch (err) {
    state.sheet = "blocked";
    state.sheetError = err instanceof Error ? err.message : String(err);
    if (!state.data || state.data.source === "sheet") {
      const saved = storage.getSnapshot();
      if (saved) {
        try {
          state.data = parseSnapshot(saved, "snapshot");
        } catch {
          state.data = null;
        }
      } else state.data = null;
    }
    if (!state.data) state.panelOpen = true;
  }
  render();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

render();
void loadSheet();
