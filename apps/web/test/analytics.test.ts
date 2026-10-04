import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPayload, CONSENT_KEY, CONSENT_MONTHS, consentExpiry, POLICY_VERSION, readConsent, resolveAnalyticsConfig,
  type AnalyticsEnv, type AnalyticsEvent, type AnalyticsView,
} from '../src/lib/analytics-policy.ts'

const location = { origin: 'https://t3.example.test', hostname: 't3.example.test', protocol: 'https:' }
const env: AnalyticsEnv = {
  VITE_UMAMI_SCRIPT_URL: '/umami/script.js',
  VITE_UMAMI_HOST_URL: '/umami',
  VITE_UMAMI_WEBSITE_ID: '00000000-0000-4000-8000-000000000001',
  VITE_UMAMI_ALLOWED_HOSTNAME: 't3.example.test',
}
const now = Date.parse('2026-09-27T12:34:56.000Z')

test('same-origin configuration preserves the collector proxy prefix', () => {
  assert.deepEqual(resolveAnalyticsConfig(env, location, true), {
    scriptUrl: 'https://t3.example.test/umami/script.js',
    hostUrl: 'https://t3.example.test/umami',
    collectorUrl: 'https://t3.example.test/umami/api/send',
    websiteId: env.VITE_UMAMI_WEBSITE_ID,
    hostname: 't3.example.test',
  })
  const external = resolveAnalyticsConfig({
    ...env, VITE_UMAMI_SCRIPT_URL: 'https://analytics.example.test/script.js', VITE_UMAMI_HOST_URL: 'https://analytics.example.test/',
  }, location, true)
  assert.equal(external?.collectorUrl, 'https://analytics.example.test/api/send')
})

test('missing configuration, development and a different public or preview hostname fail closed', () => {
  assert.equal(resolveAnalyticsConfig({}, location, true), null)
  for (const key of Object.keys(env) as (keyof AnalyticsEnv)[]) {
    assert.equal(resolveAnalyticsConfig({ ...env, [key]: '' }, location, true), null, `empty ${key}`)
    const missing = { ...env }
    delete missing[key]
    assert.equal(resolveAnalyticsConfig(missing, location, true), null, `missing ${key}`)
  }
  assert.equal(resolveAnalyticsConfig(env, location, false), null)
  for (const hostname of ['preview.t3.example.test', 't3.example.test.attacker.invalid', 'localhost']) {
    assert.equal(resolveAnalyticsConfig(env, { ...location, hostname }, true), null)
  }
  assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_ALLOWED_HOSTNAME: '*.example.test' }, location, true), null)
  assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_ALLOWED_HOSTNAME: 't3.example.test,preview.example.test' }, location, true), null)
})

test('malformed IDs and endpoint URLs cannot enable analytics', () => {
  for (const id of ['pending', 'not-a-uuid', '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001?email=secret']) {
    assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_WEBSITE_ID: id }, location, true), null)
  }
  for (const url of ['javascript:alert(1)', 'data:text/javascript,1', 'ftp://analytics.example.test', 'http://analytics.example.test/script.js',
    'https://alice:secret@analytics.example.test/script.js', '/umami/script.js?secret=token', '/umami/script.js#private', ' /umami/script.js']) {
    assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_SCRIPT_URL: url }, location, true), null, url)
    assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_HOST_URL: url }, location, true), null, url)
  }
  assert.equal(resolveAnalyticsConfig({ ...env, VITE_UMAMI_HOST_URL: '/umami/api/send' }, location, true), null)
  assert.equal(resolveAnalyticsConfig(env, { ...location, origin: 'http://t3.example.test', protocol: 'http:' }, true), null)
})

test('HTTP is permitted only for explicitly configured local acceptance tests', () => {
  const local = { origin: 'http://127.0.0.1:4175', hostname: '127.0.0.1', protocol: 'http:' }
  const configured = { ...env, VITE_UMAMI_ALLOWED_HOSTNAME: '127.0.0.1' }
  assert.equal(resolveAnalyticsConfig(configured, local, true)?.collectorUrl, 'http://127.0.0.1:4175/umami/api/send')
  assert.equal(resolveAnalyticsConfig({ ...configured, VITE_UMAMI_HOST_URL: 'http://127.0.0.1:4999' }, local, true), null)
  assert.equal(resolveAnalyticsConfig(configured, local, false), null)
})

test('the six-month product decision expiry uses calendar months and clamps month-end dates', () => {
  assert.equal(CONSENT_MONTHS, 6)
  assert.equal(CONSENT_KEY, 't3-designer.analytics-consent')
  assert.equal(new Date(consentExpiry(now)).toISOString(), '2027-03-27T12:34:56.000Z')
  assert.equal(new Date(consentExpiry(Date.parse('2026-08-31T23:00:00Z'))).toISOString(), '2027-02-28T23:00:00.000Z')
  assert.equal(new Date(consentExpiry(Date.parse('2027-08-31T23:00:00Z'))).toISOString(), '2028-02-29T23:00:00.000Z')
  assert.equal(new Date(consentExpiry(now, 1)).toISOString(), '2026-10-27T12:34:56.000Z')
})

test('only current, unexpired consent records with the minimal schema are recognized', () => {
  for (const choice of ['accepted', 'rejected']) {
    const record = { choice, version: POLICY_VERSION, expiresAt: consentExpiry(now) }
    assert.deepEqual(readConsent(JSON.stringify(record), now), record)
    assert.equal(readConsent(JSON.stringify(record), record.expiresAt), null)
    assert.equal(readConsent(JSON.stringify(record), record.expiresAt + 1), null)
  }
  const valid = { choice: 'accepted', version: POLICY_VERSION, expiresAt: consentExpiry(now) }
  for (const raw of [null, '', '{', 'null', 'true', '[]', '{}', '"accepted"',
    JSON.stringify({ ...valid, choice: 'pending' }),
    JSON.stringify({ ...valid, version: 'outdated' }),
    JSON.stringify({ ...valid, expiresAt: now }),
    JSON.stringify({ ...valid, expiresAt: now - 1 }),
    JSON.stringify({ ...valid, expiresAt: consentExpiry(now) + 1 }),
    JSON.stringify({ ...valid, expiresAt: String(valid.expiresAt) }),
    JSON.stringify({ ...valid, email: 'person@example.invalid' }),
    JSON.stringify({ ...valid, identifier: 'persistent-person' }),
  ]) assert.equal(readConsent(raw, now), null, String(raw))
})

test('views and four events have exact constant-only payloads, never caller properties', () => {
  const config = resolveAnalyticsConfig(env, location, true)!
  const views = { apartment: 'Apartment', building: 'Building', documentation: 'Documentation' } as const
  for (const [view, title] of Object.entries(views)) {
    const base = {
      website: env.VITE_UMAMI_WEBSITE_ID,
      hostname: 't3.example.test',
      url: `/${view}`,
      title: `T3 Designer · ${title}`,
      referrer: '',
    }
    assert.deepEqual(buildPayload(config, view as AnalyticsView), base)
    for (const name of ['view_changed', 'solar_opened', 'dossier_opened', 'glb_download'] as const) {
      // The runtime boundary must discard surplus JS properties even when TS callers cannot supply them.
      const event = { name, data: { email: 'person@example.invalid' }, url: '/secret?token=private', id: 'user-1', title: 'Private title' }
      assert.deepEqual(buildPayload(config, view as AnalyticsView, event), { ...base, name, data: { view } })
    }
  }
  assert.equal(buildPayload(config, 'unknown?secret=token' as AnalyticsView), null)
  assert.equal(buildPayload(config, 'building', { name: 'free_text' } as unknown as AnalyticsEvent), null)
})
