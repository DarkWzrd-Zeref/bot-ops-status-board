# Bot Passport / Bot Ops Status Board

Ledger-first, mobile-first PWA that mirrors Jorge's bot-ops ledger (a Google Sheet) into a
single dark status board: Police, Researcher, Engineer, Stay on Track, AM twin, CoS.

The board is also **Area 67 · The Hub**, a communication checkpoint for routing work between
separate AI subscription surfaces. It includes a device-local handoff composer, lifecycle inbox,
implementation roadmap, pending-work aging, and public machine-readable contracts.

- Static site: Vite + TypeScript, no framework, no backend, no secrets.
- Installable on iOS Safari (Add to Home Screen) and Android/Chrome; app shell works offline.
- Source of truth: [the ledger sheet](https://docs.google.com/spreadsheets/d/18O7x24CJmE9qRwNBndNXi8SYrvUkU0woeutWOW-ce7k/edit),
  read directly from the browser as CSV.

## Data flow

1. On load, the app fetches the sheet as CSV (`gviz/tq?tqx=out:csv`, falling back to `export?format=csv`).
2. If the sheet is private, Google answers 401 / a login redirect. The board shows a red banner:
   **AM must flip the sheet to Share → Anyone with the link → Viewer**, then tap **Refresh**.
3. Until then, open **Data** and paste a CSV or JSON snapshot. It is parsed client-side and kept
   only in the device's `localStorage`. **Load demo** shows layout with clearly-labelled fake data.
4. Optional: set a tab `gid` (from the sheet URL `#gid=…`) to read a specific tab.

## Area 67 bridge boundaries

- `/.well-known/area-67.json` is the stable public discovery document.
- `/area-67/efficiency-guide.json` contains public routing policy only.
- `/area-67/handoff.schema.json` defines versioned private packet structure.
- `/area-67/roadmap.json` reports LIVE, BUILDING, and WALLED capabilities.
- Composed packets start in browser `localStorage` and must not contain secrets. A packet can be
  explicitly promoted while an authenticated private MCP session is connected; its access token
  remains in memory and is erased on reload.
- The implementation-ready Worker/D1 service lives in `mcp/`. Production OAuth, database
  provisioning, provider connectors, real quota telemetry, and artifact storage remain explicitly
  WALLED until private infrastructure and credentials are approved. The UI names the required
  decision and recommended model for each wall.

Accepted shapes:

- Wide rows: one row per bot, columns named like the field keys below (case/spacing/prefixes are normalized,
  e.g. `Researcher: Approve Status` matches `approve_status`).
- Long ledger: `bot | field | value` rows are pivoted into wide rows automatically.
- JSON: array of objects, array of arrays (first row = header), or `{ "rows": [...] }`.

## Surfaced columns

| Section | Columns (when present) |
| --- | --- |
| Police | `mcp_first`, `no_clone`, `model_tier`, `coding_handoff`, `waste_flags` |
| Researcher | `vision_board_url`, `web_insight_url`, `proposal_summary`, `approve_status` (anything but `approved` renders PENDING) |
| Engineer | `boarding_packet`, `cloud_agent_handoff`, `pr_ci_pulse`, `merge_ask`, `board_to_cloud_to_pr`, `pulse_noise`, `mcp_or_gh_status` |
| Stay on Track | `live_book`, `live` (one-LIVE rule check), `syllabus`, `done_artifact`, `jumped_asks`, `absorbs` |
| AM twin | `am_ios_mirror`, `mcp_parity`, `last_discord_sync` |
| CoS | `global_queue` (PARK/GO), `park`, `go`, `pending_handoffs`, `network_burn` (flags > $325) |

The full ledger (every column, every row) is always available at the bottom of the page.

## Run locally

```bash
npm install   # deps are pinned exactly in package.json; no lockfile is committed
npm run dev        # http://127.0.0.1:4611
npm run build      # outputs dist/ (also generates PNG icons into public/icons)
npm run preview
```

## Deploy

- **Live:** https://status-board-production-806b.up.railway.app
- **Railway** (primary): the `Dockerfile` builds the site and serves `dist/` with nginx on `$PORT`.
  The Railway service `status-board` (project `bot-ops-status-board`) tracks `main` on this repo
  and redeploys on every push.
- **GitHub Pages** (fallback, not wired up): a manual-dispatch workflow that builds with
  `BASE_PATH=/<repo>/` and publishes `dist/` exists in the source project as
  `.github/workflows/pages.yml`. It was not pushed here because the publishing token lacks the
  `workflow` scope; add it from the GitHub UI if Railway ever needs a backup host.
