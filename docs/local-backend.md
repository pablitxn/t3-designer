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
OPENAI_API_KEY=your-own-server-key
```

Never put API keys in `VITE_*`, the static configuration or the browser. Generation
uses credits and provider quotas; local accounts can be managed with the account
CLI. The API image includes Blender. Product references and selected render views
may be sent to the configured provider as documented in the workshop guide.
Mercado Pago remains disabled in this reference stack.

## Native development without Docker

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm account bootstrap owner@example.com
pnpm dev:full
```

Open the link in `artifacts/accounts/bootstrap-link.txt`, then use
`http://127.0.0.1:5173`. This mode uses local SQLite unless `T3_DATABASE_URL` is set.
Install Blender only if you want to generate assets, and set `BLENDER_BIN` if it is
not found on PATH or in the standard macOS application location. Demo browsing
never launches Blender.

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
