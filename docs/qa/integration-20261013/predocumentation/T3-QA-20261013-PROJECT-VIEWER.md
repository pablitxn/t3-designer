<a id="t3-qa-20261013-project-viewer--miembro-viewer"></a>

# T3-QA-20261013-PROJECT-VIEWER — Viewer member

Current-status pointer (2026-10-16): the aggregate delivery is merged at
`eaa25386e98352145fae4bcc7c52af9aae42c702`; see
[current validation](../../current-20261016.md) and the
[structured Atlas handoff](../../intake-20261016.md). This draft preserves its
original checkpoint evidence. Atlas consolidation remains a separate owner task.

Status: **pending consolidation**. This is an intake draft in the product repository, not an approved Atlas entry or new protocol.

Primary source: [role report](../../project-viewer-2026-10-13.md), [original PR](https://github.com/pablitxn/t3-designer/pull/7). Original branch `qa/t3-project-viewer-20261013`; verified SHA `85d2374363ed94242f24fb2c6cfc262c94ce355c`. Shared base `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integration `qa/t3-integration-20261013`; tested code checkpoint `657060b0b459753c2d52c0643357bc1dd732ba51` (see report for final revision and later corrections).

Corrections: V01 revalidate revocation; V02 ignore out-of-order session responses; V03 accessible sliders; V04 overlay/minimap; V05 late account A 401 revalidates current B cookie without expelling B.

Consolidation decisions: Isolation follows account/membership; same revision retains local floor/variant; global premium grants no shared-project write permission. Sliders/overlay use the single anonymous mechanism.

Evidence: Original report: 54 UI (18x3), rerun in integration. Source-SHA pnpm check fails absent artifact links in a clean checkout, reproduced locally; references converted to local evidence paths. [Integrated report](../README.md). Role reports are historical evidence of their own revisions; dates and limits remain. Captures/traces are ignored local files identified by path/index, not claimed published in Git.

Pending items and limits: WebKit blocked; Safari/physical phones, PostgreSQL and physical GPU not run. Premium/admin permissions as viewers not exhaustively browser-covered; do not infer from membership role.

Proposed Atlas destinations, subject to later review: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` for receipt, `atlas/wiki/t3-designer.md` for summarized state, a dated `atlas/entries/` entry for decisions/evidence and `atlas/catalog/sources.yaml` for approved sources. Do not update historical deployment or claim release/production from local QA. Atlas consulted at `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, without writes in this batch.

Later UI/renderer stabilization checkpoint `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pause without continuous repaint, capture real frame with restored loop and observe jump transition from before input. CI evidence/limits are in the integrated report; consolidation remains pending with no Atlas writes.
