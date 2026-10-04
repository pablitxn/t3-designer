# Deployment contract

T3 Designer has two build modes. `pnpm build:demo` produces a complete static
application without accounts or backend calls. `pnpm build:full` additionally
includes account routes and private project UI; it requires an independently
configured API. Both outputs are written to `apps/web/dist/`.

## Static demo

```sh
pnpm install --frozen-lockfile
pnpm build:demo
```

Publish `apps/web/dist/` on a static host. Serve missing model/image files as 404,
and route client-side page paths such as `/privacy` to `index.html`. No API key,
Blender process, database, S3 service, private repository or cluster access is
required. Included geometry and examples are generalized demonstration data;
consult the model documentation for provenance and approximation limits.

The Dockerfile also builds from a clean source checkout:

```sh
docker build --platform linux/amd64 -t t3-demo .
docker run --rm -p 127.0.0.1:8080:8080 t3-demo
```

The default image runs as UID 1000, serves `/healthz`, and returns 404 for API and
analytics endpoints. Its startup writes only to `/tmp`; it supports a read-only
root filesystem with a writable `/tmp`. No operator network or analytics upstream
is embedded. Optional OCI source/revision labels are supplied with build arguments.

## Optional backend

Start with [the local backend guide](local-backend.md) for a tested Compose path.
For remote operation, build the web image with `--build-arg WEB_MODE=full` and build
`Dockerfile.api` separately. They use an explicit upstream contract: set
`T3_API_UPSTREAM=api:8787` on the web image when API is another container, or use
`127.0.0.1:8787` when both share a network namespace. Keep Host and Origin intact.

The API production contract is:

- `NODE_ENV=production`, `T3_PUBLIC_URL=https://your-site.example`, a dedicated
  PostgreSQL database/role in `T3_DATABASE_URL`, and an independently generated
  `T3_AUTH_SECRET` with at least 32 characters.
- Bind the API to an address appropriate for your container network using
  `T3_API_HOST`. Expose it through the same browser origin under `/api`.
- Mount persistent private storage at `T3_ACCOUNT_DATA_DIR` and
  `T3_ASSET_DATA_DIR` (`/data/accounts` and `/data/assets` in the API image).
- Keep one API/worker instance while workshop jobs and locking use SQLite.
  PostgreSQL accounts/projects do not make the workshop horizontally scalable.
- Leave generation disabled until setting your own server-side API key, limits
  and storage budget. Billing is disabled unless separately configured/tested.
- Keep credentials in a secret manager. Do not mount local provider login state
  into a shared server, or copy env/auth files into the images.

The generic web image trusts no forwarded client-IP header by default. An operator
may supply Nginx configuration in `/etc/nginx/t3-http.d/` and
`/etc/nginx/t3-server.d/`. Trust only verified proxy peers and restrict direct origin
access. Configure exact proxy IPs in `T3_TRUSTED_PROXY_IPS` on the API; a copied
network range or provider header is not an authentication boundary.

The reference API image currently supports `linux/amd64`. Architecture-specific
Blender downloads are pinned and checksum verified. Other platforms require a
separately tested image or compatible emulation.

## Public profile and analytics

Supply [site-config.json](site-configuration.md) from your instance configuration.
The file is browser-visible and contains only public notice/configuration data.
A missing profile keeps the neutral notice and analytics disabled. The image does
not include a collector proxy; configure optional analytics routes deliberately.

Infrastructure manifests, actual domains, proxy trust, retention evidence and
release records belong to the operator's private repository. The public CI works
with ordinary runners and does not publish images or deploy automatically. A
private promotion workflow can consume a verified source commit and image digests.
It must not make public validation depend on access to private includes.

## Validation and release

```sh
pnpm check
pnpm build:full
pnpm test:e2e:fast
pnpm test:analytics
pnpm test:accounts
pnpm test:demo
```

Install the pinned Playwright Chromium with
`pnpm --filter @t3-designer/web exec playwright install --with-deps chromium`.
Rendered WebGL coverage is available separately through `pnpm test:e2e:webgl`;
record the environment and browser used when retaining visual evidence.

Test the default demo with backend and operator networks unavailable. Test the
full mode with disposable accounts and your reverse proxy: activation/login,
project save/reload, cross-user isolation, invitation revocation, logout and API
responses marked `private, no-store`. Keep anonymous `/api/live` and the web
`/healthz` probes separate from authenticated functionality.

A release record should identify the exact source/image digests, test outcome,
configuration revision and recovery procedure. Preserve private project revisions
and asset IDs through storage/schema changes. A recovery copy of the relevant DB
and workshop must be verified before a migration; do not restore a DB in isolation
from its referenced artifacts or roll back authorization changes blindly.
