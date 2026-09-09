export function mountViewControls(root: HTMLElement) {
  const bar = document.createElement("div"); bar.className = "view-switch";
  bar.setAttribute("aria-label", "Camera view");
  bar.innerHTML = `<button id="view-overview" aria-pressed="true" title="Overhead command view">Overview</button><button id="view-walk" aria-pressed="false" disabled title="First-person view requires 3D">First person</button>`;
  root.append(bar);
  bar.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!b || b.disabled) return;
    window.dispatchEvent(new CustomEvent("area67-view", { detail: b.id === "view-walk" ? "walk" : "overview" }));
  });
  window.addEventListener("area67-3d-ready", () => { const b = bar.querySelector<HTMLButtonElement>("#view-walk")!; b.disabled = false; b.title = "Walk through the campus"; });
  window.addEventListener("area67-view-change", e => {
    const walk = (e as CustomEvent<string>).detail === "walk";
    bar.querySelector("#view-walk")!.setAttribute("aria-pressed", String(walk));
    bar.querySelector("#view-overview")!.setAttribute("aria-pressed", String(!walk));
  });
}
