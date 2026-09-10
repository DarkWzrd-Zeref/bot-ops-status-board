# Realistic paint cap — 2026-09-09

Zeref: Cursor codes. Heavy faces what we can actually implement.

## Roles
- Cursor Fast (`/mcp/cursor`, pal=cursor-ultra) CODES.
- Heavy (`/mcp/grok-heavy`) look-dev + contract + review. Does not take Cursor files.
- Imagine = 2D targets only. Not meshes.
- Claude Friday = GLB only.

## What the live hub can look like this week
Live 1.2.6 is Phaser boxes + ops-teal HUD. It will NOT match Imagine walk frames.
Closest honest look without a deploy:
1. `hub-{id}.png` skins on existing stationArt hook (2D, same footprints).
2. Night CSS tokens in `src/ui/campus.css` + `:root` colors in `src/style.css`. Do not change `--left --right --header --lower`.
3. World3D night lights/fog/ground hex (PR22 already started). Same meshes.
4. `textures.ts` night tile keys already on grok-heavy/reskin-spec-4777.

## What it cannot look like this week
- Photo-real wet concrete campus in the live PWA
- Per-station unique 3D architecture (that is Friday GLB)
- New camera, new HUD layout, new drawers
- Imagine JPG used as a World3D mesh

## Cursor codes on PR22 only
https://github.com/DarkWzrd-Zeref/bot-ops-status-board/pull/22
Do not mix PR15 camera, PR21 memories, PR13, PR8.
Do not edit hubs.json / agents.json / runtime / pathfinder / hud.ts logic.

## CSS token map (values only)
Keep selectors. Swap paint:
- `--mint` keep phosphor `#80f5cd`
- `--amber` → brass `#c9a15b`
- `--panel` → `#0a1216`
- `--line` → `#3a4a42`
- `.app-header` bg → `#0a1418`
- `.map-launchers` / `.world-controls` / `.view-switch` bg stay translucent; border → `#4a5e52`
- pressed / chat launcher keep mint on dark, not a new accent system

## World3D numbers if not already in PR22
- fog `FogExp2(0x0a161c, 0.012)`
- hemi `0x6a8a9a / 0x141c18 / 1.1`
- key `0xc9a15b / 1.6`
- rim `0x3aa8b8 / 1.1`
- exposure `0.92`

## Blocker (honest)
Repo `public/sprites/stations/` still only has `manifest.json`.
Heavy session has 25 PNGs at `artifacts/hub-sprites/hub-{id}.png`.
Cursor VM reported 0/25. Zeref must drop bytes into her workspace or attach them. Loader is fail-closed until then.

## Ship rule
No deploy. Live stays 1.2.6 / bb1cf2d. 1.3.0 HOLD.
Review = SHA + file list + confirmation hubs.json untouched.
