<a id="checkpoint-departamento-sol-y-pipeline-reproducible--27092026"></a>

# Checkpoint: apartment, sunlight and reproducible pipeline — 27/09/2026

This iteration integrates T3 into the building, connects interior sunlight and
reviews the architecture before adding more features. The previous checkpoint
is preserved in [building and sunlight](t3-building-sun-v1.md), commit `f697996`;
the original interior remains in [initial T3 state](t3-current-state-v1.md),
commit `5e45d4e`.

<a id="estado-implementado"></a>

## Implemented state

- T3 is identified within the building with floor and interior cutaways.
  Provisional registration from the user's mark and photograph: third floor,
  elevation 9.30 m, living room facing SW and bedrooms facing NE. This is not a
  measured location.
- The regional example's date/time is shared between both views, with seasonal
  presets, day playback and room focus. The building can be hidden in the
  interior view while retaining its shadow effects.
- Complete walls, roof and physical context continue casting shadows when cut
  away for the camera. Openings are segmented and glass is transmissive.
- `App` is reduced to composition and shared state. Explorers, solar controls,
  apartment state, camera and shadow materials are separate. Both viewers draw
  on demand; after idle, the camera interpolates without jumping and completes
  movement of both its position and focus point.
- A complete versioned scene contract and deterministic exporter allow Blender
  to reconstruct the assembly from repository files with its GUI closed.

<a id="datos-y-recuperación"></a>

## Data and recovery

Sources of truth and extension rules are in
[architecture.md](../architecture/architecture.md). Editable data remains under
`apps/web/src/data`; the schema and pure geometry are in `packages/`.

`pnpm scene:snapshot` generates scene and dossier JSON; `pnpm scene:verify`
detects stale outputs. The main file is `assets/scenes/t3-project.json`:
apartment, assets, placement, segmented walls, floors/roof, context and sun. The
reference instant is **26/09/2026 at 15:00 Europe/Paris**, fixed for stable diffs.
The web date is independent of this saved snapshot.

The four historical `.blend` files and 19 GLBs (18 catalog assets and one sample
frame) remain versioned. The new combined scene is generated at
`artifacts/blender/t3-project.blend`; it includes JSON, solar metadata and packed
image resources. The new adapter avoids overwriting historical `.blend` files.
Its PNG and detailed reports stay under Git-ignored `artifacts/` because they
are reproducible.

The pipeline uses installed Blender in the background. Assembly/rendering does
not need MCP, an add-on, an open Blender window or original photographs. Original
media remains outside the repository and was not used as private textures.

<a id="validación"></a>

## Validation

- `pnpm check`: lint, TypeScript, **77 tests** (35 web, 6 geometry, 6 schema,
  10 export and 20 Python), generated snapshot verification and build.
- Tests cover openings, transforms, areas, asset references, an independent
  astronomical source, clock changes, invalid input, stale snapshots and shared
  material restoration.
- WebGL browser: winter at 15:00, living-room focus after idle, labels, context,
  building cutaway and round trips preserving date, time and selection. No
  console errors in that session; the upstream `THREE.Clock` warning persists.
- Persistence audit: five `.blend` files reopened in independent processes (four
  historical and the new combined file), and 19 valid GLBs. No missing render
  resources or byte changes caused by the audit. An optional Blender brush
  library belongs to editing tools, not rendering.
- Real Cycles CPU render at **960 px / 32 samples**: 21 furnishing instances,
  context of 99 buildings, verified solar direction (angular error 0) and
  cutaways retaining shadows. Saved scene reopened with an active camera, one
  sun, embedded JSON and no external resources. Reports:
  `artifacts/reports/assets.json`, `artifacts/reports/generated-scene.json` and
  `artifacts/blender/t3-project.validation.json`.

The build retains the large Three.js bundle warning: approximately 1.47 MB
minified / 409 kB gzip. The warning limit was not raised to hide it.

<a id="próximas-extensiones"></a>

## Next extensions

The foundation supports a render-job adapter, camera presets, seasonal
comparisons and design variants. There is still no render queue integrated into
the UI or animation of the new Blender scene: it uses the selected instant and
saves daily samples for a future extension.

Geometry and solar direction are shared; materials, brightness, decoration and
some visual details depend on the renderer. Do not assume pixel equality between
web and Blender or treat historical `.blend` files as the current scene.
Dimensions, windows, fit and orientation remain estimates. See
[placement](../model/apartment-placement.md) and [solar limits](../model/solar-model.md).

<a id="retomar"></a>

## Resume

```sh
pnpm check
pnpm dev
pnpm blender:validate
pnpm blender:render
```

Open `http://localhost:5173/#apartment`. To change the render date without
rewriting the versioned reference, export with `--output` and pass that file with
`--input`; examples are in [blender.md](../workflows/blender.md).
