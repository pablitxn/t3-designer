<a id="qa-local-administrador-global-de-t3"></a>

# Local QA: T3 global administrator

Initial revision `7a851eb7ab703016d78c102afeaac2a8d97b08f3`, clean `work` checkout.
`git fetch origin` confirmed matching `origin/main`; no unrelated changes moved
or discarded. Working branch `qa/t3-global-admin-20261013`. Tested code commit
`6c2b96b06c90710c4117cc8f354cc935a48b8cfe`. Local commits contain changes/report;
`git log -2 --oneline` identifies delivered revision. At this historical checkpoint
there was no QA push, PR, merge or deployment.

Atlas was clean at `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`; authorized
fetch/fast-forward to `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. Read AGENTS,
local `atlas-navigate`, source policy, catalogs, T3 wiki and October 12
retrospective. No Atlas content edits. Portable origin is GitHub; Atlas GitLab
reference and historical deployment were not revalidated.

<a id="escenario-y-limites"></a>

## Scenario and limits

Real automated browser: Playwright 1.63.0, system Chromium `154.0.8037.57`,
`/usr/bin/chromium`. Real `apps/api/src/index.ts` backend, full Vite, Better Auth,
SQLite in new `/tmp/t3-global-admin-*` directories per case. Backend/browser use
loopback and isolated origin/ports. Fixture neither loads `.env` nor inherits AI,
Mercado Pago, tracing-exporter or Codex-session credentials. No email, real data
operations or AI/payment provider calls.

| Playwright project | CSS viewport | Input | Timezone |
| --- | --- | --- | --- |
| chromium-mobile-narrow | 320 x 740 | isMobile=true, hasTouch=true; includes taps | America/Argentina/Buenos_Aires |
| chromium-mobile-wide | 430 x 932 | isMobile=true, hasTouch=true; includes taps | America/Argentina/Buenos_Aires |
| chromium-desktop | 1440 x 1000 | mouse and keyboard | America/Argentina/Buenos_Aires |

Locale `es-AR`. Final secondary contexts also inherit viewport, touch and timezone.
Emulation only, no physical iPhone/Android. WebGL disabled; no case needs
generation, Blender or 3D rendering.

WebKit 26.6 / Playwright revision 2359: **BLOCKED**. Both `cdn.playwright.dev` and
fallback `playwright.download.prss.microsoft.com` returned `403 Domain forbidden`
for `webkit-debian-13.zip`. Playwright Chromium 1243 download failed likewise;
installed Chromium was used with its actual version recorded. No network/system
permission/credential changes to bypass the block.

Node `24.19.0`, pnpm `12.7.0`. Environment initially had pnpm 11.25.0; automatic
setup tried writing outside workspace. Repo-specified pnpm installed with cache/
prefix under `/tmp`, no lockfile/product-dependency changes. An environment
connection warning occurred; commands/processes/Git remained available, no progress lost.

<a id="inventario-previo-de-rutas-y-acciones"></a>

## Prior route/action inventory

From [PrivateApp](../../apps/web/src/private/PrivateApp.tsx),
[AccountHub](../../apps/web/src/private/AccountHub.tsx),
[UsagePage](../../apps/web/src/private/UsagePage.tsx),
[accounts](../../apps/api/src/accounts.ts), [billing](../../apps/api/src/billing.ts),
[projects](../../apps/api/src/projects.ts), [server](../../apps/api/src/server.ts).
Contracts: [private accounts](../workflows/private-projects.md),
[credits/billing](../credits-billing.md), [local workshop](../workflows/local-asset-workshop.md).

| UI route | Available actions | Role coverage |
| --- | --- | --- |
| /login | login; settings; demo | real login, expiration, account changes |
| /invite | inspect link, activate, validation, terminal error | personal premium/shared standard; expired/exhausted |
| /recover | operator-token reset | NOT RUN; identity workflow reserved |
| /app | own list, create/cancel, open/copy | empty/list isolation; own CRUD outside batch |
| /app/users | personal/shared links, copy/revoke, account list/tier/credits/sessions/suspension/reactivation | matrix below |
| /app/credits | balance/reservations/grants/movements, plans, checkout/mock approval/refresh/cancel | disabled/mock, persistence/isolation |
| /app/usage | period/project/type/provider/status/detail/refresh/pagination | real persisted fixtures/isolation |
| Settings > Usage (Spanish: Ajustes > Consumo) | detail/filters, close modal, return to form | real fixture data, preserved draft |
| /app/projects/:id | editor/foundations/members/checkpoints by membership | foreign access denied; GET/PUT/clone/members 404 |
| /app/assets | private library/workshop | NOT RUN; another role; no generation/rendering |
| /app/generate | conceptual proposal | NOT RUN; generation excluded |
| / and public demo | demo/3D editing/energy | NOT RUN; outside assigned role |

Account API reviewed: `/api/me`, `sign-in`, `sign-out`, `accept-invitation`,
`invitation`, `invitations`, `invitation-links`, both revocations, `users`,
`users/:id/tier`, `credits`, `suspend`, `revoke-sessions`. `reset-password`
inventoried, not UI-executed. Billing reviewed: `/api/billing`, `checkout`,
`refresh`, `cancel`, `mock/:orderId/approve`; webhook/sandbox not operated.
`/api/credits` and `/api/usage` always authenticated-account-only.

<a id="matriz-de-recorridos"></a>

## Flow matrix

Expanded final run **42/42 PASS**. Each row is a compound test repeated in three
Chromium projects, checking UI and persistence rather than HTTP alone. WebKit
blocked throughout. PASS means described assertions including expected rejections,
not absolute absence of defects.

| ID / fixture and flow | 320 | 430 | Desktop | Persistence / evidence |
| --- | --- | --- | --- | --- |
| A01 Invalid email; personal premium; activation; denied copy; used/revoked | PASS | PASS | PASS | real tier, used disabled, revokedAt; people-invitations.png |
| A02 Short reason; grant 25; lost response; double submission; premium on/off/on | PASS | PASS | PASS | 125 -> 1125 -> 125 -> 125, one grant per requestId; people-grants.png |
| A03 Two sessions; revocation; suspend/reactivate; protected admins | PASS | PASS | PASS | sessions deleted, persisted suspension, login recovered; people-session-control.png |
| A04 Pending mock subscription; reload; lost approval response; double-click; cancel/no cancel | PASS | PASS | PASS | one order/payment; 1000 -> 1500 retained after cancellation; billing.png |
| A05 Empty usage and 26 attempts; complete/partial/absent; provider; 503/retry; pages; other account | PASS | PASS | PASS | consumed 260, refunded 260; Standard only 20; usage.png |
| A06 Other account's project/order; GET/PUT/clone/members; back/forward; real session expiration | PASS | PASS | PASS | 404, empty own list, login after expiration; isolation-navigation.png |
| A07 Standard cannot invite; premium 10/20; admin 100/1000; days >30; personal over quota; revoke/expire/exhaust | PASS | PASS | PASS | over-quota rollback, released places; invitation-limits.png |
| A08 People 503/reload; no invitations; billing disabled | PASS | PASS | PASS | recovered form/list, 0 orders, purchase disabled; disabled-billing.png |
| A09 Standard subscription and both packs; expired trial | PASS | PASS | PASS | 100 -> 600 -> 700 -> 1200 -> 1100; 3 mock payments, never canInvite; billing-packs-expired-trial.png |
| A10 Lost invitation response; revoke recovered row; expired link | PASS | PASS | PASS | revocable orphan, 4 users without invalid creation; expired-invite.png |
| A11 Unspaced 100-character name / 240-character reason | PASS | PASS | PASS | no document overflow, complete values; people-long-fields.png / wallet-long-fields.png |
| A12 Today/30 days/all; type/status; reversed dates; navigate during request; back | PASS | PASS | PASS | coherent totals, invalid-date refresh disabled, no late People data; usage-filters-navigation.png |
| A13 Shared standard link with 2 uses; 2 new accounts; exhaustion | PASS | PASS | PASS | 2 redemptions, trial 100 each, empty projects; share-link-redemption.png |
| A14 Settings > Usage; detail; wide table; Escape | PASS | PASS | PASS | draft intact; no invitation sent; settings-usage.png |

Additional backend regression: personal/shared invitations concurrently compete
for final place; only one persists. Revocation/expiration release places; stale
canInvite metadata cannot invite after demotion.
[invitation-capacity.test.ts](../../apps/api/test/invitation-capacity.test.ts).
Previous invitation suite also passes tier/permissions/concurrent redemption/
expiration/revocation/inviter suspension/demotion.

<a id="bugs-corregidos"></a>

## Corrected bugs

| Base bug | Focused correction | Regression |
| --- | --- | --- |
| B01 1–4-character/whitespace grant reason reaches backend, generic error | trimmed minimum 5 / maximum 240, matching API | A02 |
| B02 Suspend button for another admin despite server prohibition | hide prohibited administrator action | A03 |
| B03 Reload pending mock checkout removes only confirmation button, blocking subscription | reopen from persisted orders; retain immediate state if refresh fails | A04, A09 |
| B04 Personal invitations bypass premium/admin quota | count pending personal/shared places under same transaction/lock; revalidate inviter | A07, concurrent regression |
| B05 Unspaced 100-character names overflow mobile | wrap name and contain long reasons in flexible panel | A11 |

Pre-fix captures/traces: `artifacts/qa-global-admin-before-fixes`,
`artifacts/qa-global-admin-quota-baseline`,
`artifacts/qa-global-admin-long-fields-baseline`. Harness selectors and hydration
wait before reload capture were also corrected; harness failures/premature
captures do not count as product bugs. No snapshot changes or lowered gates.
First 12-case matrix 36/36; expanded run adds A13/A14 and secondary-context controls.

<a id="comandos-y-resultados"></a>

## Commands and results

```sh
pnpm check
pnpm audit:history
T3_QA_CHROMIUM_PATH=/usr/bin/chromium pnpm test:admin
node --test apps/api/test/invitation-capacity.test.ts apps/api/test/credit-invitations.test.ts
```

`pnpm check` PASS on product revision: lint/types/tests/scene:verify/build/audit:dist.
649 Node + 35 Python (684 total); Python invokes no Blender. API 352, web 210,
schema/geometry 48, scripts 39. Recorded `audit:dist`: 672 files/0 failures.
`audit:history` PASS, 785 blobs / 8 pre-QA commits, 0 failures. Invitation
regressions 7/7 PASS. Manual launcher login/touch Usage at 320x740 PASS; cleanup
removed temporary databases/credentials. No detected regressions in executed
checks. Complete pre-edit base gate NOT RUN; prior UI bugs established by
reproduction captures/traces, without attributing other gate failures. Final
audited SHA recorded with evidence package.

Environment used pnpm 12 binary in `/tmp`; hosts with repo package manager need
no copy. Original logs in `artifacts/qa-global-admin/`; `results.json` and HTML
report are final UI-run source of truth.

<a id="reproduccion-y-checklist-manual"></a>

## Reproduction and manual checklist

Node >=24, repository pnpm, installed dependencies. From root:

```sh
pnpm install --frozen-lockfile
pnpm qa:admin
# Alternative without simulated checkout:
pnpm qa:admin -- --disabled
```

Launcher prints only loopback URL and disposable-credential file path
`artifacts/qa-global-admin/demo-credentials.txt` (0600). Read locally. No real
credentials/production activation links. Includes `admin@example.test`,
`admin2@example.test`, `standard@example.test`, `premium@example.test`. New
databases each start; Ctrl-C stops API/Vite and deletes database/file. Demo has
26 fictional admin attempts and one standard; tokens/models are fixtures, not
real-call measurements.

1. Open login at 320/430 px, then desktop; log in as admin.
2. People: create personal/shared standard/premium; copy/revoke. Activate fictional
   account in private window and check isolation.
3. Standard: grant 25 with reason, toggle premium/standard, suspend/reactivate.
   Revoke sessions with Standard in another window, then reload.
4. Credits: create mock subscription, reload before approval, explicitly simulate
   payment; cancel first No, then Yes. Buy both packs. No real purchases; merely
   opening must not change balance.
5. Usage: change period/provider/status, open calls, paginate/refresh. Close
   Settings > Usage with Escape and preserve form.
6. Standard creates manual private project; admin opening copied URL must lack
   access. Standard has no Invitations even with mock subscription.

Automation: [UI suite](../../apps/web/test/global-admin.browser.ts),
[fixtures](../../apps/web/test/global-admin-fixture.ts),
[config](../../apps/web/playwright.admin.config.ts). For another machine with WebKit:

```sh
pnpm --filter @t3-designer/web exec playwright install chromium webkit
T3_QA_WEBKIT=true pnpm test:admin
```

Local traces: `pnpm --filter @t3-designer/web exec playwright show-trace
<path-to-trace.zip>`. HTML `artifacts/qa-global-admin/report/index.html`. Binary
artifacts ignored by Git and separately packaged; tests/fixes/report in local commits.

<a id="pendientes-y-retorno-para-atlas"></a>

## Pending items and Atlas handoff

**BLOCKED:** all WebKit flows due to download 403. **NOT RUN:** physical devices,
Firefox, other languages in this UI suite, PostgreSQL, real Mercado Pago
sandbox/webhooks, prolonged physical-device latency/offline, email/recovery UI,
generation/3D, project-role own CRUD/sharing, infrastructure/production, remote CI.
Usage project filter inventoried but no multi-project coverage: operations here
lack projects. Premium month rollover covered by prior backend tests, not a real
browser wait. No reproduced finding left uncorrected; limits are not absolute coverage.

A lost invitation response may leave an active row without a browser token;
revoke/recreate it. Token cannot be recovered from listings per single-display
contract. This remains an operational limit, not transparent invitation retry.

Shared role-integration files: `apps/api/src/accounts.ts`,
`apps/web/src/private/AccountHub.tsx`, `apps/web/src/private/account-copy.ts`,
`apps/web/tsconfig.json`, `package.json`, `docs/workflows/private-projects.md`.
New tests/config/launcher are role-specific.

Later Atlas handoff: local global-account validation on portable GitHub checkout
and delivered revision; five account/UI bugs fixed; admin gains no others'
private project access; billing disabled/mock only; SQLite synthetic usage;
emulated Chromium and blocked WebKit. No change to October 4 deployment evidence
or establishment of provider/payments/restore/current release. Atlas wiki/
retrospective are dated context; implementation/tests belong to T3.
