import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { BUILDING_SITE, SITE_BUILDINGS, SITE_PARCEL, SITE_ROADS, type SitePoint } from '../src/data/building-site.ts'

function area(ring: SitePoint[]) {
  return Math.abs(ring.reduce((sum, a, index) => {
    const b = ring[(index + 1) % ring.length]
    return sum + a[0] * b[1] - b[0] * a[1]
  }, 0)) / 2
}

function contains(point: SitePoint, ring: SitePoint[]) {
  let inside = false
  ring.forEach((b, index) => {
    const a = ring[(index + ring.length - 1) % ring.length]
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  })
  return inside
}

function validateRing(ring: SitePoint[], label: string) {
  assert.ok(ring.length >= 3, `${label}: at least three vertices`)
  assert.notDeepEqual(ring[0], ring.at(-1), `${label}: open ring without duplicated closing vertex`)
  for (const [index, point] of ring.entries()) {
    assert.equal(point.length, 2, `${label}: planar [east,south] coordinates`)
    assert.ok(point.every(Number.isFinite), `${label}: finite coordinates`)
    const next = ring[(index + 1) % ring.length]
    assert.ok(Math.hypot(point[0] - next[0], point[1] - next[1]) > 1e-6, `${label}: nonzero edge`)
  }
  assert.ok(area(ring) > .01, `${label}: nondegenerate polygon`)
  const cross = (a: SitePoint, b: SitePoint, c: SitePoint) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue
      const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[j], d = ring[(j + 1) % ring.length]
      const crossing = cross(a, b, c) * cross(a, b, d) < -1e-10 && cross(c, d, a) * cross(c, d, b) < -1e-10
      assert.equal(crossing, false, `${label}: edges ${i} and ${j} cross`)
    }
  }
}

const closeTo = (actual: number, expected: number, tolerance: number) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be within ${tolerance} of ${expected}`)

test('one target uses local demo identifiers and an explicitly approximate solar origin', () => {
  const targets = SITE_BUILDINGS.filter(building => building.isTarget)
  assert.equal(targets.length, 1)
  const target = targets[0]
  assert.equal(target.id, 'demo-building-001')
  assert.equal(target.rnbId, 'demo-reference-001')
  assert.equal(target.id, BUILDING_SITE.targetId)
  assert.equal(target.rnbId, BUILDING_SITE.rnbId)
  assert.equal(BUILDING_SITE.latitude, 48)
  assert.equal(BUILDING_SITE.longitude, -4)
  assert.equal(BUILDING_SITE.timeZone, 'Europe/Paris')
  assert.equal(BUILDING_SITE.datasetKind, 'generalized-demo')
  assert.match(BUILDING_SITE.officialAddress, /no postal address/)
  assert.ok(contains([0, 0], target.footprint), 'local origin remains inside the preserved building')
  assert.ok(SITE_BUILDINGS.every(building => building.id.startsWith('demo-') && building.rnbId?.startsWith('demo-')))
})

test('the building footprint and cadastral parcel remain distinct areas', () => {
  const target = SITE_BUILDINGS.find(building => building.isTarget)!
  closeTo(area(target.footprint), 475.95, .02)
  assert.equal(SITE_PARCEL.id, 'demo-parcel-001')
  assert.equal(SITE_PARCEL.area, 1192, 'illustrative plot surface, not apartment or footprint surface')
  // Projected cartography and registered cadastral area need not match exactly.
  closeTo(area(SITE_PARCEL.footprint), SITE_PARCEL.area, 12)
  assert.ok(SITE_PARCEL.area > area(target.footprint) * 2)
  assert.ok(contains([0, 0], SITE_PARCEL.footprint))
  validateRing(SITE_PARCEL.footprint, 'DEMO 001')
})

test('building rings remain finite, simple and preserve actual courtyard holes', () => {
  assert.equal(new Set(SITE_BUILDINGS.map(building => building.id)).size, SITE_BUILDINGS.length)
  assert.ok(SITE_BUILDINGS.length > 10, 'retain surrounding shadow casters')
  let courtyards = 0
  for (const building of SITE_BUILDINGS) {
    validateRing(building.footprint, building.id)
    for (const hole of building.holes ?? []) {
      courtyards++
      validateRing(hole, `${building.id} courtyard`)
      assert.ok(hole.every(point => contains(point, building.footprint)), `${building.id}: hole within footprint`)
      assert.ok(area(hole) < area(building.footprint))
    }
  }
  assert.ok(courtyards > 0, 'source courtyards must not silently become filled building volumes')
})

test('source heights and absolute ground elevations retain their separate meanings', () => {
  for (const building of SITE_BUILDINGS) {
    assert.ok(Number.isFinite(building.height) && building.height > 0, `${building.id}: positive eaves height`)
    assert.ok(Number.isFinite(building.roofHeight) && building.roofHeight >= 0, `${building.id}: roof range`)
    assert.ok(Number.isFinite(building.groundOffset), `${building.id}: ground offset`)
    if (building.groundAltitude !== null) {
      assert.ok(Number.isFinite(building.groundAltitude))
      closeTo(building.groundOffset, building.groundAltitude - BUILDING_SITE.groundAltitude, .001)
    }
    if (building.floors !== null) assert.ok(Number.isInteger(building.floors) && building.floors >= 0)
  }
  const target = SITE_BUILDINGS.find(building => building.isTarget)!
  closeTo(target.height, 15.5, .001)
  closeTo(target.height + target.roofHeight, 16.3, .001)
  closeTo(target.groundOffset, 0, .001)
})

test('generalization preserves every authored context vertex, height, hole and road width', () => {
  // Fingerprint recorded before generalization. Identifiers, labels and the
  // regional solar origin are excluded; all metric geometry stays exact.
  const geometry = {
    buildings: SITE_BUILDINGS.map(({ footprint, holes, height, roofHeight, groundAltitude, groundOffset, floors }) => ({ footprint, holes, height, roofHeight, groundAltitude, groundOffset, floors })),
    roads: SITE_ROADS.map(({ points, width, isPath }) => ({ points, width, isPath })),
    parcel: { footprint: SITE_PARCEL.footprint, area: SITE_PARCEL.area },
  }
  assert.equal(createHash('sha256').update(JSON.stringify(geometry)).digest('hex'), '5b1ba7507b41a2c9c938e3cd194357abf6338cdce8a47cf60e12ebd6f0ab84d0')
})

test('road geometry remains finite, metric and clipped to the local context', () => {
  assert.equal(new Set(SITE_ROADS.map(road => road.id)).size, SITE_ROADS.length)
  assert.ok(SITE_ROADS.every(road => road.id.startsWith('demo-road-')))
  for (const road of SITE_ROADS) {
    assert.ok(road.width > 0 && Number.isFinite(road.width), `${road.id}: real width`)
    assert.ok(road.points.length >= 2)
    assert.ok(road.points.every(point => point.length === 2 && point.every(value => Number.isFinite(value) && Math.abs(value) <= 110.001)), `${road.id}: clipped local metric points`)
  }
})
