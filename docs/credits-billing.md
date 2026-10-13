<a id="créditos-suscripciones-y-mercado-pago-de-prueba"></a>

# Credits, subscriptions and test Mercado Pago payments

Accounts, projects and editing remain free. Generation operations reserve credits
before calling the provider. Payments are under development:
`T3_BILLING_MODE=disabled` is the default, and this version offers no production
payment mode. Publishing the application does not enable payments.

<a id="catálogo-inicial"></a>

## Initial catalog

Values are preliminary, configurable and expressed in Argentine pesos:

| Product | Credits | Price ARS | Expiration |
| --- | ---: | ---: | --- |
| Monthly subscription | 500 | 10,000 | One calendar month after approved payment |
| Small pack | 100 | 3,000 | No expiration |
| Large pack | 500 | 12,000 | No expiration |

Each order retains its price and credits at creation. Catalog changes do not
change existing subscriptions or pending top-ups. A paid subscription does not
make an account a premium invitee: that invitation privilege is a separate
administrator grant.

Normal accounts receive 100 credits for 15 days by default. Gifted premium access
receives 1,000 credits per UTC calendar month, without accumulating months in
which the application was unused. Credits expire at the end of their period.
Existing administrators migrate to the gifted benefit. These values are also
configurable; the balance always comes from the server.

<a id="invitaciones-y-uso-de-créditos"></a>

## Invitations and credit use

In **People and invitations** (Spanish UI: **Personas e invitaciones**), the
administrator creates normal or premium accounts, grants premium access to an
existing account and grants credits with a recorded reason. Premium users can
create links for normal accounts. Only admin and premium users have this
capability; subscribing does not change permissions. Shareable links have an
expiration, maximum uses and history, and can be revoked. The token appears only
when the link is created and travels in its `#token` fragment, not HTTP request
queries. Activation starts the 15-day trial.

| Operation | Default credits |
| --- | ---: |
| New object | 20 |
| Object revision | 10 |
| Conceptual project | 50 |
| Conceptual apartment | 50 |
| Conceptual building | 100 |
| Create a manual project, edit, share and view | 0 |

Cost and balance are shown before starting. The server reserves the amount
transactionally; simultaneous operations cannot spend the same balance. Use is
confirmed on completion. A failure, cancellation or restart preventing delivery
refunds the reservation. If object analysis used inference and ends by requesting
information, that attempt is consumed; answering starts another attempt at its
own cost. Missing photos detected before calling OpenAI release the reservation.
Automatic visual corrections are included in the attempt price. Each operation
uses an idempotency key for network retries; reuse with different content is
rejected.

Daily limits apply in addition to the balance: 5 attempts per person and 20
globally per UTC day. These are request limits, not exact dollar-spending
conversions. The OpenAI account belongs to the server; the browser never receives
its key. Projects and manual features remain available after the trial expires.
Purchased or granted credits with other expiration dates retain their own terms.

Conceptual projects generate an approximate envelope and a single interior
floor. The **New project** agents (Spanish UI: **Nuevo proyecto**) have their own
foundations and per-floor plan workflow. The person supplies dimensions,
location and timezone; openings and layouts are estimates. This is neither a
survey nor a construction-ready plan.

<a id="consumo-privado-de-generaciones"></a>

## Private generation usage

The authenticated account offers **Settings → Usage** (Spanish UI:
**Ajustes → Consumo**) without leaving the project or losing the open form. It is
also available in private navigation at `/app/usage`. **Today** (Spanish: **Hoy**)
uses the browser's local day; **Refresh** (Spanish: **Actualizar**) queries results
again after each test. The view shows only the authenticated account's operations:
sharing a project does not share billing or other users' activity. It covers model
calls invoked by T3 for homes, buildings and furniture, excluding chats and
subagents used to develop T3 and total Codex account consumption.

`GET /api/usage` returns `totals`, `operations`, `projects` and `pagination`.
It accepts `from`, `to`, `projectId`, `operationType`, `provider`, `status`, `limit`
(1–100) and `offset`. The period selects operations by reservation creation time:
`from` inclusive and `to` exclusive. Each row represents an attempt and exposes
all its calls. Totals cover all filtered operations before pagination, without
the credit history's recent-movement limit. Duration sums observed call time,
not Blender time or the entire job duration.

Credits retain one source of truth: existing reservations and ledger. Usage
reads both in one query to avoid duplicating a reservation confirmed during the
read. **Consumed** (Spanish: **Consumidos**) means confirmed reservations;
**Reserved** (**Reservados**) is the balance still held; **Actually refunded**
(**Devueltos efectivamente**) is the recorded refund. An expired or revoked grant
can prevent refunding some or all of the reserved amount. A T3 credit refund does
not erase observed tokens. Reusing furniture across projects does not count its
generation again.

<a id="registro-y-procedencia"></a>

### Recording and provenance

`usage.sqlite` in the configured library contains two tables:

| Table | Contents |
| --- | --- |
| `model_usage_operation` | Credit operation, user, project where applicable, job/run, attempt, parent version, published asset and attempt status |
| `model_usage_call` | Call and operation IDs, stage, iteration, provider, authentication mode, requested/effective models, start/end/duration, status and metrics |

Workers persist each call's start before invoking the provider. If that write
fails, inference does not start. The local SDK records `turn.completed.usage`
with `codex.turn.completed` provenance; Responses records `usage` with
`openai.responses` provenance, including incomplete or failed terminal responses.
Capture precedes proposal parsing and validation: an invalid response can have
measured usage. Attempt status is independent of each call; a later correction
can complete an attempt containing an invalid response. `needs_input` means the
attempt needs an answer, even if the provider call completed successfully and its
credits should be confirmed. Reconciliation can refine an old `succeeded` label
using that same attempt's persisted state, without changing calls or credits.

| Persisted metric | Codex `usage` | Responses `usage` |
| --- | --- | --- |
| `inputTokens` | `input_tokens` | `input_tokens` |
| `outputTokens` | `output_tokens` | `output_tokens` |
| `cachedInputTokens` | `cached_input_tokens` | `input_tokens_details.cached_tokens` |
| `cacheWriteInputTokens` | `cache_write_input_tokens` | `input_tokens_details.cache_write_tokens`, if reported |
| `reasoningOutputTokens` | `reasoning_output_tokens` | `output_tokens_details.reasoning_tokens` |

The installed SDK includes all five Codex fields; this does not prove the runtime
returns them all in a real generation. Each execution's evidence establishes the
observed subset. The effective model stays absent when the provider does not
report it; the requested model is not copied into that field.

Absent values are `null`, never estimated zero. Measurement is **complete** when
input and output are known, **partial** when only some metrics exist, and
**unmeasured** when none were received. Optional breakdowns can be absent even
with complete input/output. Cache and reasoning are not added to input/output
again. Failure, cancellation or timeout without terminal usage does not prove
zero consumption; a restart does not justify inventing an end time.

A repeated event fills only absent fields without adding tokens again. Every
retry retains a different credit operation and its historical link in
`job_credit_history`; a revision retains its parent version. Historical data
never recorded remains unknown. Back up `usage.sqlite` with account, job and
version databases and library files; restoring only one part can lose
relationships. The usage record stores no prompts, images, keys or reasoning.

For `codex-local`, the UI shows **Usage through a Codex subscription** (Spanish:
**Uso mediante suscripción de Codex**). It does not calculate dollars from API
rates, remaining quota percentages or provider invoices.

<a id="verificación-de-medición"></a>

### Measurement verification

```sh
node --test apps/api/test/usage.test.ts apps/api/test/generation-credits.test.ts
```

These tests use real SQLite, a simulated Codex executable and controlled
Responses transports. They verify capture before validation, missing data,
duplicate events, interruptions/restarts, retries and versions, actual refunds,
account isolation and paginated totals. They do not perform paid API generations
or establish a project's real E2E journey. Real executions, observed fields and
project reopening need independent integration evidence.

<a id="qué-se-considera-un-pago"></a>

## What counts as a payment

Opening checkout, returning to the application or authorizing a subscription
does not grant credits. The API queries Mercado Pago again and requires an
`approved` payment without refund, `live_mode=false`, an Argentine test seller,
exact amount/currency and a matching local order. Subscriptions verify the invoice
and its `preapproval_id`; top-ups also verify the merchant order and preference.

The canonical payment identifier is unique. Payment recording and credit grants
share one database transaction. Repeated webhooks, simultaneous queries and
retries do not grant the same balance twice. Pending or rejected payments retain
their state without credits. A refund, even partial, or chargeback removes the
entire grant: already consumed credits become debt and reduce future available
balance.

Cancellation stops subscription renewals; granted credits retain their original
expiration. Cancelled orders remain in refund reconciliation. Suspending an
account does not prevent recording a reversal.

<a id="configuración"></a>

## Configuration

Catalog variables (defaults):

```dotenv
T3_TRIAL_DAYS=15
T3_TRIAL_CREDITS=100
T3_PREMIUM_MONTHLY_CREDITS=1000
T3_MONTHLY_AMOUNT_ARS=10000
T3_MONTHLY_CREDITS=500
T3_SMALL_PACK_AMOUNT_ARS=3000
T3_SMALL_PACK_CREDITS=100
T3_LARGE_PACK_AMOUNT_ARS=12000
T3_LARGE_PACK_CREDITS=500
T3_BILLING_MODE=disabled
```

For local development without Mercado Pago, set `T3_BILLING_MODE=mock` and a
loopback `T3_PUBLIC_URL`. Mock mode is prohibited with `NODE_ENV=production` or a
public origin. Creating an order does not grant a balance: click the explicit
simulation confirmation. Only its owner can approve it; repeating approval does
not grant the order again. This mode makes no Mercado Pago calls and keeps its
orders separate from sandbox orders.

For provider testing, configure `T3_BILLING_MODE=sandbox`, an HTTPS origin,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (at least 32 characters) and
`MP_SANDBOX_PAYER_EMAIL`. Use only Argentine test sellers and buyers. Never put
keys in `VITE_*`, commits, images, logs or links. Before creating or cancelling an
operation, the server queries `/users/me` and requires `test_user` and site `MLA`.
A token prefix alone does not establish a test account.

Configure the HTTPS webhook at `/api/billing/webhook` for `payment`,
`subscription_preapproval` and `subscription_authorized_payment`. The handler
requires `x-signature`, `x-request-id` and a query `data.id` matching the body ID.
It verifies HMAC-SHA256 in constant time with a five-minute tolerance. Unsigned
notifications are rejected; **Refresh status** (Spanish: **Actualizar estado**)
reconciles operations even without a webhook. Keep the server clock synchronized.

Returned links are restricted to HTTPS on `www.mercadopago.com.ar`. Checkout Pro
uses `init_point` with the test account. A return URL never grants a balance.

<a id="operación-y-recuperación"></a>

## Operation and recovery

The API persists the local reference before sending the POST. If the provider
accepted it and the connection broke, the next attempt searches that same
reference and recovers checkout instead of blindly sending a second POST. If the
outcome is unknown, it shows `CHECKOUT_UNCONFIRMED`: query again or verify the
operation in the test dashboard. Do not delete the row or force another creation
to hide that state.

Authenticated routes, restricted to the session user:

| Method and route | Action |
| --- | --- |
| `GET /api/billing` | Catalog, subscription, latest orders and payments |
| `POST /api/billing/checkout` | `{ "product": "monthly" }`, `pack100` or `pack500` |
| `POST /api/billing/refresh` | Canonical query and operation reconciliation |
| `POST /api/billing/cancel` | Cancel subscription renewal |
| `POST /api/billing/mock/:orderId/approve` | Explicit local confirmation; mock only |

Reconciliation also queries previously stored payments that disappeared from the
provider's search history. Remote searches are bounded at 1,000 results and fail
explicitly if incomplete; a truncated search is not presented as full
reconciliation. The status view shows the latest 50 orders and 100 payments;
persisted history is not deleted.

To disable new operations, restore `T3_BILLING_MODE=disabled`. This does not cancel
existing mandates: cancel each test subscription first if its renewals should
also stop. Do not delete payment/credit tables during a code rollback.

<a id="verificación-y-límites"></a>

## Verification and limits

```sh
node --test apps/api/test/billing.test.ts
pnpm --filter @t3-designer/api typecheck
```

The suite uses a simulated provider transport and real SQLite; with
`TEST_DATABASE_URL`, it also exercises local PostgreSQL in an isolated schema.
The URL must point to `localhost`/`127.0.0.1` and a disposable database ending in
`_test`. It checks concurrency, renewals, reversal, ownership, sandbox, signatures,
retries and mock separation. These tests do not equal a completed real Mercado
Pago checkout. Sandbox activation needs separate verification of credentials,
public notifications, connectivity and test checkout.

Official references consulted for this implementation:

- [Create a subscription](https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/create-preapproval/post) and [search invoices](https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/authorized-payment-search/get).
- [Create a preference](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post), [search preferences](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-preferences/get) and [get a merchant order](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get).
- [Notification validation](https://www.mercadopago.com.ar/developers/en/docs/checkout-api-orders/optional-notifications).
