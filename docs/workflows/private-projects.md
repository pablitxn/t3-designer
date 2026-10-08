# Private accounts and projects

T3 has a public demo at `/` and an authenticated application at `/app`.
The demo remains a published, bundled example. New accounts receive no private
projects or library data automatically. Creating a project starts an empty private
foundation document with two parts: the dwelling and its building/context. It
does not read or copy the published demo. Existing scene projects remain usable;
the separate conceptual AI generator still creates an estimated single-floor scene.

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

New projects open in foundation setup. The dwelling has independent levels, each
with a floor number, optional elevation and dimensions, notes and up to four
PNG/JPEG/WebP plan images (5 MB each). Levels are simultaneous parts of a dwelling;
architecture variants remain alternative designs of a reviewed base. Unknown
measurements remain empty rather than inheriting values from the demo.

The building has a country, region, address, notes and individually attributed
source links. Official portal suggestions depend on the selected country. These
are navigation aids until a generation attempt explicitly researches the address.
Users can record sources for any country; jurisdiction and public availability
vary. See [property sources](../architecture/property-sources.md).

Setup, renaming, notes and sources use the existing explicit revision save.
A draft has no scene. The viewer, variants, furniture placement and energy tools
stay closed until reviewed dwelling and building models exist. Attaching plans
or adding an address does not mark either model complete. Each foundation now has
its own agent workshop with persisted conversation, activity, iterations, review
findings and immutable candidate versions. Starting a reconstruction sends its
saved input and correction message to the selected model provider. Dwelling attempts attach
the selected plan images. Metropolitan France building attempts first acquire
numbered addresses, building footprints/heights, roads and the address parcel
from IGN; other jurisdictions use public web search. Acquired coordinates and
source citations remain server-owned while the model explains and reviews them.
The model returns bounded scene data, never executable code.

Each attempt runs at most three generation/validation/review rounds. Deterministic
checks validate polygon shape, room overlap, openings, floor coverage and supplied
dimensions. A model then compares the structured candidate against source plans
or cited public records. This is a source/geometry review, not an automated audit
of rendered 3D images. The preview displays the resulting geometry for the user.
Missing metric scale, unreadable plans or inaccessible required property evidence
produce questions and keep the version unready. Unsupported details stay in the
assumptions and unknowns, and reconstructed geometry stays estimated.

The user can request another version in chat and explicitly accept a reviewed
candidate. Both accepted foundations are required to materialize the project's
floor scenes. During setup, changing plans or building inputs invalidates only
that foundation and preserves the other accepted model. Floor selection preserves
each floor's furniture and design variants, including negative floor numbers for
basements. The geographic position
is initially centered in the building and its orientation is estimated. Physical
stair connections contain source-attributed flights, intermediate landings and
floor/ceiling openings in the shared dwelling frame. The walkthrough renders all
accepted floors together and supports continuous ascent and descent, with wall,
door, furniture, headroom and guard collisions. Local floor regions represent
annex steps or split levels without turning them into separate storeys. Their
elevations and wall bases remain local to the owning floor. A building rebase
moves the assembly without changing those interior dimensions or variants.
Legacy connections containing notes alone remain descriptive; the agent needs
supported geometry before they become traversable. Inferred widths, steps and
landings remain estimates, not regulatory or structural approval.
Copied projects retain their accepted bases; a correction can use those bases
without access to the original project's generation history.
Chat can correct known measurements: the backend checks a literal user quote and
its numeric value, preserves that evidence, and uses accepted corrections as the
baseline for later versions while still rejecting unexplained dimension changes.

Building chat supports changes to the body/eaves height without the roof, the
roof's own height, or the total height including the roof. A total-height change
sets the body height to the requested total minus the current roof height; an
ambiguous request for “height” asks which measurement is intended. The same
bounded operations support translation in explicit cardinal directions and
resizing the footprint's east–west width or north–south depth around its current
bounding-box center. Courtyard holes follow that transformation. Measurements
must be stated in meters in a literal, affirmative quote from the current user
message; explicit metric conversions from other units are accepted. Editing a
neighbor requires its exact building identifier in that quote.

Only the specified buildings change. Their geometry becomes `estimated`, while
the original building records and the complete validated operation history stay
in the version's provenance. Unrelated buildings, roads, parcel, source citations
and source dates retain the reviewed snapshot; a correction does not silently
refresh geographic datasets. The full correction history remains visible in
the assumptions even when new model prose omits an earlier change. Building
changes do not automatically resize interior rooms or apartment variants.
Rotation/north, individual footprint vertices, roads, parcel and address changes
still require clarification or a new supported source workflow.

A failed or unready correction can continue from the most recent reviewed
ancestor with matching project inputs, even if that ancestor was not accepted
yet. The worker searches at most 12 ancestors and rejects cycles, foreign project
records and stale input fingerprints. The direct parent remains available for
its outstanding questions, but its unapproved geometry does not replace the
reviewed baseline. Attempts allow up to 30 minutes for their three review rounds.
On failure or timeout, an already persisted candidate is retained as an unready
chat version and the failed attempt is refunded; it cannot be accepted without
a new successful review. Account access is checked again before retaining it.

Replacing an accepted base creates a restorable project checkpoint. A building
correction preserves the edited interiors and building-energy assumptions while
updating context. Replacing the dwelling rebuilds its interior base, so the UI
asks the user to confirm resetting furniture and variants. Checkpoints preserve
the previous project state for recovery. The foundation document cannot be turned
into a ready scene through generic PUT.
Legacy scene projects and the independent conceptual generator retain their
existing editor behavior.

Plan uploads reuse the furniture workshop's validated image storage, capacity
checks and upload quotas. Project members read plans through project-scoped
URLs; only owners/editors upload. The project keeps access if the uploader is
removed, and revoked members lose project access. Uploading stores the image;
Save records its assignment to a floor. Removing an assignment does not delete
its stored image. Clones get independent foundation fields and authorized links
to the same immutable images. There is no automatic deletion of original plans.

Furniture generation remains in the existing asset workshop. Foundation
reconstruction currently creates rooms, walls and openings; built-in cabinetry,
appliances and other furnishings are not generated automatically. Their missing
detail can be recorded in the proposal's unknowns. Furniture layouts and movable
furnishings extend the accepted floor base, with existing immutable asset
revisions. No furniture is silently generated during intake.

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

Foundation reconstruction uses the selected inference provider. Local operator
testing can use `T3_INFERENCE_PROVIDER=codex-local` with an existing ChatGPT CLI
login and a loopback-bound backend; production rejects this adapter. The same
bounded candidate/validation/review loop runs with either provider, without an
automatic fallback to a different billing method. Each dwelling
attempt costs 50 credits and each building attempt 100, including chat
corrections; the price covers up to three internal improvement rounds. A missing
plan detected before inference returns the reservation. Durable runs and versions
survive normal navigation; a server restart marks interrupted work failed and
returns its reservation rather than silently replaying paid inference. Plan
read access, version read access, acceptance and cancellation remain scoped to
project membership. A stale project revision or changed saved inputs require a
refresh/new generation before acceptance.

`/app/generate` creates conceptual projects, apartments and building envelopes.
The user supplies dimensions, coordinates and an IANA time zone. Only one ground
floor has an interior; upper floors are an approximate exterior envelope.
Generated scenes contain no copied cadastral evidence or public-demo furnishings.
All geometry and openings are marked estimated. These drafts need human review.

Self-hosted does not mean all generation data stays on the server: the existing
asset workflow sends selected product references and renders to OpenAI. The
foundation workflow sends the saved dwelling/building preparation, selected plan
images, correction message and previous candidate when applicable; building
research can include the submitted address in public search queries. Unrelated
project documents and the separate project-notes field are not included.
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
