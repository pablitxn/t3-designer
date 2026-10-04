import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonCentroid } from '@t3-designer/geometry'
import type { Fixture } from '@t3-designer/scene-schema'
import { t3Apartment } from '../src/data/t3.ts'
import { DEMO_LAYOUT_KEY, decodeDemoLayout, encodeDemoLayout, movableDemoFixture, moveDemoFixture, originalDemoFixtures, readDemoLayout, saveDemoLayout } from '../src/lib/demo-layout.ts'

const originals = originalDemoFixtures()
const fridge = originals.find(fixture => fixture.id === 'k-fridge')!
const toilet = originals.find(fixture => fixture.id === 'wc-toilet')!
const destinationRoom = t3Apartment.rooms.find(room => room.id === 'bedroom-1')!
const [x, z] = polygonCentroid(destinationRoom.polygon)
const position: Fixture['position'] = [x, fridge.position[1], z]
function moved() { return moveDemoFixture(originalDemoFixtures(), fridge.id, { position, rotation: 5 * Math.PI / 2 }) }
function payload(id: string, at: Fixture['position'] = position) {
  const fixture = originals.find(item => item.id === id) ?? fridge
  return { id, position: at, rotation: Math.PI / 2, baseline: { position: fixture.position, rotation: fixture.rotation } }
}
function serialized(placements: unknown[], extra = {}) {
  return JSON.stringify({ version: 1, apartmentId: t3Apartment.id, placements, ...extra })
}
function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

test('public arrangement updates horizontal placement and room without changing the source or fixed fixtures', () => {
  const before = JSON.stringify(originals)
  const next = moveDemoFixture(originals, fridge.id, { position, rotation: 5 * Math.PI / 2 })
  const placed = next.find(fixture => fixture.id === fridge.id)!
  assert.deepEqual(placed.position, position)
  assert.equal(placed.rotation, Math.PI / 2)
  assert.equal(placed.roomId, destinationRoom.id)
  assert.equal(next.find(fixture => fixture.id === toilet.id), toilet)
  assert.equal(JSON.stringify(originals), before)
  assert.notEqual(placed.position, position)
  assert.notEqual(originalDemoFixtures()[0].position, originals[0].position)
})

test('the demo accepts only canonical movable IDs, finite horizontal placement and an interior room', () => {
  assert.equal(movableDemoFixture({ ...toilet, mobility: 'movable', assetId: fridge.assetId }), false)
  assert.equal(movableDemoFixture({ ...fridge, id: 'foreign-fixture', mobility: 'movable' }), false)
  assert.equal(movableDemoFixture({ ...fridge, mobility: 'fixed' }), true, 'canonical demo metadata is authoritative')
  for (const operation of [
    () => moveDemoFixture(originals, toilet.id, { position }),
    () => moveDemoFixture(originals, 'foreign-fixture', { position }),
    () => moveDemoFixture([], fridge.id, { position }),
    () => moveDemoFixture(originals, fridge.id, { position: [x, fridge.position[1] + .1, z] }),
    () => moveDemoFixture(originals, fridge.id, { position: [1_000, fridge.position[1], 1_000] }),
    () => moveDemoFixture(originals, fridge.id, { position: [NaN, fridge.position[1], z] }),
    () => moveDemoFixture(originals, fridge.id, { rotation: Infinity }),
  ]) assert.throws(operation)
})

test('storage roundtrip keeps only placement deltas and reconstructs canonical model and evidence metadata', () => {
  const fixtures = moved(), edited = fixtures.find(fixture => fixture.id === fridge.id)!
  edited.assetId = 'private-asset'
  edited.label = 'Private label must not persist'
  edited.evidence = 'Private evidence must not persist'
  edited.mobility = 'fixed'
  fixtures.push({ ...edited, id: 'extra-model' })
  const encoded = encodeDemoLayout(fixtures)!
  const document = JSON.parse(encoded)
  assert.deepEqual(Object.keys(document), ['version', 'apartmentId', 'placements'])
  assert.equal(document.placements.length, 1)
  assert.deepEqual(Object.keys(document.placements[0]), ['id', 'position', 'rotation', 'baseline'])
  assert.equal(encoded.includes('private'), false)
  assert.equal(encoded.includes('Private'), false)
  const reloaded = decodeDemoLayout(encoded)
  assert.equal(reloaded.status, 'saved')
  assert.deepEqual(reloaded.fixtures, moved())
  assert.equal(encodeDemoLayout(originals), null)
  assert.equal(encodeDemoLayout(moveDemoFixture(originals, fridge.id, { rotation: fridge.rotation + Math.PI * 2 })), null)
})

test('corrupt and incompatible storage returns canonical fixtures and reports recovery', () => {
  for (const raw of ['{', 'null', 'true', '[]', 'x'.repeat(32_001), serialized([], { version: 2 }), serialized([], { apartmentId: 'another-apartment' }), serialized(Array.from({ length: originals.length + 1 }, () => payload(fridge.id)))]) {
    const result = decodeDemoLayout(raw)
    assert.equal(result.status, 'recovered', raw.slice(0, 80))
    assert.deepEqual(result.fixtures, originals)
  }
  assert.equal(decodeDemoLayout(null).status, 'original')
  assert.equal(decodeDemoLayout(serialized([])).status, 'original')
})

test('invalid, stale and fixed-object deltas are ignored while independent valid placements are retained', () => {
  const stale = { ...payload('living-table'), baseline: { position: [0, 0, 0], rotation: 0 } }
  const forged = { ...payload(toilet.id), mobility: 'movable', assetId: fridge.assetId }
  const result = decodeDemoLayout(serialized([payload(fridge.id), stale, forged, payload('missing'), null]))
  assert.equal(result.status, 'recovered')
  assert.deepEqual(result.fixtures, moved())
  for (const invalid of [
    { ...payload(fridge.id), position: [x, 5, z] },
    { ...payload(fridge.id), position: [1_000, fridge.position[1], 1_000] },
    { ...payload(fridge.id), rotation: '90' },
    { ...payload(fridge.id), rotation: null },
    { ...payload(fridge.id), position: [x, fridge.position[1]] },
    { ...payload(fridge.id), baseline: undefined },
  ]) assert.deepEqual(decodeDemoLayout(serialized([invalid])), { fixtures: originals, status: 'recovered' })
})

test('duplicate IDs do not apply a second placement and extra storage fields never override source metadata', () => {
  const first = { ...payload(fridge.id), label: 'Injected label', roomId: 'wc', mobility: 'fixed', url: 'https://example.com/private.glb' }
  const second = payload(fridge.id, fridge.position)
  const result = decodeDemoLayout(serialized([first, second]))
  assert.equal(result.status, 'recovered')
  assert.deepEqual(result.fixtures, moved())
})

test('save and reset affect only the demo key while storage failures preserve the in-memory layout', () => {
  const store = storage()
  store.setItem('t3-designer.language', 'es')
  store.setItem('t3-designer.analytics-consent', 'keep')
  assert.equal(saveDemoLayout(store, moved()), 'saved')
  assert.deepEqual(readDemoLayout(store), { fixtures: moved(), status: 'saved' })
  assert.equal(saveDemoLayout(store, originals), 'original')
  assert.equal(store.getItem(DEMO_LAYOUT_KEY), null)
  assert.equal(store.getItem('t3-designer.language'), 'es')
  assert.equal(store.getItem('t3-designer.analytics-consent'), 'keep')
  assert.deepEqual(readDemoLayout({ getItem() { throw new Error('denied') } }), { fixtures: originals, status: 'unavailable' })
  const broken = { setItem() { throw new Error('quota') }, removeItem() { throw new Error('denied') } }
  const fixtures = moved(), before = JSON.stringify(fixtures)
  assert.equal(saveDemoLayout(broken, fixtures), 'unavailable')
  assert.equal(saveDemoLayout(broken, originals), 'unavailable')
  assert.equal(JSON.stringify(fixtures), before)
})

test('nonfinite movable values cannot silently erase an existing saved layout', () => {
  const store = storage()
  saveDemoLayout(store, moved())
  const saved = store.getItem(DEMO_LAYOUT_KEY)
  const invalid = originalDemoFixtures()
  invalid.find(fixture => fixture.id === fridge.id)!.position[0] = NaN
  assert.throws(() => encodeDemoLayout(invalid), /Invalid placement/)
  assert.equal(saveDemoLayout(store, invalid), 'unavailable')
  assert.equal(store.getItem(DEMO_LAYOUT_KEY), saved)
})
