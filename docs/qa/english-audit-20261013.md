# English engineering content audit — T3 Designer, 2026-10-13

Current-status pointer (observed 2026-10-16): [PR9](https://github.com/pablitxn/t3-designer/pull/9)
merged on 2026-10-14 at `ffaee5f08fba7fd40b5c15adf8f51dad8c6be17b`.
Subsequent aggregate [PR8](https://github.com/pablitxn/t3-designer/pull/8) merged
at main `eaa25386e98352145fae4bcc7c52af9aae42c702`; its
[main CI](https://github.com/pablitxn/t3-designer/actions/runs/38543975722) passed
all seven application jobs. PR3 is merged; PRs4-7 are closed and superseded by
PR8. Statements below about drafts, pending CI, branch ownership and “no merge”
are historical audit checkpoints. They do not describe present PR state or
establish deployment, comprehensive English compliance or provider quality.
See [current validation](current-20261016.md) for this task's narrower scope.

This audit covers repository-authored instructions, Markdown documentation,
comments/docstrings and test descriptions, plus today's QA source PRs3–7 and the
separate stacked language PR. Product behavior, API identifiers/contracts, fixture
inputs and published Git history are preserved. There is no merge or deployment.

## Authority and branch scope

The user authorized English corrections and publication on today's QA source
branches. Integration branch `qa/t3-integration-20261013` and PR8 remain owned by
the CI integrator; this task never writes either. The language branch
`docs/english-audit-20261013` starts from fetched integration snapshot
`6f375314751c77ebeedd29bdaebfda3564487eee`, rather than old main. Later integration
commits are reconciled into that branch only. The branch matrix below separates
original QA evidence from language revisions; no original PASS is reassigned to
new code automatically.

Existing AGENTS and accessible local skill guidance were inspected first. No
T3-local `.agents/skills` collection was found. Atlas navigation was explicitly
read at `/workspace/sysadmin-workspace/.agents/skills/atlas-navigate/SKILL.md`,
with root/Atlas AGENTS, source-of-truth policy, targeted catalogs and T3 wiki.
Mounted Atlas stayed read-only at `bce92720a7f7e7ee48e02e949485ae3ab1a7b921`.
Historical reports' earlier Atlas fetches/skill readings describe those sessions,
not undocumented usage by this audit.

Canonical upstream policy: [Engineering Language and Commit Directive at
35be24c](https://github.com/pablitxn/sysadmin-workspace/blob/35be24cdef1275a3d850c9ccb999e11c3ffe6609/atlas/ops/standards/engineering-language-and-commits.md),
read through GitHub at exact SHA `35be24cdef1275a3d850c9ccb999e11c3ffe6609`.
It is in Atlas draft PR5, a pending upstream dependency; neither merged main nor
mounted adoption is assumed. Concise AGENTS fallback rules remain usable without
that file. Atlas translation is incomplete; this report makes no organization-wide
compliance claim.

## Changes

- Translate AGENTS and add concise English/Conventional Commit instructions.
- Translate the four remaining Spanish technical design documents:
  `docs/architecture/property-dossier-architecture.md`,
  `docs/checkpoints/checkpoint.md`, `docs/credits-billing.md`,
  `docs/research/server-asset-generation.md`.
- Translate all five role QA reports on their respective source branches and
  language integration branch. Translate integration report and all five intake
  drafts on the language branch only. Preserve historical SHAs, dates, counts,
  failures, scope boundaries, download blocks and artifact paths. Clarify original
  delivery-checkpoint statements without claiming current CI/production success.
- Preserve old translated-heading fragments with explicit HTML anchors. Paths
  and external URLs remain stable. Broken source-report links to ignored artifacts
  become code-form local references, using the integration branch's existing fix.
- Translate one Blender-script comment from French terminology to English
  “glass blocks”; executable Python content is unchanged. All inspected test
  descriptions were already English. Remaining code-comment candidates are
  quoted input or external names, classified below.
- Translate current PR3/5/6/7 bodies after rereading current metadata, then verify
  the published bodies by rereading GitHub. Their titles were already English.
  PR4 title/body already English and retained. PR8 metadata stays with its owner.
- Add opt-in `pnpm audit:english`; no CI workflow, hook, branch protection,
  credentials or security settings changed. Existing gates are retained.

## Exceptions and ambiguous boundaries for review

| Location/material | Classification and treatment | Review needed |
| --- | --- | --- |
| `apps/web/src/i18n/locales/{es,fr}/`, `*-copy.ts`, walkthrough/editor/energy/private copy modules | Intentional multilingual product copy; preserved | Future product-language changes need product scope |
| API errors, agent prompts and natural-language parsing in `apps/api/src/` | User-visible response or generation/input contract; preserved | Mixed technical/operator diagnostics versus product messages remain ambiguous; review before changing returned strings or model instructions |
| `apps/api/test/`, web e2e/test fixtures, Blender fixture JSON | Non-English test data/queries/expected strings; preserved; descriptions already English | Review Unicode/search/localization intent rather than blanket exemption |
| `apps/api/src/foundation-building-corrections.ts` quoted `no cambies la altura ...` | Original negative-authorization input example in an English comment | Preserve quote; no language violation asserted |
| `BuildingMap.tsx` Dénicheur Breizh, Córdoba/IDECOR/USIG and official source names | External proper names/contracts; preserved | No renaming of external authorities |
| Dossier/demo data, snapshot JSON, original model/media files, research room/variant labels | Product data, original labels or source evidence; preserved | Some authored fictional labels are ambiguous outside technical prose; classify in product scope, not bulk translation |
| Spanish UI labels in English docs; original STRANDMON variant name and quoted television request | Exact control/source names, with English explanations | Retain original wording needed to identify evidence/control |
| Proposed `inmueble.md`, `entidades/`, `hechos/`, `investigaciones/`, `fuentes/` paths in dossier design | Proposed identifiers retained | Naming proposal may be reviewed separately; no path renaming here |
| QA CSV/JSON, source commit subjects/SHAs, traces/captures/logs and historical PR links | Immutable dated outputs/provenance, already English descriptions where inspected | Do not rewrite past failure records or imply ignored local files are published |
| Old Spanish HTML heading IDs | Compatibility anchors, preserved | Intentional identifiers; prose headings now English |
| Mounted Atlas and its historical Spanish material | External owner/read-only dependency | Upstream repository-wide translation remains incomplete |

No localized strings, APIs, enum values, serialized schemas, application logic,
models or fixtures were translated blindly. This is a reviewed technical-prose
audit, not certification that every non-English byte is forbidden or removed.

## Executable checks and human judgment

`pnpm audit:english` (or `node scripts/audit_english.mjs`) inventories tracked
Markdown prose outside fences and standalone source comments/single-line test
names for a small list of known legacy Spanish phrases. Inline literal values
and link targets are ignored. `node scripts/audit_english.mjs --base <revision>`
also checks explicitly selected new commit subjects for
`type(scope): description` syntax and known Spanish phrases. It does not inspect
remote PR text, enforce meaningful scope/English grammar, fully parse source
comments/docstrings or recognize all languages. It is an executable regression
check, not a guarantee; no automatic CI enforcement is installed.

Human review must assess translation fidelity, factual/historical status,
source-versus-summary boundaries, localization/test intent, anchors, API/user
messages, current PR metadata and audit completeness. Skill reading alone proves
neither obedience nor enforcement. New commits here use English Conventional
Commit subjects/bodies; historical commits remain unchanged.

## Validation and remaining gaps

Language branch local `pnpm check` passed after correcting a translation formatting
issue that initially resembled a personal home path. The privacy auditor remained
unchanged; the failed first attempt is recorded separately in
`/tmp/t3-english-check.log`. Final checks include lint/types, 658 Node tests,
35 Python unit tests (no Blender invocation), scene verification, demo build and
public artifact audit. Full build/distribution audit also passed. Large Vite
bundle warnings remain.

Source-branch validation uses documentation-link tests, bounded English audit,
public artifact audit, whitespace checks and product-file preservation checks.
It does not rerun the browser QA matrices or provider/Blender flows. Original
source baseline failures remain distinct: editor `audit:history` contains a
historical personal-path finding, while editor/viewer have absent ignored-artifact
links. Textual link corrections fix current-tree documentation checks; historical
editor privacy failure remains and must not be bypassed or rewritten.

At initial integration snapshot, CI run38417513673 had viewer and anonymous-WebGL
FAIL; other jobs passed. After integration advanced to
`d3e54ad90c8c792d43d2944874149bbd381246eb`, run38422859306 passed all listed jobs
except viewer. These are observed dated statuses, not a claim about the language
PR's new SHA. Source branches and the language PR require their own new-SHA CI.
WebKit official-download 403 and signed-log download 403 limitations remain.
No real generation/provider calls, Blender, payments, email, production checks,
physical devices, branch-protection changes, merge or deployment occurred.

Local logs are under `/tmp/t3-english-*.log` and
`/tmp/t3-english-prs/prN-checks/`; these are review evidence in this environment,
not committed runtime artifacts. Remote SHAs and CI are recorded separately below.

## This source branch

PR3: `qa/t3-anonymous-20261013`, audited source tip `cf8fc398aa0d4d3f23a3bf5773296d2a502734be`.
This branch receives only shared instruction/design translations, its own role
report, one comment and the opt-in checker. Other roles are not imported. The
updated SHA is the commit containing this report; verify it with `git rev-parse HEAD`
and the PR remote head. Historical QA tested revisions remain in the role report.
Full updated browser matrices remain for CI/manual review.

## Published source branch matrix

All five source branches were audited and corrected by appending one English
Conventional Commit per branch. Before pushing, each remote was reread and matched
its recorded source tip; afterward `git ls-remote` matched the published SHA.
Shared translations are byte-identical across branches; each receives only its
own QA report. Integration receives the same translations without importing
source history that fails the existing privacy gate.

| PR / branch | Original QA source tip | Updated and remote-verified language SHA | Status / remaining verification |
| --- | --- | --- | --- |
| [PR3](https://github.com/pablitxn/t3-designer/pull/3) `qa/t3-anonymous-20261013` | `cf8fc398aa0d4d3f23a3bf5773296d2a502734be` | `69b26d30218b46d605d79ddf5398e7098bbaecab` | Audited/corrected; local scoped checks PASS; new-SHA CI pending |
| [PR4](https://github.com/pablitxn/t3-designer/pull/4) `qa/t3-global-admin-20261013` | `07d9c16e7707ed10cfdae3f592030ba27f76aa94` | `626618b226d7ef10a9ba21c19d2907620f7fd618` | Audited/corrected; local scoped checks PASS; new-SHA CI pending |
| [PR5](https://github.com/pablitxn/t3-designer/pull/5) `qa/t3-owner-20261013-cloud` | `bc01ee5b98f858784353d533ac957944706af199` | `5681a9dc4fd9e28eba1fa41632143d01808f5821` | Audited/corrected; local scoped checks PASS; new-SHA CI pending |
| [PR6](https://github.com/pablitxn/t3-designer/pull/6) `qa/shared-project-editor-20261013` | `7fe34e94419fe4c074937072dc55f85d5b216f3e` | `1bee9a9688310c8354530e820d2d9de7719a70ea` | Audited/corrected; local scoped checks PASS; new-SHA CI pending; historical privacy exception remains |
| [PR7](https://github.com/pablitxn/t3-designer/pull/7) `qa/t3-project-viewer-20261013` | `85d2374363ed94242f24fb2c6cfc262c94ce355c` | `0b3b67ef4d85a8c237868654a89c9da8291305ed` | Audited/corrected; local scoped checks PASS; new-SHA CI pending |

Original tested code checkpoints, retained rather than reassigned: anonymous
`4894431c49f4433db35e7fd97be080aac5ad6c89`; admin
`6c2b96b06c90710c4117cc8f354cc935a48b8cfe`; owner
`07cd81cface746a061c5c33287ad85d718fbcb9d`; editor implementation
`f304628a3fdc96ba1efbfa3d4b4735a4f53a31ec` with later isolated-fixture/documentary
commits described in its report; viewer
`c1de9b0ba1f05cdda676fd10fa96216ef5f353d9`. Runtime/application files on each
source branch match their own source tips; the sole existing executable-file
edit replaces a comment. No role's integration behavior is copied onto another.

PR8 is **audited metadata / corrected by owner**, not written by this task.
Rereading showed title “QA: integrate five T3 roles with isolated UI regressions”
and an English body at `d3e54ad90c8c792d43d2944874149bbd381246eb`. There is no remaining
PR8 title/body translation to route. Historical integration report/intake changes
are available in the separate stacked language PR for the owner to review.

Checker smoke verification in a disposable local Git fixture: English prose
passes; a known Spanish heading fails; a malformed new commit subject fails.
The fixture was deleted afterward. This is not a test of general English quality.

## Reconciliation and CI observation

The language branch reconciles `d3e54ad90c8c792d43d2944874149bbd381246eb` with a
Conventional Commit merge on its own branch. The integration remote was fetched
again at 2026-10-13T15:56:19Z and still matched that SHA. This task never pushed
integration. Reconciled-tree `pnpm check` and full build/distribution audit pass;
latest demo audit 710 files and full audit 742 files. Original source QA matrices
were not rerun locally for these prose changes.

New source-SHA CI observation: PR3, PR4, PR5 and PR7 global checks were in progress;
GitGuardian passed on all five. PR6 run
[38425930520](https://github.com/pablitxn/t3-designer/actions/runs/38425930520) failed
its `Run pnpm audit:history` step, confirmed through job metadata. The local
baseline already reproduced the historical editor blob finding. It remains
unresolved because fixing it by rewriting published history or weakening the gate
is outside this task. Earlier matrix “pending” records publication-time status;
this observation supersedes it for PR6. The stacked draft PR's own CI must be
reported against its published head, not inferred from source or integration runs.

## Reconciliation with verified integration CI repair

Integration head `9e96569076e36929ea47fd0ea17d937db54f6d8d` was fetched and independently
verified against PR8 metadata. Its hosted run
[38432168616](https://github.com/pablitxn/t3-designer/actions/runs/38432168616)
completed SUCCESS across global check, all six role jobs and GitGuardian. This
supersedes the earlier integration failures for that revision, while preserving
the original failed-run evidence above.

The English branch merges that head with
`chore(integration): reconcile verified viewer CI repair`. At merge completion,
all 21 language-change files matched `c733589` byte-for-byte; the capture helper,
viewer configuration and English integration follow-up matched `9e96569` exactly.
There were no conflicts. This audit update is appended afterward. Integration
branch and PR8 metadata remain untouched by the language task.

Combined-tree local `pnpm check` passed, including 658 Node tests and 35 Python
unit tests without Blender. Full build/distribution audit, bounded English check,
new-commit syntax check against `9e96569` and whitespace check passed. Demo audit
checked 710 files; full audit checked 742. The combined published head must pass
its own hosted CI; the base's successful run is not that verification.

Final source-PR outcomes: PR3, PR4 and PR7 global checks passed. PR6 failed the
already-reproduced historical privacy gate. PR5 run38425919217 failed
`pnpm test:e2e:fast`; its pre-language run38392073624 failed the same stage.
Application/package/CI trees and all pre-existing package commands are identical
between PR5's original and language heads. Exact browser assertions remain
unavailable: generic exit-code annotations, no retained artifacts, signed-log
403. This proves a pre-existing failing stage, not identical individual assertion
causes. No language regression or gate relaxation is inferred. Both source
failures remain coordination items outside this language-only correction.
