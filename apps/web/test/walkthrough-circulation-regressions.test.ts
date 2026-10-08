import assert from 'node:assert/strict'
import test from 'node:test'
import { type FoundationCandidate, type Point2D, type ProjectSnapshot, type StairGeometry } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { assembleFoundationScenes, rebaseBuildingFoundation } from '../src/private/foundation-scenes.ts'
import { buildWalkWorld, initialWalkDoorStates, isWalkPositionFree, moveWalkBody, stepWalkVertical, withWalkDoorStates, type WalkFoundationContext, type WalkVerticalState, type WalkWorld } from '../src/walkthrough/navigation.ts'
import { stairGuardSegments } from '../src/walkthrough/stair-guards.ts'

const evidence = { confidence: 'inferred' as const, note: 'Synthetic regression; not a surveyed property.' }
const rect = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
const hole: Point2D[] = [[3.25, 1.35], [7.2, 1.35], [7.2, 4.05], [4, 4.05], [4, 2.65], [3.25, 2.65]]
function scene(y = 0): ProjectSnapshot {
  const value = buildProjectSnapshot(), perimeter = rect(0, 0, 8, 8)
  value.placement.position = [0, y, 0]; value.placement.rotationY = 0; value.placement.floorElevation = y
  value.apartment.perimeter = perimeter
  value.apartment.rooms = [{ id: 'room', name: 'Room', polygon: perimeter, color: '#ffffff', reportedArea: 64 }]
  value.apartment.walls = [{ id: 'north', from: [0, 0], to: [8, 0], height: 2.9, thickness: .1, kind: 'exterior', estimated: true }]
  value.apartment.windows = []; value.apartment.doors = []; value.fixtures = []
  value.geometry.walls = [{ wallId: 'north', solids: [] }]
  value.geometry.floor = { polygon: perimeter, elevation: 0, thickness: .15 }
  value.geometry.ceiling = { polygon: perimeter, elevation: 2.9, thickness: .15 }
  value.geometry.contextSections.ceilingBase = y + 2.9
  return value
}
function setup() {
  const lower = scene(), upper = scene(3.1)
  lower.apartment.ceilingOpenings = [{ id: 'lower-hole', polygon: structuredClone(hole), evidence }]
  upper.apartment.floorOpenings = [{ id: 'upper-hole', polygon: structuredClone(hole), evidence }]
  const geometry: StairGeometry = { width: 1, flights: [{ from: [2, 0, 2], to: [6, 2, 2], steps: 12 }, { from: [6, 2, 3.4], to: [4, 3.1, 3.4], steps: 6 }], landings: [{ polygon: rect(6, 1.5, 1, 2.4), elevation: 2 }], evidence }
  const context: WalkFoundationContext = { levels: [{ id: 'lower', name: 'Lower', elevation: 0, scene: lower }, { id: 'upper', name: 'Upper', elevation: 3.1, scene: upper }], activeLevelId: 'lower', connections: [{ id: 'stair', kind: 'stairs', fromLevelId: 'lower', toLevelId: 'upper', notes: 'U stair', geometry }] }
  return { lower, upper, context, geometry }
}
const grounded = (offset = 0): WalkVerticalState => ({ offset, velocity: 0, grounded: true })
function walk(world: WalkWorld, from: Point2D, state: WalkVerticalState, toward: Point2D) {
  let position = from, vertical = state
  const count = Math.ceil(Math.hypot(toward[0] - from[0], toward[1] - from[1]) / .025)
  const displacement: Point2D = [(toward[0] - from[0]) / count, (toward[1] - from[1]) / count]
  for (let frame = 0; frame < count; frame++) {
    const move = moveWalkBody(world, position, displacement, 1.65, vertical)
    position = move.position; vertical = stepWalkVertical(world, position, 1.65, move.vertical, 1 / 60, false)
    assert.ok(isWalkPositionFree(world, position, 1.65, vertical.offset), `free body at ${position}, feet ${vertical.offset}`)
  }
  return { position, vertical }
}
function ascend(world: WalkWorld, arrival: Point2D = [3, 3.4]) {
  let result = { position: [1.7, 2] as Point2D, vertical: grounded() }
  for (const target of [[6.5, 2], [6.5, 3.4], arrival] as Point2D[]) result = walk(world, result.position, result.vertical, target)
  return result
}
function doorAtArrival(value: ProjectSnapshot, openness: number) {
  value.apartment.walls.push({ id: 'partition', from: [3.4, 0], to: [3.4, 8], height: 2.9, thickness: .1, kind: 'interior', estimated: true })
  value.apartment.doors.push({ id: 'shared-door-id', wallId: 'partition', offset: 2.8, width: 1.2, height: 2.4, hinge: 'start', opensToward: 1, locationConfidence: 'schematic', estimated: true })
  value.customization = { wallColors: {}, floors: {}, doors: { 'shared-door-id': { style: 'panel', color: '#ffffff', openness } }, windows: {}, lighting: { naturalEnabled: true, artificialEnabled: true, lights: [] } }
}

test('a building rebase preserves the continuous stair frame including a shared rotated placement', () => {
  const { lower, context } = setup()
  const common = { summary: 'Synthetic', assumptions: [], unknowns: [], sources: [] }
  const dwelling: Extract<FoundationCandidate, { target: 'dwelling' }> = { ...common, target: 'dwelling', levels: context.levels.map((level, index) => ({ levelId: level.id, name: level.name, levelIndex: index, elevation: level.elevation, ceilingHeight: 2.9, scaleEvidence: 'Synthetic metres', apartment: level.scene.apartment })), connections: context.connections }
  const building: Extract<FoundationCandidate, { target: 'building' }> = { ...common, target: 'building', site: lower.site, buildings: lower.buildings, roads: lower.roads, parcel: lower.parcel }
  const levels = assembleFoundationScenes(lower.project.id, 'Rebase', dwelling, building)
  for (const level of levels) level.scene.placement.rotationY = .4
  const beforeContext = { ...context, levels: levels.map((level, i) => ({ ...level, elevation: context.levels[i].elevation })) }
  const before = buildWalkWorld(levels[0].scene, undefined, beforeContext)
  const updated = structuredClone(building), target = updated.buildings.find(item => item.isTarget)!
  target.groundOffset += 7.25; target.footprint = target.footprint.map(([x, z]) => [x + 12, z - 5])
  const model = { activeLevelId: 'lower', levels, dwelling: { versionId: 'dwelling', candidate: dwelling }, building: { versionId: 'building', candidate: building } }
  const rebased = rebaseBuildingFoundation(model, assembleFoundationScenes(lower.project.id, 'Rebase', dwelling, updated))
  const afterContext = { ...context, levels: rebased.map((level, i) => ({ ...level, elevation: context.levels[i].elevation })) }
  const after = buildWalkWorld(rebased[0].scene, undefined, afterContext)
  assert.deepEqual(after.ramps, before.ramps)
  assert.equal(after.floors!.length, before.floors!.length)
  after.floors!.forEach((floor, index) => {
    assert.ok(Math.abs(floor.elevation - before.floors![index].elevation) < 1e-8)
    assert.deepEqual({ ...floor, elevation: 0 }, { ...before.floors![index], elevation: 0 })
  })
  assert.equal(rebased[0].scene.placement.position[1] - levels[0].scene.placement.position[1], 7.25)
  const reached = ascend(after)
  assert.ok(Math.abs(reached.position[0] - 3) < .03)
  assert.ok(Math.abs(reached.vertical.offset - 3.1) < 1e-8)
  const upper = buildWalkWorld(rebased[1].scene, undefined, { ...afterContext, activeLevelId: 'upper' })
  assert.ok(Math.abs(upper.floorElevation + 3.1) < 1e-8)
  assert.equal(upper.ramps![1].to[1], 0, 'upper local stair datum excludes the rebased building height')
})

test('identical door IDs on different floors retain independent settings and collision', () => {
  const { lower, upper, context } = setup(); doorAtArrival(lower, 1); doorAtArrival(upper, 0)
  const states = initialWalkDoorStates(lower, context)
  assert.deepEqual(states, { 'lower:shared-door-id': 1, 'upper:shared-door-id': 0 })
  const world = buildWalkWorld(lower, states, context)
  assert.equal(isWalkPositionFree(world, [3.4, 3.4], 1.65, 0), true)
  assert.equal(isWalkPositionFree(world, [3.4, 3.4], 1.65, 3.1), false)
  const opened = withWalkDoorStates(world, { ...states, 'upper:shared-door-id': 1 })
  assert.equal(isWalkPositionFree(opened, [3.4, 3.4], 1.65, 3.1), true)
  assert.equal(states['upper:shared-door-id'], 0, 'visit state remains immutable')
})

test('furniture and a closed arrival door block stair exit without teleporting through them', () => {
  const fixture = setup(), asset = { ...fixture.upper.assets[0], id: 'arrival-cabinet', dimensions: [.8, 1.2, 1] as [number, number, number] }
  fixture.upper.assets = [asset]
  fixture.upper.fixtures = [{ id: 'cabinet', assetId: asset.id, roomId: 'room', label: 'Cabinet', position: [3.2, 0, 3.4], rotation: 0, evidence: 'Synthetic', placementStatus: 'estimated' }]
  const furnished = ascend(buildWalkWorld(fixture.lower, undefined, fixture.context))
  assert.ok(furnished.position[0] >= 3.8 - 1e-8)
  assert.ok(furnished.vertical.offset > 3, 'arrival obstacle does not drop the visitor downstairs')
  const { lower, upper, context } = setup(); doorAtArrival(upper, 0)
  const world = buildWalkWorld(lower, initialWalkDoorStates(lower, context), context), closed = ascend(world)
  assert.ok(closed.position[0] > 3.6)
  const open = withWalkDoorStates(world, { 'upper:shared-door-id': 1 })
  const passed = walk(open, closed.position, closed.vertical, [3, 3.4])
  assert.ok(Math.abs(passed.position[0] - 3) < .03)
})

test('explicit stairs cross a gap between storey envelopes without leaving the plan boundary', () => {
  const { lower, context } = setup(); lower.geometry.ceiling.elevation = 2.6
  const world = buildWalkWorld(lower, undefined, context), result = ascend(world)
  assert.ok(Math.abs(result.position[0] - 3) < .03)
  assert.ok(Math.abs(result.vertical.offset - 3.1) < 1e-8)
  assert.equal(isWalkPositionFree(world, [-.1, 3.4], 1.65, 2.8), false)
})

test('a raised door sill across the annex supports both directions without treating furniture as a step', () => {
  const value = scene()
  value.apartment.floorRegions = [{ id: 'main', polygon: rect(0, 0, 4, 8), floorElevation: 0, ceilingElevation: 2.9, evidence }, { id: 'annex', polygon: rect(4, 0, 4, 8), floorElevation: -.127, ceilingElevation: 2.3368, evidence }]
  value.apartment.walls.push({ id: 'annex-wall', from: [4, 0], to: [4, 8], height: 2.4638, baseElevation: -.127, thickness: .15, kind: 'interior', estimated: true })
  value.apartment.doors = [{ id: 'annex-door', wallId: 'annex-wall', offset: 3.4, width: 1.2, height: 2, thresholdHeight: .127, hinge: 'start', opensToward: 1, locationConfidence: 'schematic', estimated: true, appearance: 'passage' }]
  const world = buildWalkWorld(value)
  const down = walk(world, [2, 4], grounded(.127), [6, 4])
  assert.ok(Math.abs(down.position[0] - 6) < .03); assert.equal(down.vertical.offset, 0)
  const up = walk(world, down.position, down.vertical, [2, 4])
  assert.ok(Math.abs(up.position[0] - 2) < .03); assert.equal(up.vertical.offset, .127)
})

test('a fall through an upper floor aperture lands on a closed lower ceiling instead of entering its solid', () => {
  const { lower, context } = setup(); lower.apartment.ceilingOpenings = []
  const world = buildWalkWorld(lower, undefined, context), point: Point2D = [5, 2]
  let state: WalkVerticalState = { offset: 3.3, velocity: -2, grounded: false }
  for (let i = 0; i < 80; i++) {
    state = stepWalkVertical(world, point, 1.65, state, 1 / 60, false)
    assert.ok(isWalkPositionFree(world, point, 1.65, state.offset))
  }
  assert.equal(state.grounded, true); assert.ok(Math.abs(state.offset - 3.05) < 1e-8)
})

test('jump sweeps stop at the current local ceiling and unsupported floor overlap never lifts a visitor', () => {
  const { lower, context } = setup(); lower.geometry.ceiling.elevation = 2
  const world = buildWalkWorld(lower, undefined, context), point: Point2D = [2, 6]
  let state = grounded(), maximum = 0
  for (let i = 0; i < 80; i++) {
    state = stepWalkVertical(world, point, 1.65, state, .05, i === 0)
    maximum = Math.max(maximum, state.offset)
    assert.ok(isWalkPositionFree(world, point, 1.65, state.offset))
  }
  assert.ok(maximum > .1 && maximum <= .23 + 1e-8); assert.equal(state.offset, 0)
  const moved = moveWalkBody(world, point, [50, 0], 1.65, grounded())
  assert.equal(moved.vertical.offset, 0)
  assert.ok(moved.position[0] <= 6, 'large displacement remains capped without a new spawn')
})

test('collinear landing vertices do not extend rail cuts outside their edge or block a flight portal', () => {
  const { geometry } = setup()
  geometry.landings[0].polygon = [[6, 1.5], [7, 1.5], [7, 3.9], [6, 3.9], [6, 2.9]]
  const rails = stairGuardSegments(geometry).slice(geometry.flights.length * 2)
  for (const rail of rails) {
    for (const point of [rail.from, rail.to]) assert.ok(point[0] >= 6 && point[0] <= 7 && point[2] >= 1.5 && point[2] <= 3.9, `rail endpoint outside landing: ${point}`)
    if (rail.from[0] === 6 && rail.to[0] === 6) {
      const low = Math.min(rail.from[2], rail.to[2]), high = Math.max(rail.from[2], rail.to[2])
      assert.ok(high <= 1.5 || low >= 2.5, 'first flight portal stays open')
      assert.ok(high <= 2.9 || low >= 3.9, 'second flight portal stays open')
    }
  }
})
