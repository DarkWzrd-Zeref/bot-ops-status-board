# AREA 67

Classified Palworld-style agent base. The base **is** the tracker.

You walk a commander (Zeref) on a night pad. The **Palbox** (Command Well) draws a green radius. Every other building is a workstation that changes what a pal (agent) is allowed to do — Discord, Cursor cloud runs, Firecrawl, and so on.

Building rules copy Palworld's methodology (not Pocketpair art):

1. Palbox first. Stations only place **inside the ring**.
2. **Build (B)** — catalog tabs, ghost snaps to the grid, green = valid / red = blocked.
3. Select a pal, click a station — they walk over and gain that station's grants (MCP tools).
4. **Move (M)** — pick a station up, ghost it, plant it again.
5. **Dismantle (X)** — assigned pals lose that AI change.
6. Grok AM Twin B **mimics** Twin A after a short leash.
7. **Spector Gate** must scan a skill (`SAFE` / `CAUTION` / `DO_NOT_INSTALL`) before the **Skill Rack** can install it.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:4611
npm run build
```

Live SkillSpector (optional): `skillspector mcp --transport http --host 127.0.0.1 --port 8000` and `VITE_SKILLSPECTOR_URL=http://127.0.0.1:8000`. Until then, scans use `src/content/scans.json`.

## Keys

- WASD / arrows / click-to-walk
- B build · M move · X dismantle · Esc walk
- Wheel zoom
- Select pal → click building = assign

## Data

- `src/build/palworld.ts` — Palbox radius, tabs, placement messages
- `src/content/hubs.json` — stations
- `src/content/modifiers.json` — what each station does to the AI
- `src/content/agents.json` — pals (Community Brain roster + work suitability)
- `src/content/skills.json` / `scans.json` — SkillSpector targets + reports

## Deploy

- **Live:** https://status-board-production-806b.up.railway.app
- Railway project `bot-ops-status-board`, service `status-board`. Dockerfile → nginx on `$PORT`.
