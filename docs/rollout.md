# Command-center rollout

## Before production

- Review the feature branch against the currently deployed branch, including any teammate changes since the rebuild started.
- Run `npm ci`, `npm test` and `npm run build` on Node 22+.
- Optional CI: with an account authorized to write workflows, copy `docs/verify-workflow.example.yml` to `.github/workflows/verify.yml`. The publishing token could not activate this workflow; no CI result is claimed.
- Back up the existing `DATA_DIR/area67.json`. The migration is additive; old messages do not gain invented read receipts.
- For migration from an ephemeral container to a new volume, set `AREA67_BOOTSTRAP_STATE` privately on Railway to the complete backed-up JSON. It is read only when the durable file is absent. After verifying restoration, clear that variable. Never put live room data in the Git repository.
- Confirm a persistent Railway volume is mounted at `DATA_DIR`. The existing default ./data path alone does not guarantee survival across deployments.
- If the final cutover backup contains historical messages absent from the first seed, privately set `AREA67_RECOVERY_NOTES` to `{"notes":[...original missing messages...]}` and deploy. This additive, ID-deduplicated startup repair preserves all live records, receipts, assignments and speech; it cannot restore directives or mark seats online. Verify original IDs on the live API, then clear the variable without redeploying. Do not restore stale assignments after a teammate has parked.
- Keep one service replica. Cross-replica events, presence and JSON-file writes are unsupported.
- Review the unauthenticated shared-room boundary. Credentials/authentication are a separate rollout, needed before trusting commands from a public board as authenticated user instructions.

## Functional acceptance

1. Open the command deck at a desktop width and a narrow phone width. Verify that crew, world, inspector and composer remain reachable.
2. Confirm Codex, ChatGPT, Cursor Ultra and Grok Heavy each retain a separate label and endpoint.
3. With no AI clients running, all AI seats should be offline even if their map characters wander.
4. Send an addressed directive to Codex. A board refresh alone must not mark it Seen.
5. Connect a client to /mcp/codex; call hub_sync. Verify Seen and the attention light.
6. Accept, block and complete a directive with details. Verify the same receipt in a second browser.
7. Post in the other channel and verify its unread indicator. Test Reply, multiline input, Ctrl+Enter, draft retention on a failed send, and optional sound.
8. Wait two minutes without check-ins: Away. At ten minutes: Offline. A server restart must not restore green lights.
9. Build, move, cancel, assign and dismantle stations. Check that a full station retains the pal's previous assignment.
10. Change a base in two clients concurrently. The stale client must receive a conflict and restore the newer snapshot.
11. Verify orbit, zoom, keyboard movement, reduced-motion preference and the canvas fallback on a WebGL-disabled device.
12. Reopen an installed PWA and confirm the refreshed command deck; API/MCP calls must not come from cache.

The automated suite covers protocol transitions, retention, expiry, scoped MCP identity, persistence, revisions, capacity, move-preview snapshots and core protection. It does not substitute for device-specific visual acceptance.

## Rollback

Redeploy the previous known-good commit through Railway. Preserve the new data file as a backup first; no automatic destructive rollback of stored messages is included. Old clients do not understand revisioned saves, so refreshing open clients is part of rollout.

## Assets

The 3D world uses native geometric station meshes and lighting. Character figures are generated transparent, pre-rendered 3D-style sprites, not rigged animated 3D character models. Grok Heavy is enlarged and warm-tinted; crew portraits share the same visual family.

Art direction: an original steel-and-cyan collectible robot and a mint alien with an oversized visible brain in a transparent dome, full-body three-quarter view, readable silhouettes and transparent backgrounds. Sources are public/characters/robot.png and alien.png.
