import { DISTRICTS, DISTRICT_PURPOSES, MAP_W, MAP_H } from "../../shared/map.ts";
import { bus } from "../core/events.ts";
import { runtime, buildingName, hubById } from "../core/runtime.ts";

/** Read-only campus atlas. Navigation never changes station placement or assignment. */
export function mountDistricts(root: HTMLElement) {
  const details = document.createElement("details"); details.className = "district-nav";
  details.innerHTML = `<summary>Campus atlas</summary><svg class="campus-minimap" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="Station locations across the campus"></svg><nav aria-label="Map districts"><button data-district="overview">Whole campus</button>${DISTRICTS.map(d => `<button data-district="${d.id}" title="${DISTRICT_PURPOSES[d.id]}"><strong>${d.name}</strong><span>${DISTRICT_PURPOSES[d.id]}</span></button>`).join("")}<button data-district="standby">Standby · offline agents</button></nav><label class="field-label">Find a station<select aria-label="Find a station"><option value="">Choose a station</option></select></label><small>Landmarks do not prove outside services are connected.</small>`;
  root.querySelector(".world-overlay")!.append(details);
  const select = details.querySelector("select")!, svg = details.querySelector("svg")!;
  let signature = "";
  const render = () => {
    const key = JSON.stringify(runtime.buildings.map(b => [b.uid, b.tx, b.ty, b.project?.name]));
    if (key === signature || document.activeElement === select) return;
    signature = key; select.replaceChildren(new Option("Choose a station", "")); svg.replaceChildren();
    for (const b of [...runtime.buildings].sort((a, b) => buildingName(a).localeCompare(buildingName(b)))) {
      select.add(new Option(buildingName(b), b.uid));
      const h = hubById(b.hubId), rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(b.tx)); rect.setAttribute("y", String(b.ty)); rect.setAttribute("width", String(h.w)); rect.setAttribute("height", String(h.h)); rect.setAttribute("rx", ".5"); rect.setAttribute("fill", h.color);
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = buildingName(b); rect.append(title); svg.append(rect);
    }
  };
  details.addEventListener("toggle", () => { if (details.open) render(); });
  select.addEventListener("change", () => { if (!select.value) return; window.dispatchEvent(new CustomEvent("area67-focus-building", { detail: select.value })); details.open = false; select.value = ""; });
  details.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-district]"); if (!b) return;
    window.dispatchEvent(new CustomEvent("area67-district", { detail: b.dataset.district })); details.open = false;
  });
  bus.on(e => { if (e.type === "changed") render(); }); render();
}
