import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectSnapshotSchema, defaultDesignCustomization, type Point2D } from '../src/index.ts'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'

const rect = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
const evidence = { confidence: 'inferred' as const, note: 'Synthetic annex for schema validation.' }
function scene() {
  const value = buildProjectSnapshot(), perimeter = rect(0, 0, 8, 4)
  value.apartment = { ...value.apartment, perimeter, walls: [], windows: [], doors: [], rooms: [{ id: 'room', name: 'Room', polygon: perimeter, color: '#eeeeee', reportedArea: 32 }],
    floorRegions: [
      { id: 'main', polygon: rect(0, 0, 4, 4), floorElevation: 0, ceilingElevation: 2.8, evidence },
      { id: 'annex', polygon: rect(4, 0, 4, 4), floorElevation: -.127, ceilingElevation: 2.3368, evidence },
    ], floorOpenings: [{ id: 'stairs', polygon: rect(6.5, .5, 1, 1), evidence }],
  }
  value.apartment.walls = [{ id: 'wall', from: [0, 0], to: [8, 0], height: 2.8, thickness: .1, kind: 'exterior', estimated: true }]
  value.geometry.walls = [{ wallId: 'wall', solids: [] }]
  value.geometry.floor = { polygon: perimeter, elevation: -.127, thickness: .15 }
  value.geometry.ceiling = { polygon: perimeter, elevation: 2.8, thickness: .15 }
  value.geometry.contextSections.ceilingBase = value.placement.floorElevation + 2.8
  value.assets = [{ ...value.assets[0], id: 'cabinet', dimensions: [.8, 1, .5] }]
  value.fixtures = [{ id: 'fixture', assetId: 'cabinet', roomId: 'room', label: 'Cabinet', position: [5, -.127, 2], rotation: 0, evidence: 'Synthetic', placementStatus: 'estimated' }]
  return value
}

test('regional furniture may rest below zero and float above its floor, with exact JSON persistence', () => {
  const value = scene()
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(value))), value)
  value.fixtures[0].position[1] = .5
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, true, 'intentional shelf height is retained')
  for (const position of [[5, -.128, 2], [2, -.127, 2], [5, 1.34, 2], [7, 0, 1], [9, 0, 2]]) {
    value.fixtures[0].position = position as [number, number, number]
    assert.equal(ProjectSnapshotSchema.safeParse(value).success, false, `reject ${position}: below local floor, above local ceiling, void or outside`)
  }
})

test('inactive layouts and alternate architectures use their own regional limits', () => {
  const value = scene()
  value.editor = { schemaVersion: 1, activeArchitectureId: 'active', architectures: [{ id: 'active', name: 'Active', apartment: structuredClone(value.apartment), partitionWallIds: [], activeLayoutId: 'base', layouts: [{ id: 'base', name: 'Base', fixtures: structuredClone(value.fixtures) }, { id: 'alternative', name: 'Alternative', fixtures: structuredClone(value.fixtures) }] }] }
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, true)
  value.editor.architectures[0].layouts[1].fixtures[0].position[1] = -.2
  let result = ProjectSnapshotSchema.safeParse(value)
  assert.equal(result.success, false)
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'editor.architectures.0.layouts.1.fixtures.0.position'))
  value.editor.architectures[0].layouts.pop()
  const other = structuredClone(value.editor.architectures[0]); other.id = 'raised-annex'
  other.apartment.floorRegions![1].floorElevation = .1
  value.editor.architectures.push(other)
  result = ProjectSnapshotSchema.safeParse(value)
  assert.equal(result.success, false, 'inactive architecture cannot inherit active floor height')
})

test('fixed and fixture lights respect local heights while a light may illuminate a floor opening', () => {
  const value = scene(); value.customization = defaultDesignCustomization()
  value.customization.lighting.lights = [{ id: 'lamp', name: 'Low lamp', roomId: 'room', position: [5, -.1, 2], enabled: true, kelvin: 3000, lumens: 300 }]
  value.fixtures[0].light = { offset: [0, .02, 0], enabled: true, kelvin: 3000, lumens: 200 }
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, true)
  value.customization.lighting.lights[0].position = [7, 2, 1]
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, true, 'light over stair opening is valid')
  value.customization.lighting.lights[0].position[1] = 2.34
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, false, 'global ceiling cannot hide a local ceiling violation')
  value.customization.lighting.lights[0].position = [5, -.128, 2]
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, false)
  value.customization.lighting.lights = []
  value.fixtures[0].light.offset[1] = -.01
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, false, 'attached emission cannot fall below local floor')
})

test('legacy scenes preserve their zero floor constraint and unchanged valid contents', () => {
  const value = buildProjectSnapshot()
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(value))), value)
  value.fixtures[0].position[1] = -.01
  assert.equal(ProjectSnapshotSchema.safeParse(value).success, false)
})
