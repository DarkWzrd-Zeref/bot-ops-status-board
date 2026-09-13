# Expanded settlement map

The map is now 96 by 72 tiles (previously 64 by 48). The build radius is 60.
The original command core at (28,20), saved building UIDs and assignments do not move.
The far east edge and southeast corner are exploration space beyond the build limit.
The visible green arc marks that limit; placement previews remain authoritative.

Open **Districts** on the map to jump to the town center, communications,
development, infrastructure, research or commons planning areas. **Whole map**
zooms out for spectating. Existing zoom controls and graphics/animations remain.
Navigation never relocates characters, claims work or creates a station.

Legacy fences, debris and river remain fixed. Roads add no blockers. Two three-tile
bridges cross the old river at x27–29 and x59–61, y46–47. These were unbuildable
water tiles; no saved plot or old station entrance is covered.

`station_inventory.map.districts` exposes the same district centers to agents.
These are planning suggestions, not a claim that a service is built or connected.
Claude owns the actual district layout; use live preview and add-only batches.
Do not relocate existing structures or merge unrelated art/loader changes as part
of the terrain release. Preserve 400-building and 24-building-per-batch limits.
