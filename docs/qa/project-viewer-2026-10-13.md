<a id="qa-local---miembro-viewer-de-proyecto-compartido"></a>

# Local QA - shared-project viewer member

Date: 2026-10-13 UTC. Scope: viewer reading/permissions, local fixtures, no AI,
Blender, email, payments, production, merge, deployment or PR at this checkpoint.

<a id="revisiones-y-contexto"></a>

## Revisions and context

- Initially clean T3 `work`, `7a851eb7ab703016d78c102afeaac2a8d97b08f3`; fetch
  confirmed HEAD equals origin/main. Own branch `qa/t3-project-viewer-20261013`.
- Initially clean Atlas `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`; safe fetch/
  fast-forward to `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. No document edits.
  Read AGENTS, atlas-navigate, source-of-truth, T3 catalogs/wiki/October 12 retrospective.
- Atlas places T3 within Immolab with its own code owner. Its `a3579ee` reading
  and October 4 deployment are historical evidence; QA establishes no CI/production runtime.

<a id="inventario-previo-de-rutas-y-acciones"></a>

## Prior route/action inventory

Main sources: `apps/web/src/private/PrivateApp.tsx`, `api.ts`,
`ProjectFoundations.tsx`, `FoundationAgentWorkshop.tsx`, `ProjectCheckpoints.tsx`,
`apps/web/src/editor/ApartmentEditor.tsx`, `apps/web/src/walkthrough/Walkthrough.tsx`,
`apps/web/src/private/ProjectScene.tsx`, `apps/web/src/energy/ProjectEnergy.tsx`,
`apps/api/src/projects.ts`, `server.ts`, `foundation-agent.ts`.

| Route/surface | Viewer actions | Limit |
| --- | --- | --- |
| `/login`, `/app` | Login/list/open/reload/history/duplicate | Own or member projects; viewer is not global role |
| `/app/projects/:id` | Name/notes/bases/accepted models/floor selectors | No save/rename/share/asset or plan addition |
| Original bases | Levels/dimensions/country/address/sources/open plan | Disabled fields; no uploads/assignment removal |
| Agents | Read activity/versions/iterations, choose version/preview/refresh | No start/correct/cancel/retry/accept |
| Recovery | Read checkpoint/refresh | No restore |
| Project editor | Local variant/layout, 3D/plan/walls/grid/object selection | No move/rotate/copy/remove/material/light/divider |
| `#walkthrough`, `#editor` | Enter/look/walk/pause/settings/doors/map/fullscreen/return | Temporary visit; no persisted content |
| Context | Building/sunlight/camera/layers/selection | No content modification |
| Energy | Saved analysis/assumptions | No installation change |
| `/api/projects/:id/references/:id/image` | GET/HEAD/new tab | Project access, not author's private reference |
| `/api/projects/:id/assets/:id/files/model.glb` | Read/download immutable revision | No project-UI GLB button; authorized URL while membership remains |
| `/app/assets` | Own account library/workshop | No author's prompts/photos/source.blend/manifest/jobs |
| `/app/credits`, `/app/usage`, settings/logout/demo | Global navigation, own account/language/theme | No foreign-project permissions |
| `/app/generate` | Own conceptual-generation global route | Inference excluded; not shared-project editing |
| `/app/users` | No admin screen for standard viewer | Falls to list; no people management |
| `/app/projects/:id/edit` or unknown route | No extra editor | Falls to list; URL testing implies no authorized mutation |

Backend requires write for PUT, plan/asset POST, accept/cancel/generate/restore;
owner for membership including GET. Viewer can clone to own account. 404 hides
foreign resources; 401 invalid session. Global admin implies no foreign-project access.

<a id="escenario-y-reproduccion"></a>

## Scenario and reproduction

Node 24, pnpm 12.7.0, lockfile dependencies. Cloud:

```sh
cd /workspace/t3-designer
source /workspace/.cloud-setup/activate.sh
pnpm install --frozen-lockfile
node scripts/qa/project-viewer-scenario.mjs
```

Other workspaces use repo Node/pnpm without Cloud-specific `source`. Script opens
`http://127.0.0.1:5193/login` (`T3_VIEWER_QA_PORT` override), displays fictional
ID/URL, creates SQLite/files in new temp directory. Ctrl-C cleans only this scenario.

Fictional accounts `viewer@example.test`, `owner@example.test`,
`outsider@example.test`; demo password `viewer-local-demo-2026`. No real
credentials/activation links. Do not read `.env`.

Fixtures: reviewed shared two-floor house with one variant/two layouts, minimal
PNG plan, existing bundled GLB, fictional activity/versions/checkpoint; empty
shared project; other account's project. Base origin explicitly QA, without
human review/real inference. Staircase lacks geometry, so floor transit is not
certified. Fixtures test existing-data display.

Real auth/SQLite/project/file API/library/usage/disabled billing modules,
ProjectGenerations/FoundationAgent `enabled: false`. Health injected offline;
planner/renderer throw if called. No worker starts. Vite/API use separate loopback
ports per test; revocation/expiration directly controls disposable SQLite without
product QA endpoints.

```sh
T3_VIEWER_CHROMIUM_PATH=/usr/bin/chromium pnpm test:viewer
```

Omit executable override with installed Playwright browsers. Installed WebKit:
`T3_VIEWER_WEBKIT=1` adds both mobile profiles and desktop.

<a id="motores-y-limites"></a>

## Engines and limits

System Chromium `154.0.8037.57`, Debian 13; Playwright 1.63.0. Headless software
SwiftShader/ANGLE WebGL. CSS 375x812/430x932, `isMobile=true`, touch, DPR=1;
desktop 1440x1000, no touch, DPR=1. Viewport/input emulations, not physical phones.

WebKit 26.6 / build 2359 BLOCKED before launch. Official
cdn.playwright.dev/playwright.download.prss.microsoft.com mirrors both returned
HTTP 403 `Domain forbidden`. No network/policy/permission bypass. No physical
Safari or executed WebKit coverage.

<a id="bugs-corregidos"></a>

## Corrected bugs

| ID | Prior reproduction/evidence | Correction | Regression |
| --- | --- | --- | --- |
| V01 | Remove membership with open viewer; focus retains notes/scene. `results/project-viewer-revocation--2fffe-a-clean-retry-after-regrant-chromium-mobile-375/trace.zip` | ProjectEditor revalidates focus/visibilitychange/every visible 60 s; read 403/404 unmounts document. Same role/revision preserves local floor/variant | Open-tab revocation/regrant/retry, periodic walkthrough revocation |
| V02 | Held A `/api/me` arrives after B check and remounts A. `regressions-1/results/project-viewer-a-delayed-o-bbd12--a-cross-tab-account-change-chromium-mobile-375/trace.zip` | Only latest session check updates identity; sign-in/out epoch retained | Real cookie switches B, release old response, B after fetch/React; isolated list/content |
| V03 | Unnamed walkthrough sliders: implicit label association targets output. `regressions-2/results/project-viewer-walkthrough-4292e--and-keeps-visits-temporary-chromium-mobile-375/error-context.md` | Explicit height/FOV/sensitivity names | Role/name access and keyboard changes to all three |
| V04 | Paused mobile screenshot minimap over instructions/continue. First `final/results/project-viewer-walkthrough-4292e--and-keeps-visits-temporary-chromium-mobile-375/walkthrough.png`; correction `walk-final` | Paused overlay z-index 1 over minimap; toolbar available | Hit/paint order at overlap; live/paused captures |
| V05 | Late A workshop/health/credits 401 invalidates new B cookie; first full run mobile430 fails | 401 immediately unmounts private data, revalidates current `/api/me`; login only if identity absent. Login/logout/recovery callbacks restore ready | Deterministic real old-cookie 401 with held B checks; actual expiration still login |

Backend already rejected viewer writes/revoked resources; permissions/endpoints/
security policies unchanged. Revocation erases neither downloaded files nor seen
information. UI detection is tab return or visible 60-second interval, not
realtime push. Transient network failure is not confirmed revocation.

<a id="integracion-con-la-sesion-editor"></a>

## Coordination with editor session

Parent reported other branch `qa/shared-project-editor-20261013`, HEAD
`7fe34e94419fe4c074937072dc55f85d5b216f3e`, with cancellation/revocation/viewer
downgrade fixes. Not fetched or assumed in this filesystem.

Main overlap `apps/web/src/private/PrivateApp.tsx` / ProjectEditor. This patch
installs periodic revalidation only for mounted viewer. Integration must unify
access reading with editor handler without duplicate listeners/intervals,
replacing valid drafts or losing navigation guards. Retain `/api/me` order and
account/project key. Distinguish revoked GET read 403/404 from downgrade write
403 that still permits reading.

Other shared files: `e2e/private-auth.spec.ts`, `Walkthrough.tsx`,
`walkthrough.css`, `e2e/walkthrough.spec.ts`, `playwright.config.ts`,
`apps/web/package.json`, `apps/web/tsconfig.json`, `package.json`. New viewer
fixture/config/spec/report independent. Adds `test:viewer` to `check:all`;
real-API suite has own config and cannot run accidentally under generic no-WebGL
profile. Optional `T3_PLAYWRIGHT_EXECUTABLE_PATH` permits Cloud system Chromium
in general suite/walkthrough spec without changed assertions.

<a id="resultados-finales"></a>

## Final results

Locally tested/committed code `c1de9b0ba1f05cdda676fd10fa96216ef5f353d9`.
Branch `qa/t3-project-viewer-20261013`, base
`7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Subsequent documentary commit retains
result; historical batch had no PR/push/merge/deployment.

Stable final run **54 PASS, 0 FAIL/skips/retries**: 18 flows per Chromium viewport.
Start 11:05:04Z, duration 14m22s. JSON verified/results.json
(`../../artifacts/qa-project-viewer/verified/results.json`), capture/trace index
evidence-index.md (`../../artifacts/qa-project-viewer/evidence-index.md`).
Git-ignored local evidence, reproducible with fixtures/commands.

| Flow/case | 375x812 touch | 430x932 touch | 1440x1000 desktop | WebKit (3 viewports) |
| --- | --- | --- | --- | --- |
| Shared list/bases/plans/versions/checkpoints/floors/variants/context/energy | PASS | PASS | PASS | BLOCKED |
| Empty project/own library; foreign/edit/admin URL | PASS | PASS | PASS | BLOCKED |
| PNG popup/GLB download SHA256; GET/HEAD/no-store; foreign source/job/manifest; forbidden mutations | PASS | PASS | PASS | BLOCKED |
| Open-screen revocation; notes/viewer cleanup; regrant/retry | PASS | PASS | PASS | BLOCKED |
| Real expired session; Back cannot recover data; new login | PASS | PASS | PASS | BLOCKED |
| Logout double-click; account switch; reload/direct previous project access | PASS | PASS | PASS | BLOCKED |
| External account change; late real A401; pending B checks; stale positive A response | PASS | PASS | PASS | BLOCKED |
| GET503/abort/cancelled navigation with incoming GET | PASS | PASS | PASS | BLOCKED |
| Duplicate double-click: one own copy, new attachment IDs, intact source, independent references | PASS | PASS | PASS | BLOCKED |
| Rendered walkthrough; named/keyboard sliders; touch/keyboard movement; cancel/pause/layers/reload/hash/history | PASS | PASS | PASS | BLOCKED |
| Missing WebGL: usable fallback/settings/return | PASS | PASS | PASS | BLOCKED |
| List503/retry; empty after revocation; required name/cancel without creation | PASS | PASS | PASS | BLOCKED |
| Unanswered GET: actual 15s timeout/retry, no writes | PASS | PASS | PASS | BLOCKED |
| Unchanged-floor revalidation; simulated clock +60s; revocation unmounts walkthrough | PASS | PASS | PASS | BLOCKED |
| Fixture GLB deleted: placeholder; restored file/reload recovers model | PASS | PASS | PASS | BLOCKED |
| 120-character name/long notes/URL; markup as text, no overflow/HTML execution | PASS | PASS | PASS | BLOCKED |
| Own credits/usage, Settings Usage, generation disabled, project return | PASS | PASS | PASS | BLOCKED |
| Persisted clone/lost response: visible error, unique copy recovered from list | PASS | PASS | PASS | BLOCKED |

New scenario per case. Full persisted records compared with initial source;
forbidden-write cases also check unchanged attachments/jobs/balance. Viewer
navigation/visit/variant adjustments send no project mutations. Authorized
mutations are login/logout and fictional own-account copies.

<a id="comandos-y-checks"></a>

## Commands and checks

All commands after `source /workspace/.cloud-setup/activate.sh`. Logs under
`artifacts/qa-project-viewer/`.

| Command | Final result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS pnpm12.7.0, lockfile retained | Setup output; initial pnpm11 nonexistent-home error resolved with workspace tools |
| `pnpm check` | PASS lint/types,648 Node/35 Python, read-only scene:verify,demo build/audit | `check-final.log`; Turbo caches unchanged tasks |
| `pnpm typecheck`, `pnpm lint` after wide WebKit profile | PASS | `types-final.log`, `lint-final.log` |
| `pnpm build:full`, `pnpm audit:dist` | PASS,703 artifacts/0 failures | `build-full.log`, `audit-full.log` |
| `T3_VIEWER_CHROMIUM_PATH=/usr/bin/chromium T3_VIEWER_EVIDENCE_DIR=../../artifacts/qa-project-viewer/verified pnpm test:viewer` | 54PASS final revision,0 retries | `verified.log`, `verified/results.json` |
| `T3_PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @t3-designer/web exec playwright test --grep-invert @webgl --workers=1 --output=... --reporter=list,json` | 114PASS,2SKIPPED | `aggregate-verified.log`, `aggregate-verified/results.json` |
| `playwright test e2e/walkthrough.spec.ts --grep 'opening the viewer settings' --workers=1` with browser override | PASS,paused pose retained across settings | `walk-interaction.log`, `walk-interaction/results.json` |
| `playwright test e2e/walkthrough.spec.ts --grep 'E operates' --workers=1` override/port4184 | PASS isolated rerun,doors/passage/temporary reset | `door-isolated.log`, `door-isolated/results.json` |
| `pnpm audit:history` | PASS,repeated after local commits | `audit-history.log` |
| `git diff --check` | PASS | Final precommit verification |

Two cadastre cases skipped without `T3_CABA_RESEARCH_DIR`; no real data acquired.
Two extra WebGL checks use existing owner-mocked fixtures and reduced interaction
canvas helper, same software Chromium; not real-backend viewer/physical tests.
Viewer suite retains normal canvas/declared viewports.

<a id="fallos-de-diagnostico-pendientes-y-limites"></a>

## Diagnostic failures, pending items and limits

- First full run before last fix: 50PASS/4FAIL mobile430. One establishes V05;
  three load/visibility waits with concurrent servers. After Vite cache isolation/
  auth fix full 54/54 without retries. No exclusive cache causality claimed.
- Initial general two-worker suite: 108PASS/6FAIL/2SKIPPED. Four walkthrough setup:
  launchOptions dropped system-browser override. Optional override retains
  assertions and four flows pass. Two asset-history waits.
- Separate initial-SHA worktree same history spec: 2PASS/2FAIL (403/404 loading
  at 5s); isolated branch retry 4/4. Stability issue also without patch, no new
  permission defect established. Final serial suite 114/114 executed; unchanged
  assertions/timeouts.
- Extra door check under parallel rendering failed 2.1309 m vs `>2.15 m` at 15s.
  Same isolated test passed open/close/collision/reset/no writes. First FAIL
  retained in `walk-interaction`; thresholds unchanged.
- WebKit BLOCKED403. Physical Safari/iPhone/Android NOT RUN; other resolutions/
  orientations, physical GPU, full accessibility and physical network outage NOT RUN.
- Stair/floor transit NOT RUN: fixture lacks supported geometry. Premium/admin
  plans as viewer NOT RUN in real standard-account scenario. Real invitation/
  recovery, AI, Blender, live geodata, email, payments, CI/production NOT RUN by
  scope. Additional auth invite/recovery use mocks.
- Full `check:all`, analytics/demo suites/all other WebGL checks NOT RUN. Gates
  retained; `check:all` adds viewer suite.
- No pending reproducible viewer-read/permission bug after declared fixes/tests;
  prior limits remain.
- No project GLB button; permitted URL tested. Lost-response copy may already
  exist: inspect list before duplicating again. No clone idempotency/new UX decision.

Scenario also isolates `vite-cache` in temp directory. Earlier diagnostics shared
Vite optimizations that could invalidate imports in parallel; existing assertions/
timeouts unchanged to hide no results.

<a id="checklist-manual-breve"></a>

## Brief manual checklist

1. Start scenario/login viewer. Only actual fixture names "Casa compartida QA"
   and "Proyecto vacio QA", both Spanish UI "Puede ver" (can view).
2. Review house bases/plans, PNG new tab, versions/checkpoint. No save/share/
   upload/restore.
3. Change floor/layout/select object: position/rotation/remove/material/light
   controls disabled. Reload saved floor, no shared-project modifications.
4. Open walkthrough, adjust height/FOV/sensitivity by keyboard/touch, enter/walk/
   pause. Card above minimap; return/Back/Forward retain no visit.
5. Separate owner browser session, not same-cookie account, removes viewer with
   "Quitar acceso". Return viewer tab: scene gone/project unavailable. Plan/GLB
   open/reload denied. Reshare viewer and "Reintentar" (Retry) restores reading.
6. Duplicate own independent copy. Logout/outsider login: original unavailable.
   Check reload/Back/Forward login.
7. Repeat on physical mobile/Safari for hardware/touch evidence outside this
   emulation/blocked WebKit batch.

To get demo GLB with valid session, DevTools > Network request
`/api/projects/<id>/assets/<attachment>/files/model.glb`. No download button;
test exercises authorized browser URL and byte SHA256. Author
`/api/assets/<source>/...` artifacts are outside shared permission.

<a id="resumen-para-atlas-sin-escritura-aqui"></a>

## Atlas summary (without writes here)

T3 adds local viewer evidence on main/base `7a851eb`, Cloud Chromium/disposable
data. Fixes concern UI revocation/account-response ordering/walkthrough reading
and accessibility; server authorization unchanged. Primary source this report/
QA branch. No production/Safari/physical phones/AI/Blender/pricing/payments/CI
established. Consolidate ProjectEditor revalidation with editor results during
integration. Atlas consulted `27ae86c`, no entries/catalog changes; Immolab and
historical evidence retain stated currency.
