<a id="t3-qa-20261013-global-admin--administrador-global"></a>

# T3-QA-20261013-GLOBAL-ADMIN — Global administrator

Status: **pending consolidation**. This is an intake draft in the product repository, not an approved Atlas entry or new protocol.

Primary source: [role report](../../2026-10-13-global-admin.md), [original PR](https://github.com/pablitxn/t3-designer/pull/4). Original branch `qa/t3-global-admin-20261013`; verified SHA `07d9c16e7707ed10cfdae3f592030ba27f76aa94`. Shared base `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integration `qa/t3-integration-20261013`; tested code checkpoint `657060b0b459753c2d52c0643357bc1dd732ba51` (see report for final revision and later corrections).

Corrections: B01 trimmed reason validation; B02 hide other-admin suspension; B03 recover pending mock checkout after reload; B04 atomic personal/shared quota and current role; B05 long mobile text.

Consolidation decisions: Global admin role grants no access to others' projects. Billing only disabled/mock; invitation quota is transactional with inviter revalidation.

Evidence: Original report: 42 UI cases in three profiles and concurrent quota regression. Integration: see matrix and 658 Node check. [Integrated report](../README.md). Role reports are historical evidence of their own revisions; dates and limits remain. Captures/traces are ignored local files identified by path/index, not claimed published in Git.

Pending items and limits: WebKit blocked; recovery UI, PostgreSQL, payments/webhooks and real email not run. Lost invitation responses require revoking/recreating the single-delivery token.

Proposed Atlas destinations, subject to later review: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` for receipt, `atlas/wiki/t3-designer.md` for summarized state, a dated `atlas/entries/` entry for decisions/evidence and `atlas/catalog/sources.yaml` for approved sources. Do not update historical deployment or claim release/production from local QA. Atlas consulted at `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, without writes in this batch.

Later UI/renderer stabilization checkpoint `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pause without continuous repaint, capture real frame with restored loop and observe jump transition from before input. CI evidence/limits are in the integrated report; consolidation remains pending with no Atlas writes.
