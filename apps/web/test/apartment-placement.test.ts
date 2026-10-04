import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APARTMENT_PLACEMENT,
  TARGET_BUILDING_FRAME,
  apartmentDirectionToSite,
  apartmentToSite,
  buildingFrameToSite,
  siteDirectionToApartment,
  siteToApartment,
  siteToBuildingFrame,
  splitTargetBuildingFootprint,
  type Point3,
} from '../src/data/apartment-placement.ts'
import { BUILDING_SITE, SITE_BUILDINGS, type SitePoint } from '../src/data/building-site.ts'
import { t3Apartment } from '../src/data/t3.ts'
import { getSolarPosition, localDateTimeToDate } from '../src/lib/solar.ts'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
const closePoint = (actual: Point3, expected: Point3) => actual.forEach((value, index) => close(value, expected[index]))
const target = SITE_BUILDINGS.find(building => building.isTarget)!

function contains([x, z]: SitePoint, ring: SitePoint[]) {
  let inside = false
  ring.forEach((b, index) => {
    const a = ring[(index + ring.length - 1) % ring.length]
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  })
  return inside
}

function area(ring: SitePoint[]) {
  return Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length]
    return sum + a[0] * b[1] - b[0] * a[1]
  }, 0)) / 2
}

test('apartment registration is an invertible rigid transform, retaining metre dimensions', () => {
  for (const point of [[0, 0, 0], [2.5, 1.3, 8], [-4, -1, 20]] satisfies Point3[]) {
    closePoint(siteToApartment(apartmentToSite(point)), point)
    closePoint(buildingFrameToSite(siteToBuildingFrame(point)), point)
    closePoint(siteDirectionToApartment(apartmentDirectionToSite(point)), point)
    close(Math.hypot(...apartmentDirectionToSite(point)), Math.hypot(...point))
  }
  closePoint(apartmentToSite([0, 0, 0]), APARTMENT_PLACEMENT.position)
  const a = apartmentToSite([0, 0, 0]), b = apartmentToSite([0, 0, APARTMENT_PLACEMENT.bounds.depth])
  close(Math.hypot(...a.map((value, i) => value - b[i])), APARTMENT_PLACEMENT.bounds.depth)
  // Independent Three.js Y rotation convention, guarding against mirrored axes.
  const angle = APARTMENT_PLACEMENT.rotationY
  closePoint(apartmentDirectionToSite([1, 0, 0]), [Math.cos(angle), 0, -Math.sin(angle)])
  closePoint(apartmentDirectionToSite([0, 0, 1]), [Math.sin(angle), 0, Math.cos(angle)])
})

test('the marked second row below the roof uses a provisional third-floor datum', () => {
  assert.equal(APARTMENT_PLACEMENT.confidence, 'estimated')
  assert.equal(APARTMENT_PLACEMENT.floorIndex, 3)
  close(APARTMENT_PLACEMENT.storeyHeight, 3.1)
  close(APARTMENT_PLACEMENT.floorElevation, 9.3)
  assert.ok(APARTMENT_PLACEMENT.floorElevation + APARTMENT_PLACEMENT.wallHeight < target.height)
  close(apartmentToSite([3, 0, 4])[1], 9.3)
  close(apartmentToSite([3, 2.7, 4])[1], 12)
})

test('living and kitchen face the southwest courtyard; bedrooms face northeast', () => {
  close(APARTMENT_PLACEMENT.livingFacadeAzimuth, 210.79081112229017)
  close(APARTMENT_PLACEMENT.bedroomFacadeAzimuth, 30.79081112229017)
  const courtyard = apartmentDirectionToSite([0, 0, 1])
  assert.ok(courtyard[0] < 0 && courtyard[2] > 0, 'courtyard is west and south in true site coordinates')
  closePoint(siteDirectionToApartment(courtyard), [0, 0, 1])
  const daylightFromSouth = siteDirectionToApartment([0, 0.5, 1])
  assert.ok(daylightFromSouth[2] > 0, 'southern sun reaches living side')
  const daylightFromNorth = siteDirectionToApartment([0, 0.5, -1])
  assert.ok(daylightFromNorth[2] < 0, 'northern summer sun reaches bedroom side')
})

test('seasonal sunlight retains the correct front-facing windows after registration', () => {
  const summerMorning = getSolarPosition(localDateTimeToDate('2026-06-21', 8 * 60), BUILDING_SITE.latitude, BUILDING_SITE.longitude)
  const winterAfternoon = getSolarPosition(localDateTimeToDate('2026-12-21', 15 * 60), BUILDING_SITE.latitude, BUILDING_SITE.longitude)
  const summerLocal = siteDirectionToApartment(summerMorning.direction)
  const winterLocal = siteDirectionToApartment(winterAfternoon.direction)
  assert.ok(summerMorning.isDaylight && winterAfternoon.isDaylight)
  assert.ok(summerLocal[2] < -0.7, 'summer 08:00 sun is in front of northeast bedroom windows')
  assert.ok(winterLocal[2] > 0.9, 'winter 15:00 sun is in front of southwest living/kitchen windows')
  close(summerLocal[1], summerMorning.direction[1])
  close(winterLocal[1], winterAfternoon.direction[1])
  // These signs establish incidence only; actual room illumination still needs
  // openings, ceilings, wall thickness and surrounding building occlusion.
})

test('the apartment fits the target footprint without stretching; balcony projects into courtyard', () => {
  for (const wall of t3Apartment.walls.filter(wall => wall.kind === 'exterior')) {
    // Sample every metre of each wall, including its centerline endpoints.
    const steps = Math.ceil(Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]))
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps
      const point = apartmentToSite([wall.from[0] + (wall.to[0] - wall.from[0]) * ratio, 0, wall.from[1] + (wall.to[1] - wall.from[1]) * ratio])
      assert.ok(contains([point[0], point[2]], target.footprint), `${wall.id}: body remains in building footprint`)
    }
  }
  for (const room of t3Apartment.rooms) for (const [x, z] of room.polygon) {
    const point = apartmentToSite([x, 0, z])
    assert.ok(contains([point[0], point[2]], target.footprint), `${room.id}: room remains inside building`)
  }
  const front = apartmentToSite([3, 0, APARTMENT_PLACEMENT.bounds.maxZ])
  close(siteToBuildingFrame(front)[2], -APARTMENT_PLACEMENT.exteriorInset)
  const balconyTip = t3Apartment.balcony!.polygon.reduce((best, point) => point[1] > best[1] ? point : best)
  const tip = apartmentToSite([balconyTip[0], 0, balconyTip[1]])
  assert.ok(siteToBuildingFrame(tip)[2] > 0)
  assert.equal(contains([tip[0], tip[2]], target.footprint), false)
})

test('the target partitions leave a complete cross-depth aperture while conserving footprint area', () => {
  const padding = 0.2, parts = splitTargetBuildingFootprint(padding)
  close(area(parts.before) + area(parts.apartmentBand) + area(parts.after), area(target.footprint))
  for (const ring of Object.values(parts)) {
    assert.ok(ring.length >= 3)
    assert.ok(area(ring) > 0)
    assert.notDeepEqual(ring[0], ring.at(-1), 'rings remain open for extrusion')
    assert.ok(ring.every(point => point.every(Number.isFinite)))
  }
  const left = APARTMENT_PLACEMENT.bounds.minX - padding, right = APARTMENT_PLACEMENT.bounds.maxX + padding
  for (const [x, z] of parts.before) assert.ok(siteToApartment([x, 0, z])[0] <= left + 1e-9)
  for (const [x, z] of parts.after) assert.ok(siteToApartment([x, 0, z])[0] >= right - 1e-9)
  for (const [x, z] of parts.apartmentBand) {
    const value = siteToApartment([x, 0, z])[0]
    assert.ok(value >= left - 1e-9 && value <= right + 1e-9)
  }
  const localBand = parts.apartmentBand.map(([x, z]) => siteToApartment([x, 0, z]))
  assert.ok(Math.min(...localBand.map(point => point[2])) < APARTMENT_PLACEMENT.bounds.minZ, 'void continues through estimated bedroom-to-building gap')
  assert.ok(Math.max(...localBand.map(point => point[2])) > APARTMENT_PLACEMENT.bounds.maxZ, 'void reaches courtyard exterior')
  close(TARGET_BUILDING_FRAME.length, 42.2715068338)
  assert.throws(() => splitTargetBuildingFootprint(-1), RangeError)
  assert.throws(() => splitTargetBuildingFootprint(NaN), RangeError)
})
