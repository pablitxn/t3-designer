# Optional analytics and privacy

The static demo works without analytics or a backend. No collector, website ID,
operator identity, hosting provider or retention policy is configured by default.
The privacy page is available even when the instance profile cannot be loaded.

Configure your own public operator profile and, optionally, Umami through
[site configuration](site-configuration.md). The profile is loaded from the same
origin before the application starts. Deployment-specific evidence belongs in
private operations documentation; its supported public facts belong in the notice.

## Consent boundary

The tracker requires production mode, valid configuration, the exact configured
hostname, a usable consent store and explicit acceptance. Do Not Track and Global
Privacy Control keep it disabled. Rejecting analytics leaves all application
features available. Withdrawal stops future sends; changing `privacyRevision`
invalidates consent for the previous profile. Private account/project routes,
object workshop content and the privacy page are excluded from measurement.

Only allowlisted application events are sent. Do not add free-form notes, user
emails, account/project identifiers, uploaded references or signed URLs to event
payloads. Query strings and fragments are not part of analytics page URLs. The
vendored tracker fixture exists only for regression tests and retains its license.

## Operator responsibilities

A frontend consent switch does not turn off hosting or reverse-proxy logs. Your
public notice must describe those separately, based on the services you actually
operate. Browser consent duration is not server event retention. Do not promise
that every log or backup copy expires with the analytics database.

The generic Docker image contains no analytics upstream. If adding a same-origin
proxy, use exact script/collector routes, limit methods and body sizes, verify
upstream TLS, and keep dashboard/admin paths inaccessible. Preserve only the
headers required by your reviewed contract. Trust forwarded client-IP headers only
from explicitly verified proxy peers; no provider or cluster CIDR is assumed.

## Verification

Run `pnpm test:analytics` for consent, configured/unconfigured builds, hostname,
signal, withdrawal and private-route regression coverage. Test the deployed origin
separately: the local test cannot establish your live retention jobs, proxy trust,
providers or backup practices. Default demo validation uses `pnpm test:demo` and
must not contact the API or a collector.
