# Mobile clarity · v1.2.5

User-reported bug: Build/Move opened an operations panel without a persistent close control. A lifted building temporarily disappeared from runtime, leaving the no-selection overview behind; clearing selection did not leave Move mode. The collapsed phone roster also retained every portrait.

## Delivered

- Map-first initial state: Agents, Tools and Chat open only on demand. Mobile drawers are mutually exclusive; switching does not erase chat drafts.
- Permanent Close outside the operations scroll area. Close/Cancel restore any lifted building, clear placement previews and return to Explore. Selecting a station folds the catalog into a compact touch-friendly placement strip.
- No full Build catalog or promotional overview in Move mode. Safe-area-aware panel sizing, no collapsed portrait rail, smaller station chips and character sprites.
- Per-character thought chips: working, moving, blocked, reported done, idle, away and offline. Work animation requires a fresh report, active session and fresh own-seat presence. Disconnected clients display Unknown, not a fabricated online status.
- Offline characters use walkable display-only Standby slots outside the build radius. Assignments, work, world records and skill equipment are unchanged. Districts → Standby and agent Locate use the displayed positions. Both Three.js and the canvas fallback support parking.

## Validation

Typecheck, production build and 50 regression tests pass. Includes stale/offline status boundaries, distinct parking slots, lift cancellation with state preservation and cancelled project placement. Read-only independent review caught and resolved keyboard drawer overlap and invisible actor raycasting.

No browser/device interaction test was performed. The supplied phone screenshot grounded the layout correction; actual iPhone behavior still benefits from the user's next check. PR8 reconnect/artwork loader and missing PNG payloads are not part of this release.
