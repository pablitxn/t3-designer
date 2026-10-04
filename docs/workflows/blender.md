# Blender rendering and optional Codex connection

The project has two independent Blender workflows: a reproducible background
pipeline for validation/rendering, and an optional MCP connection for editing an
open Blender session. The background pipeline does not need the GUI, an add-on,
MCP, `uv`, telemetry consent or external asset providers.

See [architecture](../architecture/architecture.md) for the data contract and extension
boundaries, and [solar assumptions](../model/solar-model.md) for the study's limits.

## Headless prerequisites

Use Node.js 24+, the repository's pinned pnpm, an installed Blender executable,
and Python 3.10+ for the asset audit and Python tests. Blender runs scene scripts
with its own bundled Python. The implementation has been exercised with Blender
5.2.2 LTS on macOS.

`scripts/run_blender.mjs` chooses the executable in this order: `BLENDER_BIN`,
`/Applications/Blender.app/Contents/MacOS/Blender` on macOS when present, or
`blender` on `PATH`. For another installation:

```sh
BLENDER_BIN=/path/to/blender pnpm blender:render
```

The runner starts a separate process with `--background`, `--factory-startup`
and `--python-exit-code 1`. `assemble_project.py` also requires background mode
and never works on the open GUI session.

## Export and verify scene data

```sh
pnpm scene:snapshot
pnpm scene:verify
```

The exporter validates the project against schema version 1, checks that declared
render assets exist, and writes deterministic JSON. The default instant is
**2026-09-26 at 15:00 in Europe/Paris**. No browser state or current clock is read.
Without `--output`, it refreshes four tracked files:

| File | Contents |
| --- | --- |
| `docs/snapshots/t3-apartment.json` | Apartment geometry and metadata |
| `docs/snapshots/current-fixtures.json` | Asset catalog and fixture placements |
| `docs/snapshots/building-site.json` | Geographic context and solar samples for the older exterior adapter |
| `assets/scenes/t3-project.json` | Complete project, placement, physical wall/floor/ceiling solids, context sections and solar data |

Run from the repository root. Export options are:

| Option | Behavior |
| --- | --- |
| `--date YYYY-MM-DD` | Paris calendar day; defaults to `2026-09-26` |
| `--time HH:MM` | Paris local time from `00:00` to `23:59`; defaults to `15:00` |
| `--occurrence reject\|earlier\|later` | Resolve a repeated autumn clock time; defaults to `reject` |
| `--output path.json` | Write only the combined project snapshot to this path |
| `--check` | Compare selected files with expected bytes; write nothing and fail if missing or stale |
| `--help`, `-h` | Show exporter help |

A nonexistent time during the spring clock jump is rejected. The selected instant
is stored exactly, including minutes outside a quarter-hour. Separate daily
samples advance every 15 real minutes, so they retain the missing/repeated civil
hour. `defaultFrame` identifies the closest sample for timeline adapters; the
combined builder uses the exact selected instant, not that sampled frame.

For a seasonal variant without replacing the tracked defaults:

```sh
pnpm scene:snapshot --date 2026-12-21 --time 15:00 --output artifacts/scenes/winter.json
pnpm scene:snapshot --check --date 2026-12-21 --time 15:00 --output artifacts/scenes/winter.json
```

`pnpm scene:verify` is shorthand for `scene:snapshot --check` with the defaults.
After changing a tracked snapshot to another date, verify with those same
arguments or regenerate the defaults before running `pnpm check`.

## Audit tracked assets

```sh
pnpm blender:validate
```

This runs ordinary Python: `scripts/blender/validate_assets.py`. It audits the
Git-tracked `.blend` and `.glb` files and writes
`artifacts/reports/assets.json`. Each `.blend` is opened in an isolated Blender
background process with automatic script execution disabled. The audit checks
loadability, external resources, GLB structure and catalog dimensions; file hashes
confirm that the `.blend` inputs remain unchanged. It does not save or render.

The audit accepts `BLENDER_BIN`, or explicit options when invoked directly:

```sh
python3 scripts/blender/validate_assets.py --blender /path/to/blender --report artifacts/reports/assets-custom.json
```

Without `--report`, direct invocation creates a report in a temporary directory.
The report distinguishes errors from warnings, including optional Blender brush
libraries. A successful audit establishes file integrity and resource
portability; it does not establish parity with the current web scene or physical
lighting accuracy. If Blender is unavailable, `.blend` loading remains unverified
and the audit fails.

## Build and render the combined project

```sh
pnpm scene:snapshot
pnpm blender:scene
pnpm blender:render
```

Both Blender commands consume the saved `assets/scenes/t3-project.json`; they do
not regenerate it. `blender:scene` writes the combined scene and validation
report. `blender:render` also produces a PNG using Cycles CPU. The default outputs
are:

- `artifacts/blender/t3-project.blend`
- `artifacts/blender/t3-project.validation.json`
- `artifacts/renders/t3-project.png` when rendering

Everything under `artifacts/` is ignored by Git. The builder accepts these options
after either pnpm command:

| Option | Behavior |
| --- | --- |
| `--input path.json` | Combined project snapshot; defaults to `assets/scenes/t3-project.json` |
| `--output path.blend` | Scene output; defaults to `artifacts/blender/t3-project.blend` |
| `--render [path.png]` | Render a PNG; omitting the path uses `artifacts/renders/t3-project.png` |
| `--resolution N` | Image width, 64–8192 px; defaults to 960; height is rounded from width × 0.83 |
| `--samples N` | Cycles samples, 1–4096; defaults to 32 with denoising |
| `--context` | Show the physical building and neighbours to the camera |

For example:

```sh
pnpm blender:render --input artifacts/scenes/winter.json --output artifacts/blender/winter.blend --render artifacts/renders/winter.png --resolution 640 --samples 12 --context
```

Context always participates in shadows. `--context` changes camera visibility;
the apartment ceiling and wall tops are also hidden from camera rays while
remaining solar occluders. The builder uses exported wall solids around openings,
the same rigid apartment placement and the exported astronomical sun direction.
It loads the declared fixture GLBs and uses clear glazing. It does not recalculate
the sun with a separate Blender astronomy implementation.

The saved `.blend` embeds the complete source JSON and the builder's source. Scene
metadata records the input path/hash, selected UTC instant, timezone and placement
assumption. Its JSON validation report checks solar direction, fixture count,
apartment clearance and shadow participation of the context. A combined render
has passed with **Cycles CPU, 960 px width and 32 samples**, producing 21 fixture
instances in the 99-building context.

Materials, facade decorations, inferred roof forms and diffuse sky lighting are
renderer-specific approximations. Sharing geometry, placement and solar inputs
does not imply identical images between Three.js and Cycles. Dimensions and
registration remain estimated, so the result is a visual study, not a measured
or certified solar report.

## Preserved references and asset authoring

The combined builder refuses any `.blend` output inside `assets/blender`. These
four historical files remain separate editable references:

| Preserved file | Purpose |
| --- | --- |
| `assets/blender/asset-library.blend` | Editable library of 18 current-state assets |
| `assets/blender/door-frame.blend` | Original door-frame sample |
| `assets/blender/t3-current-state.blend` | Standalone apartment reference scene |
| `assets/blender/t3-building-context.blend` | Standalone exterior reference with a sampled solar timeline |

Their saved content reflects their respective checkpoints; asset integrity does
not imply that each reference contains the current combined scene. The older
reference builders are retained for explicit regeneration:

```sh
pnpm blender:sample     # Rebuild sample .blend, PNG and GLB
pnpm blender:assets     # Rebuild asset library, preview, 18 GLBs and manifest
pnpm blender:apartment  # Refresh snapshots and rebuild the standalone apartment
node scripts/run_blender.mjs assemble_building.py --render
```

These older commands regenerate their named files under `assets/blender` and
`apps/web/public/models`; save authored variants under different names first.
The exterior adapter reads `docs/snapshots/building-site.json` and its sampled timeline.
See [exterior reference details](../research/building-research.md#escena-blender-editable).

The sample generator, `scripts/blender/create_door_frame.py`, exports
`apps/web/public/models/door-frame.glb` and
`assets/blender/door-frame.png`. Its opening is **0.80 × 2.10 m**, with 0.06 m trim
and 0.14 m depth; outside bounds are **0.92 × 2.16 × 0.14 m** in Three.js XYZ. These
are sample values, not surveyed apartment dimensions. The sample is not placed
in the apartment. Its original validation covered GLB loading, three meshes,
PBR material, metric bounds and a floor-level origin.

Asset conventions:

- One unit is one meter; apply object scale before export.
- Origins are floor-centered, with asset fronts facing +Z in the web.
- Web/site points `[x,y,z]` become Blender `(x,-z,y)`. Export with
  `export_yup=True` to return to glTF/Three.js Y-up coordinates.
- Export only the asset selection, apply modifiers and use glTF-compatible PBR
  materials. Bake procedural textures before using them as web assets.
- Canonical apartment geometry remains in `apps/web/src/data/t3.ts`; asset
  creation does not turn estimated dimensions into measurements.

## Generate an isolated asset job

The asset worker accepts a metric JSON request and builds a parametric table,
a photo-informed STRANDMON chair draft, or bounded declarative furniture parts.
The script itself does not fetch
websites or call an AI service. It runs in
Blender background mode and refuses an existing output directory or a repository
destination outside `artifacts/`:

```sh
pnpm blender:generate --input scripts/blender/fixtures/table-job.json --output-dir artifacts/generated-assets/my-table-v1
```

Use a new directory for each attempt. Outputs are `model.glb`, `source.blend`,
`preview.png`, `request.json`, and `manifest.json`. The manifest records source
evidence, measured export bounds, hashes, Blender/recipe versions and a tabletop
support polygon in web coordinates. It is written only after export validation
and any requested preview succeed. `validated` means this technical check passed,
not that a commercial product has been reproduced or visually approved.

Options: `--resolution` (64–1024, default 384), `--samples` (1–256, default 16),
and `--skip-preview`. The fixture requests width × height × depth of
1.20 × 0.75 × 0.70 m. Tests of request validation run with the existing Python
test suite; no Blender import is needed for them.

For the chair selected during research:

```sh
pnpm blender:generate --input scripts/blender/fixtures/strandmon-job.json --output-dir artifacts/generated-assets/my-strandmon-v1 --resolution 640 --samples 32
```

This recipe adds `front.png` and `side.png` when previews are enabled. Its source
records the exact IKEA variant and references, the conflicting published seat
measurements, and inferred details. The manifest distinguishes the draft's
visual-review status from its technical export validation. Its outside dimensions
are 0.82 × 1.01 × 0.96 m; no claim of manufacturer CAD or verified visual fidelity
is made. The original generated fabric texture is embedded in the GLB.

The [local asset backend](local-asset-workshop.md) now wraps this building block
with a persistent SQLite queue, cancellation, timeouts, local storage and a Codex
SDK adapter. It spawns Blender asynchronously; the synchronous repository runner
is not used in an HTTP request handler. Remote deployment still needs service
authentication, worker isolation, quotas and shared storage. See the
[research and proposed architecture](../research/server-asset-generation.md).

## Optional live MCP editing

The following local connection was configured and verified on **2026-09-26**:

- Blender **5.2.2 LTS**, `/Applications/Blender.app`.
- Community integration **mcp-for-blender 2.1.0**, installed with `uv tool`.
- Matching bundled add-on, protocol **11**, enabled in saved Blender preferences.
- Codex server `blender`, registered in `~/.codex/config.toml` using the expanded
  absolute path to `~/.local/bin/mcp-for-blender`.
- Local socket **127.0.0.1:9876**. Keep it local: it executes Python inside Blender
  and has no authentication.
- `DISABLE_TELEMETRY=true` in the MCP environment and **Allow Telemetry** disabled
  in Blender. External asset/generation providers remain disabled.

For live editing, open Blender and run `pnpm blender:check`. This performs an MCP
handshake, checks the matching add-on and disabled consent, and lists available
tools. It fails if the open Blender instance is unreachable. Save important work
before requesting scene edits.

If disconnected, use the 3D Viewport sidebar (`N`) → **MCP for Blender** → start
the server. Some upstream labels mention Claude; the connection also works with
Codex. A Codex session opened before registration may need reopening to load the
server configuration. The original setup was tested with an MCP client and
`execute_blender_code`, not only a socket probe.

To reinstall that recorded version on another Mac with Blender and `uv`:

```sh
DISABLE_TELEMETRY=true uv tool install mcp-for-blender==2.1.0
DISABLE_TELEMETRY=true "$HOME/.local/bin/mcp-for-blender" install-addon
codex mcp add blender \
  --env DISABLE_TELEMETRY=true \
  --env BLENDER_HOST=127.0.0.1 \
  --env BLENDER_PORT=9876 \
  -- "$HOME/.local/bin/mcp-for-blender"
```

Enable the matching add-on, keep **Allow Telemetry** off and save preferences.
Run `pnpm blender:check`. Upgrade the MCP package and its bundled Blender add-on
together deliberately. This optional connection is independent of the headless
commands above.

References: [MCP for Blender](https://github.com/ahujasid/mcp-for-blender) and
[Codex MCP configuration](https://developers.openai.com/codex/mcp).
