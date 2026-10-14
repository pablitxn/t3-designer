# English engineering content audit — T3 Designer, 2026-10-13

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
