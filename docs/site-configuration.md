# Public site configuration

The demo is a static application. It does not need accounts, an API or an operator
profile to start. The optional full build enables account routes; it is selected
at build time with `pnpm build:full` or Docker's `WEB_MODE=full`.

At startup the browser reads `site-config.json` from the same static base URL,
before initializing the application and analytics. The file is public. Missing,
invalid or incomplete configuration falls back to the generic privacy notice and
disabled analytics. It must never contain credentials, internal service endpoints,
database URLs, private document references or account records.

## Configure an independent installation

Keep the source of your operator profile outside the public checkout. Supply a
reviewed file next to `index.html` in the deployed static output, or mount it at
`/usr/share/nginx/html/site-config.json` in the web container. For local review,
copy it to `apps/web/public/site-config.json` (ignored by Git); remove it after the
review if you want to return to the unconfigured demo.

```json
{
  "version": 1,
  "privacyRevision": "example-1",
  "operator": {
    "name": "Example operator",
    "contactEmail": "privacy@example.com",
    "reviewedOn": "2026-10-04",
    "hosting": "Describe the hosting providers and regions actually used.",
    "operationalLogs": "Describe your service logs, purposes and recipients.",
    "retention": "Describe verified retention, deletion and backup limits."
  }
}
```

All operator fields are required when supplying a profile. Text is rendered as
text, not HTML. The public notices must describe the current installation; do not
copy another operator's retention or infrastructure promises. Keep dated evidence
and operational runbooks in your private operations repository.

## Optional analytics

Only add `analytics` after configuring your own collector and operator notice:

```json
{
  "scriptUrl": "/umami/script.js",
  "hostUrl": "/umami",
  "websiteId": "00000000-0000-4000-8000-000000000000",
  "hostname": "demo.example.com"
}
```

This object is the `analytics` property of the complete profile, not a standalone
file. The UUID is an example, not a live site. Analytics still requires production
mode, matching hostname, valid configuration and explicit visitor consent.
Do Not Track, Global Privacy Control, withdrawal and private-route exclusions
continue to apply. Increase `privacyRevision` whenever the notice or processing
changes materially; an older consent must not silently authorize the new profile.

The generic image provides no analytics upstream. An operator may mount explicitly
reviewed Nginx snippets in `/etc/nginx/t3-http.d/` and
`/etc/nginx/t3-server.d/`, or configure their own reverse proxy. Keep TLS
verification, exact route/method restrictions, origin checks and trusted proxy
configuration. Never expose the analytics dashboard through the collector routes.

Verify `/privacy`, missing/invalid configuration, a new revision, rejection,
acceptance and withdrawal on the actual deployed origin. The frontend cannot
verify whether your hosting and retention statements match the server.
