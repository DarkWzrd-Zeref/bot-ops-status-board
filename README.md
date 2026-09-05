# Bot Passport / Bot Ops Status Board

Ledger-first, mobile-first PWA that mirrors Jorge's bot-ops ledger (a Google Sheet) into a
single dark status board: Police, Researcher, Engineer, Stay on Track, AM twin, CoS.

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

- **Railway** (primary): the `Dockerfile` builds the site and serves `dist/` with nginx on `$PORT`.
  Connect the GitHub repo to a Railway service and generate a `*.up.railway.app` domain.
- **GitHub Pages** (fallback): `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and
  publishes `dist/` on every push to `main`.
