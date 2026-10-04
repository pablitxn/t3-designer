import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonArea, segmentWall, wallLength } from '@t3-designer/geometry'
import { ApartmentSchema, type Point2D } from '@t3-designer/scene-schema'
import { t3Apartment } from '../src/data/t3.ts'

test('reconstructed zones preserve the reported areas and the full stepped footprint', () => {
  assert.equal(t3Apartment.rooms.length, 8)
  for (const room of t3Apartment.rooms) {
    assert.ok(Math.abs(polygonArea(room.polygon) - room.reportedArea) < 1e-9, room.id)
  }
  const roomTotal = t3Apartment.rooms.reduce((sum, room) => sum + room.reportedArea, 0)
  assert.ok(Math.abs(roomTotal - 49.18) < 1e-9)
  assert.ok(Math.abs(polygonArea(t3Apartment.perimeter) - roomTotal) < 1e-9)
  const balcony = t3Apartment.balcony!
  assert.ok(Math.abs(polygonArea(balcony.polygon) - 1.26) < 1e-9)
})

test('room polygons tile the stepped footprint without gaps or overlaps', () => {
  function contains([x, z]: Point2D, polygon: Point2D[]) {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i]
      const [xj, zj] = polygon[j]
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) {
        inside = !inside
      }
    }
    return inside
  }
  const points = [...t3Apartment.perimeter, ...t3Apartment.rooms.flatMap(room => room.polygon)]
  const xs = [...new Set(points.map(([x]) => x))].sort((a, b) => a - b)
  const zs = [...new Set(points.map(([, z]) => z))].sort((a, b) => a - b)
  // Every arrangement cell of this orthogonal plan has constant room membership.
  // Checking each center therefore detects even very small overlaps and gaps.
  for (let xi = 1; xi < xs.length; xi++) {
    for (let zi = 1; zi < zs.length; zi++) {
      const point: Point2D = [(xs[xi - 1] + xs[xi]) / 2, (zs[zi - 1] + zs[zi]) / 2]
      const occupancy = t3Apartment.rooms.filter(room => contains(point, room.polygon)).length
      assert.equal(occupancy, contains(point, t3Apartment.perimeter) ? 1 : 0, point.join(','))
    }
  }
})

test('all door and window openings remove the intended wall area and remain inside their wall', () => {
  assert.equal(t3Apartment.doors.length, 8)
  for (const wall of t3Apartment.walls) {
    const doors = t3Apartment.doors.filter(door => door.wallId === wall.id)
    const windows = t3Apartment.windows.filter(window => window.wallId === wall.id)
    const solids = segmentWall(wall, [...doors, ...windows])
    const solidArea = solids.reduce((sum, segment) => sum + segment.length * segment.height, 0)
    const openingArea = [...doors, ...windows].reduce((sum, opening) => sum + opening.width * opening.height, 0)
    assert.ok(Math.abs(solidArea + openingArea - wallLength(wall) * wall.height) < 1e-9, wall.id)
  }
})

test('serialized scene retains observed openings, evidence, and metric axes', () => {
  const roundTrip = ApartmentSchema.parse(JSON.parse(JSON.stringify(t3Apartment)))
  assert.deepEqual(roundTrip, t3Apartment)
  assert.deepEqual(roundTrip.coordinateSystem, { x: 'east', y: 'up', z: 'south' })
  assert.equal(roundTrip.units, 'meters')
  assert.equal(roundTrip.windows.length, 4)
  assert.ok(roundTrip.windows.every(w => w.estimated && w.locationConfidence === 'observed' && w.evidence))
  assert.equal(roundTrip.doors.find(d => d.id === 'wc-entry')?.opensToward, -1)
  assert.deepEqual(roundTrip.doors.filter(door => door.locationConfidence === 'inferred').map(door => door.id), [])
})
