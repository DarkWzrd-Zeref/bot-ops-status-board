import { DISTRICTS } from "../../shared/map.ts";

/** Camera navigation only: never moves units, assigns work or places stations. */
export function mountDistricts(root: HTMLElement) {
  root.querySelector(".world-overlay")?.insertAdjacentHTML("beforeend", `<details class="district-nav"><summary>Districts</summary><nav aria-label="Map districts"><button data-district="overview">Whole map</button>${DISTRICTS.map(d => `<button data-district="${d.id}">${d.name}</button>`).join("")}</nav><small>Planning areas · buildings stay where you placed them</small></details>`);
  root.querySelector(".district-nav nav")?.insertAdjacentHTML("beforeend", '<button data-district="standby">Standby · offline agents</button>');
  root.querySelector(".district-nav")?.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-district]");
    if (!button) return;
    window.dispatchEvent(new CustomEvent("area67-district", { detail: button.dataset.district }));
    (root.querySelector(".district-nav") as HTMLDetailsElement).open = false;
  });
}
