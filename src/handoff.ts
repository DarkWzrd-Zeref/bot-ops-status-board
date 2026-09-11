import { EFFICIENCY_GUIDE } from "./efficiency";
import { esc } from "./render";

export const HANDOFF_SCHEMA = "area67.handoff.v1";
export const PACKET_STATUSES = ["READY", "CLAIMED", "WORKING", "REVIEW", "BLOCKED", "DONE"] as const;
export type PacketStatus = (typeof PACKET_STATUSES)[number];
export type ContractName = keyof typeof EFFICIENCY_GUIDE.mcp_bus.handoff_contract;

export interface HandoffPacket {
  schema: typeof HANDOFF_SCHEMA;
  task_id: string;
  parent_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  status: PacketStatus;
  privacy: "private_device_only";
  source: string;
  route: {
    intent: string;
    owner: string;
    quota_guard: string;
  };
  contract: {
    type: ContractName;
    payload: Record<string, string>;
  };
  provenance: {
    created_by: "area_67_hub";
    context_scope: "task_only";
    public_sync: false;
  };
  audit: {
    validation: string[];
    approved_by: string | null;
    revision: number;
  };
}

const STORAGE_KEY = "area67.handoffs.v1";

export function routeIntent(intent: string): { owner: string; quotaGuard: string } {
  const route = EFFICIENCY_GUIDE.router.find((entry) => entry.if === intent);
  const owner = route?.then ?? "claude:opus_5 -> cursor:grok_4_6";
  const expensive = /fable|astra|gpt56_sol/.test(owner);
  const quotaGuard = expensive
    ? "ESCALATED: confirm complexity before spending protected model quota"
    : "PASS: standard or capability-owned route";
  return { owner, quotaGuard };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `a67-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPacket(input: {
  intent: string;
  contract: ContractName;
  source: string;
  parentId?: string;
  payload: Record<string, string>;
}): HandoffPacket {
  const now = new Date().toISOString();
  const route = routeIntent(input.intent);
  const required = EFFICIENCY_GUIDE.mcp_bus.handoff_contract[input.contract];
  const missing = required.filter((field) => !(input.payload[field] ?? "").trim());
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(", ")}`);
  return {
    schema: HANDOFF_SCHEMA,
    task_id: uuid(),
    parent_id: input.parentId?.trim() || null,
    version: 1,
    created_at: now,
    updated_at: now,
    status: "READY",
    privacy: "private_device_only",
    source: input.source.trim() || "jorge:area67",
    route: { intent: input.intent, owner: route.owner, quota_guard: route.quotaGuard },
    contract: { type: input.contract, payload: input.payload },
    provenance: { created_by: "area_67_hub", context_scope: "task_only", public_sync: false },
    audit: { validation: ["required_fields", "task_id", "privacy_boundary"], approved_by: null, revision: 1 },
  };
}

function loadPackets(): HandoffPacket[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as HandoffPacket[]) : [];
  } catch {
    return [];
  }
}

function savePackets(packets: HandoffPacket[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packets.slice(0, 50)));
}

const fieldLabels: Record<string, string> = {
  goal: "Goal",
  constraints: "Constraints",
  stack: "Stack / environment",
  done_when: "Done when",
  owner_model: "Requested owner model",
  paths: "Paths",
  touch_list: "Files to touch",
  do_not_break: "Do not break",
  pr: "PR or branch",
  tests: "Tests run",
  risks: "Risks",
  still_prompt: "Still prompt",
  motion_prompt: "Motion prompt",
  refs: "References",
  pr_url: "PR URL",
  exports: "Exports",
  launch_copy: "Launch copy",
};

function renderContractFields(): string {
  return Object.entries(EFFICIENCY_GUIDE.mcp_bus.handoff_contract)
    .map(([contract, fields], index) => `<div class="packet-fields" data-contract="${esc(contract)}" ${index ? "hidden" : ""}>
      ${fields.map((field) => `<label class="field"><span>${esc(fieldLabels[field] ?? field)}</span><textarea name="${esc(`${contract}.${field}`)}" rows="2" required ${index ? "disabled" : ""}></textarea></label>`).join("")}
    </div>`)
    .join("");
}

function renderPacketCard(packet: HandoffPacket): string {
  const nextIndex = Math.min(PACKET_STATUSES.indexOf(packet.status) + 1, PACKET_STATUSES.length - 1);
  const next = PACKET_STATUSES[nextIndex];
  const title = packet.contract.payload.goal ?? packet.contract.payload.pr ?? packet.contract.payload.still_prompt ?? packet.contract.type;
  return `<article class="packet-card">
    <div class="queue-card-head">
      <h3>${esc(title)}</h3>
      <span class="badge ${packet.status === "DONE" ? "ok" : packet.status === "BLOCKED" ? "bad" : "info"}">${packet.status}</span>
    </div>
    <p class="muted small">${esc(packet.task_id)} · v${packet.version} · ${esc(packet.contract.type)}</p>
    <p><strong>Route:</strong> ${esc(packet.route.owner)}</p>
    <p class="muted small">${esc(packet.route.quota_guard)}</p>
    <div class="packet-actions">
      <button class="btn ghost packet-copy" data-task="${esc(packet.task_id)}" type="button">Copy</button>
      <button class="btn ghost packet-download" data-task="${esc(packet.task_id)}" type="button">Download</button>
      ${packet.status !== "DONE" ? `<button class="btn ghost packet-advance" data-task="${esc(packet.task_id)}" type="button">Move to ${next}</button>` : ""}
    </div>
  </article>`;
}

export function renderHandoffBridge(): string {
  const intentOptions = EFFICIENCY_GUIDE.router
    .map((route) => `<option value="${esc(route.if)}">${esc(route.if.replaceAll("_", " "))} → ${esc(route.then)}</option>`)
    .join("");
  const contractOptions = Object.keys(EFFICIENCY_GUIDE.mcp_bus.handoff_contract)
    .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
    .join("");
  const packets = loadPackets();

  return `<section class="handoff-bridge" id="compose" aria-labelledby="compose-title">
    <header class="section-heading">
      <div><p class="eyebrow">Private device workspace</p><h2 id="compose-title">Compose a handoff</h2></div>
      <span class="pill info">${packets.length} local packet${packets.length === 1 ? "" : "s"}</span>
    </header>
    <div class="privacy-warning"><strong>Private boundary:</strong> packets stay in this browser only. They are not on the public sheet or machine endpoint. Do not enter secrets; authenticated encrypted sync is still WALLED.</div>
    <form id="handoff-form" class="handoff-form">
      <div class="form-grid">
        <label class="field"><span>Task intent</span><select name="intent">${intentOptions}</select></label>
        <label class="field"><span>Contract</span><select id="contract-type" name="contract">${contractOptions}</select></label>
        <label class="field"><span>Source</span><input name="source" value="jorge:area67" required /></label>
        <label class="field"><span>Parent task ID (optional)</span><input name="parent_id" placeholder="UUID of upstream task" /></label>
      </div>
      ${renderContractFields()}
      <div class="row">
        <button class="btn" type="submit">Route + create private packet</button>
        <a class="btn ghost machine-link" href="${import.meta.env.BASE_URL}.well-known/area-67.json" target="_blank">Machine endpoint</a>
      </div>
      <p id="handoff-message" class="muted small" role="status"></p>
    </form>
    <div id="inbox" class="local-inbox">
      <h3>Local inbox / outbox</h3>
      ${packets.length ? `<div class="packet-grid">${packets.map(renderPacketCard).join("")}</div>` : `<p class="muted">No local packets. Create one above; authenticated cross-device delivery remains on the roadmap.</p>`}
    </div>
  </section>`;
}

function packetById(id: string): HandoffPacket | undefined {
  return loadPackets().find((packet) => packet.task_id === id);
}

function downloadPacket(packet: HandoffPacket): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${packet.task_id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function bindHandoffBridge(refresh: () => void): void {
  const contractSelect = document.querySelector<HTMLSelectElement>("#contract-type");
  contractSelect?.addEventListener("change", () => {
    document.querySelectorAll<HTMLElement>(".packet-fields").forEach((group) => {
      const active = group.dataset.contract === contractSelect.value;
      group.hidden = !active;
      group.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((field) => (field.disabled = !active));
    });
  });

  document.querySelector<HTMLFormElement>("#handoff-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const contract = String(data.get("contract")) as ContractName;
    const payload: Record<string, string> = {};
    for (const field of EFFICIENCY_GUIDE.mcp_bus.handoff_contract[contract]) {
      payload[field] = String(data.get(`${contract}.${field}`) ?? "");
    }
    const message = form.querySelector<HTMLElement>("#handoff-message");
    try {
      const packet = createPacket({
        intent: String(data.get("intent")),
        contract,
        source: String(data.get("source")),
        parentId: String(data.get("parent_id")),
        payload,
      });
      savePackets([packet, ...loadPackets()]);
      refresh();
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".packet-copy").forEach((button) => button.addEventListener("click", async () => {
    const packet = packetById(button.dataset.task ?? "");
    if (packet) await navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
  }));
  document.querySelectorAll<HTMLButtonElement>(".packet-download").forEach((button) => button.addEventListener("click", () => {
    const packet = packetById(button.dataset.task ?? "");
    if (packet) downloadPacket(packet);
  }));
  document.querySelectorAll<HTMLButtonElement>(".packet-advance").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.task ?? "";
    const packets = loadPackets();
    const packet = packets.find((entry) => entry.task_id === id);
    if (!packet) return;
    const current = PACKET_STATUSES.indexOf(packet.status);
    packet.status = PACKET_STATUSES[Math.min(current + 1, PACKET_STATUSES.length - 1)];
    packet.updated_at = new Date().toISOString();
    packet.version += 1;
    packet.audit.revision += 1;
    savePackets(packets);
    refresh();
  }));
}
