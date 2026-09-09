import { BUILD_TABS } from "../build/palworld.ts";
import { bus } from "../core/events.ts";
import { AGENTS, SKILLS, assignAgent, beginMove, cancelMove, catalogForTab, demolish, equipSkill, grantsFor, hubById, runScan, runtime, buildingName, prepareProject, updateProject } from "../core/runtime.ts";
import { attention, postRadio, presenceBySeat, radioLive, radioNotes, workReports, liveWork, markHumanPingSeen } from "../core/live.ts";
import { SEATS, seatForPal, speakerLabel, type Speaker, type Channel } from "../../shared/protocol.ts";
import { projectSchema, safeLink } from "../../shared/workspace.ts";
import { mountEcosystem, showEcosystem, ecosystemNav } from "./ecosystem.ts";

let channel: Channel = "team";
let onlyDirectives = false;
let replyTo: string | undefined;
let sending = false;
let sound = false;
const unread: Record<Channel, number> = { command: 0, team: 0 };
let draft = sessionStorage.getItem("area67-draft") ?? "";
let recipient: Speaker | "all" = "all";
let directive = false;
let audio: AudioContext | undefined;
let host: HTMLElement;
let friendsOpen = localStorage.getItem("area67-friends") ? localStorage.getItem("area67-friends") !== "collapsed" : innerWidth > 700;
let chatOpen = localStorage.getItem("area67-chat") !== "collapsed";
let chatProject: string | undefined;
let editingProject: string | undefined;
let friendsOnlineOnly = false;
let inspectedKey = "";
const stateLabels = { attentive: "Online", busy: "Online · working", away: "Away", offline: "Offline" };
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
  const rank = { busy: 0, attentive: 1, away: 2, offline: 3 };
  const seats = [...SEATS].sort((a, b) => rank[attention(a.id)] - rank[attention(b.id)]);
  const visible = friendsOnlineOnly ? seats.filter(s => ["busy", "attentive"].includes(attention(s.id))) : seats;
  return visible.map(s => {
    const a = runtime.agents.find(a => a.id === s.palId);
    const building = runtime.buildings.find(b => b.uid === a?.buildingUid);
    const p = presenceBySeat.get(s.id);
    const state = attention(s.id);
    const tasks = radioNotes.filter(n => n.directive && n.recipients.includes(s.id) && n.receipts[s.id]?.state !== "completed").length;
    return `<button class="seat-row ${runtime.selectedAgent === s.palId ? "selected" : ""} ${state}" data-agent="${s.palId}" aria-label="${s.label}: ${stateLabels[state]}" title="${s.label} · ${esc(p?.activity ?? "Waiting for this AI to connect")}">
      ${portrait(s.palId!)}<span class="seat-copy"><strong><span class="status-light ${state}" aria-hidden="true"></span>${s.label}</strong><span class="seat-state">${stateLabels[state]} · ${ago(p?.lastSeen)}</span><small>${esc(p?.activity ?? "Waiting for a check-in")}</small></span>
      ${tasks ? `<span class="count-badge" title="${tasks} pending directives">${tasks}</span>` : ""}
      <span class="seat-arrow">›</span></button>
      ${runtime.selectedAgent === s.palId ? `<div class="seat-extra">${s.model}<br>Last check-in: ${ago(p?.lastSeen)}<br>${building ? esc(hubById(building.hubId).name) : "No station assigned"}</div>` : ""}`;
  }).join("") || `<p class="microcopy">No seats checking in. Show all friends to ping someone.</p>`;
}
function messageItems() {
  const rows = radioNotes.filter(n => n.channel === channel && (!chatProject || n.projectUid === chatProject) && (!onlyDirectives || n.directive)).filter((n, i) => i < 100 || (n.directive && n.recipients.some(s => n.receipts[s]?.state !== "completed")) || (n.ping && n.recipients.some(s => !n.receipts[s]))).reverse();
  if (!rows.length) return `<div class="empty-thread"><span class="empty-symbol">⌁</span><h3>${onlyDirectives ? "No directives here yet" : "The channel is open"}</h3><p>Choose a teammate below and send a directive. Their receipt will appear when they check in.</p></div>`;
  return rows.map(n => {
    const replies = n.replyTo ? radioNotes.find(r => r.id === n.replyTo) : undefined;
    return `<article class="message ${n.directive ? "directive" : ""} ${n.from === "zeref" ? "commander-message" : ""}">
      <div class="message-meta"><span class="message-author">${esc(speakerLabel(n.from))}</span><span>${n.to === "all" ? "Everyone" : "→ " + esc(speakerLabel(n.to))}</span><time datetime="${new Date(n.at).toISOString()}">${time(n.at)}</time></div>
      ${n.directive ? '<span class="directive-label">DIRECTIVE</span>' : n.ping ? '<span class="directive-label ping-label">ATTENTION PING</span>' : ""}
      ${n.projectUid ? `<span class="message-project">${esc(scopeName(n.projectUid))}</span>` : ""}
      ${replies ? `<blockquote>Reply to ${esc(speakerLabel(replies.from))}: ${esc(replies.text.slice(0, 100))}</blockquote>` : ""}
      <p class="message-body">${esc(n.text)}</p>
      ${n.directive || n.ping ? `<div class="receipt-grid">${n.recipients.map(s => {
        const r = n.receipts[s];
        return `<span class="receipt ${r?.state ?? "pending"}" title="${esc(r?.detail || (r ? "Updated " + time(r.at) : "Queued until this AI checks its inbox"))}">${esc(speakerLabel(s))}<b>${r ? receiptLabels[r.state] : "Queued"}</b></span>`;
      }).join("")}</div>` : ""}
      ${Object.entries(n.receipts).filter(([, r]) => r?.detail).map(([s, r]) => `<div class="receipt-detail"><b>${esc(speakerLabel(s as Speaker))}:</b> ${esc(r!.detail!)}</div>`).join("")}
      <button class="reply-button" data-reply="${n.id}">↳ Reply</button>
      ${n.ping && n.recipients.includes("zeref") && !n.receipts.zeref ? `<button data-seen-ping="${n.id}">Mark ping seen</button>` : ""}
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
      <div class="detail-actions">${seat ? `<button class="primary" data-address="${seat.id}">Message</button><button data-ping="${seat.id}">Ping ${esc(seat.label)}</button>` : ""}<button data-focus="${a.id}">Locate</button></div>
      ${seat ? workCard(workReports.find(w => w.seat === seat.id)) : ""}
      <label class="field-label">Assigned station<select id="assign-station" data-pal="${a.id}"><option value="">Unassigned</option>${runtime.buildings.map(b => `<option value="${b.uid}" ${a.buildingUid === b.uid ? "selected" : ""}>${esc(buildingName(b))}</option>`).join("")}</select></label>
      <details><summary>Capabilities & skills</summary><p class="microcopy">Station capabilities: ${grantsFor(a.id).map(esc).join(", ") || "None"}<br>Equipped: ${a.skills.map(esc).join(", ") || "None"}<br>Station assignments describe roles; external tools still require a running, authorized client.</p>${skills(a.id)}</details>`;
  }
  if (b) {
    const h = hubById(b.hubId);
    const project = b.project;
    return `<div class="project-banner"><span class="eyebrow">${project ? "PROJECT WORKSPACE" : "STATION / " + esc(h.kind)}</span><button data-clear class="subtle close-inspector" aria-label="Close detail">×</button><h2>${esc(buildingName(b))}</h2><p>${esc(project?.summary || h.blurb)}</p></div>
      ${project ? `<div class="project-links">${project.repoUrl && safeLink(project.repoUrl) ? `<a href="${esc(project.repoUrl)}" target="_blank" rel="noopener noreferrer">Open repository ↗</a>` : ""}${project.workspace ? `<label>Workspace<code>${esc(project.workspace)}</code></label>` : ""}</div><div class="contents-tags">${project.contents.map(c => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
      <div class="detail-actions">${h.kind === "ecosystem" ? `<button class="primary" data-ecosystem="${h.id}">Open ${esc(h.name)}</button>` : ""}<button data-project-chat="${b.uid}">${h.kind === "ecosystem" ? "Discussion" : "Open project chat"}</button><button data-ping-project="${b.uid}">Ping assigned crew</button></div>
      <label class="field-label">Gather a teammate<select id="project-assign" data-building="${b.uid}"><option value="">Choose a friend…</option>${SEATS.map(s => `<option value="${s.palId}">${s.label}</option>`).join("")}</select></label>
      <p class="microcopy">Assigned: ${runtime.agents.filter(a => a.buildingUid === b.uid).map(a => esc(AGENTS.find(d => d.id === a.id)!.name)).join(", ") || "No pals yet"}</p>
      <div class="workspace-work">${workReports.filter(w => w.buildingUid === b.uid).map(workCard).join("") || '<p class="microcopy">No work reported yet. Connected agents use work_report with this building’s ID.</p>'}</div><code class="building-id">${esc(b.uid)}</code>
      <div class="detail-actions">${project ? `<button data-edit-project="${b.uid}">Edit sign</button>` : ""}${h.placeable ? `<button data-lift="${b.uid}">Move</button><button class="danger" data-demo="${b.uid}">${project ? "Remove from map" : "Dismantle"}</button>` : "Command core"}</div>`;
  }
  const c = counts();
  return `<span class="eyebrow">Command overview</span><h2>Your team. One signal.</h2><p>Select a teammate to see their attention, assignment and capabilities.</p>
    <div class="overview-metrics"><span><b>${c.seats}<small>/${SEATS.length}</small></b>Checking in</span><span><b>${c.pending.length}</b>Open directives</span><span><b>${c.blocked}</b>Need help</span></div>
    <details><summary>How attention works</summary><p class="microcopy">Green: checked in within 2 minutes. Blue: reported working. Amber: away or check-in expired. Gray: no check-in for 10 minutes. Map movement alone is not proof of attention.</p></details>
    <details><summary>Support pals & skills</summary><div class="support-pals">${AGENTS.filter(a => !seatForPal(a.id)).map(a => `<button data-agent="${a.id}">${esc(a.name)}</button>`).join("")}</div>${skills()}</details>`;
}
function workCard(work?: typeof workReports[number]) {
  if (!work) return "";
  const live = liveWork().some(w => w.seat === work.seat);
  return `<div class="work-card ${live ? "live" : work.state}"><span>${esc(speakerLabel(work.seat))}<b>${live ? "● Working" : work.state === "working" ? "Last report · stale" : work.state === "done" ? "Done" : "Blocked"}</b></span><strong>${esc(work.taskId)}</strong><p>${esc(work.activity)}</p><small>Self-reported · ${ago(work.updatedAt)}</small>${work.artifacts.filter(safeLink).map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Evidence ${i + 1} ↗</a>`).join("")}</div>`;
}
function projects() {
  const buildings = runtime.buildings.filter(b => b.project);
  return `<div class="projects-heading"><h2>Projects <small>${buildings.length}</small></h2><button data-new-project aria-label="Add project building">+</button></div>${buildings.map(b => `<button class="project-row ${runtime.selectedBuilding === b.uid ? "selected" : ""}" data-select-building="${b.uid}"><span class="project-cube">▤</span><span><b>${esc(buildingName(b))}</b><small>${liveWork(b.uid).length ? liveWork(b.uid).length + " working" : "Workspace"}</small></span></button>`).join("") || '<p class="microcopy">Turn a repo or folder into a shared building.</p>'}`;
}
function skills(pal?: string) {
  return SKILLS.map(s => `<div class="skill-item"><div><strong>${esc(s.name)}</strong><small>${runtime.scans[s.id]?.risk_assessment.recommendation ?? "Not scanned"}</small></div><button data-scan="${s.id}">Scan</button>${pal ? `<button data-equip="${s.id}" data-onto="${pal}">Equip</button>` : ""}</div>`).join("");
}
function buildTools() {
  const mode = runtime.mode;
  return `<div class="build-toolbar"><div class="mode-buttons"><button data-new-project>+ Project</button>${[["play", "Explore"], ["build", "Build"], ["move", "Move"]].map(([id, label]) => `<button data-mode="${id}" class="${mode === id ? "active" : ""}">${label}</button>`).join("")}</div></div>
    ${mode === "build" || mode === "move" ? `<div class="build-catalog"><div class="build-tabs">${BUILD_TABS.map(t => `<button class="${runtime.buildTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}</div><div class="station-options">${catalogForTab().map(h => `<button data-hub="${h.id}" class="${runtime.ghostHub === h.id ? "active" : ""}" title="${esc(h.blurb)}"><span style="background:${h.color}"></span>${esc(h.short)}</button>`).join("")}</div><p class="microcopy">Choose a station, then place it inside the green boundary. Esc cancels.</p></div>` : ""}`;
}
function render() {
  const c = counts();
  const selected = runtime.selectedAgent || runtime.selectedBuilding || "";
  if (selected && selected !== inspectedKey && innerWidth < 1000) chatOpen = false;
  inspectedKey = selected;
  document.documentElement.classList.toggle("friends-collapsed", !friendsOpen);
  document.documentElement.classList.toggle("chat-collapsed", !chatOpen);
  host.classList.toggle("inspecting", !!runtime.selectedAgent || !!runtime.selectedBuilding || runtime.mode !== "play");
  host.querySelector("#friends-toggle")?.setAttribute("aria-expanded", String(friendsOpen));
  host.querySelector("#chat-launcher")?.setAttribute("aria-expanded", String(chatOpen));
  update("#chat-launcher", `Chat <span>${unread.command + unread.team || "⌁"}</span>`);
  host.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(b => { const ch = b.dataset.channel as Channel; b.classList.toggle("active", ch === channel); b.textContent = "# " + ch + (unread[ch] ? " · " + unread[ch] + " new" : ""); });
  update("#connection", `<span class="status-light ${radioLive ? "attentive" : "offline"}"></span>${radioLive ? "Hub connected" : "Reconnecting…"}`);
  update("#roster", roster());
  update("#human-presence", `<span class="status-light ${attention("zeref")}" aria-hidden="true"></span>Zeref <small>${stateLabels[attention("zeref")]}</small>`);
  update("#project-list", projects());
  update("#chat-scope", chatProject ? `<span>${esc(scopeName(chatProject))}</span><button data-global-chat>All chat ×</button>` : `<span>Everyone in the hub</span><button data-ping="all">Ping crew</button>`);
  host.querySelector(".comms-heading h2")!.textContent = channel === "command" ? "Command channel" : "Team chat";
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
  update("#queue-hint", !radioLive ? "Connection lost. Your draft is saved here." : recipient !== "all" && attention(recipient) === "offline" ? speakerLabel(recipient) + " is offline. Your message will wait in their inbox." : "Ctrl + Enter to send · Shift + Enter for a new line");
}
export function mountHud(root: HTMLElement) {
  host = root;
  root.innerHTML = `
    <header class="app-header"><a class="brand" href="/" aria-label="AREA 67 home"><span class="brand-mark">67</span><span>AREA <b>67</b><small>COMMAND CENTER</small></span></a>
      <div class="header-center"><span class="breadcrumb">Operations</span><span>/</span><strong>Command deck</strong></div>
      <div class="header-actions"><span id="connection" class="connection"></span><button class="subtle" id="connect-button">Connect AI ↗</button><span class="commander-avatar">Z</span><span class="commander-name">Zeref<small>Commander</small></span></div></header>
    <aside class="crew-panel"><div class="friends-heading"><button id="friends-toggle" aria-label="Toggle friends list" aria-controls="roster">☷</button><div><h2>Friends</h2><span id="team-count"></span></div></div><label class="friends-filter"><input id="online-only" type="checkbox"> Online only</label><div id="roster"></div><div class="crew-footer"><b>Live check-ins</b><p>Online lights fade when a seat stops checking in.</p></div><div id="project-list"></div></aside>
    <div class="world-overlay"><div class="world-heading"><span class="eyebrow">SECTOR 01 / THE PALBOX</span><h1>AREA 67</h1><span>Alien minds. Machine muscle.</span></div><div id="mission-summary"></div><div class="world-controls"><button data-camera="out" aria-label="Zoom out">−</button><button data-camera="home" aria-label="Center map">⌖</button><button data-camera="in" aria-label="Zoom in">+</button></div><div class="world-caption"><span>Click to explore · select a pal to assign</span><span>WASD move · scroll to zoom</span></div></div>
    <section class="operations-panel"><div id="build-tools"></div><div id="inspector-content"></div></section>
    <button id="chat-launcher" aria-controls="chat-panel" aria-expanded="true">Chat</button><aside class="comms-panel" id="chat-panel"><div class="comms-heading"><div><span class="eyebrow">LIVE COMMUNICATIONS</span><h2>Team chat</h2></div><button id="sound-toggle" class="subtle" aria-pressed="false" title="Toggle message sound">Sound off</button><button id="chat-minimize" class="subtle" aria-label="Minimize chat">−</button></div>
      <div class="channel-tabs"><button data-channel="command"># command</button><button data-channel="team" class="active"># team</button></div><div id="chat-scope"></div>
      <div class="channel-description">Shared coordination. Addressed messages are visible to the hub.</div><label class="filter-toggle"><input id="directives-only" type="checkbox"> Directives only</label>
      <div id="message-log" role="log" aria-label="Channel messages" aria-live="off"></div>
      <form id="radio-form"><div id="reply-context"></div><div class="composer-options"><label>To <select id="recipient" aria-label="Message recipient"><option value="all">Everyone</option>${SEATS.map(s => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label><select id="message-type" aria-label="Message type"><option value="message">Message</option><option value="directive">Directive</option></select></div>
      <textarea id="radio-text" rows="2" maxlength="2000" placeholder="Talk to the team, share a task, ask for help…" aria-label="Your message">${esc(draft)}</textarea>
      <div class="composer-footer"><span id="character-count">${draft.length} / 2000</span><button class="primary" id="send-message" type="submit">Send message ↗</button></div><p id="queue-hint"></p></form></aside>
    <dialog id="project-dialog"><form id="project-form"><div class="dialog-heading"><div><span class="eyebrow">BUILD A SHARED WORKSPACE</span><h2 id="project-dialog-title">Add project building</h2></div><button type="button" data-close-project aria-label="Close project form">×</button></div><p>Link a repo or name a project folder, then place its building on the map. No repository or files are created, accessed, or deleted.</p><label class="field-label">Building name<input name="name" required maxlength="64" placeholder="My project"></label><label class="field-label">Repository URL<input name="repoUrl" type="url" maxlength="300" placeholder="https://github.com/owner/repository"></label><label class="field-label">Workspace or project folder<input name="workspace" maxlength="240" placeholder="e.g. projects / web-app"></label><label class="field-label">What happens here?<input name="summary" maxlength="300" placeholder="Purpose, scope, or current mission"></label><label class="field-label">Contents — one item per line<textarea name="contents" rows="3" placeholder="src / interface&#10;server / API&#10;tests / verification"></textarea></label><p id="project-error" role="alert"></p><div class="detail-actions"><button class="primary" id="project-submit" type="submit">Choose a plot ↗</button><button type="button" data-close-project>Cancel</button></div></form></dialog>
    <dialog id="connect-dialog"><div class="dialog-heading"><div><span class="eyebrow">BRING YOUR TEAM ONLINE</span><h2>Connect a teammate</h2></div><button data-close-dialog aria-label="Close">×</button></div><p>Give each AI its own endpoint. Once connected, ask it to check its inbox and acknowledge your directive.</p><div class="connect-seats">${SEATS.map(s => `<div><strong>${s.label}</strong><code>${location.origin}/mcp/${s.slug}</code><button data-copy="${s.slug}">Copy</button></div>`).join("")}</div><div class="connection-note"><b>The AI must be running.</b><p>Connecting tools does not wake an idle AI app. Ask it to call <code>hub_sync</code> while active and <code>directive_ack</code> to report progress. Attention expires after two minutes without a check-in.</p></div></dialog>
    <div id="toast" role="status" aria-live="polite"></div>`;
  root.querySelector(".header-center")!.innerHTML = ecosystemNav();
  root.querySelector(".friends-filter")!.insertAdjacentHTML("beforebegin", '<div id="human-presence" class="human-presence"></div>');
  root.querySelector(".crew-footer")!.insertAdjacentHTML("beforeend", ecosystemNav());
  root.insertAdjacentHTML("beforeend", '<form id="quick-chat" aria-label="Quick team message"><label for="quick-text" class="sr-only">Message everyone as Zeref</label><input id="quick-text" maxlength="2000" placeholder="Message everyone as Zeref…" autocomplete="off"><button type="submit">Send</button></form>');
  mountEcosystem(root, openChat);
  bind();
  render();
  host.querySelector<HTMLElement>("#message-log")!.scrollTop = 1e9;
  bus.on(e => {
    if (e.type === "changed" || e.type === "presence" || e.type === "radio") render();
    if (e.type === "toast") flash(e.text, e.tone);
    if (e.type === "radio" && e.note.from !== "zeref") {
      if (!chatOpen || e.note.channel !== channel || (chatProject && e.note.projectUid !== chatProject)) { unread[e.note.channel]++; render(); }
      flash(speakerLabel(e.note.from) + ": " + e.note.text.slice(0, 110));
      if (sound && audio) { const o = audio.createOscillator(); const g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.frequency.value = 620; g.gain.setValueAtTime(0.06, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18); o.start(); o.stop(audio.currentTime + 0.2); }
    }
  });
}
function showProjectForm(uid?: string) {
  editingProject = uid;
  const dialog = host.querySelector<HTMLDialogElement>("#project-dialog")!;
  const form = host.querySelector<HTMLFormElement>("#project-form")!;
  form.reset();
  const info = runtime.buildings.find(b => b.uid === uid)?.project;
  for (const key of ["name", "repoUrl", "workspace", "summary"] as const) (form.elements.namedItem(key) as HTMLInputElement).value = info?.[key] ?? "";
  (form.elements.namedItem("contents") as HTMLTextAreaElement).value = info?.contents.join("\n") ?? "";
  host.querySelector("#project-dialog-title")!.textContent = uid ? "Edit project sign" : "Add project building";
  host.querySelector("#project-submit")!.textContent = uid ? "Save sign" : "Choose a plot ↗";
  host.querySelector("#project-error")!.textContent = "";
  dialog.showModal();
}
function scopeName(uid: string) { const b = runtime.buildings.find(b => b.uid === uid); return b ? buildingName(b) : "Removed station · history"; }
function openChat(projectUid?: string) {
  if (chatProject !== projectUid) replyTo = undefined;
  chatProject = projectUid; chatOpen = true; channel = "team"; onlyDirectives = false;
  host.querySelector<HTMLInputElement>("#directives-only")!.checked = false;
  host.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(b => b.classList.toggle("active", b.dataset.channel === "team"));
  host.querySelector(".comms-heading h2")!.textContent = "Team chat";
  unread.team = 0;
  render(); host.querySelector<HTMLTextAreaElement>("#radio-text")!.focus();
}
async function pingSeats(seats: (Speaker | "all")[], projectUid?: string) {
  if (!radioLive) { flash("Reconnect to queue your ping.", "warn"); return; }
  if (!seats.length) { flash("Assign a teammate to this workspace first.", "warn"); return; }
  const name = runtime.buildings.find(b => b.uid === projectUid)?.project?.name;
  try {
    await Promise.all(seats.map(to => postRadio("zeref", `Attention requested${name ? " at " + name : " in the hub"}. Please check in and read the shared conversation.`, { channel: "team", to, ping: true, projectUid })));
    openChat(projectUid);
    flash("Ping queued. Seen appears after the agent reads it. An idle AI app still needs to be running.");
  } catch (error) { flash(error instanceof Error ? error.message : "Ping could not be queued.", "bad"); }
}
function bind() {
  host.addEventListener("click", event => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.ecosystem) showEcosystem(b.dataset.ecosystem);
    if (b.dataset.seenPing) void markHumanPingSeen(b.dataset.seenPing).catch(() => flash("Could not acknowledge ping. Please retry.", "bad"));
    if (b.hasAttribute("data-new-project")) showProjectForm();
    if (b.dataset.editProject) showProjectForm(b.dataset.editProject);
    if (b.hasAttribute("data-close-project")) host.querySelector<HTMLDialogElement>("#project-dialog")!.close();
    if (b.dataset.selectBuilding) { runtime.selectedBuilding = b.dataset.selectBuilding; runtime.selectedAgent = null; if (innerWidth < 1000) chatOpen = false; if (innerWidth <= 700) friendsOpen = false; }
    if (b.dataset.projectChat) openChat(b.dataset.projectChat);
    if (b.hasAttribute("data-global-chat")) openChat();
    if (b.dataset.ping) void pingSeats([b.dataset.ping as Speaker | "all"], chatProject);
    if (b.dataset.pingProject) void pingSeats(SEATS.filter(s => runtime.agents.find(a => a.id === s.palId)?.buildingUid === b.dataset.pingProject).map(s => s.id), b.dataset.pingProject);
    if (b.id === "friends-toggle") { friendsOpen = !friendsOpen; localStorage.setItem("area67-friends", friendsOpen ? "open" : "collapsed"); }
    if (b.id === "chat-launcher" || b.id === "chat-minimize") { chatOpen = !chatOpen; localStorage.setItem("area67-chat", chatOpen ? "open" : "collapsed"); if (chatOpen) unread[channel] = 0; }
    if (b.dataset.agent) { runtime.selectedAgent = b.dataset.agent; runtime.selectedBuilding = null; if (innerWidth < 1000) chatOpen = false; if (innerWidth <= 700) friendsOpen = false; }
    if (b.hasAttribute("data-clear")) { runtime.selectedAgent = null; runtime.selectedBuilding = null; }
    if (b.dataset.focus) bus.emit({ type: "focus-agent", agentId: b.dataset.focus });
    if (b.dataset.address) { recipient = b.dataset.address as Speaker; host.querySelector<HTMLSelectElement>("#recipient")!.value = recipient; openChat(); }
    if (b.dataset.mode) {
      if (runtime.lifting) cancelMove();
      runtime.mode = b.dataset.mode as typeof runtime.mode;
      if (runtime.mode !== "build") runtime.ghostHub = null;
    }
    if (b.dataset.tab) { runtime.buildTab = b.dataset.tab as typeof runtime.buildTab; runtime.mode = "build"; runtime.ghostHub = null; }
    if (b.dataset.hub) { if (b.dataset.hub === "project-site") showProjectForm(); else { runtime.ghostHub = b.dataset.hub; runtime.ghostProject = null; runtime.mode = "build"; } }
    if (b.dataset.lift) beginMove(b.dataset.lift);
    if (b.dataset.demo && confirm(runtime.buildings.find(item => item.uid === b.dataset.demo)?.project ? "Remove this building from the map and unassign its pals? The repository and project files will NOT be deleted." : "Dismantle this station and unassign its pals?")) demolish(b.dataset.demo);
    if (b.dataset.scan) void runScan(b.dataset.scan);
    if (b.dataset.equip) equipSkill(b.dataset.onto!, b.dataset.equip);
    if (b.dataset.channel) {
      channel = b.dataset.channel as Channel;
      unread[channel] = 0;
      host.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(button => button.classList.toggle("active", button.dataset.channel === channel));
      host.querySelector(".comms-heading h2")!.textContent = channel === "command" ? "Command channel" : "Team channel";
      host.querySelector(".channel-description")!.textContent = channel === "command" ? "Directives, acknowledgements, and progress." : "Shared coordination. Addressed messages are visible to the whole hub.";
    }
    if (b.dataset.reply) { const note = radioNotes.find(n => n.id === b.dataset.reply); openChat(note?.projectUid); replyTo = b.dataset.reply; channel = note?.channel ?? "team"; directive = false; host.querySelector<HTMLSelectElement>("#message-type")!.value = "message"; host.querySelector("#send-message")!.textContent = "Send message ↗"; recipient = note?.from ?? "all"; host.querySelector<HTMLSelectElement>("#recipient")!.value = recipient === "zeref" ? "all" : recipient; if (recipient === "zeref") recipient = "all"; host.querySelector<HTMLTextAreaElement>("#radio-text")!.focus(); }
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
    if (el.id === "online-only") friendsOnlineOnly = (el as unknown as HTMLInputElement).checked;
    if (el.id === "assign-station") assignAgent(el.dataset.pal!, el.value || null);
    if (el.id === "project-assign" && el.value) assignAgent(el.value, el.dataset.building!);
    render();
  });
  const input = host.querySelector<HTMLTextAreaElement>("#radio-text")!;
  const quick = host.querySelector<HTMLInputElement>("#quick-text")!;
  quick.value = sessionStorage.getItem("area67-quick-draft") ?? "";
  quick.oninput = () => sessionStorage.setItem("area67-quick-draft", quick.value);
  host.querySelector<HTMLFormElement>("#quick-chat")!.onsubmit = async event => {
    event.preventDefault(); const text = quick.value.trim(); if (!text) return;
    const send = host.querySelector<HTMLButtonElement>("#quick-chat button")!; if (send.disabled) return;
    send.disabled = true;
    try { await postRadio("zeref", text, { channel: "team", to: "all" }); if (quick.value.trim() === text) { quick.value = ""; sessionStorage.removeItem("area67-quick-draft"); } flash("Sent to team chat as Zeref"); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not send. Your draft is retained.", "bad"); }
    finally { send.disabled = false; }
  };
  input.oninput = () => { draft = input.value; sessionStorage.setItem("area67-draft", draft); host.querySelector("#character-count")!.textContent = draft.length + " / 2000"; };
  input.onkeydown = event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); host.querySelector<HTMLFormElement>("#radio-form")!.requestSubmit(); } };
  host.querySelector<HTMLFormElement>("#radio-form")!.onsubmit = async event => {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    const button = host.querySelector<HTMLButtonElement>("#send-message")!;
    sending = true; button.disabled = true; button.textContent = "Sending…";
    const submitted = draft;
    try {
      await postRadio("zeref", submitted, { channel, to: recipient, directive, replyTo, projectUid: chatProject });
      if (draft === submitted) { draft = ""; input.value = ""; sessionStorage.removeItem("area67-draft"); }
      replyTo = undefined;
      flash(directive ? "Directive queued. Receipts appear when teammates check in." : "Message sent");
      render(); host.querySelector<HTMLElement>("#message-log")!.scrollTop = 1e9;
    } catch (e) { flash(e instanceof Error ? e.message : "Send failed. Your draft is safe.", "bad"); }
    finally { sending = false; button.disabled = false; button.textContent = directive ? "Send directive ↗" : "Send message ↗"; host.querySelector("#character-count")!.textContent = draft.length + " / 2000"; }
  };
  host.querySelector<HTMLFormElement>("#project-form")!.onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const result = projectSchema.safeParse({ name: data.get("name"), repoUrl: data.get("repoUrl"), workspace: data.get("workspace"), summary: data.get("summary"), contents: String(data.get("contents") ?? "").split("\n").map(s => s.trim()).filter(Boolean) });
    if (!result.success) { host.querySelector("#project-error")!.textContent = result.error.issues[0].message; return; }
    if (!radioLive) { host.querySelector("#project-error")!.textContent = "Reconnect before changing a shared project."; return; }
    try {
      if (editingProject) updateProject(editingProject, result.data); else prepareProject(result.data);
      host.querySelector<HTMLDialogElement>("#project-dialog")!.close();
      chatOpen = false;
      flash(editingProject ? "Project sign updated." : "Choose an empty plot on the map. Esc cancels.");
      render();
    } catch (error) { host.querySelector("#project-error")!.textContent = String(error); }
  };
}
