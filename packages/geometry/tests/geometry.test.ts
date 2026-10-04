import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apartmentBounds,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  segmentWall,
  wallCenter,
  wallLength,
  wallRotation,
} from '@t3-designer/geometry'
import type { Door, Point2D, Wall, Window } from '@t3-designer/scene-schema'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)
const wall: Wall = { id: 'wall', from: [0, 0], to: [5, 0], height: 3, thickness: 0.12, kind: 'interior', estimated: true }
const door: Door = { id: 'door', wallId: 'wall', offset: 0.5, width: 1, height: 2.1, hinge: 'start', opensToward: 1, locationConfidence: 'schematic', estimated: true }
const window: Window = { id: 'window', wallId: 'wall', offset: 2.5, width: 1.5, height: 1.2, sillHeight: 0.9, estimated: true }

test('diagonal wall transforms local X onto its plan direction', () => {
  const diagonal = { from: [-2, 1] as Point2D, to: [1, 5] as Point2D }
  assert.equal(wallLength(diagonal), 5)
  assert.deepEqual(wallCenter(diagonal), [-0.5, 3])
  const yaw = wallRotation(diagonal)
  close(Math.cos(yaw) * 5, 3)
  close(-Math.sin(yaw) * 5, 4)
  // Reversing the endpoints must also reverse the local wall axis.
  const reversed = wallRotation({ from: diagonal.to, to: diagonal.from })
  close(Math.cos(reversed) * 5, -3)
  close(-Math.sin(reversed) * 5, -4)
})

test('concave area and centroid are independent of winding', () => {
  const polygon: Point2D[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]
  for (const points of [polygon, [...polygon].reverse()]) {
    assert.equal(polygonArea(points), 7)
    const centroid = polygonCentroid(points)
    close(centroid[0], 19 / 14)
    close(centroid[1], 19 / 14)
  }
  assert.throws(() => polygonCentroid([[0, 0], [1, 0], [2, 0]]), RangeError)
})

test('apartment bounds include balcony extent', () => {
  const perimeter: Point2D[] = [[-1, 0], [4, 0], [4, 4], [-1, 4]]
  assert.deepEqual(polygonBounds(perimeter), { min: [-1, 0], max: [4, 4], width: 5, depth: 4, center: [1.5, 2] })
  assert.equal(apartmentBounds({ perimeter, balcony: { id: 'balcony', name: 'Balcony', polygon: [[2, 4], [4, 4], [4, 6], [2, 6]], reportedArea: 4 } }).depth, 6)
  assert.throws(() => polygonBounds([]), RangeError)
})

test('door and window segmentation preserves solid area and apertures', () => {
  const segments = segmentWall(wall, [door, window])
  assert.equal(segments.length, 6)
  close(segments.reduce((area, segment) => area + segment.length * segment.height, 0), 5 * 3 - 1 * 2.1 - 1.5 * 1.2)
  for (const segment of segments) {
    for (const opening of [door, window]) {
      const bottom = 'sillHeight' in opening ? opening.sillHeight : 0
      const horizontal = Math.min(segment.offset + segment.length, opening.offset + opening.width) - Math.max(segment.offset, opening.offset)
      const vertical = Math.min(segment.bottom + segment.height, bottom + opening.height) - Math.max(segment.bottom, bottom)
      assert.ok(horizontal <= 1e-9 || vertical <= 1e-9, 'Solid wall must not intersect an aperture')
    }
  }
  assert.ok(segments.some((segment) => segment.offset === 2.5 && segment.bottom === 0 && segment.height === 0.9), 'Window retains a sill wall')
})

test('empty walls and boundary openings do not create zero-size solids', () => {
  assert.deepEqual(segmentWall(wall, []), [{ offset: 0, length: 5, bottom: 0, height: 3 }])
  assert.deepEqual(segmentWall(wall, [{ ...door, wallId: 'another-wall' }]), segmentWall(wall, []))
  assert.deepEqual(segmentWall(wall, [{ ...door, offset: 0, width: 5, height: 3 }]), [])
})

test('vertically separated openings share a horizontal span safely', () => {
  const highWindow = { ...window, offset: door.offset, width: door.width, sillHeight: 2.3, height: 0.5 }
  const segments = segmentWall(wall, [door, highWindow])
  close(segments.reduce((area, segment) => area + segment.length * segment.height, 0), 15 - 2.1 - 0.5)
  assert.ok(segments.some((segment) => segment.offset === 0.5 && Math.abs(segment.bottom - 2.1) < 1e-9 && Math.abs(segment.height - 0.2) < 1e-9))
})
