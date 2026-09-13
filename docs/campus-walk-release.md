# AREA 67 campus / walk release

## v1.3.0

User-authorized presentation and first-person upgrade on the v1.2.6 production tree.

- Cursor Ultra's PR13, `457948db16667484853584eafdd51f58e3888c39`, supplies the pure `stationMapLabel` helper, canvas short/full label behavior and regression test. Its World3D hunks are ported into the redesigned renderer. Do not merge PR13 separately after this release.
- Native Three.js architecture replaces the old generic station bodies: fabrication hangar, open exchange, reactor, observatory, signal house, armored vault, archive shelter, scan gate and distinct civic structures. Materials are batched by building. All25 kits fit their existing footprint; no station IDs, coordinates, assignments or storage records change.
- Volumetric robots (including heavier Grok Heavy) and large-cranium aliens replace flat billboards in the primary renderer. Work-arm movement follows fresh actual work signals. Existing portrait and fallback image assets are retained. No missing Claude PNGs are claimed as delivered.
- Perspective first-person spectator mode uses continuous radius-aware collision, wall sliding, bounded substeps, fresh-grid hydration recovery and explicit inspect. Desktop WASD/drag/E/Escape plus touch direction buttons/drag/Inspect; always return via Overview. No automatic pointer lock or permission prompt. Walking never assigns agents, builds/demolishes stations, changes shared player records or calls external tools. Active lift blocks entry; existing overview camera state is retained.
- Screen-space label packing limits overlapping labels; selected/focused items have priority. All stations remain discoverable via a full-name atlas selector in both renderers. First-person uses a reticle and contextual inspect action rather than floating labels.
- On-demand edge panels, separate inspector/build-tool content, agent search, compact mobile controls, subdued ground surfaces and district inlays. Existing96x72 map, terrain, river crossings and roads are preserved. This is a campus presentation/navigation redesign, not a destructive layout migration.

## Team scope

Grok Heavy remains temporary decorator; Claude art attribution preserved. Cross-checked WANT proposals. No new private project buildings, peer roster reassignment, hidden live idle agents, EMPTY/STAFFED inference, external integration grants or engine migration included. Future40-agent onboarding still needs the separate identity/registry design. Unreal/Blender specialist roles are planned, not connected services.

## Validation

Typecheck, production build and71 regression tests pass (including geometry footprint/material-batch checks, volumetric character checks, walk collision/recovery and label packing). Read-only input review caught and corrected fallback atlas navigation and mobile bottom-control overlap. No browser, device, GPU frame-rate or iPhone visual QA has been performed.40-agent performance is a future test target, not certified capacity. First person requires WebGL; canvas fallback keeps navigation/boards/chat but disables that toggle.

## Release procedure

Publish exact verified commit to existing Railway service only; retain existing data volume and private key configuration. Verify health version/commit, emitted asset URLs and original live base/card identities. Post timed reentry instructions only after verified success; peers must acknowledge themselves. No second deployment for PR13.
