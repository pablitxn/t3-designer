import assert from 'node:assert/strict'
import test from 'node:test'
import { type Point2D, type ProjectSnapshot, type StairGeometry } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { buildWalkWorld, findWalkSpawn, initialWalkDoorStates, isWalkPositionFree, moveWalkBody, roomAtPosition, stepWalkVertical, walkLevelAtPosition, type WalkFoundationContext, type WalkVerticalState, type WalkWorld } from '../src/walkthrough/navigation.ts'

const evidence = { confidence: 'inferred' as const, note: 'Synthetic circulation regression geometry, not a measured property.' }
const square: Point2D[] = [[0, 0], [8, 0], [8, 8], [0, 8]]
const hole: Point2D[] = [[3.25, 1.35], [7.2, 1.35], [7.2, 4.05], [4, 4.05], [4, 2.65], [3.25, 2.65]]
function scene(y = 0): ProjectSnapshot {
  const value = buildProjectSnapshot()
  value.placement.position = [0, y, 0]; value.placement.rotationY = 0; value.placement.floorElevation = y
  value.apartment.perimeter = structuredClone(square)
  value.apartment.rooms = [{ id: 'room', name: 'Room', polygon: structuredClone(square), color: '#ffffff', reportedArea: 64 }]
  value.apartment.walls = []; value.apartment.windows = []; value.apartment.doors = []; value.fixtures = []
  value.geometry.floor = { polygon: structuredClone(square), elevation: 0, thickness: .15 }
  value.geometry.ceiling = { polygon: structuredClone(square), elevation: 2.9, thickness: .15 }
  return value
}
function setup() {
  const lower = scene(), upper = scene(3.1)
  lower.apartment.ceilingOpenings = [{ id: 'lower-hole', polygon: structuredClone(hole), evidence }]
  upper.apartment.floorOpenings = [{ id: 'upper-hole', polygon: structuredClone(hole), evidence }]
  const geometry: StairGeometry = { width: 1, flights: [{ from: [2, 0, 2], to: [6, 2, 2], steps: 12 }, { from: [6, 2, 3.4], to: [4, 3.1, 3.4], steps: 6 }], landings: [{ polygon: [[6, 1.5], [7, 1.5], [7, 3.9], [6, 3.9]], elevation: 2 }], evidence }
  const context: WalkFoundationContext = { levels: [{ id: 'lower', name: 'Lower', elevation: 0, scene: lower }, { id: 'upper', name: 'Upper', elevation: 3.1, scene: upper }], activeLevelId: 'lower', connections: [{ id: 'main-stair', kind: 'stairs', fromLevelId: 'lower', toLevelId: 'upper', notes: 'U stair', geometry }] }
  return { lower, upper, context }
}
function walk(world: WalkWorld, from: Point2D, state: WalkVerticalState, toward: Point2D) {
  let position = from, vertical = state
  const distance = Math.hypot(toward[0] - from[0], toward[1] - from[1]), count = Math.ceil(distance / .025)
  const displacement: Point2D = [(toward[0] - from[0]) / count, (toward[1] - from[1]) / count]
  for (let frame = 0; frame < count; frame++) {
    const move = moveWalkBody(world, position, displacement, 1.65, vertical)
    position = move.position; vertical = stepWalkVertical(world, position, 1.65, move.vertical, 1 / 60, false)
    assert.ok(isWalkPositionFree(world, position, 1.65, vertical.offset), `free at ${position}, feet ${vertical.offset}`)
  }
  return { position, vertical }
}
const grounded = (offset = 0): WalkVerticalState => ({ offset, velocity: 0, grounded: true })

test('continuous U stair ascent, landing turn and descent preserve floor identity without teleportation', () => {
  const { lower, context } = setup(), before = JSON.stringify(context)
  const world = buildWalkWorld(lower, initialWalkDoorStates(lower, context), context)
  let result = { position: [1.7, 2] as Point2D, vertical: grounded() }
  const path: Point2D[] = [[6.5, 2], [6.5, 3.4], [3.7, 3.4]]
  for (const target of path) { result = walk(world, result.position, result.vertical, target); assert.ok(Math.hypot(result.position[0] - target[0], result.position[1] - target[1]) < .04, `reached ${target}; actual ${JSON.stringify(result)}`) }
  assert.ok(Math.abs(result.vertical.offset - 3.1) < 1e-7)
  assert.equal(walkLevelAtPosition(world, result.position, result.vertical.offset), 'upper')
  assert.equal(roomAtPosition(world, result.position, result.vertical.offset)?.id, 'upper:room')
  for (const target of [[6.5, 3.4], [6.5, 2], [1.7, 2]] as Point2D[]) result = walk(world, result.position, result.vertical, target)
  assert.ok(Math.abs(result.position[0] - 1.7) < .04)
  assert.equal(result.vertical.offset, 0)
  assert.equal(walkLevelAtPosition(world, result.position, result.vertical.offset), 'lower')
  assert.equal(JSON.stringify(context), before)
})

test('upper slabs and a missing ceiling opening block ascent, while floor overlap never lifts a ground-floor visitor', () => {
  const { lower, context } = setup()
  const full = buildWalkWorld(lower, undefined, context)
  const flat = walk(full, [1, 6], grounded(), [7, 6])
  assert.equal(flat.vertical.offset, 0)
  assert.equal(walkLevelAtPosition(full, flat.position, flat.vertical.offset), 'lower')
  lower.apartment.ceilingOpenings = []
  const blocked = walk(buildWalkWorld(lower, undefined, context), [1.7, 2], grounded(), [6.5, 2])
  assert.ok(blocked.position[0] < 4.4)
  assert.ok(blocked.vertical.offset < 1.2)
})

test('a local annex threshold supports walking down and back up with its own headroom', () => {
  const lower = scene()
  lower.apartment.floorRegions = [
    { id: 'main', polygon: [[0, 0], [4, 0], [4, 8], [0, 8]], floorElevation: 0, ceilingElevation: 2.9, evidence },
    { id: 'annex', polygon: [[4, 0], [8, 0], [8, 8], [4, 8]], floorElevation: -.127, ceilingElevation: 2.3368, evidence },
  ]
  const world = buildWalkWorld(lower)
  assert.equal(world.floorElevation, -.127)
  const down = walk(world, [2, 4], grounded(.127), [6, 4])
  assert.equal(down.vertical.offset, 0)
  const up = walk(world, down.position, down.vertical, [2, 4])
  assert.equal(up.vertical.offset, .127)
  assert.equal(isWalkPositionFree(world, [6, 4], 2.4, 0), false)
  assert.ok(findWalkSpawn(world)?.feetOffset !== undefined)
})

test('flight side rails prevent a shortcut off the stair and upper-floor spawn uses actual elevation', () => {
  const { lower, upper, context } = setup(), world = buildWalkWorld(lower, undefined, context)
  const onStair = walk(world, [1.7, 2], grounded(), [4.5, 2])
  const blocked = walk(world, onStair.position, onStair.vertical, [4.5, 3])
  assert.ok(blocked.position[1] <= 2.3 + 1e-7)
  const upperWorld = buildWalkWorld(upper, undefined, { ...context, activeLevelId: 'upper' })
  const spawn = findWalkSpawn(upperWorld)
  assert.ok(spawn)
  assert.equal(spawn.levelId, 'upper')
  assert.ok(Math.abs(spawn.feetOffset! - 3.1) < 1e-7)
  assert.ok(isWalkPositionFree(upperWorld, spawn.position, 1.65, spawn.feetOffset))
})
