# Final-run CI follow-up

This follow-up starts from `6f375314751c77ebeedd29bdaebfda3564487eee`. Historical documentation and UI labels are unchanged; the separate language-audit task owns their translation. New code comments, this report and PR text are English. Atlas remains read-only.

## Verified failure

[Run 38417513673](https://github.com/pablitxn/t3-designer/actions/runs/38417513673) failed two test steps. Its global check/history/build, admin, shared editor, owner and owner WebGL passed. These are final assertions, not assumptions about earlier runs:

- Anonymous WebGL desktop: the actual airborne transition was observed, but `data-grounded` remained false during the unchanged 60-second landing assertion. Recorded foot offsets advanced slowly from 0.12775 through 0.39375 and back to 0.26775.
- Viewer desktop: `walkthrough-live` screenshot exceeded the unchanged 15-second limit even though the helper reported three previously active render loops.

Annotations were read through the GitHub API. Signed log downloads remain inaccessible; no network policy, credentials or connection settings were changed. Both jobs successfully retained their browser artifacts.

## Smallest supported correction

Commit `182c5797a3dd94a261f9dd8ef851052613f63c71` changes only two browser-test files. Production physics, UI labels and generation behavior are unchanged.

The installed React Three Fiber implementation re-applies declared DPR, shadows and frame-loop settings when React updates the Canvas. The existing anonymous harness set DPR 0.5 and disabled shadows only once; subsequent pose updates could restore heavier rendering. The harness now preserves that existing software-only budget and explicitly verifies its effective values after movement. It still tests the real jump, real airborne transition and real landing with the original assertions and limits. It does not simulate physics or alter `data-grounded`.

Capture now suspends the renderer scheduler's active flag as well as its loop, preventing a queued React update from restarting drawing during screenshot readback. The helper renders and finishes the real frame, captures the unchanged viewport, and restores both previous flags in `finally`. Viewer DPR, shadows, geometry, input and the 15-second screenshot limit remain unchanged. No synthetic image or expected snapshot is substituted.

## Local validation

- Anonymous affected flow: 3/3 PASS, narrow touch 320x568, wide touch 430x932, desktop 1440x1000. Persistent DPR 0.5/shadows-off assertions pass after pose updates.
- Viewer affected flow: 3/3 PASS, touch 375x812, touch 430x932, desktop 1440x1000. Real screenshots and traces retained.
- `pnpm check`: PASS, including lint, types, existing Node/Python tests, scene verification, build and distribution audit.
- `git diff --check`: PASS.

Evidence: `artifacts/integration-qa/resume-anonymous/`, `resume-viewer/`, `resume-check.log`, `resume-lint.log`, `resume-types.log`, and the saved final-run annotation JSON files. All data and accounts are isolated fixtures. Chromium 154.0.8037.57 with Playwright 1.63.0; touch viewports are emulation, not physical phone tests. WebKit remains blocked by its official download's 403. No OpenAI/Codex provider request, Blender modeling/rendering, real payment, email, production operation or 3D quality validation was performed.

The follow-up commit is a clear boundary for the language-audit task. The new published SHA must pass its own CI; local PASS does not establish remote PASS. Keep [PR #8](https://github.com/pablitxn/t3-designer/pull/8) in DRAFT. No merge or deployment.

## Viewport capture follow-up

[Run 38422859306](https://github.com/pablitxn/t3-designer/actions/runs/38422859306), at `d3e54ad90c8c792d43d2944874149bbd381246eb`, finished with one failing job: viewer desktop still exceeded the 15-second `walkthrough-live` capture deadline after fonts had loaded. Anonymous WebGL and all other jobs passed. The anonymous budget correction is therefore verified in hosted CI. The scheduler freeze alone did not resolve hosted viewer capture.

Chromium viewport capture now requests `Page.captureScreenshot` with lossless PNG `optimizeForSpeed: true`. The installed Playwright implementation does not request this encoder option. Font readiness and capture share the existing 15-second deadline; geometry, viewer rendering settings, behavior assertions and persistence checks are unchanged. Selector captures and other browser engines retain Playwright's screenshot path. This targets screenshot readback/encoding cost; it does not prove encoding was the cause of the hosted timeout.

Both local capture runs passed 3/3 profiles. Actual PNG dimensions were inspected: 375x812, 430x932 and 1440x1000, and mobile/desktop images visibly contain the active walkthrough. Evidence is retained in `artifacts/integration-qa/png-speed-viewer/` and `png-deadline-viewer/`; the latter checks the final helper with font readiness included in the deadline. Lint, types, 24 supporting tests (documentation, public artifacts and history audit), public source audit and diff check pass. Their logs use the `png-deadline-` prefix. No placeholder pixels, timeout increase or snapshot substitution is used.

The English audit is independently published as stacked [draft PR #9](https://github.com/pablitxn/t3-designer/pull/9) at `c733589ce629fadbce3572f3444848542034ab96`, based on `d3e54ad`. Its branch is not edited by this task. Integration follow-up commits must be reconciled with that branch while preserving its language changes.
