<a id="t3-qa-20261013-project-owner--propietario-de-proyectos"></a>

# T3-QA-20261013-PROJECT-OWNER — Project owner

Current-status pointer (2026-10-16): the aggregate delivery is merged at
`eaa25386e98352145fae4bcc7c52af9aae42c702`; see
[current validation](../../current-20261016.md) and the
[structured Atlas handoff](../../intake-20261016.md). This draft preserves its
original checkpoint evidence. Atlas consolidation remains a separate owner task.

Status: **pending consolidation**. This is an intake draft in the product repository, not an approved Atlas entry or new protocol.

Primary source: [role report](../../owner-20261013.md), [original PR](https://github.com/pablitxn/t3-designer/pull/5). Original branch `qa/t3-owner-20261013-cloud`; verified SHA `bc01ee5b98f858784353d533ac957944706af199`. Shared base `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integration `qa/t3-integration-20261013`; tested code checkpoint `657060b0b459753c2d52c0643357bc1dd732ba51` (see report for final revision and later corrections).

Corrections: OWNER-B01 aside minimum width; OWNER-B02 discard on cancelled history navigation; OWNER-B03 cost confirmation and stable key when answering furniture questions.

Consolidation decisions: History guard unified with editor. Deterministic queued/running/success/needs-input/failed/cancelled/retry mocks use real services without providers or Blender. Blocked outside development, loopback and owner-qa directory.

Evidence: Original report: 54 combinations consolidated across batches, 3 WebGL with existing GLB, 180 regressions and 1 normal-entrypoint smoke. Integration: new matrix without automatically transferring those PASS results. [Integrated report](../README.md). Role reports are historical evidence of their own revisions; dates and limits remain. Captures/traces are ignored local files identified by path/index, not claimed published in Git.

Pending items and limits: WebKit blocked; 3D quality, inference, Blender modeling/rendering, payments and production not validated.

Proposed Atlas destinations, subject to later review: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` for receipt, `atlas/wiki/t3-designer.md` for summarized state, a dated `atlas/entries/` entry for decisions/evidence and `atlas/catalog/sources.yaml` for approved sources. Do not update historical deployment or claim release/production from local QA. Atlas consulted at `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, without writes in this batch.

Additional integration finding INTEGRATION-B01: StrictMode replay retained an aborted controller and delayed initial connection. Fixed by clearing the reference; regression against base app with delayed polling, plus affected real flows/suites rerun. See integrated report for results/limits.

Later UI/renderer stabilization checkpoint `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pause without continuous repaint, capture real frame with restored loop and observe jump transition from before input. CI evidence/limits are in the integrated report; consolidation remains pending with no Atlas writes.
