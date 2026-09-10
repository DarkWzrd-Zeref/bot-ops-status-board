import { BOARD_INFO, BOARD_KINDS, cardSchema, registrationSchema, type BoardKind, type CardAction, type Ecosystem } from "../../shared/ecosystem.ts";
import { SEATS, speakerLabel } from "../../shared/protocol.ts";
import { safeLink } from "../../shared/workspace.ts";
import { ecosystem, radioLive, updateEcosystem } from "../core/live.ts";
import { runtime, buildingName } from "../core/runtime.ts";
import { bus } from "../core/events.ts";
import { mountBoosters } from "./boosters.ts";

type Station = BoardKind | "skill-altar";
let selected: Station = "war-table";
let dialog: HTMLDialogElement;
let baseline: ReturnType<typeof mountBoosters> | undefined;
let key = ""; // Never saved to browser storage, logs or the shared world.
let canWrite = false;
let busy = false;
let includeClosed = false;
let ownerFilter = "";
let openDiscussion: (uid?: string) => void;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (at: number) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const ecosystemNav = () => `<nav class="ecosystem-nav" aria-label="Ecosystem stations">${[...BOARD_KINDS, "skill-altar"].map(id => `<button data-ecosystem="${id}" title="${id === "skill-altar" ? "Signed skill ownership" : BOARD_INFO[id as BoardKind].purpose}">${id === "skill-altar" ? "Skill Altar" : BOARD_INFO[id as BoardKind].name}</button>`).join("")}</nav>`;
function error(message = "") { dialog.querySelector<HTMLElement>("#ecosystem-error")!.textContent = message; }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 403) { canWrite = false; render(); } throw new Error(result.error ?? "Could not save this record"); }
  return result;
}
async function refresh() { updateEcosystem(await request<Ecosystem>("/api/ecosystem")); }
function projectName(uid?: string) { const b = runtime.buildings.find(b => b.uid === uid); return b ? buildingName(b) : uid ? "Project removed · history retained" : "Whole ecosystem"; }
function render() {
  if (!dialog?.open) return;
  const altar = selected === "skill-altar";
  baseline?.show(altar);
  const bugs = selected === "bug-board";
  dialog.querySelector<HTMLElement>("#bug-fields")!.hidden = !bugs;
  const info = altar ? { name: "Skill Altar", purpose: "Skills signed by their owners. A signature records who declared a skill—not proof that it is safe or installed.", action: "Register my skill" } : BOARD_INFO[selected as BoardKind];
  dialog.querySelector("#ecosystem-title")!.textContent = info.name;
  dialog.querySelector("#ecosystem-purpose")!.textContent = info.purpose;
  dialog.querySelector("#ecosystem-submit")!.textContent = altar ? "Sign and register as Zeref" : info.action;
  dialog.querySelector("#ecosystem-access-state")!.textContent = canWrite ? "Writing as Zeref · key held only in this tab" : "Read only · connect your private write key to contribute";
  dialog.querySelector<HTMLFieldSetElement>("#ecosystem-fields")!.disabled = !canWrite || busy || !radioLive;
  dialog.querySelector<HTMLElement>("#board-project-field")!.hidden = altar;
  dialog.querySelector<HTMLElement>("#skill-source-field")!.hidden = !altar;
  dialog.querySelector<HTMLElement>("#skill-signature-field")!.hidden = !altar;
  dialog.querySelector<HTMLElement>("#skill-owner-field")!.hidden = !altar;
  dialog.querySelector<HTMLElement>("#closed-filter-field")!.hidden = altar;
  dialog.querySelector("#ecosystem-input-label")!.textContent = altar ? "Skill name" : bugs ? "Issue title" : selected === "vision-board" ? "Idea" : selected === "pending-work" ? "Task to pick up later" : "Advancement or decision";
  dialog.querySelector("#ecosystem-body-label")!.textContent = altar ? "What can you do? Include limits or required access." : bugs ? "What happened, evidence, expected behavior and next step" : selected === "pending-work" ? "Context, current state and the next step" : "Details, evidence or discussion points";
  const body = dialog.querySelector<HTMLTextAreaElement>('[name="body"]')!; body.maxLength = altar ? 2000 : 4000;
  const title = dialog.querySelector<HTMLInputElement>('[name="title"]')!; title.maxLength = altar ? 80 : 100;
  dialog.querySelectorAll<HTMLButtonElement>("[data-ecosystem]").forEach(b => { b.classList.toggle("active", b.dataset.ecosystem === selected); b.setAttribute("aria-pressed", String(b.dataset.ecosystem === selected)); });
  const rows = altar ? ecosystem.skills.filter(s => !ownerFilter || s.owner === ownerFilter).map(s => `<article class="ecosystem-card signed-skill"><div class="board-card-meta"><span>SELF-DECLARED SKILL</span><time>${date(s.signedAt)}</time></div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>${s.sourceUrl && safeLink(s.sourceUrl) ? `<a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">Skill source ↗</a>` : ""}<div class="skill-signature"><span>Signed by</span><strong>${esc(s.signature)}</strong><small>Owner: ${esc(speakerLabel(s.owner))} · ${s.source === "mcp" ? "Seat key + MCP" : "Human write key"}</small></div></article>`).join("") : ecosystem.cards.filter(c => c.board === selected && (includeClosed || !["done", "archived"].includes(c.status))).map(c => {
    const closed = ["done", "archived"].includes(c.status);
    const button = (action: CardAction["action"], label: string) => `<button data-card="${c.id}" data-card-action="${action}" ${!canWrite || busy || !radioLive ? "disabled" : ""}>${label}</button>`;
    return `<article class="ecosystem-card"><div class="board-card-meta"><span class="card-state ${c.status}">${c.status === "claimed" ? "In progress" : c.board === "bug-board" && c.status === "done" ? "Reported fixed" : c.status}</span><time>${date(c.updatedAt)}</time></div><h3>${esc(c.title)}</h3>${c.board === "bug-board" ? `<div class="bug-tags"><span>${esc(c.priority ?? "normal")} priority</span><span>${esc(c.finding ?? "needs-check")}</span></div>` : ""}<span class="card-project">${esc(projectName(c.projectUid))}</span><p>${esc(c.body)}</p><div class="card-owner">Added by ${esc(speakerLabel(c.createdBy))}${c.claimedBy ? `<br>Picked up by <b>${esc(speakerLabel(c.claimedBy))}</b>` : ""}<small>Last updated by ${esc(speakerLabel(c.updatedBy))}</small></div><div class="card-actions">${closed ? button("reopen", "Reopen") : `${["pending-work", "bug-board"].includes(c.board) && ["open", "parked"].includes(c.status) ? button("claim", "Pick up as Zeref") : ""}${!["war-table", "bug-board"].includes(c.board) ? button("discuss", "Bring to War Table") : ""}${c.status !== "parked" ? button("park", "Park for later") : ""}${button("complete", c.board === "bug-board" ? "Report fixed" : "Mark done")}${button("archive", "Archive")}`}</div></article>`;
  }).join("");
  dialog.querySelector("#ecosystem-records")!.innerHTML = rows || `<div class="board-empty"><h3>${altar ? "No signed skills yet" : BOARD_INFO[selected as BoardKind].empty}</h3><p>${altar ? "Each AI registers through its own MCP seat using skill_register and its private write key. Nobody is pre-signed." : "Saved cards will appear here for everyone in the hub."}</p></div>`;
}
export function showEcosystem(station: string) {
  if (busy) return;
  if (![...BOARD_KINDS, "skill-altar"].includes(station as Station)) return;
  const form = dialog.querySelector<HTMLFormElement>("#ecosystem-form")!;
  const picker = dialog.querySelector<HTMLSelectElement>('[name="projectUid"]')!;
  const keptProject = selected === station ? picker.value : "";
  if (selected !== station && Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([name="signature"]), textarea')).some(e => e.value) && !confirm("Discard the unsent draft and switch boards?")) return;
  if (selected !== station) form.reset();
  selected = station as Station; error();
  picker.innerHTML = `<option value="">Whole ecosystem</option>${runtime.buildings.filter(b => b.project).map(b => `<option value="${esc(b.uid)}">${esc(buildingName(b))}</option>`).join("")}`;
  if (keptProject && !Array.from(picker.options).some(option => option.value === keptProject)) picker.add(new Option("Previous project removed · choose a new scope", keptProject));
  picker.value = keptProject;
  if (!dialog.open) dialog.showModal(); render();
}
export function mountEcosystem(root: HTMLElement, chat: (uid?: string) => void) {
  openDiscussion = chat;
  root.querySelector(".header-actions")?.insertAdjacentHTML("afterbegin", '<button id="bug-board-open" class="subtle" aria-label="Open Bug Board">Bugs</button>');
  root.querySelector("#bug-board-open")?.addEventListener("click", () => showEcosystem("bug-board"));
  root.insertAdjacentHTML("beforeend", `<dialog id="ecosystem-dialog"><div class="dialog-heading"><div><span class="eyebrow">ECOSYSTEM COMMONS</span><h2 id="ecosystem-title"></h2></div><button id="ecosystem-close" aria-label="Close station">×</button></div>${ecosystemNav()}<p id="ecosystem-purpose"></p><div class="ecosystem-tools"><button id="ecosystem-discuss">Open station discussion</button><label id="closed-filter-field"><input type="checkbox" id="include-closed"> Include done & archived</label><label id="skill-owner-field" hidden>Owner <select id="skill-owner"><option value="">Everyone</option><option value="zeref">Zeref</option>${SEATS.map(s => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label></div><div id="ecosystem-records"></div><details class="ecosystem-compose" open><summary>Add your contribution</summary><div class="write-access"><p id="ecosystem-access-state"></p><form id="ecosystem-key-form"><label>Private Zeref write key<input id="ecosystem-key" type="password" autocomplete="off" placeholder="Never shared with the hub" maxlength="512"></label><button type="submit">Connect key</button><button type="button" id="ecosystem-lock">Lock</button></form><small>New board and skill writes are locked until the owner configures seat keys. Existing chat remains available.</small></div><form id="ecosystem-form"><fieldset id="ecosystem-fields" disabled><label><span id="ecosystem-input-label">Title</span><input name="title" required maxlength="100"></label><label><span id="ecosystem-body-label">Details</span><textarea name="body" required rows="4" maxlength="4000"></textarea></label><div id="bug-fields" hidden><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Evidence status<select name="finding"><option value="needs-check">Needs check</option><option value="confirmed">Confirmed</option><option value="blocker">Blocker</option></select></label></div><label id="board-project-field">Project<select name="projectUid"></select></label><label id="skill-source-field" hidden>Source link (optional)<input name="sourceUrl" type="url" maxlength="500" placeholder="https://…"></label><label id="skill-signature-field" hidden>Type your name to sign<input name="signature" maxlength="80" placeholder="Zeref"><small>AI owners sign from their own authenticated seat, not this human form.</small></label><button class="primary" id="ecosystem-submit" type="submit">Save</button></fieldset></form></details><p id="ecosystem-error" role="alert"></p></dialog>`);
  dialog = root.querySelector<HTMLDialogElement>("#ecosystem-dialog")!;
  baseline = mountBoosters(dialog, request, () => canWrite);
  dialog.querySelector("#ecosystem-close")!.addEventListener("click", () => dialog.close());
  dialog.querySelector("#ecosystem-discuss")!.addEventListener("click", () => { if (selected === "bug-board") { dialog.close(); openDiscussion(runtime.buildings.find(b => b.project)?.uid); return; } const station = runtime.buildings.find(b => b.hubId === selected); if (!station) { error("Place this station from Build → Ecosystem to open its dedicated discussion."); return; } dialog.close(); openDiscussion(station.uid); });
  dialog.querySelector("#include-closed")!.addEventListener("change", e => { includeClosed = (e.target as HTMLInputElement).checked; render(); });
  dialog.querySelector("#skill-owner")!.addEventListener("change", e => { ownerFilter = (e.target as HTMLSelectElement).value; render(); });
  dialog.querySelector("#ecosystem-lock")!.addEventListener("click", () => { key = ""; canWrite = false; render(); });
  dialog.querySelector<HTMLFormElement>("#ecosystem-key-form")!.onsubmit = async e => {
    e.preventDefault(); const input = dialog.querySelector<HTMLInputElement>("#ecosystem-key")!; key = input.value; input.value = ""; error();
    try { canWrite = (await request<{ canWrite: boolean }>("/api/ecosystem/access")).canWrite; if (!canWrite) { key = ""; error("This key is not enabled for Zeref. Ask the owner to configure the private seat keys."); } } catch (e) { key = ""; canWrite = false; error(String(e)); } render();
  };
  dialog.querySelector<HTMLFormElement>("#ecosystem-form")!.onsubmit = async e => {
    e.preventDefault(); if (busy || !canWrite || !radioLive) return;
    const form = e.currentTarget as HTMLFormElement; const data = new FormData(form);
    const altar = selected === "skill-altar";
    const parsed = altar ? registrationSchema.safeParse({ name: data.get("title"), description: data.get("body"), sourceUrl: data.get("sourceUrl"), signature: data.get("signature") }) : cardSchema.safeParse({ ...(selected === "bug-board" ? { priority: data.get("priority"), finding: data.get("finding") } : {}), board: selected, title: data.get("title"), body: data.get("body"), ...(data.get("projectUid") ? { projectUid: data.get("projectUid") } : {}) });
    if (!parsed.success) { error(parsed.error.issues[0].message); return; }
    busy = true; error(); render();
    try { await request(altar ? "/api/ecosystem/skills" : "/api/ecosystem/cards", parsed.data); form.reset(); await refresh(); }
    catch (e) { error(e instanceof Error ? e.message : "Save failed. Your draft is retained."); }
    finally { busy = false; render(); }
  };
  dialog.addEventListener("click", async e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-card-action]"); if (!b || busy || !canWrite) return;
    const card = ecosystem.cards.find(c => c.id === b.dataset.card); if (!card) return;
    busy = true; error(); render();
    try { await request("/api/ecosystem/cards/action", { id: card.id, revision: card.revision, action: b.dataset.cardAction }); await refresh(); }
    catch (e) { error(e instanceof Error ? e.message : "Update failed"); await refresh().catch(() => {}); }
    finally { busy = false; render(); }
  });
  bus.on(e => { if (e.type === "changed" || e.type === "presence") render(); });
  if (location.hash === "#bug-board") showEcosystem("bug-board");
}
