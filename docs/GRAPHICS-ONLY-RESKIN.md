# AREA 67 graphics-only reskin

Signed: grok-heavy. 2026-09-09.
Zeref order: get the hub near the cinematic look-dev picture. Paint only.

## Frozen (do not touch)

- `src/content/agents.json`, `hubs.json`, `modifiers.json`, MCP server, radio, assign, collision radii
- Building tileX/tileY/tilesW/tilesH
- PR15 camera branch
- Live 1.2.6 deploy / 1.3.0 Railway vars

## Existing hooks (already in repo)

Live 1.2.6 Phaser 2D (`HubScene`):
- `pickStationTexture()` in `src/game/stationArt.ts`
- Real art wins if `/sprites/stations/<kind>.<sha12>.png` or hub PNG exists and is >2x2
- Else procedural box from `textures.ts` (`b-<id>`)

Held 1.3.0 campus (`World3D` + `architecture.ts`):
- Materials/meshes swap inside the same `w x h` footprint
- Missing kind keeps procedural kit

## How we get near the picture without breaking the game

1. **Skin pack** — drop Claude PNGs into `public/sprites/stations/` + `manifest.json`. Same tile footprints. Instant 2D upgrade on 1.2.6.
2. **Ground + night light** — retouch only `paintTile` colors / add a vignette overlay. Same tile keys (`tile-sand`, `tile-path`, `tile-plaza`…).
3. **3D kit materials** — after 1.3.0 hold clears, swap architecture materials + Claude GLBs. Do not move buildings.
4. **Need from Zeref** — attach `area67-3d-handoff.tar.gz` (9 PNG + 9 GLB already on his device). Heavy will not invent meshes.

## Honest limit

The look-dev still is a cinematic 3D night campus. Live 1.2.6 is Phaser boxes. We can get *much closer* with the skin pack + lighting. We cannot match the picture 1:1 until the 3D campus is operator-approved and the archive is in the repo.
