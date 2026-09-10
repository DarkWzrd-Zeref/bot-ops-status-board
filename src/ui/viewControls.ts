export function mountViewControls(root: HTMLElement) {
  const bar = document.createElement("div"); bar.className = "view-switch";
  bar.setAttribute("aria-label", "Map navigation"); bar.setAttribute("role", "toolbar");
  bar.innerHTML = `<button id="view-fit" class="fit-campus" data-view-camera="fit" title="Fit every placed station on screen"><span aria-hidden="true">⌖</span> Fit campus</button><span class="view-divider" aria-hidden="true"></span><button id="view-overview" data-view-camera="isometric" disabled title="Isometric view requires 3D">Isometric</button><button id="view-top" data-view-camera="top" disabled title="Top-down view requires 3D">Top down</button><button id="view-walk" aria-pressed="false" disabled title="First-person view requires 3D">Walk</button><span class="map-navigation-hint">Scroll to zoom · / to find a station</span>`;
  root.append(bar);
  bar.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!b || b.disabled) return;
    e.stopPropagation();
    if (b.dataset.viewCamera) {
      window.dispatchEvent(new CustomEvent("area67-camera", { detail: b.dataset.viewCamera }));
    } else window.dispatchEvent(new CustomEvent("area67-view", { detail: "walk" }));
  });
  window.addEventListener("area67-3d-ready", () => {
    for (const [id, title] of [["view-walk", "Walk through the campus"], ["view-overview", "Angled view of the whole campus"], ["view-top", "Top-down plan of the whole campus"]]) {
      const b = bar.querySelector<HTMLButtonElement>(`#${id}`)!; b.disabled = false; b.title = title;
    }
    bar.querySelector(".map-navigation-hint")!.textContent = "Drag to pan · right-drag to orbit · scroll to zoom";
  });
  window.addEventListener("area67-view-change", e => {
    const walk = (e as CustomEvent<string>).detail === "walk";
    bar.querySelector("#view-walk")!.setAttribute("aria-pressed", String(walk));
  });
}
