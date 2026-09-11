import { esc } from "./render";

export type RoadmapStatus = "LIVE" | "BUILDING" | "WALLED";

export interface RoadmapItem {
  id: number;
  title: string;
  status: RoadmapStatus;
  outcome: string;
  blocker?: string;
  ask?: string;
  help: string;
}

export const ROADMAP: RoadmapItem[] = [
  {
    id: 1,
    title: "Shared MCP service",
    status: "WALLED",
    outcome: "One authenticated job store and tool surface shared by every compatible AI client.",
    blocker: "Needs a private host, database, identity policy, and confirmation of which subscription surfaces accept remote MCP.",
    ask: "Jorge: choose Cloudflare or Railway and approve the authentication boundary.",
    help: "Claude Opus 5 for threat model → Cursor Opus/Sol for implementation",
  },
  {
    id: 2,
    title: "Inbox / outbox lifecycle",
    status: "LIVE",
    outcome: "Device-local READY → CLAIMED → WORKING → REVIEW → BLOCKED → DONE queue.",
    help: "Cursor Composer 2.5 for routine extensions",
  },
  {
    id: 3,
    title: "Task-specific handoff packets",
    status: "LIVE",
    outcome: "Generate only job_spec, file_map, diff, asset_brief, or ship_packet fields.",
    help: "Cursor Grok 4.6",
  },
  {
    id: 4,
    title: "Live-sheet schema adapter",
    status: "BUILDING",
    outcome: "Row-oriented ledger tasks surface as actionable queue cards; remaining role views still need canonical fields.",
    blocker: "The source sheet mixes roster, research, rules, and status records in one shape.",
    ask: "Jorge/AM: approve a canonical v2 sheet tab or preserve the current mixed schema.",
    help: "Claude Opus 5 for schema review → Cursor Sonnet 5",
  },
  {
    id: 5,
    title: "Durable task identity",
    status: "LIVE",
    outcome: "UUID, parent ID, schema version, timestamps, source, owner, target, and privacy on every new packet.",
    help: "Cursor Composer 2.5",
  },
  {
    id: 6,
    title: "Authenticated write-back",
    status: "WALLED",
    outcome: "Claims, status, blockers, approvals, and results return to the shared ledger.",
    blocker: "The hub is a static nginx site and has no private Google OAuth/service-account boundary.",
    ask: "Jorge: provide a dedicated service account or approve migration from Sheets to an authenticated database.",
    help: "GPT-5.6 Sol for backend implementation → Claude Opus 5 security review",
  },
  {
    id: 7,
    title: "Aging and escalation",
    status: "LIVE",
    outcome: "Pending records show age and stale warnings from the ledger update date.",
    help: "Cursor Composer 2.5",
  },
  {
    id: 8,
    title: "Executable routing",
    status: "LIVE",
    outcome: "Intent selection resolves an owner surface/model and applies a quota warning before packet creation.",
    help: "Cursor Grok 4.6",
  },
  {
    id: 9,
    title: "Provider quota telemetry",
    status: "WALLED",
    outcome: "Real usage counters replace policy-only quota warnings.",
    blocker: "Consumer subscription usage is not exposed through one common API and cannot be inferred safely.",
    ask: "Jorge: approve provider API credentials or a manual budget-import format for each surface.",
    help: "Grok Heavy for provider research → GPT-5.6 Sol for adapters",
  },
  {
    id: 10,
    title: "Public / private separation",
    status: "BUILDING",
    outcome: "Public guide metadata stays static; task packets remain device-local until authenticated storage exists.",
    blocker: "localStorage is device-local, not encrypted shared storage; it must never receive secrets.",
    ask: "Jorge: approve identity provider and retention policy before private synchronization.",
    help: "Claude Opus 5 security design",
  },
  {
    id: 11,
    title: "Stable machine endpoint",
    status: "LIVE",
    outcome: "/.well-known/area-67.json publishes versioned, privacy-safe schemas and capability state.",
    help: "Cursor Composer 2.5",
  },
  {
    id: 12,
    title: "Compact navigation and filters",
    status: "LIVE",
    outcome: "Jump links separate Bridge, Compose, Inbox, Roadmap, Pending, Bots, and Ledger.",
    help: "Cursor Composer 2.5",
  },
  {
    id: 13,
    title: "Provenance and audit receipts",
    status: "LIVE",
    outcome: "Packets record creator, context scope, validation, approval, and revision metadata.",
    help: "Cursor Sonnet 5",
  },
  {
    id: 14,
    title: "Automated tests",
    status: "BUILDING",
    outcome: "Routing, packet validation, schema adaptation, approval walls, and redaction are regression-tested.",
    help: "ChatGPT Codex or Cursor Sol",
  },
  {
    id: 15,
    title: "Artifact promotion pipeline",
    status: "WALLED",
    outcome: "promote_asset moves approved stills, motion exports, and launch copy into durable shared storage.",
    blocker: "No private object store or provider media connector is configured.",
    ask: "Jorge: choose R2, Google Drive, or Railway storage and approve retention/access rules.",
    help: "Grok Imagine for assets → Cursor Sol for storage integration",
  },
];

export function renderRoadmap(): string {
  const totals = {
    LIVE: ROADMAP.filter((item) => item.status === "LIVE").length,
    BUILDING: ROADMAP.filter((item) => item.status === "BUILDING").length,
    WALLED: ROADMAP.filter((item) => item.status === "WALLED").length,
  };
  const items = ROADMAP.map(
    (item) => `<article class="roadmap-card status-${item.status.toLowerCase()}">
      <div class="roadmap-head">
        <span class="step-number">${item.id.toString().padStart(2, "0")}</span>
        <span class="badge ${item.status === "LIVE" ? "ok" : item.status === "BUILDING" ? "warn" : "bad"}">${item.status}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.outcome)}</p>
      ${item.blocker ? `<p class="roadmap-blocker"><strong>Blocker:</strong> ${esc(item.blocker)}</p>` : ""}
      ${item.ask ? `<p class="roadmap-ask"><strong>Needed:</strong> ${esc(item.ask)}</p>` : ""}
      <p class="muted small"><strong>Best help:</strong> ${esc(item.help)}</p>
    </article>`,
  ).join("");

  return `<section class="roadmap" id="roadmap" aria-labelledby="roadmap-title">
    <header class="section-heading">
      <div><p class="eyebrow">Area 67 implementation map</p><h2 id="roadmap-title">Bridge roadmap</h2></div>
      <div class="roadmap-totals">
        <span class="badge ok">${totals.LIVE} LIVE</span>
        <span class="badge warn">${totals.BUILDING} BUILDING</span>
        <span class="badge bad">${totals.WALLED} WALLED</span>
      </div>
    </header>
    <p class="muted small">WALLED means an external credential, infrastructure choice, provider capability, or Jorge approval is required. It does not mean work disappeared.</p>
    <div class="roadmap-grid">${items}</div>
  </section>`;
}
