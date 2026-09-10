# Realistic paint cap — Cursor codes, Heavy does not

Signed: grok-heavy 2026-09-09 20:18 ET
Zeref: Cursor is the coder. Heavy faces what can actually land.

Live stays 1.2.6 / bb1cf2d. No deploy. 1.3.0 HOLD.

## Who does what

| seat | implements |
|---|---|
| Cursor Fast `/mcp/cursor` | code in PR22 + CSS token retint |
| Heavy `/mcp/grok-heavy` | Imagine look-dev, spec, review SHAs, radio |
| Claude Friday | GLB only |
| Imagine | stills / walk frames. Not meshes. Not HUD. |

Heavy does not take `src/ui/hud.ts`, `src/game/World3D.ts`, or Cursor branches.

## What is already coded (PR22 `c291b47`)

- Night World3D `NIGHT_LOOK` + wetter terrain materials
- architecture roughness/emissive tweak
- Boot loads `hub-{id}.png` first, fail-closed
- `scripts/seat-imagine-stills.mjs` + `scripts/imagine-drop.json`
- Fail-closed GLB hook for Friday (`stationModels.ts`)

78 tests. Draft. Not live.

## What Heavy can actually implement from this seat

- Docs and token maps (this file)
- Identity notes (id-scan)
- Radio / review
- Imagine stills in the grok.com chat folder

Heavy **cannot**: run Vite, npm test, put chat JPGs into Cursor's VM, rewrite HUD, invent GLB, deploy Railway.

## Honest visual cap this week

| surface | result if Cursor finishes |
|---|---|
| Live 1.2.6 Phaser | night 2D tiles + hub-png skins if bytes exist. Still a board, not the photo. |
| Local World3D (1.3.0 HOLD) | dusk fog/gold key/teal rim + wet ground. Kits stay kits until Friday GLB. |
| HUD | night glass tokens. Same anchors. Not cinematic UI. |

The walk frames are **look-dev**. They will not become the live camera.

## Blocker (do not paper over)

`artifacts/imagine-stations` is empty in Cursor's VM. Seater = 0/25. Loader is ready. Files are not.
Zeref must drop the 25 stills into that folder or `public/sprites/stations/hub-*.png`.

## Cursor next code (one slice)

Retint `src/ui/campus.css` colors only. Do not change `--header`, panel `top/left/right/bottom`, `#quick-chat` center, or media-query layout.

| current | night |
|---|---|
| `--mint: #9deccf` | `#bef264` |
| `--line: #30434f` | `#3a4a38` |
| `.app-header` `#0d1923` | `#0b100c` |
| `.map-launchers` / `.district-nav` / `.view-switch` / `.world-controls` bg `#101e28ed` | `#0d1410f2` |
| borders `#3c5865` | `#4a5540` |
| `#quick-chat` `#10222feb` / `#415767` | `#0d1410f2` / `#4a5540` |
| `#chat-launcher` / pressed view `#9deccf` | `#bef264` |
| `.station-chip` `#122736d9` / `#526c7a80` | `#10180fd9` / `#4a554080` |
| selected chip `#d8eee7` | `#d8f0c4` |
| `.campus-minimap` `#1b303d` | `#16201a` |
| inputs `#0c1a25` | `#0b100c` |

Do not edit `hud.ts`.

## Frozen

hubs.json, agents.json, assign/move/radio/MCP, collision, PR15, PR13 merge, 1.3.0 ACK, Railway.
