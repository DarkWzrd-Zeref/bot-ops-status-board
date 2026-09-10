# AREA 67 visual-only reskin

Signed: grok-heavy 2026-09-09 19:18 ET  
Zeref: get near the high-end look-dev picture. Upgrade graphics. Do not mess with data or mechanics.

**Claude is OFF until Friday.** Do not invent her GLB/PNG. Do not wait on her for slice 1. Preserve authorship on `area67-3d-handoff.tar.gz` if Zeref attaches it.

Live remains 1.2.6 / bb1cf2d. 1.3.0 HOLD. No deploy. Do not mix PR15 camera.

## Frozen (do not edit in this lane)

- `src/content/hubs.json` ids, tiles W/H, colors-as-identity, blurbs
- `src/content/agents.json` roster
- assign / build / move / demolish / radio / MCP / presence
- collision radii, walk grid, Palbox ring math
- PR15 Escape / look-slop / inspector pause

## Paint surfaces (allowed)

| layer | file | change |
|---|---|---|
| 2D fallback tiles + boxes | `src/game/textures.ts` | richer sand/path/plaza/water, same keys `tile-*` `b-*` `chibi-*` |
| 3D sky / fog / lights | `src/game/World3D.ts` createTerrain + constructor lights | dusk gold key + teal rim, wet ground, no new buildings |
| 3D kits | `src/game/architecture.ts` materials only | roughness/metalness/emissive; keep footprints |
| 2D sprites | `public/sprites/stations/*.png` + existing `manifest.json` | drop Claude PNGs when tar.gz arrives; `stationArt.ts` already decorative-only |
| HUD chrome | `src/ui/campus.css` colors | glass panels, do not move layout anchors |

## Why it cannot match the picture tonight

1. Live 1.2.6 is Phaser painted boxes. The picture is a cinematic 3D campus.
2. World3D (PR14 / 1.3.0 HOLD) is the real canvas: ACES + shadows + architecture kits already exist, sitting on a dark teal plinth with no ground materials.
3. Claude 9 GLB + 9 PNG are on the user device (`area67-3d-handoff.tar.gz`), not in this repo. Manifest exists; PNG bytes do not.
4. Heavy cannot run Blender. Inventing GLBs would break collision.

## Phases

1. **Materials now (Claude off)** — Cursor applies lighting + ground + palette in World3D/textures. Same tiles. Preview locally. No Railway.
2. **Art drop** — Zeref attaches the tar.gz. Cursor copies PNGs to `public/sprites/stations/` using existing hashed names. Fallback stays if a file is missing.
3. **Blender Friday** — Claude reskins kits to the look-dev. Origin = footprint centre. tileW/H + 0.42 lip. Preserve attribution. Heavy reviews hashes only.

## Night palette (same tile keys)

- background `#0b100c`
- fog `#0a140e`
- accent `#76b900` / `#bef264`
- tile-sand `#3a3424` / `#2c271c`
- tile-sand2 `#322c1e` / `#241f16`
- tile-path `#4a4536` / `#353126`
- tile-pad `#3f4a40` / `#2a332c`
- tile-plaza `#2f3830` / `#222a24`
- tile-water `#12301c` / `#0a1c12`
- tile-fence `#1a2218` / `#4a5540`

## Look-dev target (from Heavy render)

Night classified campus. Gold key light from the Well. Teal rim from comms. Glass + stone, not flat boxes. Ground reads as paths and districts without world signs. Pals stay readable chips, not cinematic heroes.
