# Current-state reconstruction checkpoint — 2026-09-26

## Implemented

- Eight area-consistent zones, 18 walls, eight door/passages and four observed
  window/glazed-access openings. Revised service strip and bedroom portals from
  photographic evidence; outward WC leaf; cased kitchen opening.
- Warm narrow parquet, kitchen gray tiles, pale bathroom tiles, gray-green entry
  and WC finishes; profiled blue-gray/pale-gray trims, baseboards and thresholds.
- Casement frames, glazing, sills, shutter boxes, bedroom guards and balcony rail.
- 18 original Blender GLB asset families, 21 placed instances: kitchen appliances,
  cabinets, bathroom fittings, radiators, electrical panel and a low wooden table.
- Counter fillers and backsplashes, washer wood cap, utility shelves, exposed pipes,
  representative entrance damage and an actual hole in the closet-door panel.
- Room camera focus, top view, cutaway, layer toggles and downloadable asset inventory.
- Derived Blender scene assembled from the same serialized domain data.

## Source of truth and regeneration

1. Edit `apps/web/src/data/t3.ts` for architecture.
2. Edit `apps/web/src/data/current-state.ts` for catalog/placements.
3. Regenerate snapshots with `pnpm scene:snapshot`.
4. Author asset changes in `scripts/blender/create_current_assets.py`, export via
   live MCP or `pnpm blender:assets`, and keep catalog dimensions aligned.
5. Rebuild the derived DCC scene with `pnpm blender:apartment`.
6. Run lint, typecheck, tests and build. Inspect the app after geometry changes.

## Material limitations

Reported areas are 49.18 m²; no linear measurements were supplied. All wall lengths,
heights (2.70 m), opening positions, object dimensions and placements are estimated.
The two-bedroom identity and bathroom room-local arrangement are provisional.
The shower and glass partition are represented without claiming a calibrated
bathroom layout. The kitchen aisle remains narrow in this estimate; do not treat
it as measured clearance or a construction plan. Wall thickness overlays area
zones; visible clear areas are smaller. Wear is representative, not exhaustive.

Blender previews and web rendering have different lighting/material pipelines.
The web mirror/glass use lightweight PBR, not accurate live reflections. No ceiling
mesh is used in the inspection view. No renovation proposal, furniture editor,
manufacturer CAD replica or measured digital twin is claimed by this milestone.

The app uses a large Three.js bundle and can emit the upstream THREE.Clock
warning. This checkpoint includes the previously prepared Blender setup and sample asset.

## Saved milestone

Checkpoint tag: `checkpoint/t3-current-state-v1` (local Git tag).

This milestone includes the web reconstruction, validated domain data, reusable
GLBs, editable Blender library, derived apartment scene, previews, generation
scripts, and the evidence index. Original WhatsApp media and extracted video
frames remain local and are excluded from this commit. Python caches and Blender
backup files are also ignored.

Validation completed on 2026-09-26 before saving this checkpoint:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (19 passing tests), `pnpm build`.
- `python3 scripts/blender/validate_current_assets.py`: 18 valid GLBs,
  137,380 triangles, 9,266,588 bytes; metric bounds/origins and embedded textures.
- Browser inspection: room focus, plan/perspective, full-height/cutaway walls,
  labels, equipment visibility and asset inventory.
- Live Blender scene and saved render visually inspected; original scene retained.

To resume, read this file and `docs/reference/evidence.md`, then run `pnpm dev`.
The next modeling priority is measured geometry and the bathroom's precise
shower/partition arrangement, followed by more faithful materials and wear.
The checkpoint remains a first visual reconstruction, not a measured 1:1 model.
