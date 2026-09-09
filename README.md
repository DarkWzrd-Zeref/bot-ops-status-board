# Community Brain Base

RuneScape-style community hub + Palworld base building. The base is the agent tracker.

You walk a commander (Zeref) around a Grand Exchange plaza. The **Command Well** is the Palbox. Every other building is a **workstation that changes what a pal (agent) is allowed to do** — Discord tools, Cursor cloud runs, Firecrawl, and so on.

[NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) is a standing station: the **Spector Gate**. Skills cannot rewrite an agent until they are scanned there (`SAFE` / `CAUTION` / `DO_NOT_INSTALL`, score 0–100). The **Skill Rack** is the ranch: assign a pal, install a scanned skill.

## Loop (Palworld)

1. Well / Palbox sits in the plaza (base radius; keep the GE floor clear).
2. **Build (B)** a station from the hotbar. Ghost snaps to the grid.
3. Select a pal, click the station — they walk over and gain that station's grants (MCP tools, gates, policy).
4. Grok AM Twin B **mimics** Twin A after a short leash.
5. Drop **Spector Gate**, scan a skill, then **Skill Rack** to equip. `DO_NOT_INSTALL` is blocked.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:4611
npm run build
```

Live SkillSpector (optional): run `skillspector mcp --transport http --host 127.0.0.1 --port 8000` and set `VITE_SKILLSPECTOR_URL=http://127.0.0.1:8000`. Until then, scans use fixtures in `src/content/scans.json` shaped like SkillSpector's JSON report.

## Keys

- WASD / arrows / click-to-walk
- B build · X remove station · Esc walk
- Wheel zoom
- Select pal → click building = assign

## Data

- `src/content/hubs.json` — stations
- `src/content/modifiers.json` — what each station does to the AI
- `src/content/agents.json` — pals (Community Brain roster)
- `src/content/skills.json` / `scans.json` — SkillSpector targets + reports
- `src/content/research-questions.json` — open design questions
