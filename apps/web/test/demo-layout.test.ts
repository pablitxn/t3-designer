import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonCentroid } from '@t3-designer/geometry'
import { AssetSchema, FixtureSchema, pointInEditorPolygon, type Fixture } from '@t3-designer/scene-schema'
import { assetCatalog, currentFixtures } from '../src/data/current-state.ts'
import { demoAssets, demoFixtureCatalog, demoFixtures } from '../src/data/demo-catalog.ts'
import { t3Apartment } from '../src/data/t3.ts'
import { DEMO_LAYOUT_KEY, decodeDemoLayout, encodeDemoLayout, movableDemoFixture, moveDemoFixture, originalDemoFixtures, readDemoLayout, saveDemoLayout, toggleDemoFixture } from '../src/lib/demo-layout.ts'

const originals = originalDemoFixtures()
const fridge = originals.find(fixture => fixture.id === 'k-fridge')!
const toilet = originals.find(fixture => fixture.id === 'wc-toilet')!
const destinationRoom = t3Apartment.rooms.find(room => room.id === 'bedroom-1')!
const [x, z] = polygonCentroid(destinationRoom.polygon)
const position: Fixture['position'] = [x, fridge.position[1], z]
const generated = demoFixtureCatalog.filter(entry => entry.source === 'generated')
const chair = generated.find(entry => entry.asset.id === 'strandmon-v1')!.fixture
const bed = generated.find(entry => entry.asset.id === 'fagelfjallet-v1')!.fixture
function moved() { return moveDemoFixture(originalDemoFixtures(), fridge.id, { position, rotation: 5 * Math.PI / 2 }) }
function payload(id: string, at: Fixture['position'] = position) {
  const fixture = demoFixtures.find(item => item.id === id) ?? fridge
  return { id, position: at, rotation: Math.PI / 2, baseline: { position: fixture.position, rotation: fixture.rotation } }
}
function serialized(placements: unknown[], extra = {}) {
  return JSON.stringify({ version: 1, apartmentId: t3Apartment.id, placements, ...extra })
}
function serializedV2(hidden: unknown[] = [], added: unknown[] = [], placements: unknown[] = []) {
  return serialized(placements, { version: 2, hidden, added })
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
  assert.deepEqual(Object.keys(document), ['version', 'apartmentId', 'hidden', 'added', 'placements'])
  assert.equal(document.version, 2)
  assert.deepEqual(document.hidden, [])
  assert.deepEqual(document.added, [])
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

test('the demo catalog adds only the latest published drafts, with valid room footprints and separate chair seeds', () => {
  assert.deepEqual(generated.map(entry => entry.asset.id), ['strandmon-v1', 'dyvlinge-v2', 'fagelfjallet-v1'])
  assert.equal(demoFixtures.length, currentFixtures.length + 3)
  assert.equal(demoAssets.length, assetCatalog.length + 3)
  assert.equal(new Set(demoAssets.map(asset => asset.id)).size, demoAssets.length)
  assert.equal(new Set(demoFixtures.map(fixture => fixture.id)).size, demoFixtures.length)
  assert.deepEqual(demoAssets.slice(0, assetCatalog.length), assetCatalog)
  assert.deepEqual(originalDemoFixtures(), currentFixtures, 'generated choices are never enabled by default')
  for (const entry of demoFixtureCatalog) {
    assert.deepEqual(AssetSchema.parse(entry.asset), entry.asset)
    assert.deepEqual(FixtureSchema.parse(entry.fixture), entry.fixture)
    assert.equal(entry.fixture.assetId, entry.asset.id)
    if (entry.source === 'apartment') {
      assert.equal(entry.previewUrl, `/models/current/previews/${entry.asset.id}.png`)
      continue
    }
    assert.equal(entry.fixture.id, `demo-${entry.asset.id}`)
    assert.equal(entry.asset.url, `/demo-assets/${entry.asset.id}/model.glb`)
    assert.equal(entry.previewUrl, `/demo-assets/${entry.asset.id}/preview.png`)
    assert.equal(entry.fixture.position[1], .015)
    assert.equal(entry.fixture.rotation, 0)
    assert.equal(entry.fixture.mobility, 'movable')
    assert.equal(movableDemoFixture(entry.fixture), true)
    const room = t3Apartment.rooms.find(room => room.id === entry.fixture.roomId)!
    const [x, , z] = entry.fixture.position, [width, , depth] = entry.asset.dimensions
    for (const dx of [-width / 2, width / 2]) for (const dz of [-depth / 2, depth / 2]) {
      assert.equal(pointInEditorPolygon([x + dx, z + dz], room.polygon), true, `${entry.fixture.id} footprint must fit ${room.id}`)
    }
  }
  const chairs = generated.filter(entry => entry.fixture.roomId === 'living')
  assert.equal(chairs.length, 2)
  assert.ok(Math.abs(chairs[0].fixture.position[0] - chairs[1].fixture.position[0]) > (chairs[0].asset.dimensions[0] + chairs[1].asset.dimensions[0]) / 2)
  assert.equal(bed.roomId, 'bedroom-1')
})

test('presence toggles fixed and generated fixtures without mutating the catalog or duplicating active objects', () => {
  const canonical = JSON.stringify(demoFixtures)
  const hidden = toggleDemoFixture(originals, toilet.id, false)
  assert.equal(hidden.some(fixture => fixture.id === toilet.id), false)
  assert.deepEqual(toggleDemoFixture(hidden, toilet.id, true), originals)
  const added = toggleDemoFixture(hidden, chair.id, true)
  assert.equal(added.filter(fixture => fixture.id === chair.id).length, 1)
  assert.deepEqual(added.find(fixture => fixture.id === chair.id), chair)
  assert.notEqual(added.find(fixture => fixture.id === chair.id)!.position, chair.position)
  const placed = moveDemoFixture(added, chair.id, { position, rotation: Math.PI / 2 })
  assert.equal(toggleDemoFixture(placed, chair.id, true), placed, 'idempotent presence preserves current placement')
  const removed = toggleDemoFixture(placed, chair.id, false)
  assert.equal(toggleDemoFixture(removed, chair.id, false), removed)
  assert.deepEqual(toggleDemoFixture(removed, chair.id, true).find(fixture => fixture.id === chair.id), chair, 're-adding restores the canonical seed')
  assert.equal(JSON.stringify(demoFixtures), canonical)
  assert.deepEqual(originals, currentFixtures)
  assert.throws(() => toggleDemoFixture(originals, 'private-fixture', true), /Unknown object/)
  assert.throws(() => toggleDemoFixture(originals, 'private-fixture', false), /Unknown object/)
})

test('v2 roundtrip preserves hidden installations, added drafts and their independent placement deltas', () => {
  let fixtures = toggleDemoFixture(moved(), toilet.id, false)
  fixtures = toggleDemoFixture(fixtures, chair.id, true)
  fixtures = toggleDemoFixture(fixtures, bed.id, true)
  fixtures = moveDemoFixture(fixtures, chair.id, { position, rotation: Math.PI / 2 })
  const encoded = encodeDemoLayout(fixtures)!, document = JSON.parse(encoded)
  assert.equal(document.version, 2)
  assert.deepEqual(document.hidden, [toilet.id])
  assert.deepEqual(document.added, [chair.id, bed.id])
  assert.deepEqual(document.placements.map((item: { id: string }) => item.id), [fridge.id, chair.id])
  assert.equal(document.placements.some((item: { id: string }) => item.id === bed.id), false, 'a draft at its seed needs only membership')
  assert.deepEqual(decodeDemoLayout(encoded), { fixtures, status: 'saved' })
  assert.deepEqual(decodeDemoLayout(encodeDemoLayout([])), { fixtures: [], status: 'saved' }, 'hiding every original object is a valid layout')
  assert.equal(encodeDemoLayout(originalDemoFixtures()), null)
})

test('v1 placements migrate to v2 on save using the existing key without enabling generated furniture', () => {
  const store = storage(), legacy = serialized([payload(fridge.id)])
  store.setItem(DEMO_LAYOUT_KEY, legacy)
  const loaded = readDemoLayout(store)
  assert.deepEqual(loaded, { fixtures: moved(), status: 'saved' })
  assert.equal(DEMO_LAYOUT_KEY, 't3-designer.demo-layout.v1')
  assert.equal(store.getItem(DEMO_LAYOUT_KEY), legacy, 'reading does not rewrite browser preferences')
  assert.equal(saveDemoLayout(store, loaded.fixtures), 'saved')
  const document = JSON.parse(store.getItem(DEMO_LAYOUT_KEY)!)
  assert.equal(document.version, 2)
  assert.deepEqual(document.hidden, [])
  assert.deepEqual(document.added, [])
  assert.deepEqual(readDemoLayout(store), loaded)
  const forgedLegacy = serialized([payload(fridge.id), payload(chair.id)], { hidden: [toilet.id], added: [chair.id] })
  assert.deepEqual(decodeDemoLayout(forgedLegacy), { fixtures: moved(), status: 'recovered' })
})

test('membership allowlists recover valid choices without accepting foreign IDs, metadata, duplicates or retired revisions', () => {
  const result = decodeDemoLayout(serializedV2(
    [toilet.id, toilet.id, chair.id, 'foreign'],
    [chair.id, { id: bed.id, url: 'https://example.com/private.glb' }, 'demo-dyvlinge-v1'],
    [payload(fridge.id)],
  ))
  const expected = toggleDemoFixture(toggleDemoFixture(moved(), toilet.id, false), chair.id, true)
  assert.deepEqual(result, { fixtures: expected, status: 'recovered' })
  const duplicate = decodeDemoLayout(serializedV2([], [chair.id, chair.id]))
  assert.equal(duplicate.status, 'recovered')
  assert.equal(duplicate.fixtures.filter(fixture => fixture.id === chair.id).length, 1)
  assert.equal(encodeDemoLayout(result.fixtures)!.includes('private'), false)
  const generatedFixture = result.fixtures.find(fixture => fixture.id === chair.id)!
  generatedFixture.assetId = 'private-model'
  generatedFixture.label = 'Untrusted label'
  generatedFixture.evidence = 'https://example.com/private.glb'
  const sanitized = decodeDemoLayout(encodeDemoLayout(result.fixtures))
  assert.deepEqual(sanitized.fixtures.find(fixture => fixture.id === chair.id), chair)
  assert.equal(encodeDemoLayout(sanitized.fixtures)!.includes('Untrusted'), false)
})

test('placements cannot activate hidden or unadded fixtures, and stale added-object deltas keep only the canonical seed', () => {
  const inactive = decodeDemoLayout(serializedV2([fridge.id], [], [payload(fridge.id), payload(chair.id)]))
  assert.deepEqual(inactive, { fixtures: toggleDemoFixture(originals, fridge.id, false), status: 'recovered' })
  const stale = { ...payload(chair.id), baseline: { position: [1, .015, 1], rotation: 0 } }
  const added = decodeDemoLayout(serializedV2([], [chair.id], [stale]))
  assert.deepEqual(added, { fixtures: toggleDemoFixture(originals, chair.id, true), status: 'recovered' })
  assert.throws(() => moveDemoFixture(originals, chair.id, { position }), /Fixed or unknown object/)
})

test('unsupported membership structures fail closed and invalid generated transforms cannot erase a saved layout', () => {
  for (const raw of [
    serialized([], { version: 3 }),
    serialized([], { version: 2, hidden: null, added: [] }),
    serialized([], { version: 2, hidden: [], added: {} }),
    serializedV2(Array(currentFixtures.length + 1).fill(toilet.id)),
    serializedV2([], Array(generated.length + 1).fill(chair.id)),
  ]) assert.deepEqual(decodeDemoLayout(raw), { fixtures: originals, status: 'recovered' })
  const store = storage()
  saveDemoLayout(store, moved())
  const saved = store.getItem(DEMO_LAYOUT_KEY)
  const invalid = toggleDemoFixture(originalDemoFixtures(), chair.id, true)
  invalid.find(fixture => fixture.id === chair.id)!.position[1] = 99
  assert.throws(() => encodeDemoLayout(invalid), /Invalid placement/)
  assert.equal(saveDemoLayout(store, invalid), 'unavailable')
  assert.equal(store.getItem(DEMO_LAYOUT_KEY), saved)
})
