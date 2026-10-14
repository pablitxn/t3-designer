<a id="t3-qa-del-editor-de-proyecto-compartido-2026-10-13"></a>

# T3: shared-project editor QA (2026-10-13)

Scope: standard member with `editor` permission on another user's project.
Existing scenes/assets; no inference, generation, Blender rendering, payments,
email, production data, merge or deployment. Scenario uses bundled demo geometry,
`@example.test` users, isolated projects and temporary SQLite. Model files unchanged.

<a id="revisión-y-contexto"></a>

## Revision and context

- Initially clean T3 checkout: `work`, `7a851eb7ab703016d78c102afeaac2a8d97b08f3`.
  `fetch origin` and `ls-remote origin refs/heads/main` returned the same SHA.
  No discarded changes/reset. Working branch `qa/shared-project-editor-20261013`.
  Implementation checkpoint `f304628a3fdc96ba1efbfa3d4b4735a4f53a31ec`; final HEAD
  is in evidence `git-metadata.json`.
- Initially clean Atlas: `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`; fetched and
  fast-forwarded to `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. No Atlas content changes.
- Read: both AGENTS, atlas/AGENTS, atlas-navigate, source-of-truth, repository/
  relationship catalogs, T3 wiki, IMM-02 retrospective and workflows
  `private-projects.md` / `local-asset-workshop.md`.
- Atlas places T3 in Immolab and distinguishes October 12 local baseline from
  October 4 historical deployment. This batch adds local evidence without
  revalidating production, remote CI, providers or PostgreSQL.
- No tool was exposed to verify/change this session's effective model, reasoning
  or speed; repository inspection does not establish those settings.

<a id="inventario-previo-del-rol"></a>

## Prior role inventory

Derived from `App.tsx`, `PrivateApp.tsx`, `ApartmentEditor.tsx`, `ProjectScene.tsx`,
`AccountHub.tsx`, `api.ts`, `projects.ts` and `server.ts`.

| Route | Available actions and boundary |
| --- | --- |
| `/login` | Login, validation, generic error, demo and settings. |
| `/app` | Own/shared list, open, create/cancel and duplicate. |
| `/app/projects/:id` | Name/notes, explicit revision save, 409 recovery, own duplicate. Only owner manages members; editor cannot add/remove access. |
| Ready editor | Change/duplicate variants/layouts; select/place/move/rotate/duplicate/remove instances; undo/redo; 3D/plan/wall/snap camera; finishes/floors/openings/lights and solar date/time. Dividers are available but excluded from this batch's real flows. |
| Project inspection | First-person walkthrough; building context/sun; solar energy. Personal library can attach an existing asset. |
| Document-dependent foundations | Edit preparation/plans/sources; select accepted floors; read history/versions/checkpoints; home/building workshops and accept/cancel/restore with appropriate permissions. Generation disabled here. |
| `/app/assets` | Private library/history, preview/download; generation/revision/retry/cancel depend on configuration. No personal assets in this batch's real fixtures. |
| `/app/credits`, `/app/usage` | Own balance/plan/usage. Checkout disabled. |
| `/app/generate` | Direct conceptual-generation route; excluded/disabled. |
| `/app/users` | Only admin or premium invitations; absent for standard editor. Global admin grants no private project access. |
| `/invite`, `/recover`, `/` | Activation/recovery and separate public demo; no implied project membership. |

<a id="motores-y-límites"></a>

## Engines and limits

Playwright 1.63.0, system Chromium **154.0.8037.57**, `/usr/bin/chromium`, Linux.
Real WebGL 2 with ANGLE/SwiftShader software rasterization, no physical-GPU test.
Navigation, inputs, selectors, clicks, one mobile tap, screenshots and persisted
effects exercised in browser.

| Configuration | CSS viewport | isMobile / hasTouch | Status |
| --- | --- | --- | --- |
| Chromium mobile narrow | 360 x 800 | true / true | PASS |
| Chromium mobile wide | 430 x 932 | true / true | PASS |
| Chromium desktop | 1440 x 1000 | false / false | PASS |
| Required Playwright WebKit 26.6 (build 2359) | same three planned sizes | mobile/desktop | BLOCKED: binary absent; official CDN/mirror downloads return 403 Domain forbidden |

Mobile sizes are touch emulation. No physical iPhone/Android, system Safari or
Firefox tests. WebKit version is package-required, not executed. Timestamps,
effective version and context options accompany each test report.

<a id="matriz-de-recorridos"></a>

## Flow matrix

`C360`, `C430`, `C1440` refer to the Chromium configurations above. Real cases use
full Vite -> proxy -> API entrypoint -> Better Auth/SQLite; users/projects renew
per test. Browser injects transport failures; lost-response/timeout cases first
use `route.fetch()` against real backend and verify database commit.

| Flow | C360 | C430 | C1440 | Evidence / verified effect |
| --- | --- | --- | --- | --- |
| Required login/fields, wrong password and valid login | PASS | PASS | PASS | Generic error, real backend cookies/session. |
| Own/shared list and foreign project ID access | PASS | PASS | PASS | Foreign project absent/unavailable. |
| Owner/editor limits and admin without grant | PASS | PASS | PASS | No sharing; member POST/DELETE 403; admin 404. |
| Independent variants/layouts and finishes | PASS | PASS | PASS | Two variants; layouts preserve furniture/floors/doors/curtains/4000 K light. Save/reload/database read. |
| Plain-text notes, empty name, invalid numeric value | PASS | PASS | PASS | HTML not executed; whitespace not saved; invalid field restores previous value. |
| Save double-click and undo/redo | PASS | PASS | PASS | One persisted revision, no false alert; correct object states. |
| Concurrent owner editing and 409 | PASS | PASS | PASS | Draft retained, buttons blocked, owner reload then revision 3. |
| Response lost after commit | PASS | PASS | PASS | Transport abort; retry 409 without second commit; reload reconciles. |
| Real response timeout | PASS | PASS | PASS | 16s wait against app 15s timeout; same persisted/reconciled outcome. |
| Initial error/retry; save error before commit | PASS | PASS | PASS | Recoverable load 503; retained draft/revision before retry. |
| Cancel link/logout, Back/Forward, confirm departure | PASS | PASS | PASS | Cancellation preserves draft; departure discards draft only, not database. |
| Revoke while editing | PASS | PASS | PASS | PUT rejected; scene/controls removed; database intact; reload/list hide project. |
| Revoke during 409 recovery | PASS | PASS | PASS | GET 404 removes loaded scene; owner's change persists. |
| Editor -> viewer downgrade and revoked session | PASS | PASS | PASS | PUT 403, readonly fields/no Save; real session deleted; focus leads to login without private data. |
| Independent editor-owned copy | PASS | PASS | PASS | Only copy changes; original unchanged; sharing only on own copy. |
| Empty library/project list and cancelled creation | PASS | PASS | PASS | Zero projects after cancellation/invalid required; recoverable list outage. |
| Own credits/usage | PASS | PASS | PASS | Balance visible, checkout disabled, usage screen. |
| Existing assets: place/rotate/duplicate/remove, plan/context | PASS | PASS | PASS | Two persisted instances, mobile tap, camera/context without GLB change. |
| Late response after project change | PASS | PASS | PASS | Allowed commit arrives late without replacing other project's fields. |
| Attached private asset and layout isolation | NOT RUN | NOT RUN | NOT RUN | Supplementary existing-mock desktop PASS, WebGL disabled; not established with real API here. |
| Multi-floor preparation, plan upload, checkpoint accept/restore | NOT RUN | NOT RUN | NOT RUN | Ready legacy project; these UI flows not established. |
| Generation/retry/cancel workshop, AI/Blender, geometry design | NOT RUN | NOT RUN | NOT RUN | Excluded by mandate; no generation job started. |
| Walkthrough, energy editing, fullscreen, personal-asset download | NOT RUN | NOT RUN | NOT RUN | Inventoried but not exercised for this role; context/empty library inspected. |
| Entire matrix in WebKit | BLOCKED | BLOCKED | BLOCKED | Engine setup, not product defect. |

Known pending product bugs in executed flows: none. Blocks/NOT RUN listed above;
no absolute coverage established. Revocation is detected on next project request
or reload; no membership polling added or promise to erase downloaded information.

<a id="bugs-corregidos-y-evidencia-anterior"></a>

## Corrected bugs and earlier evidence

1. **History cancellation lost draft.** Real baseline `cancel route...` FAIL;
   URL remains `/app` after cancelled Back. Root router consults
   `t3:before-navigate` before route update; editor retains one guard. Regression
   covers Back/Forward/link/logout cancellation and confirmed departure.
2. **Revocation retained editor.** Real baseline `revocation during edit...` FAIL;
   generic error and controls remain after PUT 404. Loaded project is now removed
   and unavailable shown; GET 403/404 also cannot retain old scenes.
3. **Viewer downgrade retained apparent writing.** Real baseline
   `downgrade to viewer...` FAIL; Save/inputs editable despite PUT 403. Unauthorized
   edits are discarded and document fetched with current role. Backend already
   rejected both writes; authorization unchanged.

Stable baseline 7 PASS / 3 FAIL in Chromium 360. Initial runs also had harness
errors: label selector including options, ValidityState assertion, one-use 503
consumed by StrictMode. Fixed without product changes or weakened assertions.
Regressions retain retries=0.

<a id="comandos-y-resultados"></a>

## Commands and results

Cloud pnpm wrapper initially tried dependency installation/validation in its
personal data directory outside workspace. Existing dependencies were used with
pnpm flags preventing automatic repair. Gates/dependencies/lockfile unchanged.

```sh
# Reproduce real flows
T3_QA_CHROMIUM=/usr/bin/chromium \
  pnpm --config.manage-package-manager-versions=false \
       --config.verify-deps-before-run=false test:shared-editor \
       --project chromium-mobile-narrow --project chromium-mobile-wide --project chromium-desktop

# Complete gates on final revision
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false check
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false build:full
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false audit:dist
```

- Real matrix 45 PASS (15 cases x 3 viewports), 0 FAIL/skipped/flaky, retries=0.
  Fixture recheck with isolated Blender probe: another 3 PASS, one per viewport.
- `check` PASS: lint/types, 648 Node and 35 Python, scene:verify, demo build/audit
  (671 files, zero failures).
- `build:full` PASS; full audit PASS (703 files, zero failures).
- Existing `editor.spec.ts`/`private-auth.spec.ts`: 12 PASS, desktop Chromium
  1440 x 1000, WebGL disabled, existing mocks. Temporary config in evidence;
  no substitution for real flows.
- `git diff --check` PASS. Final audit detected a personal path in this new
  report; removed and gate rerun without policy changes.
- Prior WARN: Vite chunks >500kB, THREE.Clock deprecation, NO_COLOR/FORCE_COLOR.
  No thresholds lowered to hide them.
- WebKit launcher FAIL from missing binary, classified BLOCKED; installation in
  `/workspace/.cache/t3-browsers` fails official-host 403. No bypass policy changes.
- Health: library flow queried `blender --version`; no generation/rendering/model
  changes. Final fixture directs probe at nonexistent binary to avoid future call.
- Manual launcher start and `/api/live` 200 checked; SIGINT closed servers and
  removed temporary directory. Cloud PTY Ctrl+C did not reach Node; SIGINT sent
  only to own PID. Normal terminals use Ctrl+C.

<a id="evidencia-y-archivos-compartidos"></a>

## Evidence and shared files

Git-ignored local evidence: `artifacts/qa/shared-editor-20261013/`, containing
logs/reports, browser results, PNGs, traces, temporary supplementary config and
JSON/CSV summary. Open traces with
`pnpm --filter @t3-designer/web exec playwright show-trace <trace.zip>` or local binary.

Inspected samples: desktop save
(`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-variants-lay-be98d-ist-through-save-and-reload-chromium-desktop/saved-editor.png`),
wide mobile plan
(`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-existing-obj-1e72e-oval-and-context-inspection-chromium-mobile-wide/existing-assets-plan.png`),
mobile cancellation trace
(`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-cancel-route-d3e0d-ion-preserves-unsaved-draft-chromium-mobile-narrow/trace.zip`),
matrix (`../../artifacts/qa/shared-editor-20261013/matrix.csv`). These are local
session files, not published Git material.

Shared product changes needing role integration: `apps/web/src/App.tsx` and
`apps/web/src/private/PrivateApp.tsx`. Tooling: `package.json`,
`apps/web/package.json`, `apps/web/playwright.config.ts`, `apps/web/tsconfig.json`.
New role files: shared-editor fixture/spec/config, demo launcher and this report.
No models/assets/backend/policy/credential/Atlas changes.

<a id="checklist-manual-reproducible"></a>

## Reproducible manual checklist

1. Run `node apps/web/test/shared-editor-demo.ts` from repo root with Node >=24
   and repo dependencies. It prints loopback origin, project URL, fictional emails
   and fixture password; requests no keys/activation links. Persistence lasts
   only for temporary scenario lifetime. Keep terminal open.
2. Open separate editor/owner/admin browser sessions using printed fixture
   credentials only. Editor logs in at `/login`, opens Shared editor card and
   checks edit permission (Spanish UI: Puede editar). Sharing (Compartir) absent;
   admin without grant sees unavailable project.
3. Duplicate variant/layout; move existing asset and change floor/door/light.
   Save/reload/switch layouts; original retains choices. Personal library empty;
   do not start workshops.
4. Owner/editor open same project. Owner saves different notes; editor saves stale
   revision. Conflict must retain draft and offer latest-version reload (Spanish
   UI: Cargar última versión).
5. Edit unsaved notes; try logout, all-projects link (Todos los proyectos),
   Back/Forward. Cancellation retains draft; accepted departure discards unsaved
   changes only.
6. Owner changes editor to viewer or removes access in Sharing (Compartir).
   Open editor save becomes readonly after downgrade; revoked project unavailable
   without controls. Reload/list confirms boundary.
7. Use reproducible suite for response loss/timeouts/late responses: real commit
   followed by held/interrupted response, without external-service failures.
8. Stop with Ctrl+C normally or SIGINT only to this launcher PID if Cloud does
   not transmit it. Cleanup closes Vite/API and deletes fictional databases;
   next start creates independent accounts/projects.

<a id="resumen-para-integrar-después-en-atlas"></a>

## Summary for later Atlas integration

Historical delivery checkpoint: T3 `qa/shared-project-editor-20261013` on
`7a851eb` received history-cancellation and revoked/downgraded-editor UI fixes.
Evidence in report/artifacts; at that time not pushed/merged/deployed. Real
Chromium mobile/desktop QA with Better Auth/SQLite, no inference/model creation.
Global admin without membership still lacks private access. WebKit blocked by
official egress; PostgreSQL/production, accepted multi-floor models and generation
not established here. Atlas clean at `27ae86c`; incorporate summary in later
intake without confusing results with October 4 deployment.
