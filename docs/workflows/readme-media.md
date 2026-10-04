# README screenshots and GIFs

The [README](../../README.md) uses real browser captures in English and light
mode. Geometry, controls, saved-model history and caveats come from the app.
There are no mock interfaces, invented generation events or retouched scenes.

## Prerequisites

Use the repository's Node.js/pnpm versions, Playwright Chromium and FFmpeg on
`PATH`. The scripts reuse the web workspace's pinned Playwright dependency.

```sh
pnpm install
pnpm --filter @t3-designer/web exec playwright install chromium
pnpm dev:web --host 127.0.0.1 --port 5173 --strictPort
```

Keep Vite running. In another terminal at the repository root:

```sh
node scripts/capture_readme.mjs
node scripts/capture_readme_interactions.mjs
node scripts/capture_readme_energy.mjs
README_GALLERY_BASE_URL=http://127.0.0.1:5173 node scripts/capture_readme_workshop.mjs
node scripts/capture_readme_reference.mjs
```

The public and reference commands use the running static demo. The workshop command starts
its own temporary API and Vite server on ports **8793** and **5193**, then stops
them. It activates a throwaway demo account and creates a real private project;
it never uses the operator's accounts or personal browser session. Generation
is disabled, and an assertion checks that no generation request was submitted.
Temporary account and library data is removed on normal completion or error.

Each script opens a fresh browser session and declines optional analytics if configured.
Animation scripts keep raw frames in a unique ignored directory under `artifacts/readme/`.
The default demo has no consent banner because analytics is unconfigured. To use
an already installed Google Chrome instead of Playwright Chromium, set
`T3_PLAYWRIGHT_CHANNEL=chrome`. The workshop server explicitly selects full mode;
the other captures need only the default static demo.
Capture requires local browser processes, loopback access and WebGL 2. The energy
script explicitly uses SwiftShader; these images are not GPU compatibility tests.
The app's canonical model, snapshots and Blender sources remain unchanged.

## Capture into a review directory

Set `README_MEDIA_DIR` to review an output before replacing checked-in media:

```sh
README_MEDIA_DIR=artifacts/readme-preview node scripts/capture_readme.mjs
README_MEDIA_DIR=artifacts/readme-preview node scripts/capture_readme_interactions.mjs
README_MEDIA_DIR=artifacts/readme-preview node scripts/capture_readme_energy.mjs
README_MEDIA_DIR=artifacts/readme-preview README_GALLERY_BASE_URL=http://127.0.0.1:5173 node scripts/capture_readme_workshop.mjs
```

Paths are resolved from the repository root. Other options:

| Variable | Scope and purpose |
| --- | --- |
| `README_BASE_URL` | Public capture scripts; defaults to `http://127.0.0.1:5173` |
| `T3_PLAYWRIGHT_CHANNEL` | Browser channel; defaults to Playwright `chromium`; `chrome` uses installed Google Chrome |
| `README_REFERENCE_DIR` | Reference screenshots; defaults to `docs/reference` |
| `README_CAPTURE_ONLY=furniture` or `walkthrough` | Interaction script; rerun only one sequence |
| `README_WORKSHOP_WEB_PORT` | Workshop's isolated Vite port; defaults to `5193` |
| `README_WORKSHOP_API_PORT` | Workshop's isolated API port; defaults to `8793` |
| `README_WORKSHOP_SKIP_GALLERY=1` | Workshop script; reuse an already captured public gallery |
| `README_GALLERY_BASE_URL` | Workshop script; capture the gallery from a separate static demo URL before using its isolated full-mode server |

Use free ports. Stop only the processes started for your capture; do not replace
an existing developer's backend or reuse their account database.

## Media inventory

| File in `docs/media/` | What the real UI shows |
| --- | --- |
| `apartment-overview.png` | Perspective cutaway at 16:00, fixtures, materials and Rooms inspector |
| `building-context.png` | Building cutaway exposing the apartment at 16:00 |
| `property-dossier.png` | Dossier introduction, map, reported areas and overview cards |
| `sunlight.gif` | Building sun path, then living-room daylight; 18 s, 960 px |
| `walkthrough.gif` | Walk through the living room, close/reopen a closet door with E, look toward the balcony; about 11 s, 1120 px |
| `walkthrough.png` | Static walkthrough view for reuse outside the README |
| `furniture-layout.gif` | Drag the low table, rotate, undo/redo and orbit in 3D; about 10 s, 1120 px |
| `object-workshop.png` | Real authenticated workshop with a prepared, unsubmitted product request and generation disabled |
| `object-library.gif` | Public gallery, front/side/3D views and real DYVLINGE version selection; about 16 s, 1040 px |
| `private-project.png` | Private editor with a saved alternative layout |
| `private-design.gif` | Duplicate a layout, change finishes, window dressing and lighting, then save |
| `solar-energy.gif` | Roof, change 12 to 18 panels, yearly generation and investment assumptions; 11 s, 1100 px |

The source study date for apartment/daylight, walkthrough and energy captures is
**22 September 2026**. Displayed solar times use the generalized demo's `Europe/Paris` timezone.
The three reference screenshots (`building-explorer.png`, `t3-building-cutaway.png`
and `apartment-solar-study.png`) show those same authored demonstration scenes.

GIFs use optimized 128-color palettes at 8 fps. They are edited demonstrations
of real interactions: waits are shortened, important states are held, and cuts
connect views. They are not recordings of native playback speed or generation
latency. The sunlight sequence samples real time-input changes; the energy
sequence cuts between the roof and the study below it without changing the UI's
layout. The object gallery shows archived results, not a newly generated job.

## Review before committing

Open the README preview, inspect the stills and sample decoded GIF frames.
Confirm that objects have loaded, cameras move, the furniture actually changes
position, the door changes state, version labels match the visible model, and
text remains readable at repository width. Keep approximation and correction
labels visible. Check desktop and narrow-screen Markdown layout.

The workshop recording verifies the real private save by reloading the project.
All capture scripts fail on browser page errors. These checks complement source
and browser tests; they do not certify model fidelity, physics or deployment.

```sh
pnpm exec eslint scripts/capture_readme*.mjs
node --test scripts/test/documentation.test.ts
git diff --check
```

Only reviewed final media belongs in `docs/media/`. Keep raw frames, local HTML
previews, credentials, copied libraries and unpublished sharing drafts under
ignored or temporary directories. The README describes current source features;
check the live demo separately before claiming that a new feature is deployed.
