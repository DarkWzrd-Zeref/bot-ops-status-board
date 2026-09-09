import questionsFile from "../content/research-questions.json";
import { BUILD_TABS, PALBOX_LEVEL, PALBOX_SLOTS, tabFor } from "../build/palworld.ts";
import { bus } from "../core/events.ts";
import {
  AGENTS,
  MODS,
  SKILLS,
  assignAgent,
  beginMove,
  catalogForTab,
  demolish,
  equipSkill,
  grantsFor,
  hubById,
  resetBase,
  runScan,
  runtime,
} from "../core/runtime.ts";
import { recoTone } from "../core/skillspector.ts";
import { postRadio, radioLive, radioNotes } from "../core/live.ts";

const qFile = questionsFile as { questions: { id: string; category: string; priority: string; question: string; current_guess?: string; status: string }[] };

export function mountHud(root: HTMLElement): void {
  const render = () => {
    root.innerHTML = html();
    bind(root);
  };
  bus.on((e) => {
    if (e.type === "changed" || e.type === "radio") render();
    if (e.type === "toast") {
      render();
      requestAnimationFrame(() => flash(e.text, e.tone));
    }
  });
  render();
}

function flash(text: string, tone: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.dataset.tone = tone;
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

function html(): string {
  const mode = runtime.mode;
  const selA = runtime.agents.find((a) => a.id === runtime.selectedAgent);
  const selB = runtime.buildings.find((b) => b.uid === runtime.selectedBuilding);
  const placeable = catalogForTab();
  const hasSpector = runtime.buildings.some((b) => b.hubId === "skillspector");
  const pals = runtime.agents.length;

  return `
    <div id="toast"></div>
    <header class="bar top">
      <div>
        <strong>AREA 67</strong>
        <span class="muted">classified palbox · stations rewrite the agents</span>
      </div>
      <div class="pills">
        <span class="pill ok">PALBOX LV.${PALBOX_LEVEL}</span>
        <span class="pill ${pals <= PALBOX_SLOTS ? "ok" : "bad"}">${pals}/${PALBOX_SLOTS} PALS</span>
        <span class="pill ${runtime.pulseOn ? "ok" : "warn"}">${runtime.pulseOn ? "LIVE TRACK" : "PAUSED"}</span>
        <span class="pill ${hasSpector ? "ok" : "bad"}">${hasSpector ? "SPECTOR ONLINE" : "NO SPECTOR GATE"}</span>
        <span class="pill ${radioLive ? "ok" : "warn"}">${radioLive ? "ARCHITECT RADIO" : "RADIO LOCAL"}</span>
        <span class="pill info">${runtime.buildings.length} stations</span>
      </div>
    </header>

    <div class="radio-bar">
      <div class="radio-head">
        <strong>Architect radio</strong>
        <span class="muted">Claude MCP + Grok · Zeref directs</span>
      </div>
      <ol class="radio-log">
        ${
          radioNotes.length
            ? radioNotes
                .slice(0, 8)
                .map(
                  (n) =>
                    `<li><b class="who ${esc(n.from)}">${esc(n.from)}</b> ${esc(n.text)}</li>`,
                )
                .join("")
            : `<li class="muted">Silent. Claude connects at /mcp. Grok posts here. You type below.</li>`
        }
      </ol>
      <form id="radio-form">
        <input id="radio-text" maxlength="2000" autocomplete="off" placeholder="Zeref → Claude and Grok" />
        <button type="submit">Send</button>
      </form>
    </div>

    <aside class="panel left">
      <h2>Pals</h2>
      <p class="hint">Select a pal, then click a station — Palworld throw. Twin B mimics Twin A.</p>
      ${runtime.agents
        .map((a) => {
          const def = AGENTS.find((d) => d.id === a.id)!;
          const on = a.id === runtime.selectedAgent ? "on" : "";
          const b = runtime.buildings.find((x) => x.uid === a.buildingUid);
          return `<button class="row ${on}" data-agent="${a.id}">
            <i style="background:${def.color}"></i>
            <span>
              <b>${esc(def.name)}</b>
              <small>${esc(def.model)} · ${esc(a.detail)}</small>
              <small>${b ? hubById(b.hubId).short : "unassigned"} · ${esc(def.work.join("/"))}</small>
            </span>
          </button>`;
        })
        .join("")}
    </aside>

    <aside class="panel right">
      ${inspect(selA?.id ?? null, selB?.uid ?? null)}
      <h2>SkillSpector</h2>
      <p class="hint">NVIDIA scan gate. Place Spector Gate, scan, then Skill Rack to install.</p>
      ${SKILLS.map((s) => {
        const r = runtime.scans[s.id];
        const reco = r?.risk_assessment.recommendation;
        return `<div class="skill">
          <div>
            <b>${esc(s.name)}</b>
            <small>${reco ? reco + " · " + r.risk_assessment.score + "/100" : "not scanned"}</small>
          </div>
          <div class="btns">
            <button data-scan="${s.id}">Scan</button>
            ${
              selA
                ? `<button data-equip="${s.id}" data-onto="${selA.id}">Install on ${esc(AGENTS.find((d) => d.id === selA.id)!.name)}</button>`
                : ""
            }
          </div>
          ${
            r?.issues.length
              ? `<ul>${r.issues.map((i) => `<li class="${recoTone(r.risk_assessment.recommendation)}">${esc(i.id)} · ${esc(i.category)}</li>`).join("")}</ul>`
              : ""
          }
        </div>`;
      }).join("")}
      <label class="chk"><input type="checkbox" id="caution-block" ${runtime.cautionBlocks ? "checked" : ""}/> CAUTION also blocks install</label>
      <h2>Research board</h2>
      <details>
        <summary>${qFile.questions.length} open questions</summary>
        <ol class="qs">${qFile.questions.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.question)}</li>`).join("")}</ol>
      </details>
    </aside>

    <footer class="bar bottom">
      <div class="modes">
        <button data-mode="play" class="${mode === "play" ? "on" : ""}">Walk (ESC)</button>
        <button data-mode="build" class="${mode === "build" ? "on" : ""}">Build (B)</button>
        <button data-mode="move" class="${mode === "move" ? "on" : ""}">Move (M)</button>
        <button data-mode="demolish" class="${mode === "demolish" ? "on" : ""}">Dismantle (X)</button>
        <button id="reset">Reset base</button>
      </div>
      <div class="tabs">
        ${BUILD_TABS.map((t) => {
          const on = runtime.buildTab === t.id ? "on" : "";
          return `<button class="tab ${on}" data-tab="${t.id}" title="${esc(t.hint)}">${esc(t.label)}</button>`;
        }).join("")}
      </div>
      <div class="hotbar">
        ${placeable
          .map((h) => {
            const on = runtime.ghostHub === h.id && (mode === "build" || mode === "move") ? "on" : "";
            return `<button class="hot ${on}" data-hub="${h.id}" title="${esc(h.blurb)}">
              <span class="swatch" style="background:${h.color}"></span>
              ${esc(h.short)}
            </button>`;
          })
          .join("")}
      </div>
      <p class="hint">Palworld: ghost snaps to grid · green = inside Palbox ring · WASD walk · wheel zoom</p>
    </footer>
  `;
}

function inspect(agentId: string | null, buildingUid: string | null): string {
  if (agentId) {
    const def = AGENTS.find((d) => d.id === agentId)!;
    const a = runtime.agents.find((x) => x.id === agentId)!;
    const grants = grantsFor(agentId);
    return `<h2>${esc(def.name)}</h2>
      <p>${esc(def.bio)}</p>
      <p class="hint">${esc(def.role)} · ${esc(def.account)} · work ${esc(def.work.join(", "))} · ${def.discordChannel ? "#" + def.discordChannel : "no channel"}</p>
      <p>Status: ${esc(a.detail)}</p>
      <p>AI grants: ${grants.length ? grants.map(esc).join(", ") : "(none — assign to a station)"}</p>
      <p>Skills: ${a.skills.length ? a.skills.join(", ") : "none equipped"}</p>
      ${a.buildingUid ? `<button data-unassign="${a.id}">Unassign</button>` : ""}`;
  }
  if (buildingUid) {
    const b = runtime.buildings.find((x) => x.uid === buildingUid)!;
    const hub = hubById(b.hubId);
    const mod = MODS[b.hubId];
    const pals = runtime.agents.filter((a) => a.buildingUid === b.uid);
    return `<h2>${esc(hub.name)}</h2>
      <p>${esc(hub.blurb)}</p>
      <p class="hint">${mod ? esc(mod.aiChange) : ""} · tab ${tabFor(hub)}</p>
      <p>Work: ${esc(mod?.work ?? "—")} · slots ${pals.length}/${mod?.slots ?? "?"}</p>
      <p>Grants: ${(mod?.grants ?? []).map(esc).join(", ") || "—"}</p>
      <p>Pals: ${pals.length ? pals.map((p) => esc(AGENTS.find((d) => d.id === p.id)?.name ?? p.id)).join(", ") : "empty"}</p>
      ${hub.placeable ? `<button data-lift="${b.uid}">Pick up (move)</button><button data-demo="${b.uid}">Dismantle</button>` : ""}`;
  }
  return `<h2>AREA 67</h2><p class="hint">Palbox is the well. Build only inside the green ring. Assign pals to stations to change their MCP grants. Spector scans skills before they rewrite an agent.</p>`;
}

function bind(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-agent]").forEach((btn) => {
    btn.onclick = () => {
      runtime.selectedAgent = btn.dataset.agent ?? null;
      runtime.selectedBuilding = null;
      bus.emit({ type: "changed" });
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
    btn.onclick = () => {
      runtime.mode = (btn.dataset.mode as typeof runtime.mode) ?? "play";
      if (runtime.mode !== "build" && runtime.mode !== "move") runtime.ghostHub = null;
      bus.emit({ type: "changed" });
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.tab as (typeof BUILD_TABS)[number]["id"] | undefined;
      if (!id) return;
      runtime.buildTab = id;
      runtime.mode = "build";
      const first = catalogForTab(id)[0];
      runtime.ghostHub = first?.id ?? null;
      bus.emit({ type: "changed" });
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-hub]").forEach((btn) => {
    btn.onclick = () => {
      runtime.mode = "build";
      runtime.ghostHub = btn.dataset.hub ?? null;
      bus.emit({ type: "changed" });
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-scan]").forEach((btn) => {
    btn.onclick = () => void runScan(btn.dataset.scan ?? "");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-equip]").forEach((btn) => {
    btn.onclick = () => equipSkill(btn.dataset.onto ?? "", btn.dataset.equip ?? "");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-unassign]").forEach((btn) => {
    btn.onclick = () => assignAgent(btn.dataset.unassign ?? "", null);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((btn) => {
    btn.onclick = () => demolish(btn.dataset.demo ?? "");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-lift]").forEach((btn) => {
    btn.onclick = () => beginMove(btn.dataset.lift ?? "");
  });
  const chk = root.querySelector<HTMLInputElement>("#caution-block");
  if (chk) {
    chk.onchange = () => {
      runtime.cautionBlocks = chk.checked;
      bus.emit({ type: "changed" });
    };
  }
  const reset = root.querySelector<HTMLButtonElement>("#reset");
  if (reset) reset.onclick = () => resetBase();
  const form = root.querySelector<HTMLFormElement>("#radio-form");
  const input = root.querySelector<HTMLInputElement>("#radio-text");
  if (form && input) {
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const text = input.value;
      input.value = "";
      void postRadio("zeref", text).catch(() => flash("Radio bus down", "bad"));
    };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
