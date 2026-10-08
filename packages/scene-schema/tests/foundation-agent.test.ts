import assert from 'node:assert/strict'
import test from 'node:test'
import { FoundationCandidateSchema, type FoundationCandidate } from '../src/foundation-agent.ts'

function building(): Extract<FoundationCandidate, { target: 'building' }> {
  return {
    target: 'building', summary: 'Synthetic building for URL validation.', assumptions: [], unknowns: [],
    sources: [{ title: 'Public registry', url: 'https://example.test/parcel', kind: 'official', claims: ['Parcel footprint'], retrievedAt: '2026-10-07' }],
    site: { latitude: 48, longitude: 2, timeZone: 'Europe/Paris', address: 'Test address', officialAddress: 'Test address', targetId: 'building', rnbId: null, groundAltitude: 0, retrievedAt: '2026-10-07', radiusMeters: 30, attribution: 'Synthetic test geometry', mapUrl: 'https://example.test/map', rnbUrl: null },
    buildings: [{ id: 'building', rnbId: null, isTarget: true, label: 'Test building', footprint: [[0, 0], [4, 0], [4, 4], [0, 4]], height: 3, roofHeight: 0, groundAltitude: 0, groundOffset: 0, floors: 1, planarAccuracy: null, verticalAccuracy: null, source: 'estimated' }],
    roads: [], parcel: { id: 'parcel', label: 'Test parcel', area: 16, footprint: [[0, 0], [4, 0], [4, 4], [0, 4]] },
  }
}

const invalidUrls = ['', 'not a URL', '/relative/parcel', 'https://', 'https://[invalid', 'javascript:alert(1)', 'file:///tmp/plan', 'ftp://example.test/parcel']

test('dwelling registration is optional, bounded and explicit without rotation or scale', () => {
  const value = building(), registration = { dwellingVersionId: '23fe1dc6-642e-4d99-9b6c-fd853a42a960', position: [0, -.127, 6.375], evidence: { confidence: 'user', note: 'Plan origins share the documented common datum.' } }
  assert.deepEqual(FoundationCandidateSchema.parse({ ...value, dwellingRegistration: registration }), { ...value, dwellingRegistration: registration })
  for (const invalid of [
    { ...registration, dwellingVersionId: 'unknown' }, { ...registration, position: [0, 0] },
    { ...registration, position: [Infinity, 0, 0] }, { ...registration, position: [0, 0, 10001] },
    { ...registration, rotationY: 90 }, { ...registration, scale: 1 },
    { ...registration, evidence: { ...registration.evidence, confidence: 'official' } },
    { ...registration, evidence: { ...registration.evidence, note: '' } },
  ]) assert.equal(FoundationCandidateSchema.safeParse({ ...value, dwellingRegistration: invalid }).success, false)
  assert.deepEqual(FoundationCandidateSchema.parse(value), value)
})

test('building ridge axes are optional for old candidates and canonical when explicit', () => {
  assert.deepEqual(FoundationCandidateSchema.parse(building()), building())
  for (const azimuth of [0, 37.5, 90, 179.99]) {
    const value = building(); value.buildings[0].roofRidgeAzimuthDeg = azimuth
    assert.deepEqual(FoundationCandidateSchema.parse(value), value)
  }
  for (const azimuth of [-1, 180, 360, NaN, Infinity, null, 'north']) {
    const value = building()
    const parsed = FoundationCandidateSchema.safeParse({ ...value, buildings: [{ ...value.buildings[0], roofRidgeAzimuthDeg: azimuth }] })
    assert.equal(parsed.success, false)
    if (!parsed.success) assert.ok(parsed.error.issues.some(issue => issue.path.join('.') === 'buildings.0.roofRidgeAzimuthDeg'))
  }
})

test('invalid source links return validation issues instead of escaping safeParse', () => {
  for (const url of invalidUrls) {
    const value = building()
    value.sources[0].url = url
    // Calling safeParse directly also catches regressions that throw TypeError.
    const result = FoundationCandidateSchema.safeParse(value)
    assert.equal(result.success, false, `Accepted unsafe or invalid source URL: ${url}`)
    if (!result.success) assert.ok(result.error.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(['sources', 0, 'url'])), `Missing source URL issue for ${url}`)
  }
})

test('invalid map and building-registry links fail safely at their own field paths', () => {
  for (const field of ['mapUrl', 'rnbUrl'] as const) for (const url of invalidUrls) {
    const value = building()
    value.site[field] = url
    const result = FoundationCandidateSchema.safeParse(value)
    assert.equal(result.success, false, `Accepted unsafe or invalid ${field}: ${url}`)
    if (!result.success) assert.ok(result.error.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(['site', field])), `Missing ${field} issue for ${url}`)
  }
})

test('HTTP and HTTPS sources and site links remain valid; a missing registry link may be null', () => {
  assert.equal(FoundationCandidateSchema.safeParse(building()).success, true)
  for (const url of ['http://example.test/parcel?record=42#map', 'https://example.test/parcel?record=42#map']) {
    const value = building()
    value.sources[0].url = url
    value.site.mapUrl = url
    value.site.rnbUrl = url
    assert.deepEqual(FoundationCandidateSchema.parse(value), value)
  }
})
