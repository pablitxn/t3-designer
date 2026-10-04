import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsEnvironment, defaultSiteConfig, loadSiteConfig, parseSiteConfig } from '../src/lib/site-config.ts'
import { consentExpiry, POLICY_VERSION, readConsent } from '../src/lib/analytics-policy.ts'

const location = new URL('https://demo.example.test')
const profile = {
  version: 1, privacyRevision: 'operator-v1',
  operator: { name: 'Example Operator', contactEmail: 'privacy@example.test', reviewedOn: '2026-10-04',
    hosting: 'Example hosting.', operationalLogs: 'Example logs.', retention: 'Example retention.' },
  analytics: { scriptUrl: '/umami/script.js', hostUrl: '/umami', websiteId: '00000000-0000-4000-8000-000000000001', hostname: location.hostname },
}

test('the default profile contains no operator identity or analytics', () => {
  assert.deepEqual(defaultSiteConfig, { version: 1, privacyRevision: 'unconfigured' })
  assert.deepEqual(analyticsEnvironment(defaultSiteConfig), {})
  assert.equal(parseSiteConfig(undefined, location), defaultSiteConfig)
})

test('public operator profiles are validated and immutable, with analytics explicitly optional', () => {
  const parsed = parseSiteConfig(profile, location)
  assert.deepEqual(parsed, profile)
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.operator) && Object.isFrozen(parsed.analytics))
  const operatorOnly = { version: profile.version, privacyRevision: profile.privacyRevision, operator: profile.operator }
  assert.deepEqual(parseSiteConfig(operatorOnly, location), operatorOnly)
  assert.deepEqual(analyticsEnvironment(operatorOnly as ReturnType<typeof parseSiteConfig>), {})
})

test('incomplete, stale-host, malformed and unknown settings fail closed', () => {
  const invalid = [null, [], {}, { ...profile, version: 2 }, { ...profile, privacyRevision: '' },
    { ...profile, privateApiKey: 'example-only' }, { ...profile, operator: { name: 'Incomplete' } },
    { ...profile, operator: { ...profile.operator, reviewedOn: '2026-02-30' } },
    { ...profile, operator: { ...profile.operator, name: 'Bad\nName' } },
    { ...profile, operator: { ...profile.operator, contactEmail: 'not an email' } },
    { ...profile, operator: { ...profile.operator, retention: 'x'.repeat(1501) } },
    { ...profile, analytics: { ...profile.analytics, hostname: 'other.example.test' } },
    { ...profile, analytics: { ...profile.analytics, scriptUrl: 'javascript:alert(1)' } },
    { ...profile, analytics: { ...profile.analytics, scriptUrl: 'https://user:secret@analytics.example.test/script.js' } },
    { ...profile, analytics: { ...profile.analytics, hostUrl: '/umami?token=secret' } },
    { ...profile, analytics: { ...profile.analytics, websiteId: '' } },
  ]
  for (const value of invalid) assert.equal(parseSiteConfig(value, location), defaultSiteConfig)
})

test('configuration fetch is same-origin, uncredentialed and independent of an API', async () => {
  const calls: { url: string; options?: RequestInit }[] = []
  const config = await loadSiteConfig({ origin: location.origin, baseUrl: '/showcase/', fetcher: async (input, options) => {
    calls.push({ url: String(input), options })
    return Response.json(profile)
  } })
  assert.deepEqual(config, profile)
  assert.equal(calls[0].url, 'https://demo.example.test/showcase/site-config.json')
  assert.equal(calls[0].options?.credentials, 'omit')
  assert.equal(calls[0].options?.redirect, 'error')
  assert.equal(calls[0].options?.cache, 'no-store')
  assert.equal(calls[0].options?.referrerPolicy, 'no-referrer')
  assert.ok(calls[0].options?.signal)
  let requested = false
  assert.equal(await loadSiteConfig({ origin: location.origin, baseUrl: 'https://other.example.test/', fetcher: async () => {
    requested = true; return Response.json(profile)
  } }), defaultSiteConfig)
  assert.equal(requested, false)
})

test('missing JSON, SPA fallback HTML, oversized data and fetch failures leave the demo usable', async () => {
  const responses = [new Response('', { status: 404 }), new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    new Response(' '.repeat(32769), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '999999' } })]
  for (const response of responses) assert.equal(await loadSiteConfig({ origin: location.origin, baseUrl: '/', fetcher: async () => response }), defaultSiteConfig)
  assert.equal(await loadSiteConfig({ origin: location.origin, baseUrl: '/', fetcher: async () => { throw new Error('Unavailable') } }), defaultSiteConfig)
})

test('operator privacy revisions invalidate saved consent independently of the application policy version', () => {
  const now = Date.now()
  const previousVersion = `${POLICY_VERSION}:operator-v1`
  const raw = JSON.stringify({ choice: 'accepted', version: previousVersion, expiresAt: consentExpiry(now) })
  assert.ok(readConsent(raw, now, previousVersion))
  assert.equal(readConsent(raw, now, `${POLICY_VERSION}:operator-v2`), null)
})
