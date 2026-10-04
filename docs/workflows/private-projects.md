# Private accounts and projects

T3 has a public demo at `/` and an authenticated application at `/app`.
The demo remains a published, bundled example. New accounts receive no private
projects or library data automatically. Creating a manual project copies the
published scene into a private, independently saved document. Generating with AI
creates a new estimated scene from the person's dimensions and location.

Better Auth 1.7.7 is the MIT-licensed, self-hosted library. There is no paid auth
service, Google integration or external identity account required.
New screens use Tailwind; the existing public demo keeps its visual styling.

## Run locally

Use the repository's Node/pnpm versions, then:

```sh
pnpm install
pnpm account bootstrap me@example.com
pnpm dev:full
```

The bootstrap command writes a single-use link to
`artifacts/accounts/bootstrap-link.txt` with owner-only permissions. Open that
link in your browser, enter the invited email and choose your own password
(12–128 characters). Neither the command nor the assistant chooses a password.
No email is sent. Invitations expire after 24 hours. First-admin creation closes
after the first account exists; an expired bootstrap can be replaced while the
database still has no users.

Use exactly `http://127.0.0.1:5173` unless `T3_PUBLIC_URL` is changed. Cookies and
origin checks intentionally distinguish `localhost` from `127.0.0.1`. The root
`.env`, if present, is loaded by API commands; use `.env.example` as the reference.

Local accounts/projects use a separate SQLite file under `artifacts/accounts`.
A randomly generated local session secret is stored there with owner-only
permissions. It is never bundled into the frontend. Set `T3_DATABASE_URL` to use
PostgreSQL instead. Database migrations create the auth/project tables at startup.

## Accounts and recovery

The People screen lets the administrator suspend/reactivate members, revoke
sessions, grant premium access and add credits. The Invitations screen lets
administrators and gifted premium members create personal or limited-use links,
review their usage and revoke them. Only administrators can invite or promote
another premium member. Paying a subscription does not grant invitation rights.
Premium members can invite at most 10 people per link and keep 20 unredeemed
places outstanding; administrators can keep 1,000. Link expiry is configurable
from 1 to 30 days. Standard members cannot create invitations.

Deliver invitation
links privately: possession of an unused link plus its bound email permits
activation. Email ownership has not been independently verified by SMTP in this
beta. There is no open registration endpoint.

If someone loses their password, the operator can prepare a short-lived recovery
link from the server:

```sh
pnpm account recovery me@example.com
```

Deliver the link from `artifacts/accounts/recovery-link.txt` privately after
checking the person's identity. Resetting a password consumes the token and
revokes the account's existing sessions. Automated verification/recovery email
is a later integration; the UI must not claim an email was sent.

Sessions use HttpOnly, host-only cookies; production also requires Secure.
Every private request rechecks the session/current account, with cookie caching
disabled. Mutations require the configured origin and JSON. Forwarded identity
headers never create a user or grant permissions. Anonymous requests receive 401;
another user's resource IDs receive 404. Revocation cannot erase an already
downloaded file or information a reader has seen.

Login throttling uses the TCP peer IP by default and ignores forwarding headers.
Behind the production reverse proxy, set `T3_TRUSTED_PROXY_IPS` to the comma-separated
exact IPs of the proxy hops you operate, including the API's immediate peer.
IPv4 and IPv6 are supported; IPv4-mapped IPv6 normalizes to the same IPv4 address.
The API accepts `X-Forwarded-For` only from an allowlisted socket, validates the
whole chain (at most ten IPs), then walks it from right to left until the first
untrusted IP. A forged leftmost prefix cannot override the actual client.
Malformed chains from trusted proxies are rejected with 403. `CF-Connecting-IP`
and other forwarding headers are never read directly by the API for this decision.
The production Nginx proxy derives and replaces X-Forwarded-For from the verified
verified upstream client-IP header under your own deployment contract.

Configure each trusted proxy to append its verified peer address or replace
untrusted forwarding input, and prevent direct public access to the API. Do not
allowlist clients, whole networks, hostnames or `*`. An empty list behind a shared
proxy would make all visitors share that proxy's login limit; confirm the observed
socket/forwarding chain and test two distinct clients before exposing the beta.

## Projects, copies and sharing

Each project has an owner and optional editor/viewer memberships. Owners manage
members; editors save content; viewers only read. Global administrator status
does not grant access to everybody's private projects. Sharing requires an
existing account, so account invitation and project membership stay separate.

Saves include the last observed revision. A stale save returns 409; reload before
trying again instead of silently overwriting someone else's work. Scene documents
are validated on the server, including model references. Project names and notes
are stored privately and rendered as text. Personal documents, energy data and
photo galleries are not automatically sent to a model or published in the demo.

The initial project is a copy of the current T3. Its source measurements and
geographical context remain estimates; renaming a copy does not reconstruct a
different property. Importing a floorplan/address with an agent is not part of
this release. Changes to the bundled demo do not update existing copies.

Generated models belong to their creator. Adding one to a project grants that
project access to the immutable GLB revision, not the creator's prompts,
reference photos, Blender source, manifest or job history. The shared revision
remains usable by the project independently of membership changes to the creator.
Project copies receive their own attachment IDs. Models are stored once locally;
the attachment is a durable reference, not a second physical file copy. Future
deletion/garbage collection must preserve objects still referenced by projects.

## Existing local library

Old jobs/assets have no owner and stay inaccessible through the API after this
upgrade. They are preserved on disk. Once the first administrator has activated
their account, explicitly assign the old library:

```sh
pnpm account claim-library me@example.com
```

This changes only ownership of previously unowned records. It does not move files,
overwrite existing owners, publish models, or execute queued inference jobs.

## Generation and confidentiality

Generation is disabled by default. Enable it explicitly with
`T3_GENERATION_ENABLED=true`, `T3_INFERENCE_PROVIDER=openai` and a server-side
`OPENAI_API_KEY`. Every active account with sufficient credits may generate.
Every initial attempt, revision, retry and continued answer reserves credits and
a daily allowance before work begins. Defaults are
five attempts per user/day UTC, twenty globally, two pending per user and twenty
pending globally. These are request limits, not an exact monetary spending cap.
Also configure provider-level spending limits for the server's API project.

The hosted adapter uses the OpenAI Responses API with a bounded JSON schema;
model output is data, never executable code. The optional Codex adapter uses the
operator's ChatGPT CLI session and remains local-only. No model call is needed
for login, manual project creation, editing, sharing or viewing existing models.
See [credits and billing](../credits-billing.md) for reservation, return and
expiration rules. Failed or cancelled generation returns its reservation; a
completed analysis requesting further information consumes its attempt.

`/app/generate` creates conceptual projects, apartments and building envelopes.
The user supplies dimensions, coordinates and an IANA time zone. Only one ground
floor has an interior; upper floors are an approximate exterior envelope.
Generated scenes contain no copied cadastral evidence or public-demo furnishings.
All geometry and openings are marked estimated. These drafts need human review.

Self-hosted does not mean all generation data stays on the server: the existing
asset workflow sends selected product references and renders to OpenAI. Private
project notes and other project documents are not included in that workflow.
Public-page analytics is consent-controlled; private routes never send Umami
events, even when public analytics consent was previously granted.

## Production boundary

The backend is optional. Follow [local setup](../local-backend.md) for Docker or
native development, and the generic [deployment contract](../deployment.md) for
remote operation. Supply your own database, private workshop volume, secrets,
public HTTPS origin and trusted proxy configuration. There is no dependency on a
particular cluster, ingress provider or operator repository.

PostgreSQL holds accounts and projects. Workshop jobs and locks still use SQLite,
so run one API/worker with persistent storage. An S3-compatible backend is a
separate integration; the reference stack does not claim to upload assets to S3.
Keep private files outside static roots and preserve account/project authorization
when serving downloads. The demo's bundled catalog remains independently usable.
