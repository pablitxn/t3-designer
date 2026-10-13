<a id="qa-del-visitante-anonimo---2026-10-13"></a>

# Anonymous visitor QA - 2026-10-13

QA complete for executed scope. Four defects corrected; 255 distinct UI cases
passed, with declared limits/unexecuted cases. No deployment or physical-device
validation established.

<a id="revision-y-entorno"></a>

## Revision and environment

- Initial T3/`origin/main`: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`.
- Isolated `qa/t3-anonymous-20261013`, initially clean checkout. Normal/explicit
  `refs/heads/main` fetch, ls-remote and fast-forward checked. At this historical
  checkpoint no reset, other-branch merge, push, PR or deployment.
- Initial Atlas `bce92720a7f7e7ee48e02e949485ae3ab1a7b921`, fast-forwarded to
  `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, no content edits. Read AGENTS,
  atlas-navigate, policy, T3 wiki/entry.
- Cloud Linux, Node24.19.0, pnpm12.7.0, Playwright1.63.0, system
  Chromium154.0.8037.57. Pinned Chromium153.0.8010.12/WebKit26.6/v2359 downloads
  blocked by official providers' 403 Domain forbidden.
- Touch emulation 320x568/430x932; desktop1440x1000. Existing-suite overrides
  documented separately; project name does not prove retained viewport. No
  physical iPhone/Android.
- Real loopback/SQLite backend, separate run directories, no .env/real accounts,
  generation/payments/OTLP disabled. Published assets/fictional dossier only.
  Network errors/tiles use local fixtures.

<a id="inventario-desde-codigo"></a>

## Code inventory

Read before case selection: `App.tsx`, `workspace-view.ts`, `ApartmentExplorer`,
`PublicArrangement`, `useDemoLayout`, `usePublicArrangement`, `PublicAssetsExplorer`,
`DossierExplorer`, `BuildingExplorer`, `SolarControls`, `EnergyWorkbench`,
`Walkthrough`, `ApplicationSettings`, `SettingsDialog`, `PrivacyControls`,
`PrivacyPage`, `PrivateApp`/`AccountForm` boundary.

| Route/surface | Visitor actions |
| --- | --- |
| `/`, unknown hash | Default building, five tabs, private links/settings |
| `/#apartment` | Perspective/plan/camera reset/expand/exit; cutaway/furniture/labels/context layers; eight rooms/overview; catalog/detail/GLB download/solar |
| Public furniture | Select/add/remove21 original instances/3 existing objects; collapsible groups; movable rotation/movement, fixed installations; keys/arrows/Shift/R,undo/redo/reset,drag cancel/Escape; local autosave/cross-tab sync |
| `/#walkthrough` | Reference viewer,enter/pause/resume/exit,spawn/reset,date/time/restore time,lights/torch,height/FOV/sensitivity,screen controls,walk/turn/jump,interactive doors,fullscreen |
| `/#building` | Perspective/map/reset/expand,neighbors/path/labels/panels,locate/full view,building/floor/interior cuts,enter apartment,light/energy controls,sources/external links |
| Shared solar | Date1900–2100,seasons,clock/slider,play/pause,noon,night/day,DST,orientation/assumptions |
| Public energy | Sun/panels/usage/investment tabs,shared date/slider,installation/monthly weather/losses,usage/tariffs/currency,results/capacity,local scenario save/restore/discard |
| `/#documentation` | Five sections,cards/statistics,search/clear/empty,eight areas,observations,13 source records/local copy/external guide,viewer return/print |
| `/#assets` | Three objects/four versions,perspective/front/side/viewer,history/select,evidence/corrections,external product,GLB download,two full-build `/app/assets` CTAs |
| Settings | Auto/es/en/fr,system/light/dark,metric/imperial,privacy/consent,Escape/backdrop/close/focus,persistence/tabs |
| `/privacy` | Policy,absent/configured operator,return/navigation/history |
| `/app`, `/app/assets`, other private routes | Redirect visitor `/login`; no private library/projects |
| `/login` | Email/password,native validation,submit/busy/error/retry,settings,demo return,closed registration/invitation/recovery help |
| `/invite`, `/recover` | Missing/invalid link,sanitized hash,rejection. Successful activation/authenticated accounts belong to other roles |

<a id="defectos-corregidos"></a>

## Corrected defects

1. Dossier Escape close left focus on body. Opener preserved/restored on dialog
   unmount. Independent Chromium reproduction; Escape/button/backdrop and local
   popup-copy regressions.
2. Lost/404 gallery image showed broken img without recovery. Translated message/
   retry retain object/version; view changes reset image state. Lost response/
   retry/version/es-en-fr regressions.
3. Implicit height/FOV/sensitivity labels named output, leaving sliders unnamed.
   Unique IDs/explicit associations enable identification/keyboard changes.
   Prior FAIL then PASS in three viewports.
4. Narrow walkthrough minimap over instructions/entry button. Corrected overlay
   paint order; map remains visible during visit. Earlier capture/hit-test FAIL;
   final entry checked all sizes.

Pre-fix evidence `artifacts/qa-anonymous/bugs-before`, `slider-before`,
`overlay-before`; all defects pre-existed. Incorrect first assertions (default
building/selectors/labels) fixed in tests without product change. First inherited
batch HMR reload during settings record; full repeat with stable sources.
Inherited WebGL executablePath override prevented system Chromium; optional
system override added, assertions retained. Setup issue, not product bug.
Concurrent software renders exhausted long-case deadlines; isolated plan drag
passed. Walkthrough screens/control groups separated into independent cases,
retaining assertions/180s per case. Jump allowed up to60s for frames, landing
still checked. Initial gallery-viewer capture preceded GLB; replaced by loaded-mesh
wait, verified orbit gesture and visible-viewer capture. Empty earlier captures
establish no rendering.

<a id="evidencia-actual"></a>

## Recorded evidence

- `pnpm check` PASS: lint/types,648 Node/35 Python,scene verification/build,
  672-file/0-failure audit. Final code log `artifacts/qa-anonymous/checks/review-final.log`.
- Backend-free production demo3PASS: `artifacts/qa-anonymous/checks/demo-final.log`.
- Complete public suite180PASS in `final-ui`:42 new+138 inherited. Overrides below.
- Final WebGL21PASS `webgl-atomic`,three exact viewports:loaded viewers/orbit,
  movement/jump/pause/return,settings/validation/denied fullscreen,clear entry,
  failed GLB.
- `pnpm test:anonymous`60PASS `gates-final`,three exact viewports,focus/image/slider
  regressions.
- Production privacy/analytics29PASS `analytics`;collector/tracker/operator
  intercepted fictional fixtures. Two private-workshop/authenticated tests excluded.
- Map2desktopPASS `map-drag-final`:synthetic tiles,recenter/zoom/attribution,
  100% failed tiles/retry.3D dragPASS there;plan dragPASS `drag-isolated`.
  Both1284x926,no touch.
- Manual gallery->login UI PASS430x932 touch;API live200,protected library401.
  `checks/manual-launcher.json` and attached capture.
- After backend stop SQLite zero users/sessions/projects/assets/jobs/foundation
  runs/credits/payments/AI calls/usage;four fictional-access rate-limit rows.
  `checks/backend-counts.json`;no database/session-secret delivery.
- Simulated CI1PASS,new `apps/web/test-results/anonymous/ui` layout. Local data/
  secrets separate temp,excluded CI artifacts. Both-provider YAML validated.
- Per-test captures/traces `artifacts/qa-anonymous/<run>/browser`;`results.json`
  and `report/index.html` record outcomes/errors/attachments.
- Environment recovery checked10:29UTC:shell/Git/processes/API/Vite/evidence writes
  remained available.

<a id="matriz-de-flujos"></a>

## Flow matrix

PASS means executed UI/assertions; FAIL means earlier reproduced defect or
identified failed execution. BLOCKED means absent engine/capability. NOT RUN
retains exclusions/unexecuted cases. Individual CSV accompanies evidence/JSON;
reruns do not add coverage.

| Flow/fixture | 320 touch | 430 touch | Desktop | Evidence/limit |
| --- | --- | --- | --- | --- |
| `/`,five tabs,direct link,unknown hash,reload,back/forward | PASS | PASS | PASS | anonymous visitor inventory;default building |
| Auto/es/en/fr,system/light/dark,units/persistence | PASS | PASS | PASS | settings/i18n/privacy;inherited overrides below |
| Modal focus/Escape/backdrop/Tab/Shift-Tab;invalid/denied storage | PASS | PASS | PASS | settings/i18n/main gate |
| Apartment layers/eight rooms/overview/all details/GLB | PASS | PASS | PASS | anonymous-details;restored layers/persisted detail selection |
| Furniture add/remove/presence,empty catalog/collapsible groups | PASS | PASS | PASS | layout/arrangement/public arrangement;21 originals+3existing |
| Double rotation,undo/redo/reset/undo,navigation/reload | PASS | PASS | PASS | localStorage comparison;reset retains other preferences |
| Valid movement,out-of-bound/fixed rejection | PASS | PASS | PASS | demo-layout,persisted positions,no model changes |
| Two-tab movement/presence/reset sync;new context isolated | PASS | PASS | PASS | storage events/new context without layout |
| Corrupt/quota-exceeded storage,recovery/unsaved state | PASS | PASS | PASS | demo-layout/corrupt layout/energy quota fixture |
| Solar night/noon/seasons,empty/range/DST | PASS | PASS | PASS | date/time,29/03 gap,25/10 repeat |
| Solar play/pause/navigation pause,shared instant | PASS | PASS | PASS | apartment/building inputs;temporary time |
| Building layers/cuts/locate/enter apartment | PASS | PASS | PASS | anonymous-details,pressed/checked controls |
| Energy four panels/save/reload/zero/discard | PASS | PASS | PASS | explicit save/persisted values |
| Energy capacity/invalid/extreme investment/weather/date | PASS | PASS | PASS | representative,not full parameter combinations |
| All currency/monthly weather/usage combinations | NOT RUN | NOT RUN | NOT RUN | code inventory/representative cases/calculation tests,not all UI combos |
| Dossier five sections/search/clear/empty/local copy | PASS | PASS | PASS | i18n/dossier,fictional content/local popup |
| 13 sources/Escape/close/backdrop/opener focus | PASS | PASS | PASS | prior FAIL corrected,source dialog |
| Print media/selected section | PASS | PASS | PASS | print capture;app print button desktop only |
| Printer/native OS dialog | NOT RUN | NOT RUN | NOT RUN | no physical printer/device;window.print intercepted |
| Gallery3objects/4versions/images/evidence/GLB | PASS | PASS | PASS | naturalWidth512,version/history/successful download |
| Lost/404 image/retry/preserved version/es-en-fr | PASS | PASS | PASS | prior FAIL corrected,before/after images/traces |
| Project/workshop CTA->real backend login | PASS | PASS | PASS | anonymous/launcher visitor redirect |
| Empty/invalid email no-request login,fictional credentials | PASS | PASS | PASS | native validation/real401,no accounts created |
| Lost login response/busy/double-submit/429/cancel | PASS | PASS | PASS | one submit,draft retained,late response cancelled by navigation |
| API/session503/retry,expired/invalid cookie/private routes | PASS | PASS | PASS | real401/injected failure,no visible private data |
| Missing/invalid invite/recover/sanitized hash | PASS | PASS | PASS | invalid fictional tokens,no activation/email |
| Authentic expired session/two valid accounts isolation | NOT RUN | NOT RUN | NOT RUN | other role;visitor/contexts/invalid cookie checked |
| Privacy link/page/return/history/local consent | PASS | PASS | PASS | gate/analytics;analytics390/375px cases |
| Failed tracker/collector,DNT/GPC,revoke/expire/tabs | NOT RUN | NOT RUN | PASS | 29production cases1440x1000,two390x844 no-touch;no real service |
| Map tiles/zoom/recenter/attribution/error/retry | NOT RUN | NOT RUN | PASS | 2desktop cases,fictional tiles,no real OSM |
| WebGL plan/perspective drag,fixed installation | NOT RUN | NOT RUN | PASS | 1284x926;existing instance movement,no geometry |
| WebGL viewers,touch/desktop orbit,unavailable model | PASS | PASS | PASS | final atomic batch,180s/case,real-render wait |
| Walkthrough enter/move/jump/pause/resume/blur/exit | PASS | PASS | PASS | Chromium touch events/desktop mouse,no physical device |
| Settings/invalid date/sliders/reset/lights/torch | PASS | PASS | PASS | accessible names corrected,no design persistence |
| Entry above minimap,active map visible | PASS | PASS | PASS | prior FAIL/CSS fix,real hit-testing/capture |
| Denied fullscreen/mouse capture:UI fallback | PASS | PASS | PASS | intentional denial,no native permission establishment |
| Successful native Pointer Lock/fullscreen | NOT RUN | NOT RUN | NOT RUN | injected denial not attributed to product |
| Run/crouch/doors in real walkthrough | NOT RUN | NOT RUN | NOT RUN | inventoried,not all exercised for this role |
| WebKit | BLOCKED | BLOCKED | BLOCKED | WebKit26.6/v2359,official403 Domain forbidden |
| Physical GPU/iPhone/Android | NOT RUN | NOT RUN | NOT RUN | headless SwiftShader/emulation |
| Model creation/modification/fidelity,AI,payment/email/deploy | NOT RUN | NOT RUN | NOT RUN | excluded by mandate |

Viewport overrides, distinct from project names:

- `apartment-viewer`, `arrangement-controls`:1284x926,narrow605x926.
- `building-studio`,demo-layout multi-tab,public-assets,energy mobile,i18n mobile:
  390x844 in specific cases.
- settings narrow320x568;i18n international-date-line separate default1280x720
  no-touch context.
- New `anonymous*` retain320x568/430x932/1440x1000;extra isolation context1280x720
  no-touch. Metadata includes engine/viewport/maxTouchPoints/coarse-pointer.
- Analytics1440x1000 generally,two390x844 mobile no-touch;one execution per case.
- SwiftShader WebGL DPR0.5/shadows disabled for interaction;no FPS/hardware/
  exact-lighting/fidelity claim.

<a id="escenario-manual-aislado"></a>

## Isolated manual scenario

```sh
source /workspace/.cloud-setup/activate.sh # Only in this Cloud environment
cd /workspace/t3-designer
node scripts/qa-anonymous.mjs
```

Launcher displays temp directory. Web4190/API8790,overrides
`T3_ANONYMOUS_WEB_PORT`/`T3_ANONYMOUS_API_PORT`. No .env/user creation/key/activation
link/AI. New profile/incognito for empty storage. Ctrl-C stops only its two
processes. Do not delete others' data;temp directories separate from
`artifacts/cloud-dev`/production.

Reproducible tests:

```sh
T3_ANONYMOUS_EXECUTABLE=/usr/bin/chromium pnpm --filter @t3-designer/web exec playwright test --config playwright.anonymous.config.ts
T3_ANONYMOUS_EXECUTABLE=/usr/bin/chromium T3_ANONYMOUS_WEBGL=1 pnpm --filter @t3-designer/web exec playwright test --config playwright.anonymous.config.ts
```

Omit `T3_ANONYMOUS_EXECUTABLE` for installed official binaries. WebKit:
`T3_ANONYMOUS_BROWSER=webkit`,select `anonymous-webgl.spec.ts` or `anonymous.spec.ts`;
inherited map/drag suites use Chromium flags. Missing binary is not app failure.

Short manual checklist:

1. Narrow viewport,five tabs/back/forward,settings/language/theme/units,close/reload.
2. Apartment add STRANDMON/remove installation/rotate table/undo/redo/reset/undo;
   reload/compare another tab/incognito.
3. Solar29/03/2026 02:30,25/10/2026 02:30,night/play;view change pauses. Energy
   save four panels,set zero/discard/reload/check saved state.
4. Dossier existing/missing search,open source,Escape/Tab restores focus;local
   copy/print.
5. DYVLINGE v1/v2,three gallery views,GLB download. Block front.png network,
   check message,restore/retry.
6. Existing-asset walkthrough enter/touch/pause/lights/torch/reset/exit. No
   generation/geometry changes.
7. Private CTA/login/empty form/invalid email/fictional credentials;demo return,
   no private data exposed.

<a id="retorno-para-atlas-sin-escrituras"></a>

## Atlas handoff (without writes)

T3 belongs to Immolab. Atlas documents October12 a3579ee baseline and October4
ade9bf2/20a426f deployment; this QA on main7a851eb/local branch does not revalidate
it. Later integrate UI results/engine limits/four fixes/final SHAs into T3 intake.
No real services/GitOps/DNS/payments/email/AI consulted. No architecture change or
new product decision.

<a id="comandos-y-cierre-de-revision"></a>

## Commands and revision closure

All instance commands after `source /workspace/.cloud-setup/activate.sh`.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS648Node+35Python,lint/types/scene/build/audit | checks/review-final.log |
| `pnpm lint`,`pnpm typecheck` after WebGL case separation | PASS | checks/atomic-lint.log,checks/atomic-webgl-types.log |
| `pnpm audit:history` | PASS | checks/history.log |
| Full anonymous config before final slider | 180PASS | final-ui/results.json |
| `pnpm test:anonymous` | 60PASS,real backend/no.env | gates-final/results.json |
| `pnpm test:anonymous:webgl` | 21PASS,final log chronology | webgl-atomic/results.json/run.log;exact duration JSON |
| building-map+demo-drag desktop | map2/3DdragPASS;concurrent top timeout | map-drag-final/results.json |
| isolated demo-drag top | 1PASS,original assertions | drag-isolated/results.json |
| Backend-free production demo | 3PASS | checks/demo-final.log,demo-final/test-results/.last-run.json |
| Public analytics external config/system Chromium | 29PASS;2private excluded | analytics/results.json |
| CI=1,new artifact layout,lost preview/retry | 1PASS,0sqlite/session-secret in artifacts | checks/ci-scenario.log |
| `node scripts/qa-anonymous.mjs`/UI | PASS,API200/private401 | checks/manual-launcher.json |
| GitHub/GitLab YAML/`git diff --check` | PASS | local parse/clean Git output |
| Complete `pnpm check:all` | NOT RUN | other roles/suites remain in gates |

Deduplicated138inherited+60anonymous+21WebGL+4map/drag+29analytics+3production-demo
= **255 PASS**. Selected final execution zeroFAIL. Prior reproduction/setup FAIL
retained/explained,not hidden or attributed to a regression from these changes.

Tested code saved in local commits:

- `154ace41b93caba56d55d0502544ca0ea039f18f`:recoverable gallery/dossier focus.
- `d7eabd944e0d556c784edb018be39e1eb2988795`:accessible slider names.
- `4a0a7e7`:walkthrough overlay above minimap.
- `4894431c49f4433db35e7fd97be080aac5ad6c89`:tests/config/CI/manual scenario.
  Subsequent closure commit only completes report. Final SHA/delivery hashes/
  commit patch in evidence manifest.

New CI layout tested in CI mode;backend databases/secret outside test-results.
No previous gate changed:new tests need own API/separate web-only config;
anonymous commands added check:all,fast gate both CI providers. WebGL retains
assertions/180s per case,may be slow in software.

Shared integration files:

- `src/walkthrough/Walkthrough.tsx`,`walkthrough.css`:private viewer also uses;
  here tested public assets,not authenticated projects.
- `src/components/DossierExplorer.tsx`,`PublicAssetsExplorer.tsx`,`assets.css`,
  `src/i18n/locales/{en,es,fr}/public-assets.ts`.
- Root `package.json`,`.github/workflows/ci.yml`,`.gitlab-ci.yml`,
  `apps/web/playwright.config.ts`,building-map.spec.ts/demo-drag.spec.ts browser
  overrides. Resolve small overlaps on integration;historical task had no merge/publication.

Deliverables `artifacts/qa-anonymous/delivery`:

- `cases.csv`:case/engine/actual or configured main viewport/touch/result/duration/
  evidence paths;secondary contexts/inherited overrides in report.
- `summary.json`:deduplicated counts/limits.
- `evidence.zip`:selected captures,all new-case traces,final-run JSON/logs;
  excludes temporary database/session secrets.
- `commits.patch`:local integration commits without PR publication at checkpoint.
- `manifest.json`:branch/SHA and delivery SHA256.

No reproduced in-scope defect remains uncorrected. Matrix BLOCKED/NOT RUN remain:
WebKit/physical devices/unexercised controls/all energy combinations/valid accounts/
physical printing/successful Pointer Lock-fullscreen/excluded services-modeling.
