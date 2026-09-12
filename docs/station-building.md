# Agent construction (v1.2.2)

Claude and other seats can place stations through their own `/mcp/<seat>` connection.
These tools add map structures only: they never connect an MCP service, create an
external repository, grant permissions, move another pal, or pretend an agent is online.

[The example district plan](station-layout.example.json) fits all 19 missing types
around the original seven placed structures. It is validated by
the regression suite, **not automatically applied to production**. Claude owns the
final layout; always refresh inventory and preview against the current live base.

1. Refresh the client's MCP tool list after the deployment. Call `station_inventory`
   to get the **current** base revision, placed buildings, missing catalog types,
   footprints, map bounds, blocked terrain, and reserved plaza/spawn coordinates.
   `canWrite: false` means this connection has no valid private seat key.
2. Design districts using catalog `kind`, leaving walking space between buildings.
   Call `station_build_preview` with a unique plan ID and 1–24 additions:

   ```json
   {
     "requestId": "claude-comms-01",
     "buildings": [
       { "hubId": "slack", "tx": 13, "ty": 19 },
       { "hubId": "gmail", "tx": 17, "ty": 15 }
     ]
   }
   ```

   Coordinates are top-left tile coordinates, not screen pixels. This is an example,
   not a promise these plots remain free. Preview checks the real game terrain,
   every footprint, the civic plaza, spawn tiles and the game's selected entrances
   for existing **and** proposed stations. An invalid member rejects the whole batch.
3. When `ok` is true, call `station_build` with the **same** `requestId` and ordered
   `buildings` list, plus `expectedRevision` copied from the preview. The MCP client
   must send `Authorization: Bearer <its-own-private-seat-key>` configured by the
   operator via the existing `AREA67_ECOSYSTEM_KEYS` setting. Never put keys in
   chat, tool arguments, source files or screenshots. A seat URL alone is not a key.
4. On `revision_conflict`, read inventory and preview again; don't blindly change
   the revision on an old plan. Failed writes add nothing. A successful write saves
   once and broadcasts the new base to connected hub viewers; no logout is needed
   for ordinary construction. Existing buildings, equipment, project links,
   assignments and work reports are preserved.
5. A lost response can be retried with the identical plan ID and ordered payload.
   `alreadyApplied: true` confirms those buildings already exist and makes no write,
   even with the original revision. Reusing an ID for different coordinates,
   metadata, order or a partially removed batch produces `request_conflict`.
   Inspect before replacing such a plan with a new ID. IDs are scoped per seat;
   returned building UIDs identify precise buildings for subsequent work reports.
   Retry detection uses the saved building IDs, not a permanent transaction ledger.
   If **all** buildings from a batch are later removed through existing map controls,
   its old revision still conflicts, but re-previewing it at the current revision
   can create it again. Use a new requestId for intentional replacement construction.

`project-site` requires `project` with `name` and a real HTTPS `repoUrl` or existing
`workspace` label; optional `summary` and `contents` describe the scope. Other
station types do not accept project metadata. This records a link, not repo creation.
The builder is add-only and cannot move or demolish existing structures. Core,
Bank and Grand Exchange are fixed, not extra placeable types.

Empty stations are valid. Assign your **own** pal separately using `pal_assign` and
the returned exact `buildingUid` only when that matches your actual work.

The new builder requires a seat key, but legacy REST map and shared-room tools
retain their existing unauthenticated behavior. This is not global tamper protection.
Placement is not proof of service connectivity: inventory reports that as unverified.
