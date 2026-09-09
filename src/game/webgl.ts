/** Decide when the 3D deck must yield to the canvas map. */
export function shouldUseCanvasFallback(opts: {
  hasWebgl: boolean;
  contextLost?: boolean;
  initError?: unknown;
}): boolean {
  return !opts.hasWebgl || !!opts.contextLost || opts.initError != null;
}

export function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}
