import assert from 'node:assert/strict'
import test from 'node:test'
import { ApartmentSchema, type Apartment } from '@t3-designer/scene-schema'

function fixture(): Apartment {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test apartment',
    units: 'meters',
    coordinateSystem: { x: 'east', y: 'up', z: 'south' },
    perimeter: [[0, 0], [4, 0], [4, 4], [0, 4]],
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], reportedArea: 16, color: '#dddddd' }],
    walls: [{ id: 'wall', from: [0, 0], to: [4, 0], height: 2.5, thickness: 0.1, kind: 'exterior', estimated: true }],
    doors: [{ id: 'door', wallId: 'wall', offset: 0.4, width: 0.9, height: 2.1, hinge: 'start', opensToward: 1, locationConfidence: 'schematic', estimated: true }],
    windows: [{ id: 'window', wallId: 'wall', offset: 2, width: 1, height: 1.2, sillHeight: 0.9, estimated: true }],
    metadata: {
      source: 'Test fixture',
      description: 'Synthetic test geometry',
      reportedCarrezArea: 16,
      reportedBasementArea: 0,
      assumptions: [],
      unresolved: [],
    },
  }
}

test('valid scene survives JSON serialization with domain values intact', () => {
  const apartment = fixture()
  assert.deepEqual(ApartmentSchema.parse(JSON.parse(JSON.stringify(apartment))), apartment)
})

test('unknown wall references and out-of-bounds openings are rejected', () => {
  const apartment = fixture()
  apartment.doors[0].wallId = 'missing'
  apartment.windows[0].offset = 3.5
  apartment.windows[0].sillHeight = 2
  const parsed = ApartmentSchema.safeParse(apartment)
  assert.equal(parsed.success, false)
  if (parsed.success) return
  assert.deepEqual(parsed.error.issues.map((issue) => issue.path), [
    ['doors', 0, 'wallId'], ['windows', 0, 'width'], ['windows', 0, 'height'],
  ])
})

test('overlapping apertures fail; adjacent apertures are allowed', () => {
  const apartment = fixture()
  apartment.windows[0].offset = 1
  assert.equal(ApartmentSchema.safeParse(apartment).success, false)
  apartment.windows[0].offset = apartment.doors[0].offset + apartment.doors[0].width
  assert.equal(ApartmentSchema.safeParse(apartment).success, true)
})

test('IDs are unique across entity collections', () => {
  const apartment = fixture()
  apartment.doors[0].id = 'room'
  assert.equal(ApartmentSchema.safeParse(apartment).success, false)
})

test('nonfinite points, zero-length walls and degenerate polygons fail', () => {
  const invalidPoint = fixture()
  invalidPoint.perimeter[0][0] = Infinity
  assert.equal(ApartmentSchema.safeParse(invalidPoint).success, false)
  const invalidWall = fixture()
  invalidWall.walls[0].to = [0, 0]
  assert.equal(ApartmentSchema.safeParse(invalidWall).success, false)
  const invalidRoom = fixture()
  invalidRoom.rooms[0].polygon = [[0, 0], [1, 0], [2, 0]]
  assert.equal(ApartmentSchema.safeParse(invalidRoom).success, false)
})

test('negative lengths and a different unit convention fail', () => {
  const apartment = fixture()
  apartment.walls[0].thickness = -0.1
  assert.equal(ApartmentSchema.safeParse(apartment).success, false)
  assert.equal(ApartmentSchema.safeParse({ ...fixture(), units: 'centimeters' }).success, false)
})
