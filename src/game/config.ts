import { World3D } from "./World3D.ts";
import { detectWebgl, shouldUseCanvasFallback } from "./webgl.ts";

export { shouldUseCanvasFallback };

async function canvasMap(parent: HTMLElement) {
  parent.replaceChildren();
  const { makeFallback } = await import("./fallback.ts");
  return makeFallback(parent);
}

// Canvas map loads when WebGL is missing OR present-and-broken (context lost / init throw).
export async function makeGame(parent: HTMLElement) {
  if (shouldUseCanvasFallback({ hasWebgl: detectWebgl() })) return canvasMap(parent);
  try {
    const world = new World3D(parent);
    world.onContextLost = () => {
      world.dispose();
      void canvasMap(parent);
    };
    return world;
  } catch (error) {
    console.warn("3D unavailable; using the canvas map", error);
    return canvasMap(parent);
  }
}
