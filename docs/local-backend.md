# Optional local backend

The complete public demo works with `pnpm demo` and does not require this guide.
Use the backend when you want accounts, private projects, invitations or Blender
generation. Your installation uses your own database, storage and API credentials.

## Docker Compose

Prerequisites: Docker with Compose v2, Node.js 24+ and pnpm 12.7.0. The pinned
Blender image is `linux/amd64`; ARM hosts need Docker's x64 emulation. CPU rendering
can be slower under emulation. Provide several GiB of disk and RAM for image builds.

From the repository root:

```sh
pnpm local:setup
pnpm local:up
pnpm local:account bootstrap owner@example.com
docker compose --env-file deploy/local/.env exec api cat /data/accounts/bootstrap-link.txt
```

The setup command creates independent random secrets in `deploy/local/.env`, mode
0600. Running it again preserves the file. The example email above is a placeholder;
use the administrator email you want to activate. Open the generated single-use
link locally, set a password, and sign in. No invitation email is sent automatically.
Treat activation and recovery links as credentials; do not post them in issues.

Open `http://127.0.0.1:8080` using that exact origin. The web container is the only
published port and is bound to host loopback. PostgreSQL and the API are available
only on the Compose network. `T3_LOCAL_CONTAINER=true` permits the API bridge bind
only in development with a loopback browser origin. It is not a production mode.

If port 8080 is occupied, change `T3_WEB_PORT` in `deploy/local/.env` before starting.
Restart the stack after changing configuration. Existing activation links contain
the old origin and should be regenerated instead of edited.

```sh
docker compose --env-file deploy/local/.env ps
pnpm local:logs
pnpm local:down
```

`local:down` stops the containers and preserves the named database/workshop volumes.
Do not add `--volumes` unless you intentionally want to delete that local dataset.
Do not reuse this reference Compose unchanged for an internet-facing deployment.

## Generation

Generation and payments start disabled. Set these values in the ignored local file
and restart with `pnpm local:up` when you want paid provider inference:

```dotenv
T3_GENERATION_ENABLED=true
T3_INFERENCE_PROVIDER=openai
T3_OPENAI_MODEL=gpt-6-astra
OPENAI_API_KEY=your-own-server-key
```

Never put API keys in `VITE_*`, the static configuration or the browser. Generation
uses credits and provider quotas; local accounts can be managed with the account
CLI. The API image includes Blender. Product references and selected render views
may be sent to the configured provider as documented in the workshop guide.
Mercado Pago remains disabled in this reference stack.

All hosted planning, generation, corrections and visual review use `gpt-6-astra`
by default and always request `reasoning.effort=max`. Operators can override the
model with `T3_OPENAI_MODEL`; individual calls cannot lower reasoning effort.
Each API call allows up to 128,000 output tokens by default, including reasoning,
and has a thirty-minute timeout. These are ceilings, not a target consumption.
The optional `codex-local` provider must be selected explicitly for local use;
a missing API key never switches providers automatically.

## Native development without Docker

Preserve an existing root `.env`: it may already contain your API key and local
database configuration. Only create it from the example when it is absent:

```sh
pnpm install --frozen-lockfile
if [ ! -f .env ]; then cp .env.example .env; fi
```

Edit the existing `.env` to enable generation and select OpenAI/Astra using the
values above. For a new local installation, create the initial account once:

```sh
pnpm account bootstrap owner@example.com
```

Keep the API running in one terminal:

```sh
pnpm start:api
```

Start the full application in a second terminal:

```sh
pnpm --filter @t3-designer/web dev:full --host 127.0.0.1 --port 5173
```

Open the activation link in `artifacts/accounts/bootstrap-link.txt` if this is a
new account, then sign in at `http://127.0.0.1:5173`. This mode uses local SQLite
unless `T3_DATABASE_URL` is set.
Install Blender only if you want to generate assets, and set `BLENDER_BIN` if it is
not found on PATH or in the standard macOS application location. Demo browsing
never launches Blender.

Use these separate commands for manual generation sessions. `pnpm dev:full` and
`pnpm dev:api` use backend watch mode; source edits can restart the API and
interrupt an active job. Restart `start:api` yourself after changing `.env`, once
active jobs have finished.

Foundation attempts have a thirty-minute overall timeout by default, including
generation, rendering and review rounds. For local loopback development only,
`T3_FOUNDATION_TIMEOUT_MS=7200000` allows up to two hours overall so multiple
reviews can finish; individual hosted calls still have thirty-minute timeouts.
This override is rejected in production or with a non-loopback browser origin.

For a manual object check, sign in at `/app/assets`, create an object with the
required references, and inspect both the generated preview and
the recorded activity. `/app/usage` shows T3 attempts, provider models and tokens.
`/app/credits` shows application credits, which are separate from OpenAI billing.

## API funding and costs

An API key authenticates requests; the OpenAI organization holds the API balance.
In [OpenAI Billing](https://platform.openai.com/settings/organization/billing/overview),
select the organization used by your key, review its existing balance, and follow
the portal to add a payment method or credits. ChatGPT/Codex subscription usage
is [separate from API-key billing](https://learn.chatgpt.com/docs/pricing).

Check dollar costs in [OpenAI Usage](https://platform.openai.com/settings/organization/usage)
and current model and tool rates in [API pricing](https://developers.openai.com/api/docs/pricing).
Reasoning tokens count as output tokens. In organization or project settings,
spend alerts notify you while a hard spend limit stops affected API traffic;
see [spend limits](https://developers.openai.com/api/docs/guides/spend-limits).
The configured spend limit is a control, not your available credit balance.

## Data and storage boundary

Compose persists accounts/projects in PostgreSQL and the workshop library in a
private volume. Workshop jobs and locks still use SQLite and require one API/worker
instance. Keep that volume together with the account/project database when
recovering an installation. Do not place either in the web root or Git.

An S3-compatible storage backend is a separate migration and is not implemented by
adding a MinIO container to this stack. The browser demo always loads its bundled
public models. Promoting a generated model into the public catalog requires an
explicit export, metadata sanitization, rights/provenance review and new hashes.

For remote hosting, use [the deployment contract](deployment.md); for the notice
and optional analytics, use [site configuration](site-configuration.md).
