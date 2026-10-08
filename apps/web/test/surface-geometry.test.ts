import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonArea } from '@t3-designer/geometry'
import type { Point2D } from '@t3-designer/scene-schema'
import { surfaceGeometry, surfacePolygons } from '../src/components/surface-geometry.ts'

const rectangle = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
const area = (pieces: Point2D[][]) => pieces.reduce((sum, piece) => sum + polygonArea(piece), 0)

test('openings crossing a room boundary cut the finish without filling the stair void', () => {
  const room = rectangle(0, 0, 4, 4), opening = rectangle(3, 1, 3, 2)
  assert.ok(Math.abs(area(surfacePolygons(room, [opening])) - 14) < 1e-8)
  const neighboringRoom = rectangle(4, 0, 4, 4)
  assert.ok(Math.abs(area(surfacePolygons(neighboringRoom, [opening])) - 12) < 1e-8)
})

test('split-level finishes are clipped to their region and share an L-shaped stair opening', () => {
  const perimeter = rectangle(0, 0, 8, 6)
  const opening: Point2D[] = [[2, 1], [6, 1], [6, 3], [4, 3], [4, 2], [2, 2]]
  const lower = surfacePolygons(perimeter, [opening], rectangle(0, 0, 4, 6))
  const upper = surfacePolygons(perimeter, [opening], rectangle(4, 0, 4, 6))
  assert.ok(Math.abs(area(lower) - 22) < 1e-8)
  assert.ok(Math.abs(area(upper) - 20) < 1e-8)
  assert.ok(lower.flat().every(([x]) => x <= 4 + 1e-8))
  assert.ok(upper.flat().every(([x]) => x >= 4 - 1e-8))
})

test('clipped floor and ceiling slabs include upward and downward faces at the requested thickness', () => {
  const geometry = surfaceGeometry(rectangle(0, 0, 4, 4), [rectangle(1, 1, 2, 2)], undefined, .2)
  geometry.computeBoundingBox()
  assert.equal(geometry.boundingBox!.max.y, 0)
  assert.ok(Math.abs(geometry.boundingBox!.min.y + .2) < 1e-7)
  const normals = geometry.getAttribute('normal')
  assert.ok(Array.from({ length: normals.count }, (_, i) => normals.getY(i)).some(y => y > .99))
  assert.ok(Array.from({ length: normals.count }, (_, i) => normals.getY(i)).some(y => y < -.99))
  geometry.dispose()
})
