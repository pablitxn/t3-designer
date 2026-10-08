import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { polygonArea } from '@t3-designer/geometry'
import { ProjectSnapshotSchema, type Point2D } from '@t3-designer/scene-schema'
import { contextBuildingVolumes, projectContextCutaways } from '../src/private/project-context-cutaway.ts'
import { surfacePolygons } from '../src/components/surface-geometry.ts'

const rectangle = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
const area = (pieces: Point2D[][]) => pieces.reduce((sum, piece) => sum + polygonArea(piece), 0)

test('the pilot annex is cut away on First but retained when Second only touches its boundary', () => {
  const annex = { footprint: rectangle(-23.7736, -.95, 12.75, 3.5), groundOffset: -.127, height: 2.9464 }
  const before = structuredClone(annex)
  assert.deepEqual(contextBuildingVolumes(annex, [{ polygon: annex.footprint, base: -.127 - .15, ceiling: 2.8194 }]), [])
  const upper = contextBuildingVolumes(annex, [{ polygon: rectangle(-11.0236, -.95, 11.0236, 6.73), base: 3.2766 - .15, ceiling: 3.2766 + 2.72 }])
  assert.deepEqual(upper, [{ polygon: annex.footprint, holes: undefined, base: -.127, height: 2.9464 }])
  assert.deepEqual(annex, before)
})

test('partial overlap opens active rooms and preserves mass outside them and below their slab', () => {
  const building = { footprint: rectangle(0, 0, 6, 4), groundOffset: 0, height: 6 }
  const room = rectangle(2, 1, 6, 2)
  const volumes = contextBuildingVolumes(building, [{ polygon: room, base: .85, ceiling: 3 }])
  const bottom = volumes.filter(volume => volume.base === 0)
  const above = volumes.filter(volume => volume.base === .85)
  assert.equal(area(bottom.map(volume => volume.polygon)), 24)
  assert.ok(bottom.every(volume => volume.height === .85))
  assert.ok(Math.abs(area(above.map(volume => volume.polygon)) - 16) < 1e-8)
  assert.ok(above.every(volume => volume.height === 5.15))
  assert.ok(above.every(volume => area(surfacePolygons(volume.polygon, [], room)) < 1e-8))
})

test('neighbors, courtyard voids and vertically separate buildings retain their complete volumes', () => {
  const building = { footprint: rectangle(0, 0, 6, 4), holes: [rectangle(2, 1, 2, 2)], groundOffset: 0, height: 6 }
  for (const region of [
    { polygon: rectangle(6, 0, 2, 4), base: 0, ceiling: 3 },
    { polygon: rectangle(2.5, 1.5, 1, 1), base: 0, ceiling: 3 },
    { polygon: building.footprint, base: 7, ceiling: 10 },
  ]) assert.deepEqual(contextBuildingVolumes(building, [region]), [{ polygon: building.footprint, holes: building.holes, base: 0, height: 6 }])
})

test('separate floor regions cut context at their own elevations', () => {
  const building = { footprint: rectangle(0, 0, 4, 2), groundOffset: -.2, height: 4.2 }
  const volumes = contextBuildingVolumes(building, [
    { polygon: rectangle(0, 0, 2, 2), base: -.15, ceiling: 2.7 },
    { polygon: rectangle(2, 0, 2, 2), base: 1.85, ceiling: 4.7 },
  ])
  assert.equal(area(volumes.filter(volume => volume.base === -.2).map(volume => volume.polygon)), 8)
  assert.equal(area(volumes.filter(volume => volume.base === -.15).map(volume => volume.polygon)), 4)
  assert.equal(volumes.filter(volume => volume.base >= 1.85).length, 0)
})

test('cutaway regions follow saved translation, rotation and local floor elevations without changing the solar model', () => {
  const scene = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))
  scene.placement.position = [10, 5, 20]
  scene.placement.rotationY = Math.PI / 2
  scene.apartment.floorRegions = [{ id: 'annex', polygon: rectangle(0, 0, 2, 3), floorElevation: -.127, ceilingElevation: 2.8194, evidence: { confidence: 'user', note: 'Controlled split-level context regression.' } }]
  const before = structuredClone(scene)
  const [region] = projectContextCutaways(scene)
  assert.deepEqual(region.polygon.map(point => point.map(value => Math.round(value * 1e8) / 1e8)), [[10, 20], [10, 18], [13, 18], [13, 20]])
  assert.equal(region.base, 5 - .127 - scene.geometry.floor.thickness)
  assert.equal(region.ceiling, 5 + 2.8194)
  assert.deepEqual(scene, before)
})
