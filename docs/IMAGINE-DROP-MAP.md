# Imagine → stationArt drop map

Zeref assigned Cursor to aid Heavy on the giga upgrade. 2026-09-09.
Copy stills to `public/sprites/stations/hub-<id>.png`. Do not edit hubs.json. Same footprints.
`stationArt.ts` loads hub sprites first if the file is >2x2.

| palbox id | still file | dest |
|---|---|---|
| war-table | war-table.jpg | hub-war-table.png |
| vision-board | vision-board.jpg | hub-vision-board.png |
| pending-work | pending-work.jpg | hub-pending-work.png |
| skill-altar | skill-altar.jpg | hub-skill-altar.png |
| project-site | project-depot.jpg | hub-project-site.png |
| well | core-well.jpg | hub-well.png |
| bank | bank-vault.jpg | hub-bank.png |
| grand-exchange | ge-pavilion.jpg | hub-grand-exchange.png |
| discord | comms-hall.jpg | hub-discord.png |
| cursor | code-forge.jpg | hub-cursor.png |
| skillspector | guard-spector.jpg | hub-skillspector.png |
| skill-rack | skill-rack.jpg | hub-skill-rack.png |
| github | github-guild.jpg | hub-github.png |
| gmail | gmail-post.jpg | hub-gmail.png |
| calendar | calendar-keep.jpg | hub-calendar.png |
| slack | slack-tavern.jpg | hub-slack.png |
| railway | infra-rail-tower.jpg | hub-railway.png |
| neon | media-neon.jpg | hub-neon.png |
| cloudflare | cloudflare-tower.jpg | hub-cloudflare.png |
| firecrawl | research-library.jpg | hub-firecrawl.png |
| apify | apify-workshop.jpg | hub-apify.png |
| elevenlabs | voice-studio.jpg | hub-elevenlabs.png |
| agentmail | agentmail-lodge.jpg | hub-agentmail.png |
| drive | ops-warehouse.jpg | hub-drive.png |
| x | x-plaza.jpg | hub-x.png |

Source folder this session: `artifacts/imagine-stations/` (25 files).
Kind hashes stay as fallback if a hub PNG is missing.
No deploy. Live 1.2.6. Claude Friday = GLB only.
