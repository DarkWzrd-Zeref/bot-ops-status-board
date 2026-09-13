/** Stable world origin: expansions must not move existing saved buildings. */
export const MAP_W = 96;
export const MAP_H = 72;
export const CORE_X = 28;
export const CORE_Y = 20;
export const BASE_RADIUS = 60;

/** Planning districts, not automatic construction or service connections. */
export const DISTRICTS = [
  { id: "town", name: "Town center", x: 28, y: 20 },
  { id: "comms", name: "Communications", x: 12, y: 34 },
  { id: "forge", name: "Development", x: 54, y: 20 },
  { id: "infra", name: "Infrastructure", x: 74, y: 34 },
  { id: "research", name: "Research", x: 58, y: 54 },
  { id: "commons", name: "Commons", x: 28, y: 56 },
] as const;
