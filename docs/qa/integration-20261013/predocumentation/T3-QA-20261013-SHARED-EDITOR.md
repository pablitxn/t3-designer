<a id="t3-qa-20261013-shared-editor--editor-de-proyecto-compartido"></a>

# T3-QA-20261013-SHARED-EDITOR — Shared-project editor

Current-status pointer (2026-10-16): the aggregate delivery is merged at
`eaa25386e98352145fae4bcc7c52af9aae42c702`; see
[current validation](../../current-20261016.md) and the
[structured Atlas handoff](../../intake-20261016.md). This draft preserves its
original checkpoint evidence. Atlas consolidation remains a separate owner task.

Status: **pending consolidation**. This is an intake draft in the product repository, not an approved Atlas entry or new protocol.

Primary source: [role report](../../shared-project-editor-2026-10-13.md), [original PR](https://github.com/pablitxn/t3-designer/pull/6). Original branch `qa/shared-project-editor-20261013`; verified SHA `7fe34e94419fe4c074937072dc55f85d5b216f3e`. Shared base `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integration `qa/t3-integration-20261013`; tested code checkpoint `657060b0b459753c2d52c0643357bc1dd732ba51` (see report for final revision and later corrections).

Corrections: Cancelled Back/Forward/link/logout retains draft; 403/404 remove editor; downgrade refreshes viewer permission; aborted responses/late saves do not change another project.

Consolidation decisions: One t3:before-navigate event in App/ProjectEditor. Integration adds shared revalidation: revision changes retain draft until conflict; role changes remove unauthorized controls/draft.

Evidence: Original report: 45 compound cases (15x3), plus regressions; integration adds 2 cases x3 and reruns 51 combinations. Source history fails audit:history due to a personal path in an earlier draft; final tip is not used as an ancestor. [Integrated report](../README.md). Role reports are historical evidence of their own revisions; dates and limits remain. Captures/traces are ignored local files identified by path/index, not claimed published in Git.

Pending items and limits: WebKit blocked. Detailed remote report 403; local history diagnosis confirmed. Inference, Blender, infrastructure and PostgreSQL not run.

Proposed Atlas destinations, subject to later review: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` for receipt, `atlas/wiki/t3-designer.md` for summarized state, a dated `atlas/entries/` entry for decisions/evidence and `atlas/catalog/sources.yaml` for approved sources. Do not update historical deployment or claim release/production from local QA. Atlas consulted at `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, without writes in this batch.

Later UI/renderer stabilization checkpoint `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pause without continuous repaint, capture real frame with restored loop and observe jump transition from before input. CI evidence/limits are in the integrated report; consolidation remains pending with no Atlas writes.
