# Cursor drop map — Imagine seating

Zeref 2026-09-09 19:52 ET: Cursor aids Heavy on the giga paint upgrade.
Imagine stills exist as look-dev in this chat, NOT yet as repo bytes.
Claude manifest hashes stay hers. Do not overwrite Claude filenames with Imagine pixels.

## How to seat without mixing authorship

Use hub-specific files that stationArt already loads first:

`/sprites/stations/hub-{id}.png`  (see `hubSpritePath`)

Kind files `/sprites/stations/{kind}.{sha12}.png` stay reserved for Claude Friday / the tar.gz.

Missing file = painted box. That is correct.

## 25 buildings

| id | kind | tiles | drop as |
|---|---|---|---|
| well | core | 2x2 | hub-well.png |
| bank | core | 4x3 | hub-bank.png |
| grand-exchange | core | 4x3 | hub-grand-exchange.png |
| discord | comms | 4x3 | hub-discord.png |
| slack | comms | 3x3 | hub-slack.png |
| gmail | comms | 3x3 | hub-gmail.png |
| agentmail | comms | 3x3 | hub-agentmail.png |
| cursor | code | 4x3 | hub-cursor.png |
| github | code | 3x3 | hub-github.png |
| skillspector | guard | 4x4 | hub-skillspector.png |
| skill-rack | guard | 3x3 | hub-skill-rack.png |
| railway | infra | 4x3 | hub-railway.png |
| neon | infra | 3x3 | hub-neon.png |
| cloudflare | infra | 3x4 | hub-cloudflare.png |
| firecrawl | research | 4x3 | hub-firecrawl.png |
| apify | research | 3x3 | hub-apify.png |
| elevenlabs | media | 3x3 | hub-elevenlabs.png |
| x | media | 2x2 | hub-x.png |
| calendar | ops | 3x3 | hub-calendar.png |
| drive | ops | 4x3 | hub-drive.png |
| project-site | project | 3x3 | hub-project-site.png |
| war-table | ecosystem | 4x4 | hub-war-table.png |
| vision-board | ecosystem | 4x3 | hub-vision-board.png |
| pending-work | ecosystem | 4x3 | hub-pending-work.png |
| skill-altar | ecosystem | 3x3 | hub-skill-altar.png |

ecosystem has no kind PNG. Commons MUST use hub-* or they stay boxes.

## Cursor apply order
1. Export Imagine stills to `public/sprites/stations/hub-*.png` on a branch that is NOT camera-homework-4777.
2. Night ground already started in textures.ts on grok-heavy/reskin-spec-4777 (PR19).
3. World3D fog/lights on that same paint branch if you take it.
4. Do not merge PR13/PR8. Do not ACK 1.3.0. Do not deploy.
