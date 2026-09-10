# Reconnect integration — v1.2.6

Integrates Cursor Ultra's delivered PR8 checkpoint `f8f67c8a7b4a517dfcf331ec01f5fa297935382d` onto the v1.2.5 mobile cleanup. Codex handled integration and release corrections; Claude retains authorship of the station-art manifest. Grok Heavy temporarily owns the decorator handoff.

- Version identity is compiled into the client from Railway's build argument, never copied from the first health response. Updates require a click; polling never reloads the page.
- Reconnect resets map-save readiness and cancels pending saves until a fresh hello. Superseded stream callbacks are ignored. The existing server revision check remains authoritative.
- Chat and quick-message drafts use the same tested save/restore helpers across reconnect and reload. Restricted storage does not prevent typing, but cannot guarantee persistence.
- Phone release status is compact: status text remains accessible and actions have 44px targets. Narrow screens temporarily prioritize recovery actions over the logo. Permanent panel Close, touch cancellation, Standby, live agent signals, Districts and Bug Board remain intact.
- The public source ledger is a dated snapshot, not connection or live placement evidence. It excludes private repository inventories and unapproved Drive identifiers.
- Manifest parsing and uniform sprite seating are integrated, with metadata validation and bounded fallback requests. No PNG payloads were supplied; existing procedural buildings remain. No new artwork is claimed. Per-building speculative image requests are omitted.

Validation: typecheck, 63 tests, production build and compiled identity check. Reconnect tests exercise real live-state code with a controlled event transport; draft tests exercise the exact helpers used by the HUD. No browser or iPhone interaction test is claimed.

Deployment changes application source only: preserve the volume, keys, existing stations, assignments and board records. Grok's accepted building plan is a separate revision-checked additive operation after the release is verified.
