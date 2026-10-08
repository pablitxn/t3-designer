import assert from 'node:assert/strict'
import test from 'node:test'
import type { Point2D } from '@t3-designer/scene-schema'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { addPartition, addFixture, duplicateLayout, rebuildApartmentGeometry, selectLayout, updateFixture } from '../src/editor/model.ts'

function regionalScene() {
  const snapshot = structuredClone(buildProjectSnapshot())
  const rectangle = (x: number, width: number): Point2D[] => [[x, 0], [x + width, 0], [x + width, 4], [x, 4]]
  const polygon = rectangle(0, 8)
  snapshot.apartment.perimeter = polygon
  snapshot.apartment.rooms = [{ id: 'lower', name: 'Anexo', polygon: rectangle(0, 4), color: '#ffffff', reportedArea: 16 }, { id: 'main', name: 'Principal', polygon: rectangle(4, 4), color: '#ffffff', reportedArea: 16 }]
  snapshot.apartment.walls = polygon.map((from, index) => ({ id: `w${index}`, from, to: polygon[(index + 1) % 4], height: 2.7, thickness: .1, kind: 'exterior' as const, estimated: true }))
  snapshot.apartment.doors = []; snapshot.apartment.windows = []; snapshot.fixtures = []
  delete snapshot.apartment.balcony; delete snapshot.customization; delete snapshot.editor
  snapshot.apartment.floorRegions = snapshot.apartment.rooms.map((room, index) => ({ id: room.id, polygon: room.polygon, floorElevation: index === 0 ? -.127 : 0, ceilingElevation: index === 0 ? 2.4 : 2.7, evidence: { confidence: 'inferred', note: 'Test split-level' } }))
  snapshot.geometry.floor.elevation = -.127
  snapshot.geometry = rebuildApartmentGeometry(snapshot)
  return snapshot
}

test('new furniture starts on the regional floor and explicit horizontal moves follow it without rewriting variants', () => {
  let snapshot = addFixture(regionalScene(), 'low-table', 'regional-table', 'lower')
  assert.equal(snapshot.fixtures[0].position[1], -.127)
  snapshot = duplicateLayout(snapshot, 'move', 'Move')
  snapshot = updateFixture(snapshot, 'regional-table', { position: [6, -.127, 2] })
  assert.deepEqual(snapshot.fixtures[0].position, [6, 0, 2])
  snapshot = selectLayout(snapshot, 'layout-original')
  assert.equal(snapshot.fixtures[0].position[1], -.127)
  assert.equal(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot))).fixtures[0].position[1], -.127)
})

test('raised objects keep intentional height while floor and local ceiling limits are enforced', () => {
  let snapshot = addFixture(regionalScene(), 'low-table', 'raised', 'main', [6, .4, 2])
  snapshot = updateFixture(snapshot, 'raised', { position: [2, .4, 2] })
  assert.equal(snapshot.fixtures[0].position[1], .4)
  assert.throws(() => updateFixture(snapshot, 'raised', { position: [2, -.2, 2] }), /below the floor/)
  assert.throws(() => updateFixture(snapshot, 'raised', { position: [2, 2.3, 2] }), /ceiling/)
  snapshot.apartment.floorOpenings = [{ id: 'hole', polygon: [[1, 1], [3, 1], [3, 3], [1, 3]], evidence: { confidence: 'inferred', note: 'Test stairwell' } }]
  assert.throws(() => updateFixture(snapshot, 'raised', { position: [2, .5, 2] }), /stair opening/)
})

test('materialized wall solids retain the regional base and door threshold after an architecture edit', () => {
  const snapshot = regionalScene(), wall = snapshot.apartment.walls[0]
  wall.baseElevation = -.127
  snapshot.apartment.doors = [{ id: 'door', wallId: wall.id, offset: 1, width: 1, height: 2, thresholdHeight: .127, hinge: 'start', opensToward: 1, estimated: true, locationConfidence: 'schematic' }]
  const solids = rebuildApartmentGeometry(snapshot).walls[0].solids
  assert.ok(solids.some(solid => Math.abs(solid.position[1] - solid.scale[1] / 2 + .127) < 1e-8))
  const threshold = solids.find(solid => solid.scale[0] === 1 && Math.abs(solid.scale[1] - .127) < 1e-8)!
  assert.ok(threshold)
  assert.ok(Math.abs(threshold.position[1] + .127 / 2) < 1e-8)
})


test('a new annex partition rests on its regional floor and cannot span incompatible local levels', () => {
  const source = regionalScene()
  const scene = addPartition(source, { id: 'annex-divider', from: [1, 2], to: [3, 2], height: 2.5, thickness: .1 })
  const wall = scene.apartment.walls.find(wall => wall.id === 'annex-divider')!
  assert.equal(wall.baseElevation, -.127)
  assert.equal(wall.height, 2.5)
  assert.ok(scene.geometry.walls.find(item => item.wallId === wall.id)!.solids.every(solid => Math.abs(solid.position[1] - solid.scale[1] / 2 + .127) < 1e-8))
  assert.throws(() => addPartition(source, { id: 'too-tall', from: [1, 2], to: [3, 2], height: 2.6, thickness: .1 }), /Invalid partition dimensions/)
  assert.throws(() => addPartition(source, { id: 'mixed', from: [3, 2], to: [5, 2], height: 2.4, thickness: .1 }), /different floor regions/)
  source.apartment.floorOpenings = [{ id: 'void', polygon: [[1.5, 1], [2.5, 1], [2.5, 3], [1.5, 3]], evidence: { confidence: 'inferred', note: 'Test stair opening' } }]
  assert.throws(() => addPartition(source, { id: 'over-hole', from: [1, 2], to: [3, 2], height: 2.4, thickness: .1 }), /stair opening/)
})
