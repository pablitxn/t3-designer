# Object workshop: hosted API and local development

The Objects workspace creates furniture drafts from a product URL. The API, job
queue, Blender modelling/rendering and private asset storage run on the backend.
Production uses the OpenAI Responses API with a server-side API key. Each attempt
reserves application credits; model inference and web research use the Internet.
An optional local Codex adapter supports private operator development.

## Private application update

The workshop now requires an individual account and is available at `/app/assets`.
The public Objects tab explains the feature without querying private APIs.
Generation is disabled by default. Follow [private accounts and projects](private-projects.md)
to activate the first administrator, assign an existing library and enable
generation with credits and request limits. The same pipeline runs locally and
in the single-worker production container.

## Start

Prerequisites: Node 24+, pnpm 12.7.0, Blender and an OpenAI API key configured
privately as `OPENAI_API_KEY` in the ignored root `.env`. Use
`T3_INFERENCE_PROVIDER=openai`. Tested with Blender 5.2.2 LTS. Never place the
key in frontend variables, source files, logs or links.

```sh
pnpm install
T3_GENERATION_ENABLED=true pnpm dev:full
```

After activating your administrator account, open
`http://127.0.0.1:5173/app/assets` and sign in. The API prints
`T3 private backend: http://127.0.0.1:8787`. Vite proxies `/api` to the loopback
backend. The private workshop reports whether generation is enabled, the inference provider is
configured and Blender is available. Configuration presence is not a live API
connectivity or account-quota check. The public `/#assets` page explains the
workshop without accessing private data.

To run each component independently:

```sh
T3_GENERATION_ENABLED=true pnpm start:api
pnpm --filter @t3-designer/web dev:full --host 127.0.0.1 --port 5173
```

`pnpm dev:api` adds Node watch mode for backend development. Editing backend
files restarts the process and interrupts an active job; retry it afterwards.
Use `start:api` during long generation sessions.

The API validates sessions, ownership and Host/Origin and rejects cross-site
requests. Local development binds loopback. The production configuration requires
HTTPS and PostgreSQL; the local Codex subscription adapter cannot be enabled
in production. See the private-projects deployment boundary before exposure.

## Create and review

1. Paste a public HTTP(S) product URL. Add color, variant and visual details in
   the description if useful. Optionally attach up to four PNG/JPEG/WebP photos
   (5 MB each). Without attachments, the backend attempts to retrieve product
   photos from Product JSON-LD or Open Graph metadata. Missing usable photos
   pause the job for attachments; text alone no longer produces a blind draft.
2. Optionally enter **width, height, depth in centimetres**. The backend stores
   metres in that order. Explicit dimensions take precedence over website data
   and are labelled as user supplied.
3. Create the object. Once the server accepts it, the form clears and the
   **Live generation** panel selects that creation. A failed submission keeps
   your draft, and edits made while submitting are preserved. A single worker
   researches one job at a time; other jobs remain queued. A maximum of 20
   active/queued jobs prevents accidental floods.
4. If reliable outer dimensions or visual references are missing, answer the
   questions shown in the job card. Attach photos or add dimensions as needed.
   A photo-only clarification is sufficient when photographs were requested.
5. The worker renders perspective, front and side views and sends those images
   together with the product photos to a separate Codex visual review. The
   review can accept, return a corrected recipe, or ask for missing evidence.
   Up to three render/review rounds run per attempt. Dimensions stay fixed.
6. Review the side-by-side photos and preview, findings and interactive 3D view.
   Use **Create improved version** to describe a mismatch and optionally attach
   better references. The next job receives that feedback, the previous recipe
   and its renders. Versions share a library card; a selector reopens each one.
   The original files remain immutable. Download GLB, editable Blender
   source and manifest. Source URLs, measurement status and limitations remain
   attached to the asset.

Cancellation aborts the active inference request or Blender process and prevents publication.
Failed or cancelled jobs can be retried. Every attempt gets a fresh workspace
and output directory. Previously completed assets remain intact. Creating
an improved version creates a linked asset without overwriting the original or
inserting anything into the apartment. If three comparisons still find visible
differences, the last candidate is published explicitly as an unresolved draft.
Automated acceptance is a model judgment, not a guarantee of product fidelity.

The activity panel shows timestamped web-tool actions, source links, the model
plan, Blender geometry/export/render milestones, visual findings and corrections.
Expand a
row to inspect its details. Updates arrive over a server-sent event stream;
periodic requests take over if that connection drops. Scrolling back pauses
automatic following; **Follow latest** returns to new events. The creation
selector reopens saved histories, including separate attempts after a retry or
answer. **View object** takes you to the resulting model, and **New object**
focuses the product-link field.

These are recorded actions and results, not internal model reasoning or raw
process logs. At most 500 events are retained per job. Creations made before
activity recording was introduced have no detailed trace; the screen states
this instead of reconstructing an invented history.

## What can be generated

The AI returns a validated data recipe. It never supplies executable Python.
The repository's trusted generator supports:

- The already authored IKEA **STRANDMON** chair recipe, with original fabric
  texture and sculpted panels. The test product's overall dimensions are
  82 cm wide × 101 cm high × 96 cm deep. Its source text/drawing disagree on
  seat width/height; that discrepancy remains part of the review notes.
- Simple rectangular tables with four straight legs.
- Other furniture as **1–128 geometric parts**: bevelled boxes, ellipsoids,
  cylinders, tapered cones and shaped upholstery cushions, with PBR materials.
  Cushions support squared/rounded profiles, piping, tufted button grids and
  original embedded woven/corduroy textures. They remain parameterized geometry.

The procedural recipe normalizes the whole mesh to the declared outer size.
The export audit checks actual bounds, floor-centered origin, Y-up/Z-front
convention, portable resources and artifact hashes before publication. These
checks establish a technical export contract, not a faithful product replica.
Complex freeform surfaces, logos and exact manufacturer textile patterns remain
outside the current recipe vocabulary. A feedback loop cannot guarantee a
faithful reconstruction of a shape the generator cannot express.

Website access can fail or expose only text. The backend asks for photos in
that case. Photos and renders are attached as actual SDK image inputs rather
than being represented by URLs in a text prompt. This is not a dedicated
image-to-3D network. All output remains labelled as a draft for user review,
even when the automatic visual comparison accepts it.

## Architecture and files

```text
React Objects screen → authenticated HTTP API → credit reservation + SQLite queue
    → reference photos + hosted OpenAI Responses API → JSON recipe
    → Blender → export audit → photo/render visual review
          ↑ revised recipe ← differences (up to three rounds)
    → local library (GLB + blend + previews + provenance)
```

`packages/asset-schema` defines the shared input and recipe contract. The
frontend calls `apps/api`; the production API uses a bounded JSON response
schema and `scripts/blender/generate_asset.py`. The optional local adapter uses
`@openai/codex-sdk` and the installed Codex CLI. Blender does not use the GUI session
or its MCP server. Rendering uses Cycles CPU by default and requires no GPU.

The default data directory is **`artifacts/asset-library/`**, ignored by Git:

```text
library.sqlite          Durable jobs and asset metadata (WAL enabled)
.backend-lock.sqlite    OS-released exclusive lock: one backend per library
references/             Uploaded/acquired product photos and metadata
jobs/<job>/<attempt>/   Analysis, per-round recipe, candidate files and review
assets/<asset>/         model.glb, source.blend, preview.png,
                        request.json, manifest.json, front.png, side.png,
                        review.json (new visually reviewed jobs)
```

SQLite completion and asset publication happen in one transaction. On restart,
queued jobs resume; interrupted jobs are marked failed for an explicit retry.
Partial output is never served as a completed asset. A force-killed process can
leave an unreferenced attempt/output folder, which is not exposed by the API.
Keep SQLite metadata, references, jobs and assets when moving the library;
asset directory paths in SQLite are currently absolute, so changing the library
root after creation requires a metadata migration. There is no remote storage
or automatic backup in this iteration.

The same database also stores ordered job events. Browser reconnects request
only events after the last received sequence number, so reloading the page
does not discard the recorded activity. Candidate checkpoints also persist:
answering a question or retrying after review reuses the most recent valid
candidate and observed differences rather than starting without context.

For `T3_INFERENCE_PROVIDER=codex-local`, install the Codex CLI, run `codex login`
and keep the API bound to loopback. This adapter is rejected in production.
Its runner inherits an allowlist of environment variables and the existing
Codex auth location, but removes API-key credentials. The wrapper ignores user
configuration, project rules, MCP servers and hooks for these jobs. Codex uses
a read-only sandbox, no approvals, no shell tools, and hosted web research.
Only explicitly selected product photos and generated renders are attached to
the hosted Codex service for comparison. No credentials are copied into the
library or sent to the browser. A failed
generation exposes a bounded, readable error instead of a raw Codex transcript.

## Configuration

Set variables in the launching shell or the root `.env`, which API commands load.
Vite's `T3_API_PROXY_URL` override must be set in its launching shell. See
`.env.example` and the private-projects guide for account and generation limits.

| Variable | Default / purpose |
| --- | --- |
| `T3_INFERENCE_PROVIDER` | `openai` with an API key; `codex-local` for the optional local CLI |
| `OPENAI_API_KEY` | Server-only API credential; never included in model inputs or Blender environment |
| `T3_OPENAI_MODEL` | `gpt-5.4` for hosted structured generation and review |
| `T3_LIBRARY_MAX_MIB` | `1536`; combined artifact budget with 256 MiB reserved before rendering |
| `T3_API_PORT` | `8787` |
| `T3_API_PROXY_URL` | `http://127.0.0.1:8787`; set for the Vite process if using another local API port |
| `T3_ASSET_DATA_DIR` | `artifacts/asset-library`, relative to repository root or absolute |
| `BLENDER_BIN` | macOS app path when present, otherwise `blender` on PATH |
| `T3_CODEX_BIN` | `codex` on PATH; use the existing signed-in CLI |
| `T3_CODEX_MODEL` | omitted; Codex's built-in default, since user config is isolated |
| `T3_CODEX_TIMEOUT_MS` | 180000; configurable from 10000 to a maximum of 600000 |
| `CODEX_HOME` | existing CLI auth location if customized; never copy its credentials into this repo |

Blender has a ten-minute timeout and renders 512 px previews at 24 samples.
One job runs at a time. Shutdown aborts the worker and releases the library lock.
The hosted adapter requires an API key; the application never creates keys.
Asset drafts cost 20 credits and revisions 10 by default. Automatic visual
corrections stay within the same attempt price. An analysis that asks for more
information consumes its attempt only if inference ran; answering starts a new
attempt. Failure or cancellation refunds an unsettled reservation. Replaying
the same `Idempotency-Key` returns the original operation without another debit.

## API

| Method | Path | Response / behavior |
| --- | --- | --- |
| GET | `/api/live` | public liveness only; no account or workshop details |
| GET | `/api/health` | inference configuration, Blender availability and current job |
| GET / POST | `/api/jobs` | `{jobs}` / create with `{url,notes,dimensions?,referenceImageIds?}` → `{job}` |
| POST | `/api/references` | `{name,dataUrl}` → `{reference}` with persistent image ID |
| GET | `/api/references/:id` | `{reference}` metadata |
| GET / HEAD | `/api/references/:id/image` | Stored raster image |
| GET | `/api/jobs/:id` | `{job}` |
| GET | `/api/jobs/:id/events?after=0` | `{events}` ordered by persistent sequence |
| GET | `/api/jobs/:id/events/stream?after=0` | SSE `activity` events; supports `Last-Event-ID` on reconnect |
| POST | `/api/jobs/:id/cancel` | JSON `{}` → `{job}` |
| POST | `/api/jobs/:id/retry` | JSON `{}` → `{job}` |
| POST | `/api/jobs/:id/answers` | `{notes,dimensions?,referenceImageIds?}` → `{job}` |
| GET | `/api/assets` | `{assets}` |
| GET | `/api/assets/:id` | `{asset}` |
| POST | `/api/assets/:id/revisions` | `{feedback,referenceImageIds?}` → new `{job}` linked to this asset |
| GET / HEAD | `/api/assets/:id/files/:filename` | allowlisted generated artifact |

All workshop routes require a valid session and ownership of the resource.
Mutation requests require the configured same-origin application. POST bodies
must be JSON and at most 64 KiB, except the reference upload's
7 MB encoded-body allowance. Product URLs cannot contain credentials, local
hostnames, raw IPs or custom ports. Photo acquisition checks and pins public
DNS addresses at every redirect, bounds response sizes and timeouts, and
accepts raster formats only. Manufacturer research also uses the hosted web search tool.

## Verify and recover

```sh
pnpm check
pnpm test:e2e
curl http://127.0.0.1:8787/api/live
```

Automated tests use injected planners/renderers, so they do not spend subscription
usage. Real Codex and Blender runs are separate integration checks. Unit tests
cover bounded recipes, persistence/restart, cancellation, job transitions,
artifact integrity, HTTP request isolation and the subscription adapter.

Verified on 2026-10-03: a STRANDMON job submitted through the browser completed
using the real local ChatGPT session and Blender in about 71 seconds. The saved
GLB measured approximately `[0.82, 1.01, 0.96]` metres with no audit errors;
GLB/Blender/preview downloads matched their manifest hashes. The asset survived
backend restarts and rendered in the browser's WebGL viewer. `pnpm check`,
24 browser tests and 29 analytics/privacy tests passed. Local evidence lives
under `artifacts/backend-smoke/` and is not checked into Git. This timing is a
single local observation, not a promised latency or a visual-fidelity score.

The same day's visual-loop check revised an existing DYVLINGE using the user's
product screenshot and an automatically acquired IKEA photo, plus all three
previous renders. It completed three render/review rounds in 8m37s, recorded
actual recipe changes, and saved a linked version while preserving the original.
The final reviewer still requested shape/material corrections; the app shows
that verdict and issues rather than claiming a faithful replica. The new files
retain the 0.63 × 0.68 × 0.75 m envelope. Evidence is in
`artifacts/feedback-smoke/`; `pnpm check`, 34 browser tests and 29 analytics tests
passed. Runtime is one observation, not a promise for other products.

- **Backend offline:** start `pnpm start:api` and use the local Vite page.
- **Codex unavailable/login required:** verify `codex login status` in the same
  shell/environment. Sign in normally; never paste credentials into the app.
- **Usage limit:** wait for the subscription window to reset, then retry.
- **Blender missing:** set `BLENDER_BIN` to the installed executable and restart.
- **Blender SIGSEGV before Python on macOS:** during agent testing, an outer
  tool sandbox can prevent Metal initialization. Run the trusted backend in a
  normal local terminal. The app does not disable machine security settings.
- **Library already in use:** stop its other backend before restarting. A dead
  process's PID lock is recovered at startup; do not remove a live lock.
- **Need to stop:** Ctrl-C the backend. Completed assets persist; interrupted
  jobs show a recoverable failure on the next start.

Production uses the hosted identity, account isolation, bounded container
resources and private PVC described in [deployment](../deployment.md). Shared
object storage and multi-worker scaling remain future work.
See [credits and development payments](../credits-billing.md) for account grants,
trials, invitation privileges and the disabled-by-default payment adapter.

References: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk),
[Codex authentication](https://learn.chatgpt.com/docs/auth), and the
[feasibility report](../research/server-asset-generation.md).
