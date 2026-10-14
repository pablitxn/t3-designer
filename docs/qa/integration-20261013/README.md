<a id="t3--integracion-qa-de-cinco-roles-2026-10-13"></a>

# T3 — five-role QA integration (2026-10-13)

Status at the recorded checkpoint: DRAFT, local matrices complete; CI requires
admin/viewer diagnosis. Not approved for merge/deployment. This report supersedes
the cross-role status; source reports retain their branches' historical evidence.
Later CI observations belong in the language audit or the integrator's updates.

Base `origin/main`: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Working branch
`qa/t3-integration-20261013`. Initial functional code with complete check:
`657060b0b459753c2d52c0643357bc1dd732ba51`; final renderer correction
`67ad9ec8c1770788a7b6f34f34316bca67ccb26e`; CI retention/diagnostics added afterward.
Matrices started at `e4cb70f` were completed and suites affected by INTEGRATION-B01
rerun after the fix; this is not presented as one immutable batch.
[Full provenance](sources.json).

| Role | Source PR | Verified SHA |
| --- | --- | --- |
| Anonymous | [PR3](https://github.com/pablitxn/t3-designer/pull/3) | `cf8fc398aa0d4d3f23a3bf5773296d2a502734be` |
| Global admin | [PR4](https://github.com/pablitxn/t3-designer/pull/4) | `07d9c16e7707ed10cfdae3f592030ba27f76aa94` |
| Owner | [PR5](https://github.com/pablitxn/t3-designer/pull/5) | `bc01ee5b98f858784353d533ac957944706af199` |
| Shared editor | [PR6](https://github.com/pablitxn/t3-designer/pull/6) | `7fe34e94419fe4c074937072dc55f85d5b216f3e` |
| Viewer | [PR7](https://github.com/pablitxn/t3-designer/pull/7) | `85d2374363ed94242f24fb2c6cfc262c94ce355c` |

Final trees were integrated with a squash per role and independent commits. At
that checkpoint the five original branches/PRs remained intact and open. Editor
draft history failing the privacy gate was excluded as ancestry. No history was
rewritten, auditor weakened, merge into main performed or deployment made.
Subsequent English-only source-branch commits are tracked separately in the audit.

<a id="resolucion-semantica"></a>

## Semantic resolution

- `App.tsx` consults one cancellable `t3:before-navigate` event before changing a
  history route. Editor links/logout use the same guard; cancellation preserves
  the full URL. The duplicate owner alternative is removed; both regressions remain.
- `PrivateApp.tsx` combines immediate 403/404 cleanup, rejection of aborted
  responses/late saves and sequence/epoch session checks. A late 401 revalidates
  the current cookie without removing another valid identity. Editor/viewer
  membership is revalidated at focus, visibilitychange and every visible 60 s.
  New revisions preserve dirty drafts until 409 resolution; role changes remove
  unauthorized controls/drafts. Same revision/role preserves temporary viewer selectors.
- Sliders retain one label/input association by ID; walkthrough overlay has one
  z-index above the minimap. Long names impose no minimum aside width.
- All Playwright configs enter typecheck. Suites with their own backend have
  dedicated gates and are not rediscovered under the generic server. `check:all`
  retains previous gates and adds five roles. GitHub/GitLab CI adds Chromium for
  new suites; WebKit stays unexecuted because of the known environment block.
- Each fixture/Vite uses its own cache to avoid invalidating another session.
  Owner uses official Playwright Chromium unless Cloud explicitly overrides it.
  Mocks retain development/loopback/isolated-directory restrictions and contact
  no providers.

Shared files for review: `App.tsx`, `private/PrivateApp.tsx`,
`walkthrough/Walkthrough.tsx`, `styles/walkthrough.css`, `private/AccountHub.tsx`,
`private/account-copy.ts`, `components/AssetsExplorer.tsx`, `lib/asset-api.ts`,
`accounts.ts`, package scripts, tsconfig, Playwright/Vite configs and CI workflows.
Product differences are focused; no new protocol or architecture refactor.

<a id="diagnostico-de-gates-fuente"></a>

## Source-gate diagnosis

Base passes `audit:history` (785 blobs, 8 commits). Anonymous, admin, owner and
viewer pass source-history audits. Editor fails `personal home directory` in a
historical `docs/qa/shared-project-editor-2026-10-13.md` blob; final prose had
removed the path but the ancestor remained reachable. Initial five-tip integration
passes 852 blobs/13 commits. Functional checkpoint `657060b` passes 877 blobs/18
commits; publication audit is repeated on the consolidated report.

Original viewer SHA was reproduced in a detached worktree: lint/types/package
tests pass, but documentation links reject two relative links to absent ignored
artifacts. First integrated check reproduces these plus four editor links. They
become textual local references; the gate remains intact. Integrated `pnpm check`
passes: 658 Node + 35 Python, lint, types, read-only scene snapshot, demo build and
696-file audit. Final full build/audit pass 735 files; final check passes with
703-file demo audit. Counts vary with chunks/cache; exact command outputs remain.
Remote source-failure logs returned 403; causes are backed by local reproduction,
not downloaded remote logs.

Owner initially rejected data path `artifacts/integration-qa/owner`, deliberately.
Correct execution uses `artifacts/owner-qa/integration-20261013`; no allowlist expansion.

<a id="defecto-adicional-reproducido-al-integrar"></a>

## Additional defect reproduced during integration

**INTEGRATION-B01**: `AssetsExplorer` aborted the first fetch during StrictMode
effect replay but retained its controller reference. Second setup did not read
and waited 3 s for polling; under load, 5-second assertions expired. Cleanup clears
the reference and new setup starts immediately. The defect also exists in base
`7a851eb`.

Deterministic regression: only the 3-second polling interval is delayed to 60 s,
retaining real clock/scheduler/lazy loading. Base fails `Taller conectado` (the
actual Spanish UI label); corrected app passes without raised timeouts. Evidence:
`initial-connection-baseline` and `initial-connection-fixed`. Earlier fully paused
clock attempts never reached the app and are not validation. An initial fixture
had an incorrect required-button assertion, fixed before gate use. A base attempt
without a Playwright binary failed setup; separate harness used the same system
Chromium without changing base app.

First generic suite: 103 PASS, 11 FAIL, 2 SKIPPED; workshop connection failures
before the fix. Logs/traces remain; affected suites rerun with identical gates.
These are not dismissed as environment failures. New fixture mixed Window and
Node timers and failed types; browser Window typing corrected and full check rerun.

Editor first matrix: 50 PASS / 1 FAIL (51 cases). Narrow-profile copy opening
failed: clone 201 persisted, new GET 200 in trace, initial read aborted after ~18 s;
UI showed connection error instead of title. Same case rerun in all three profiles:
3 PASS with original gates. Failure remains; no unreplicated product cause is
asserted. The 51 combinations are consolidated across batches, not one 51/51 run.

<a id="matrices-y-evidencia"></a>

## Matrices and evidence

[Final flow/profile matrix](flow-matrix.csv) and [all valid batches, including
prior failures](run-matrix.csv). Actual context flags come from traces. Owner
secondary contexts have the same width but lack touch emulation in some sharing
cases. Dedicated viewer uses touch/isMobile in both profiles. Nominal viewport
is not a physical device.

<a id="evidencia-y-alcance"></a>

## Evidence and scope

Recorded integration results: anonymous 60 PASS, admin 42 PASS, owner 54 PASS;
editor 51 consolidated PASS combinations (50/51 first batch + 3/3 recovery),
workshop 54 PASS and 12 affected real flows PASS, owner WebGL 3 PASS. Corrected
generic suite 115 PASS / 2 live-cadastre SKIPPED (teatro-colon/museo-larreta,
excluded from isolated scenario). Two additional WebGL regressions ran separately:
settings PASS and doors PASS isolated with original gates. Analytics 31 PASS,
demo 3 PASS, real accounts 1 PASS. Viewer 54 PASS; anonymous WebGL 21 PASS. No
pending local FAIL in final matrix; initial failures remain in batch matrix.
Do not automatically transfer PASS from prior reports. Local evidence:
`artifacts/integration-qa/`, `artifacts/owner-qa/integration-20261013/`,
`artifacts/qa-global-admin/`. Databases and session-secret are ignored local
fixtures, excluded from public deliverables. Local captures/traces are not in Git.

System Chromium 154.0.8037.57, Playwright 1.63.0; exact viewports in each
JSON/browser-context/trace. Touch emulation: anonymous 320x568/430x932; admin
320x740/430x932; owner/editor 360x800/430x932; viewer 375x812/430x932. Desktop
1440x1000. WebGL uses software SwiftShader and existing assets. Anonymous reduces
DPR to .5 and disables shadows only in its interaction harness, as in its source;
owner/viewer retain DPR/shadows. These are not fidelity tests. Viewer captures
temporarily freeze the real loop without changing geometry/shadows/DPR/input,
then restore it immediately. Neither 3D quality nor physical devices is established.

WebKit: BLOCKED by known 403 downloads, without allowlist/permission retries.
Safari, Firefox, physical phones, PostgreSQL, physical GPU, email, real
payments/providers, Blender/modeling/rendering and production: NOT RUN. No external
inference or OpenAI/Codex requests. No absolute coverage claim.

<a id="ci-publicado-y-limites-de-diagnostico"></a>

## Published CI and diagnostic limits

[DRAFT PR #8](https://github.com/pablitxn/t3-designer/pull/8). At `657060b`, run
[38397546627](https://github.com/pablitxn/t3-designer/actions/runs/38397546627),
`check`, owner, owner-webgl and shared-editor pass; admin, viewer and anonymous-webgl
fail. Details were unavailable through downloads; all three specific causes
required later diagnosis. `gh run view --log-failed` returns 403 from the signed
download host; signatures are not exposed and allowlists unchanged. At that
checkpoint causes were unverified and integration was not ready for merge.

Independent role jobs and global check run in parallel, retaining all gates and
requiring complete green before review. Next revision retains only
browser-results/results.json and annotates real JSON errors for API access despite
blocked logs. SQLite, session-secret and seeds are excluded from uploads. Original
gates still fail when applicable. An initial diagnostic draft had ANSI-regex lint;
Node `stripVTControlCharacters` replaces it and scoped lint passes. For final
published status consult PR checks and local receipt
`artifacts/integration-qa/publication.json`; this report does not anticipate CI PASS.

<a id="correcciones-verificadas-tras-ci"></a>

## Corrections verified after CI

At `8ad0f58`, run [38403119343](https://github.com/pablitxn/t3-designer/actions/runs/38403119343),
admin recovers; global, owner, editor and owner-webgl pass. Viewer fails only its
15-second desktop screenshot; anonymous-webgl fails paused 90-second screenshot,
late sampling of transient jump state and return exhausting 30 s. Real API
annotations establish these causes without bypassing download 403.

Checkpoint `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: walkthrough Canvas uses demand
when paused, always when walking. Viewer capture harness freezes the last real
frame only for the image, retains DPR/shadows, restores loop in finally; viewport
and 15-second budget remain. MutationObserver records actual grounded=false
transition from before the click; test still requires landing within 60 s.
Neither data-grounded nor jump is simulated.

Local checks: full check PASS (658 Node + 35 Python); affected anonymous 9/9 PASS,
viewer initial capture 3/3 PASS and isolated pause/revocation 6/6 PASS, isolated
door 1/1 PASS. Three concurrent GPU suites produced two viewer UI timeouts and
one door-distance failure; retained in run-matrix, recovered serially without
raised limits. Initial capture incorrectly used fullPage in harness; source
viewport retained. Final revision must pass CI before readiness. No new heavy
package; recovery through published branch/PR.

<a id="reproducir-y-revisar-manualmente"></a>

## Reproduce and review manually

Install Node 24/pnpm 12.7 and `pnpm install --frozen-lockfile --ignore-scripts`.
In this Cloud first `source /workspace/.cloud-setup/activate.sh`. Other hosts:
install Playwright Chromium and omit system overrides. Use independent browser
profiles and new directories; do not load production `.env`.

- Anonymous: `node scripts/qa-anonymous.mjs`, port 4190. Exercise tabs,
  settings/reload, dossier close/focus, gallery/version/image retry and
  slider/walkthrough. [Source guide](../../workflows/anonymous-qa.md).
- Admin: `pnpm qa:admin`, fictional-data/mock-billing launcher. Check short reason,
  invitations/quota, allowed suspension, mock purchase/reload, usage and other
  accounts. [Source guide](../2026-10-13-global-admin.md).
- Owner: two terminals per [guide](../owner-20261013.md), explicit backend
  `NODE_ENV=development T3_OWNER_QA=isolated-fixtures T3_QA_DIRECTORY=artifacts/owner-qa/manual-integrated node apps/api/test/owner-qa-backend.ts`
  without external keys/providers/database/telemetry; full web on 4189 proxy 8798.
  Use only fictional local seed accounts/passwords. Create project/intake, attach
  file, save, cancel Back with draft, resolve conflict, questions/corrections/
  acceptance, retry/cancel and mock download. Files are not production data.
- Viewer/editor: `node scripts/qa/project-viewer-scenario.mjs` per
  [viewer guide](../project-viewer-2026-10-13.md). Owner shares from an independent
  session as viewer/editor. Check read-only controls; editor changes notes/saves.
  Cancelling link/Back with a dirty draft retains URL/text. Remove access/change
  role from owner, return focus: unauthorized controls/data disappear. Logout/new
  login does not recover another account's data.
  [Editor guide](../shared-project-editor-2026-10-13.md).

Stop only your own processes with Ctrl-C. To disable generation mocks, stop QA
backend and start normal `apps/api/src/index.ts` with isolated data and
`T3_GENERATION_ENABLED=false`. Mocks are absent from normal production startup
and fail closed for production NODE_ENV or disallowed paths/origins.

<a id="predocumentacion-para-atlas"></a>

## Atlas intake drafts

Five records **pending consolidation**:
[anonymous](predocumentation/T3-QA-20261013-ANONYMOUS.md),
[admin](predocumentation/T3-QA-20261013-GLOBAL-ADMIN.md),
[owner](predocumentation/T3-QA-20261013-PROJECT-OWNER.md),
[editor](predocumentation/T3-QA-20261013-SHARED-EDITOR.md),
[viewer](predocumentation/T3-QA-20261013-PROJECT-VIEWER.md).
They include IDs, SHAs, fixes, decisions, evidence, limits and proposed destinations.
Atlas read at `27ae86c`, without writes. Do not update historical deployment
evidence or claim a release from this batch.

<a id="ultima-verificacion-de-captura"></a>

## Latest capture verification

Run [38411681088](https://github.com/pablitxn/t3-designer/actions/runs/38411681088),
SHA `f7b13a1`: global, admin, owner, editor, owner-webgl, anonymous-webgl and
GitGuardian PASS; viewer retains one 15-second desktop screenshot FAIL. No
permission/persistence failure established in that run.

Checkpoint `900c0cfb089ef577b6900fb1317be1e3d45857df` waits for `gl.finish()` after
rendering the real frame, completing GPU commands before readback. It verifies
frozen renderer existence and annotates name/loops on failure. Screenshot 15 s
and case timeout stay unchanged, as do models/shadows/DPR/input. Affected viewer:
3/3 local PASS; lint/types PASS. Everything stays on GitHub without heavy packages.
CI for this revision remains pending until confirmed by receipt/PR.

<a id="sincronizacion-final-de-checkout-mock"></a>

## Final mock-checkout synchronization

In run38415532316/b604d19, admin fails an immediate 1-order expectation against 0.
The case queried SQLite immediately after double-click, before asynchronous
checkout completion. Checkpoint `467f9216ce7bff72e5753b8b71207fec1b565f85` waits for
the same equality of 1 with expect.poll and original budget before reloading. It
relaxes neither value, double-click nor single-payment/cancellation/balance checks.
Local recheck 3/3 PASS; lint/types PASS. Annotations prioritize stacks for future errors.

Scoped admin recheck mistakenly reused its fixed config directory and replaced
previous local captures/JSON. Batches/42PASS remain in CSV/logs; full admin evidence
is GitHub artifact role-admin-browser-evidence in run38403119343 (`8ad0f58`). Old
local paths are not presented as existing files. Config now permits
T3_ADMIN_EVIDENCE_DIR to separate future batches; CI default remains. No captures
are reconstructed or heavy packages created.
