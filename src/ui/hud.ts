import { BUILD_TABS } from "../build/palworld.ts";
import { bus } from "../core/events.ts";
import { AGENTS, SKILLS, assignAgent, beginMove, cancelMove, catalogForTab, demolish, equipSkill, grantsFor, hubById, runScan, runtime } from "../core/runtime.ts";
import { attention, postRadio, presenceBySeat, radioLive, radioNotes } from "../core/live.ts";
import { SEATS, seatForPal, speakerLabel, type Speaker, type Channel } from "../../shared/protocol.ts";

let channel: Channel = "command";
let onlyDirectives = false;
let replyTo: string | undefined;
let sending = false;
let sound = false;
const unread: Record<Channel, number> = { command: 0, team: 0 };
let draft = sessionStorage.getItem("area67-draft") ?? "";
let recipient: Speaker | "all" = "all";
let directive = true;
let audio: AudioContext | undefined;
let host: HTMLElement;
const stateLabels = { attentive: "Listening", busy: "Working", away: "Away", offline: "Offline" };
const receiptLabels = { seen: "Seen", accepted: "Working", completed: "Done", blocked: "Blocked" };
export function characterKind(model: string) { return /grok/i.test(model) ? "robot" : "alien"; }
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function time(at: number) { return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function ago(at?: number) {
  if (!at) return "Never checked in";
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return seconds < 60 ? "Just now" : seconds < 3600 ? Math.floor(seconds / 60) + "m ago" : Math.floor(seconds / 3600) + "h ago";
}
function portrait(id: string, large = false) {
  const def = AGENTS.find(a => a.id === id);
  const hue = id === "director" ? 175 : id === "grok-am-b" ? 25 : id === "claude" ? 275 : id === "researcher" ? 65 : 0;
  return `<span class="portrait ${large ? "large" : ""}" style="--hue:${hue}deg;--seat-color:${def?.color ?? "#6ff5c3"}"><img src="/characters/${characterKind(def?.model ?? "")}.png" alt="" /></span>`;
}
function light(seat: Speaker) {
  const state = attention(seat);
  return `<span class="status-light ${state}" aria-hidden="true"></span><span>${stateLabels[state]}</span>`;
}
function flash(text: string, tone = "info") {
  const toast = host.querySelector<HTMLElement>("#toast")!;
  toast.textContent = text; toast.dataset.tone = tone; toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4500);
}
function update(selector: string, value: string) {
  const element = host.querySelector<HTMLElement>(selector)!;
  if (element.dataset.rendered === value) return;
  // Presence ticks must not close expanded details or interrupt a station picker.
  if (element.contains(document.activeElement) && document.activeElement?.matches("select")) return;
  const open = Array.from(element.querySelectorAll("details")).map(d => d.open);
  element.innerHTML = value;
  element.querySelectorAll("details").forEach((d, i) => { if (open[i] !== undefined) d.open = open[i]; });
  element.dataset.rendered = value;
}
function counts() {
  const seats = SEATS.filter(s => ["attentive", "busy"].includes(attention(s.id))).length;
  const pending = radioNotes.filter(n => n.directive && n.recipients.some(s => n.receipts[s]?.state !== "completed"));
  return { seats, pending, blocked: pending.filter(n => Object.values(n.receipts).some(r => r?.state === "blocked")).length };
}
function roster() {
  return SEATS.map(s => {
    const a = runtime.agents.find(a => a.id === s.palId);
    const building = runtime.buildings.find(b => b.uid === a?.buildingUid);
    const p = presenceBySeat.get(s.id);
    const state = attention(s.id);
    const tasks = radioNotes.filter(n => n.directive && n.recipients.includes(s.id) && n.receipts[s.id]?.state !== "completed").length;
    return `<button class="seat-row ${runtime.selectedAgent === s.palId ? "selected" : ""} ${state}" data-agent="${s.palId}" title="${esc(p?.activity ?? "Waiting for this AI to connect")}">
      ${portrait(s.palId!)}<span class="seat-copy"><strong>${s.label}</strong><span class="seat-state">${light(s.id)}</span><small>${esc(p?.activity ?? "Waiting for a check-in")}</small></span>
      ${tasks ? `<span class="count-badge" title="${tasks} pending directives">${tasks}</span>` : ""}
      <span class="seat-arrow">›</span></button>
      ${runtime.selectedAgent === s.palId ? `<div class="seat-extra">${s.model}<br>Last check-in: ${ago(p?.lastSeen)}<br>${building ? esc(hubById(building.hubId).name) : "No station assigned"}</div>` : ""}`;
  }).join("");
}
function messageItems() {
  const rows = radioNotes.filter(n => n.channel === channel && (!onlyDirectives || n.directive)).filter((n, i) => i < 100 || (n.directive && n.recipients.some(s => n.receipts[s]?.state !== "completed"))).reverse();
  if (!rows.length) return `<div class="empty-thread"><span class="empty-symbol">⌁</span><h3>${onlyDirectives ? "No directives here yet" : "The channel is open"}</h3><p>Choose a teammate below and send a directive. Their receipt will appear when they check in.</p></div>`;
  return rows.map(n => {
    const replies = n.replyTo ? radioNotes.find(r => r.id === n.replyTo) : undefined;
    return `<article class="message ${n.directive ? "directive" : ""} ${n.from === "zeref" ? "commander-message" : ""}">
      <div class="message-meta"><span class="message-author">${esc(speakerLabel(n.from))}</span><span>${n.to === "all" ? "Everyone" : "→ " + esc(speakerLabel(n.to))}</span><time datetime="${new Date(n.at).toISOString()}">${time(n.at)}</time></div>
      ${n.directive ? '<span class="directive-label">DIRECTIVE</span>' : ""}
      ${replies ? `<blockquote>Reply to ${esc(speakerLabel(replies.from))}: ${esc(replies.text.slice(0, 100))}</blockquote>` : ""}
      <p class="message-body">${esc(n.text)}</p>
      ${n.directive ? `<div class="receipt-grid">${n.recipients.map(s => {
        const r = n.receipts[s];
        return `<span class="receipt ${r?.state ?? "pending"}" title="${esc(r?.detail || (r ? "Updated " + time(r.at) : "Waiting for this AI to read the directive"))}">${esc(speakerLabel(s))}<b>${r ? receiptLabels[r.state] : "Pending"}</b></span>`;
      }).join("")}</div>` : ""}
      ${Object.entries(n.receipts).filter(([, r]) => r?.detail).map(([s, r]) => `<div class="receipt-detail"><b>${esc(speakerLabel(s as Speaker))}:</b> ${esc(r!.detail!)}</div>`).join("")}
      <button class="reply-button" data-reply="${n.id}">↳ Reply</button>
    </article>`;
  }).join("");
}
function inspector() {
  const a = runtime.agents.find(a => a.id === runtime.selectedAgent);
  const b = runtime.buildings.find(b => b.uid === runtime.selectedBuilding);
  if (a) {
    const def = AGENTS.find(d => d.id === a.id)!;
    const seat = seatForPal(a.id);
    return `<div class="inspector-title">${portrait(a.id, true)}<div><span class="eyebrow">${esc(def.role)}</span><h2>${esc(def.name)}</h2><span class="seat-state">${seat ? light(seat.id) : "Support pal · no independent connection"}</span></div><button class="subtle close-inspector" data-clear aria-label="Close detail">×</button></div>
      <p>${esc(def.bio)}</p><div class="detail-stats"><span>Identity<b>${esc(def.model)}</b></span><span>Connection<b>${seat ? ago(presenceBySeat.get(seat.id)?.lastSeen) : "Unconnected role"}</b></span></div>
      <div class="detail-actions">${seat ? `<button class="primary" data-address="${seat.id}">Send directive ↗</button>` : ""}<button data-focus="${a.id}">Locate on map</button></div>
      <label class="field-label">Assigned station<select id="assign-station" data-pal="${a.id}"><option value="">Unassigned</option>${runtime.buildings.map(b => `<option value="${b.uid}" ${a.buildingUid === b.uid ? "selected" : ""}>${esc(hubById(b.hubId).name)}</option>`).join("")}</select></label>
      <details><summary>Capabilities & skills</summary><p class="microcopy">Station capabilities: ${grantsFor(a.id).map(esc).join(", ") || "None"}<br>Equipped: ${a.skills.map(esc).join(", ") || "None"}<br>Station assignments describe roles; external tools still require a running, authorized client.</p>${skills(a.id)}</details>`;
  }
  if (b) {
    const h = hubById(b.hubId);
    return `<span class="eyebrow">Station / ${esc(h.kind)}</span><h2>${esc(h.name)}</h2><p>${esc(h.blurb)}</p><p class="microcopy">Assigned: ${runtime.agents.filter(a => a.buildingUid === b.uid).map(a => esc(AGENTS.find(d => d.id === a.id)!.name)).join(", ") || "No pals yet"}</p><div class="detail-actions">${h.placeable ? `<button data-lift="${b.uid}">Move station</button><button class="danger" data-demo="${b.uid}">Dismantle</button>` : "Command core"}</div>`;
  }
  const c = counts();
  return `<span class="eyebrow">Command overview</span><h2>Your team. One signal.</h2><p>Select a teammate to see their attention, assignment and capabilities.</p>
    <div class="overview-metrics"><span><b>${c.seats}<small>/${SEATS.length}</small></b>Checking in</span><span><b>${c.pending.length}</b>Open directives</span><span><b>${c.blocked}</b>Need help</span></div>
    <details><summary>How attention works</summary><p class="microcopy">Green: checked in within 2 minutes. Blue: reported working. Amber: away or check-in expired. Gray: no check-in for 10 minutes. Map movement alone is not proof of attention.</p></details>
    <details><summary>Support pals & skills</summary><div class="support-pals">${AGENTS.filter(a => !seatForPal(a.id)).map(a => `<button data-agent="${a.id}">${esc(a.name)}</button>`).join("")}</div>${skills()}</details>`;
}
function skills(pal?: string) {
  return SKILLS.map(s => `<div class="skill-item"><div><strong>${esc(s.name)}</strong><small>${runtime.scans[s.id]?.risk_assessment.recommendation ?? "Not scanned"}</small></div><button data-scan="${s.id}">Scan</button>${pal ? `<button data-equip="${s.id}" data-onto="${pal}">Equip</button>` : ""}</div>`).join("");
}
function buildTools() {
  const mode = runtime.mode;
  return `<div class="build-toolbar"><div class="mode-buttons">${[["play", "Explore"], ["build", "Build"], ["move", "Move"], ["demolish", "Dismantle"]].map(([id, label]) => `<button data-mode="${id}" class="${mode === id ? "active" : ""}">${label}</button>`).join("")}</div><span class="microcopy">${runtime.buildings.length} stations · ${runtime.agents.length} pals</span></div>
    ${mode === "build" || mode === "move" ? `<div class="build-catalog"><div class="build-tabs">${BUILD_TABS.map(t => `<button class="${runtime.buildTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}</div><div class="station-options">${catalogForTab().map(h => `<button data-hub="${h.id}" class="${runtime.ghostHub === h.id ? "active" : ""}" title="${esc(h.blurb)}"><span style="background:${h.color}"></span>${esc(h.short)}</button>`).join("")}</div><p class="microcopy">Choose a station, then place it inside the green boundary. Esc cancels.</p></div>` : ""}`;
}
function render() {
  const c = counts();
  host.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(b => { const ch = b.dataset.channel as Channel; b.textContent = "# " + ch + (unread[ch] ? " · " + unread[ch] + " new" : ""); });
  update("#connection", `<span class="status-light ${radioLive ? "attentive" : "offline"}"></span>${radioLive ? "Hub connected" : "Reconnecting…"}`);
  update("#roster", roster());
  update("#team-count", c.seats + " / " + SEATS.length + " active");
  update("#inspector-content", inspector());
  update("#build-tools", buildTools());
  update("#mission-summary", `<span class="eyebrow">ACTIVE OPERATIONS</span><strong>${c.pending.length ? c.pending.length + " open directive" + (c.pending.length === 1 ? "" : "s") : "Ready for your next directive"}</strong><span>${c.blocked ? c.blocked + " need your attention" : c.seats + " teammates checking in"}</span>`);
  const log = host.querySelector<HTMLElement>("#message-log")!;
  const bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 65;
  const scroll = log.scrollTop;
  update("#message-log", messageItems());
  log.scrollTop = bottom ? log.scrollHeight : scroll;
  update("#reply-context", replyTo ? `Replying to ${esc(speakerLabel(radioNotes.find(n => n.id === replyTo)?.from ?? "zeref"))}<button type="button" data-cancel-reply aria-label="Cancel reply">×</button>` : "");
  update("#queue-hint", !radioLive ? "Connection lost. Your draft is saved here." : recipient !== "all" && attention(recipient) === "offline" ? speakerLabel(recipient) + " is offline. Your directive will wait in their inbox." : "Ctrl + Enter to send · Shift + Enter for a new line");
}
export function mountHud(root: HTMLElement) {
  host = root;
  root.innerHTML = `
    <header class="app-header"><a class="brand" href="/" aria-label="AREA 67 home"><span class="brand-mark">67</span><span>AREA <b>67</b><small>COMMAND CENTER</small></span></a>
      <div class="header-center"><span class="breadcrumb">Operations</span><span>/</span><strong>Command deck</strong></div>
      <div class="header-actions"><span id="connection" class="connection"></span><button class="subtle" id="connect-button">Connect AI ↗</button><span class="commander-avatar">Z</span><span class="commander-name">Zeref<small>Commander</small></span></div></header>
    <aside class="crew-panel"><div class="section-heading"><h2>Crew manifest</h2><span id="team-count"></span></div><div id="roster"></div><div class="presence-legend"><span><i class="status-light attentive"></i>Listening</span><span><i class="status-light busy"></i>Working</span><span><i class="status-light away"></i>Away</span><span><i class="status-light offline"></i>Offline</span></div><div class="crew-footer"><b>Attention needs a check-in.</b><p>Green fades when a teammate stops contacting the hub.</p></div></aside>
    <div class="world-overlay"><div class="world-heading"><span class="eyebrow">SECTOR 01 / THE PALBOX</span><h1>AREA 67</h1><span>Alien minds. Machine muscle.</span></div><div id="mission-summary"></div><div class="world-controls"><button data-camera="out" aria-label="Zoom out">−</button><button data-camera="home" aria-label="Center map">⌖</button><button data-camera="in" aria-label="Zoom in">+</button></div><div class="world-caption"><span>Click to explore · select a pal to assign</span><span>WASD move · scroll to zoom</span></div></div>
    <section class="operations-panel"><div id="build-tools"></div><div id="inspector-content"></div></section>
    <aside class="comms-panel"><div class="comms-heading"><div><span class="eyebrow">LIVE COMMUNICATIONS</span><h2>Command channel</h2></div><button id="sound-toggle" class="subtle" aria-pressed="false" title="Toggle message sound">Sound off</button></div>
      <div class="channel-tabs"><button data-channel="command" class="active"># command</button><button data-channel="team"># team</button></div>
      <div class="channel-description">Directives, acknowledgements, and progress.</div><label class="filter-toggle"><input id="directives-only" type="checkbox"> Directives only</label>
      <div id="message-log" role="log" aria-label="Channel messages" aria-live="off"></div>
      <form id="radio-form"><div id="reply-context"></div><div class="composer-options"><label>To <select id="recipient" aria-label="Message recipient"><option value="all">Everyone</option>${SEATS.map(s => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label><select id="message-type" aria-label="Message type"><option value="directive">Directive</option><option value="message">Message</option></select></div>
      <textarea id="radio-text" rows="3" maxlength="2000" placeholder="Give your team a clear directive…" aria-label="Your message">${esc(draft)}</textarea>
      <div class="composer-footer"><span id="character-count">${draft.length} / 2000</span><button class="primary" id="send-message" type="submit">Send directive ↗</button></div><p id="queue-hint"></p></form></aside>
    <dialog id="connect-dialog"><div class="dialog-heading"><div><span class="eyebrow">BRING YOUR TEAM ONLINE</span><h2>Connect a teammate</h2></div><button data-close-dialog aria-label="Close">×</button></div><p>Give each AI its own endpoint. Once connected, ask it to check its inbox and acknowledge your directive.</p><div class="connect-seats">${SEATS.map(s => `<div><strong>${s.label}</strong><code>${location.origin}/mcp/${s.slug}</code><button data-copy="${s.slug}">Copy</button></div>`).join("")}</div><div class="connection-note"><b>The AI must be running.</b><p>Connecting tools does not wake an idle AI app. Ask it to call <code>hub_sync</code> while active and <code>directive_ack</code> to report progress. Attention expires after two minutes without a check-in.</p></div></dialog>
    <div id="toast" role="status" aria-live="polite"></div>`;
  bind();
  render();
  host.querySelector<HTMLElement>("#message-log")!.scrollTop = 1e9;
  bus.on(e => {
    if (e.type === "changed" || e.type === "presence" || e.type === "radio") render();
    if (e.type === "toast") flash(e.text, e.tone);
    if (e.type === "radio" && e.note.from !== "zeref") {
      if (e.note.channel !== channel) { unread[e.note.channel]++; render(); }
      flash(speakerLabel(e.note.from) + ": " + e.note.text.slice(0, 110));
      if (sound && audio) { const o = audio.createOscillator(); const g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.frequency.value = 620; g.gain.setValueAtTime(0.06, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18); o.start(); o.stop(audio.currentTime + 0.2); }
    }
  });
}
function bind() {
  host.addEventListener("click", event => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.agent) { runtime.selectedAgent = b.dataset.agent; runtime.selectedBuilding = null; }
    if (b.hasAttribute("data-clear")) { runtime.selectedAgent = null; runtime.selectedBuilding = null; }
    if (b.dataset.focus) bus.emit({ type: "focus-agent", agentId: b.dataset.focus });
    if (b.dataset.address) { recipient = b.dataset.address as Speaker; host.querySelector<HTMLSelectElement>("#recipient")!.value = recipient; host.querySelector<HTMLTextAreaElement>("#radio-text")!.focus(); }
    if (b.dataset.mode) {
      if (runtime.lifting) cancelMove();
      runtime.mode = b.dataset.mode as typeof runtime.mode;
      if (runtime.mode !== "build") runtime.ghostHub = null;
    }
    if (b.dataset.tab) { runtime.buildTab = b.dataset.tab as typeof runtime.buildTab; runtime.mode = "build"; runtime.ghostHub = null; }
    if (b.dataset.hub) { runtime.ghostHub = b.dataset.hub; runtime.mode = "build"; }
    if (b.dataset.lift) beginMove(b.dataset.lift);
    if (b.dataset.demo && confirm("Dismantle this station and unassign its pals?")) demolish(b.dataset.demo);
    if (b.dataset.scan) void runScan(b.dataset.scan);
    if (b.dataset.equip) equipSkill(b.dataset.onto!, b.dataset.equip);
    if (b.dataset.channel) {
      channel = b.dataset.channel as Channel;
      unread[channel] = 0;
      host.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(button => button.classList.toggle("active", button.dataset.channel === channel));
      host.querySelector(".comms-heading h2")!.textContent = channel === "command" ? "Command channel" : "Team channel";
      host.querySelector(".channel-description")!.textContent = channel === "command" ? "Directives, acknowledgements, and progress." : "Shared coordination. Addressed messages are visible to the whole hub.";
    }
    if (b.dataset.reply) { replyTo = b.dataset.reply; directive = false; host.querySelector<HTMLSelectElement>("#message-type")!.value = "message"; host.querySelector("#send-message")!.textContent = "Send message ↗"; recipient = radioNotes.find(n => n.id === replyTo)?.from ?? "all"; host.querySelector<HTMLSelectElement>("#recipient")!.value = recipient === "zeref" ? "all" : recipient; if (recipient === "zeref") recipient = "all"; host.querySelector<HTMLTextAreaElement>("#radio-text")!.focus(); }
    if (b.hasAttribute("data-cancel-reply")) replyTo = undefined;
    if (b.id === "connect-button") host.querySelector<HTMLDialogElement>("#connect-dialog")!.showModal();
    if (b.hasAttribute("data-close-dialog")) host.querySelector<HTMLDialogElement>("#connect-dialog")!.close();
    if (b.dataset.copy) void navigator.clipboard.writeText(location.origin + "/mcp/" + b.dataset.copy).then(() => flash("Endpoint copied")).catch(() => flash("Copy unavailable. Select the endpoint text to copy it.", "warn"));
    if (b.dataset.camera) window.dispatchEvent(new CustomEvent("area67-camera", { detail: b.dataset.camera }));
    if (b.id === "sound-toggle") { sound = !sound; if (sound) { audio ??= new AudioContext(); void audio.resume(); } b.textContent = sound ? "Sound on" : "Sound off"; b.setAttribute("aria-pressed", String(sound)); }
    render(); bus.emit({ type: "changed" });
  });
  host.addEventListener("change", event => {
    const el = event.target as HTMLSelectElement;
    if (el.id === "recipient") recipient = el.value as Speaker | "all";
    if (el.id === "message-type") { directive = el.value === "directive"; host.querySelector("#send-message")!.textContent = directive ? "Send directive ↗" : "Send message ↗"; }
    if (el.id === "directives-only") onlyDirectives = (el as unknown as HTMLInputElement).checked;
    if (el.id === "assign-station") assignAgent(el.dataset.pal!, el.value || null);
    render();
  });
  const input = host.querySelector<HTMLTextAreaElement>("#radio-text")!;
  input.oninput = () => { draft = input.value; sessionStorage.setItem("area67-draft", draft); host.querySelector("#character-count")!.textContent = draft.length + " / 2000"; };
  input.onkeydown = event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); host.querySelector<HTMLFormElement>("#radio-form")!.requestSubmit(); } };
  host.querySelector<HTMLFormElement>("#radio-form")!.onsubmit = async event => {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    const button = host.querySelector<HTMLButtonElement>("#send-message")!;
    sending = true; button.disabled = true; button.textContent = "Sending…";
    const submitted = draft;
    try {
      await postRadio("zeref", submitted, { channel, to: recipient, directive, replyTo });
      if (draft === submitted) { draft = ""; input.value = ""; sessionStorage.removeItem("area67-draft"); }
      replyTo = undefined;
      flash(directive ? "Directive queued. Receipts appear when teammates check in." : "Message sent");
      render(); host.querySelector<HTMLElement>("#message-log")!.scrollTop = 1e9;
    } catch (e) { flash(e instanceof Error ? e.message : "Send failed. Your draft is safe.", "bad"); }
    finally { sending = false; button.disabled = false; button.textContent = directive ? "Send directive ↗" : "Send message ↗"; host.querySelector("#character-count")!.textContent = draft.length + " / 2000"; }
  };
}
