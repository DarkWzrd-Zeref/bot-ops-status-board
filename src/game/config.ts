import { World3D } from "./World3D.ts";

// The legacy renderer is downloaded only when WebGL is unavailable.
export async function makeGame(parent: HTMLElement) {
  try { return new World3D(parent); }
  catch (error) {
    console.warn("3D unavailable; using the canvas map", error);
    parent.replaceChildren();
    const { makeFallback } = await import("./fallback.ts");
    return makeFallback(parent);
  }
}
