import { DISTRICTS, MAP_W, MAP_H } from "../../shared/map.ts";
import { bus } from "../core/events.ts";
import { runtime, buildingName, hubById } from "../core/runtime.ts";

const purposes = ["Coordinate team decisions and shared priorities.", "Find communication tools and inspect connection details.", "Review repositories, project work and development tools.", "Inspect hosting, data and infrastructure work.", "Gather sources and review research tasks.", "Discuss plans, park future work and register signed skills."];
export type StationSearchItem = { uid: string; name: string; kind: string; description: string };
/** Every search word must match; exact names sort first without changing map state. */
export function searchStations(items: StationSearchItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  return items.filter(item => words.every(word => `${item.name} ${item.kind} ${item.description}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => Number(b.name.toLocaleLowerCase() === normalized) - Number(a.name.toLocaleLowerCase() === normalized) || a.name.localeCompare(b.name));
}
/** Read-only campus atlas. Navigation never changes station placement or assignment. */
export function mountDistricts(root: HTMLElement) {
  const details = document.createElement("details"); details.className = "district-nav";
  details.innerHTML = `<summary><span aria-hidden="true">⌕</span> Find a station <kbd>/</kbd></summary><div class="atlas-heading"><span class="eyebrow">CAMPUS DIRECTORY</span><button type="button" class="atlas-close" aria-label="Close campus directory">×</button></div><label class="station-search"><span class="sr-only">Search stations and projects</span><input id="station-search" type="search" placeholder="Search stations, projects, capabilities…" autocomplete="off" aria-controls="station-search-results"></label><p class="station-search-count" role="status" aria-live="polite"></p><div id="station-search-results" class="station-search-results" role="group" aria-label="Matching stations"></div><details class="atlas-districts"><summary>Explore by district</summary><svg class="campus-minimap" viewBox="0 0 ${MAP_W} ${MAP_H}" role="group" aria-label="Station locations across the campus"></svg><nav aria-label="Map districts"><button data-district="overview">Fit whole campus</button>${DISTRICTS.map((d, i) => `<button data-district="${d.id}" title="${purposes[i]}">${d.name}</button>`).join("")}<button data-district="standby">Standby · offline agents</button></nav></details><label class="field-label atlas-select">All stations<select aria-label="Find a station"><option value="">Choose a station</option></select></label><small>Navigation only. A station’s presence does not verify an outside connection.</small>`;
  root.querySelector(".world-overlay")!.append(details);
  const select = details.querySelector("select")!, svg = details.querySelector("svg")!;
  const input = details.querySelector<HTMLInputElement>("#station-search")!;
  const results = details.querySelector<HTMLElement>("#station-search-results")!;
  const close = () => { details.open = false; details.querySelector<HTMLElement>("summary")!.focus(); };
  const jump = (uid: string) => {
    details.open = false;
    window.dispatchEvent(new CustomEvent("area67-focus-building", { detail: uid }));
    select.value = "";
  };
  const renderSearch = () => {
    const items = searchStations(runtime.buildings.map(b => {
      const h = hubById(b.hubId);
      return { uid: b.uid, name: buildingName(b), kind: b.project ? "Project" : h.kind, description: b.project?.summary || h.blurb };
    }), input.value);
    results.replaceChildren();
    details.querySelector(".station-search-count")!.textContent = `${items.length} ${items.length === 1 ? "station" : "stations"}${input.value.trim() ? " found" : " · jump anywhere"}`;
    for (const item of items) {
      const button = document.createElement("button"); button.type = "button"; button.className = "station-search-result";
      const text = document.createElement("span"), name = document.createElement("strong"), description = document.createElement("small"), arrow = document.createElement("span");
      name.textContent = item.name; description.textContent = `${item.kind} · ${item.description}`; text.append(name, description);
      arrow.textContent = "↗"; arrow.setAttribute("aria-hidden", "true"); button.append(text, arrow);
      button.addEventListener("click", () => jump(item.uid)); results.append(button);
    }
    if (!items.length) { const p = document.createElement("p"); p.className = "station-search-empty"; p.textContent = "No matching stations. Try a name or a capability."; results.append(p); }
  };
  let signature = "";
  const render = () => {
    const key = JSON.stringify(runtime.buildings.map(b => [b.uid, b.tx, b.ty, b.project?.name]));
    if (key === signature || document.activeElement === select) return;
    signature = key; select.replaceChildren(new Option("Choose a station", "")); svg.replaceChildren();
    for (const b of [...runtime.buildings].sort((a, b) => buildingName(a).localeCompare(buildingName(b)))) {
      select.add(new Option(buildingName(b), b.uid));
      const h = hubById(b.hubId), rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(b.tx)); rect.setAttribute("y", String(b.ty)); rect.setAttribute("width", String(h.w)); rect.setAttribute("height", String(h.h)); rect.setAttribute("rx", ".5"); rect.setAttribute("fill", h.color);
      rect.setAttribute("role", "button"); rect.setAttribute("tabindex", "0"); rect.setAttribute("aria-label", `Jump to ${buildingName(b)}`);
      rect.addEventListener("click", () => jump(b.uid));
      rect.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jump(b.uid); } });
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = buildingName(b); rect.append(title); svg.append(rect);
    }
    renderSearch();
  };
  details.addEventListener("toggle", event => {
    if (event.target !== details || !details.open) return;
    render(); renderSearch();
    window.dispatchEvent(new CustomEvent("area67-navigation-open"));
    input.focus();
  });
  input.addEventListener("input", renderSearch);
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); results.querySelector<HTMLButtonElement>("button")?.focus(); }
    if (event.key === "Enter") { event.preventDefault(); results.querySelector<HTMLButtonElement>("button")?.click(); }
  });
  details.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } });
  details.querySelector(".atlas-close")!.addEventListener("click", close);
  window.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || document.activeElement?.closest("input, textarea, select, [contenteditable=true], dialog")) return;
    if ((event.key === "/" && !event.ctrlKey && !event.metaKey) || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault(); details.open = true; input.focus();
    }
  });
  document.addEventListener("pointerdown", event => { if (details.open && !details.contains(event.target as Node)) details.open = false; });
  select.addEventListener("change", () => { if (select.value) jump(select.value); });
  details.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-district]"); if (!b) return;
    details.open = false; window.dispatchEvent(new CustomEvent("area67-district", { detail: b.dataset.district }));
  });
  bus.on(e => { if (e.type === "changed") render(); }); render();
}
