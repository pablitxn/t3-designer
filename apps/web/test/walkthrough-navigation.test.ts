import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultDesignCustomization, type Point2D, type ProjectSnapshot, type Wall } from '@t3-designer/scene-schema'
import { polygonCentroid } from '@t3-designer/geometry'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { addFixture, duplicateLayout, ensureEditor, selectLayout } from '../src/editor/model.ts'
import { buildWalkWorld, canSetWalkDoorOpenness, findWalkDoorTarget, findWalkSpawn, initialWalkDoorStates, isWalkPositionFree, moveWalkPosition, resolveWalkDoorOpenness, roomAtPosition, stepWalkVertical, walkDoorLeaf, withWalkDoorStates, WALK_CROUCH_HEIGHT, WALK_EYE_HEIGHT, WALK_RADIUS, type WalkDoorPose, type WalkVerticalState } from '../src/walkthrough/navigation.ts'

const baseline = buildProjectSnapshot()
const square: Point2D[] = [[0, 0], [8, 0], [8, 8], [0, 8]]
function scene(partition = true): ProjectSnapshot {
  const snapshot = structuredClone(baseline)
  snapshot.apartment.perimeter = structuredClone(square)
  snapshot.geometry.floor = { polygon: structuredClone(square), elevation: 0, thickness: .14 }
  snapshot.geometry.ceiling = { polygon: structuredClone(square), elevation: 2.7, thickness: .18 }
  snapshot.apartment.rooms = [{ id: 'room', name: 'Room', polygon: structuredClone(square), color: '#ffffff', reportedArea: 64 }]
  snapshot.apartment.walls = square.map((from, index): Wall => ({ id: `edge-${index}`, from, to: square[(index + 1) % square.length], height: 2.7, thickness: .1, kind: 'exterior', estimated: true }))
  if (partition) snapshot.apartment.walls.push({ id: 'partition', from: [4, 0], to: [4, 8], height: 2.7, thickness: .1, kind: 'interior', estimated: true })
  snapshot.apartment.doors = partition ? [{ id: 'passage', appearance: 'passage', wallId: 'partition', offset: 3, width: 1.5, height: 2.1, hinge: 'start', opensToward: 1, estimated: true, locationConfidence: 'schematic' }] : []
  snapshot.apartment.windows = []
  snapshot.fixtures = []
  return snapshot
}
function fixture(snapshot: ProjectSnapshot, dimensions: [number, number, number], position: [number, number, number], rotation = 0) {
  snapshot.assets = [{ ...baseline.assets[0], id: 'obstacle', dimensions }]
  snapshot.fixtures = [{ ...baseline.fixtures[0], id: 'obstacle-placement', roomId: 'room', assetId: 'obstacle', position, rotation }]
}
function doorScene(): ProjectSnapshot {
  const snapshot = scene()
  snapshot.apartment.doors[0].appearance = 'panel'
  return snapshot
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen) }
  return value
}

test('canonical apartment with its initial door leaves starts safely without mutating the saved scene', () => {
  const snapshot = frozen(structuredClone(baseline)), before = JSON.stringify(snapshot)
  const world = buildWalkWorld(snapshot)
  const spawn = findWalkSpawn(world)
  assert.ok(spawn)
  assert.equal(isWalkPositionFree(world, spawn.position), true)
  assert.equal(roomAtPosition(world, spawn.position)?.id, 'entrance')
  assert.ok(Number.isFinite(spawn.yaw))
  for (const id of ['living', 'kitchen', 'bedroom-1', 'bedroom-2', 'bathroom', 'wc']) {
    const roomSpawn = findWalkSpawn(world, id)
    assert.ok(roomSpawn, `${id} has a safe standing spawn`)
    assert.equal(roomAtPosition(world, roomSpawn.position)?.id, id)
    assert.ok(isWalkPositionFree(world, roomSpawn.position))
  }
  moveWalkPosition(world, spawn.position, [1, 0])
  assert.equal(JSON.stringify(snapshot), before)
  assert.equal(findWalkSpawn(world, 'missing'), null)
})

test('doors allow passage, jambs keep body clearance and walls stop a delayed movement frame', () => {
  const world = buildWalkWorld(scene())
  const through = moveWalkPosition(world, [2, 3.75], [4, 0])
  assert.ok(Math.abs(through[0] - 6) < 1e-7)
  assert.equal(through[1], 3.75)
  const stopped = moveWalkPosition(world, [2, 1], [4, 0])
  assert.ok(stopped[0] <= 4 - .05 - WALK_RADIUS + 1e-7)
  assert.ok(stopped[0] >= 3.65)
  assert.equal(stopped[1], 1)
  assert.equal(isWalkPositionFree(world, [4, 3.1]), false)
  assert.equal(isWalkPositionFree(world, [4, 3.75]), true)
})

test('horizontal motion slides along a blocking wall while staying on its original side', () => {
  const world = buildWalkWorld(scene())
  const moved = moveWalkPosition(world, [3.6, 1], [1, 1])
  assert.ok(moved[0] < 3.76)
  assert.ok(moved[1] > 1.95)
  assert.equal(isWalkPositionFree(world, moved), true)
})

test('window apertures remain barriers even when their sill is at floor level', () => {
  const snapshot = scene()
  snapshot.apartment.doors = []
  snapshot.apartment.windows = [{ id: 'window', wallId: 'partition', offset: 3, width: 1.5, height: 2.1, sillHeight: 0, estimated: true }]
  const world = buildWalkWorld(snapshot)
  assert.ok(moveWalkPosition(world, [2, 3.75], [4, 0])[0] < 4)
})

test('low door lintels require crouching and cannot be crossed at standing height', () => {
  const snapshot = scene()
  snapshot.apartment.doors[0].height = 1.2
  const world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4, 3.75], WALK_EYE_HEIGHT), false)
  assert.equal(isWalkPositionFree(world, [4, 3.75], WALK_CROUCH_HEIGHT), true)
  assert.ok(moveWalkPosition(world, [2, 3.75], [4, 0])[0] < 4)
  assert.ok(moveWalkPosition(world, [2, 3.75], [4, 0], WALK_CROUCH_HEIGHT)[0] > 5.9)
})

test('fixture footprints follow Three positive-Y rotation, rather than an unrotated or mirrored box', () => {
  const snapshot = scene(false)
  fixture(snapshot, [2, 1, .4], [4, 0, 4], Math.PI / 4)
  const world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4.65, 3.35]), false)
  assert.equal(isWalkPositionFree(world, [4.65, 4.65]), true)
  const moved = moveWalkPosition(world, [2, 4], [4, 0])
  assert.ok(moved[0] < 4)
  assert.equal(isWalkPositionFree(world, moved), true)
})

test('vertical bounds and floor elevation control standing and crouching clearance', () => {
  const snapshot = scene(false)
  fixture(snapshot, [2, .4, 2], [4, 1.3, 4])
  let world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4, 4]), false)
  assert.equal(isWalkPositionFree(world, [4, 4], WALK_CROUCH_HEIGHT), true)
  snapshot.geometry.floor.elevation = .5
  world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4, 4], WALK_CROUCH_HEIGHT), false, 'raising the floor raises the body into the shelf')
  snapshot.fixtures[0].position[1] = 1.8
  world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4, 4], WALK_CROUCH_HEIGHT), true)
  assert.equal(isWalkPositionFree(world, [4, 4]), false)
  snapshot.fixtures[0].position[1] = 0
  world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [4, 4]), true, 'an object completely below the floor does not block')
  snapshot.geometry.ceiling.elevation = 1.8
  world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [2, 2]), false)
  assert.equal(isWalkPositionFree(world, [2, 2], WALK_CROUCH_HEIGHT), true)
})

test('concave perimeter and door openings never allow walking outside the apartment', () => {
  const snapshot = scene(false)
  snapshot.apartment.perimeter = [[0, 0], [8, 0], [8, 3], [3, 3], [3, 8], [0, 8]]
  snapshot.apartment.doors = [{ id: 'main-entry', wallId: 'edge-3', offset: 3, width: 1.5, height: 2.1, hinge: 'start', opensToward: 1, estimated: true, locationConfidence: 'schematic' }]
  const world = buildWalkWorld(snapshot)
  assert.equal(isWalkPositionFree(world, [5, 5]), false)
  assert.equal(isWalkPositionFree(world, [2.9, 5]), false, 'body radius remains inside a concave edge')
  const stopped = moveWalkPosition(world, [1, 4], [-4, 0])
  assert.ok(stopped[0] >= WALK_RADIUS - 1e-7)
  assert.equal(isWalkPositionFree(world, stopped), true)
})

test('a furnished room finds a safe alternative, while a fully blocked room returns no spawn', () => {
  const snapshot = scene(false)
  fixture(snapshot, [2, 2, 2], [4, 0, 4])
  let world = buildWalkWorld(snapshot)
  const spawn = findWalkSpawn(world, 'room')
  assert.ok(spawn)
  assert.notDeepEqual(spawn.position, [4, 4])
  assert.ok(isWalkPositionFree(world, spawn.position))
  snapshot.assets[0].dimensions = [8, 2, 8]
  world = buildWalkWorld(snapshot)
  assert.equal(findWalkSpawn(world, 'room'), null)
  assert.equal(findWalkSpawn(world), null)
})

test('invalid motion is ignored and enormous displacement stays computationally and spatially bounded', () => {
  const world = buildWalkWorld(scene(false))
  const position: Point2D = [1, 1]
  assert.deepEqual(moveWalkPosition(world, position, [Infinity, 0]), position)
  assert.deepEqual(moveWalkPosition(world, position, [NaN, 0]), position)
  const moved = moveWalkPosition(world, position, [1e200, 0])
  assert.ok(moved[0] <= 5 + 1e-7)
  assert.ok(isWalkPositionFree(world, moved))
  assert.equal(isWalkPositionFree(world, [NaN, 1]), false)
  assert.equal(isWalkPositionFree(world, position, NaN), false)
  assert.equal(isWalkPositionFree(world, position, .1), false)
  assert.deepEqual(position, [1, 1])
  const recovered = moveWalkPosition(world, [NaN, 1], [1, 0])
  assert.ok(isWalkPositionFree(world, recovered))
})

test('switching a materialized layout changes collision without reading or mutating inactive versions', () => {
  const original = ensureEditor(structuredClone(baseline))
  const center = polygonCentroid(original.apartment.rooms.find(room => room.id === 'bedroom-1')!.polygon)
  const originalWorld = buildWalkWorld(original)
  assert.ok(isWalkPositionFree(originalWorld, center))
  const alternative = addFixture(duplicateLayout(original, 'walk-alternative', 'Walk alternative'), 'low-table', 'walk-table', 'bedroom-1', [center[0], 0, center[1]])
  assert.equal(isWalkPositionFree(buildWalkWorld(alternative), center), false)
  assert.equal(isWalkPositionFree(originalWorld, center), true)
  const restored = selectLayout(alternative, original.editor.architectures[0].activeLayoutId)
  assert.equal(isWalkPositionFree(buildWalkWorld(restored), center), true)
  assert.equal(alternative.fixtures.some(item => item.id === 'walk-table'), true)
  assert.equal(original.fixtures.some(item => item.id === 'walk-table'), false)
})

test('maximum eye height keeps real doorway clearance and a low ceiling cannot produce an unsafe standing spawn', () => {
  const world = buildWalkWorld(baseline)
  const door = baseline.apartment.doors.find(item => item.id === 'entrance-living')!
  const wall = baseline.apartment.walls.find(item => item.id === door.wallId)!
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
  const along = door.offset + door.width / 2
  const center: Point2D = [wall.from[0] + (wall.to[0] - wall.from[0]) / length * along, wall.from[1] + (wall.to[1] - wall.from[1]) / length * along]
  assert.equal(isWalkPositionFree(world, center, 1.9), true, 'the tallest UI eye height fits a 2.04m doorway including head clearance')
  assert.equal(isWalkPositionFree(world, center, 1.95), false)
  const low = scene(false)
  low.geometry.ceiling.elevation = 1.5
  const lowWorld = buildWalkWorld(low)
  assert.equal(findWalkSpawn(lowWorld), null)
  assert.equal(isWalkPositionFree(lowWorld, [4, 4], 1.2), true)
  const shorter = findWalkSpawn(lowWorld, undefined, 1.2)
  assert.ok(shorter)
  assert.ok(isWalkPositionFree(lowWorld, shorter.position, 1.2))
  const roomSpawn = findWalkSpawn(lowWorld, 'room', WALK_CROUCH_HEIGHT)
  assert.ok(roomSpawn)
  assert.ok(isWalkPositionFree(lowWorld, roomSpawn.position, WALK_CROUCH_HEIGHT))
  assert.equal(findWalkSpawn(lowWorld, 'room', Infinity), null)
  assert.equal(findWalkSpawn(lowWorld, undefined, .1), null)
})

test('a grounded jump follows a .4m arc, rejects air jumps, and lands without embedding in the floor', () => {
  const world = buildWalkWorld(scene(false)), point: Point2D = [2, 2]
  const initial = frozen<WalkVerticalState>({ offset: 0, velocity: 0, grounded: true })
  let state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, initial, 1 / 60, true)
  assert.equal(state.grounded, false)
  assert.ok(state.offset > 0 && state.velocity > 0)
  assert.deepEqual(stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, 1 / 60, true), stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, 1 / 60, false))
  let highest = state.offset
  for (let frame = 0; frame < 50; frame++) {
    state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, 1 / 60, false)
    highest = Math.max(highest, state.offset)
    assert.ok(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, state.offset))
  }
  assert.ok(highest > .39 && highest <= .4)
  assert.deepEqual(state, initial)
  assert.deepEqual(initial, { offset: 0, velocity: 0, grounded: true })
  const falselyGrounded = { offset: .3, velocity: 0, grounded: true }
  const falling = stepWalkVertical(world, point, WALK_EYE_HEIGHT, falselyGrounded, .05, true)
  assert.ok(falling.offset < .3 && falling.velocity < 0, 'grounded input cannot grant an air jump without a surface')
})

test('the swept head stops at a ceiling or thin fixture underside using the raised floor datum', () => {
  const snapshot = scene(false), point: Point2D = [4, 4]
  snapshot.geometry.floor.elevation = .5
  snapshot.geometry.ceiling.elevation = .5 + WALK_EYE_HEIGHT + .12 + .11
  let world = buildWalkWorld(snapshot)
  const initial = { offset: 0, velocity: 0, grounded: true }
  let state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, initial, .05, true)
  assert.ok(state.offset > 0 && state.offset <= .11)
  assert.ok(state.velocity <= 0, 'head contact cancels upward velocity and starts falling')
  assert.ok(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, state.offset))
  snapshot.geometry.ceiling.elevation = 3.2
  fixture(snapshot, [2, .005, 2], [4, .5 + WALK_EYE_HEIGHT + .12 + .09, 4])
  world = buildWalkWorld(snapshot)
  state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, initial, .05, true)
  assert.ok(state.offset > 0 && state.offset <= .09 + 1e-8)
  assert.ok(state.velocity <= 0)
  for (let frame = 0; frame < 15; frame++) {
    assert.ok(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, state.offset))
    state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, .05, false)
  }
  assert.deepEqual(state, initial)
})

test('ceiling collision is detected when a timestep crosses the apex and ends beneath the ceiling', () => {
  const snapshot = scene(false), point: Point2D = [4, 4]
  snapshot.geometry.ceiling.elevation = WALK_EYE_HEIGHT + .12 + .3915
  const world = buildWalkWorld(snapshot)
  const state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, { offset: .39, velocity: .2, grounded: false }, .05, false)
  assert.ok(state.offset < .386, 'the swept apex hits the ceiling before the unobstructed final point at .38775m')
  assert.ok(state.velocity < 0)
  assert.ok(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, state.offset))
})

test('landing uses rotated furniture tops, and leaving their support starts a fall to the floor', () => {
  const snapshot = scene(false)
  fixture(snapshot, [2, .3, .4], [4, 0, 4], Math.PI / 4)
  const world = buildWalkWorld(snapshot), point: Point2D = [4.65, 3.35]
  let state: WalkVerticalState = { offset: .4, velocity: -1, grounded: false }
  for (let frame = 0; frame < 3; frame++) state = stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, .05, false)
  assert.deepEqual(state, { offset: .3, velocity: 0, grounded: true })
  assert.ok(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, state.offset))
  const outside = moveWalkPosition(world, point, [1.35, 0], WALK_EYE_HEIGHT, state.offset)
  state = stepWalkVertical(world, outside, WALK_EYE_HEIGHT, state, .05, false)
  assert.equal(state.grounded, false)
  assert.ok(state.offset < .3 && state.velocity < 0)
  for (let frame = 0; frame < 12; frame++) {
    state = stepWalkVertical(world, outside, WALK_EYE_HEIGHT, state, .05, false)
    assert.ok(isWalkPositionFree(world, outside, WALK_EYE_HEIGHT, state.offset))
  }
  assert.deepEqual(state, { offset: 0, velocity: 0, grounded: true })
})

test('horizontal body collision uses airborne feet for obstacle clearance without automatic stepping', () => {
  const snapshot = scene(false)
  fixture(snapshot, [1, .3, 1], [4, 0, 4])
  const world = buildWalkWorld(snapshot)
  assert.ok(moveWalkPosition(world, [2, 4], [4, 0])[0] < 3.4, 'a low box still blocks grounded walking')
  const airborne = moveWalkPosition(world, [2, 4], [4, 0], WALK_EYE_HEIGHT, .4)
  assert.ok(airborne[0] > 5.9, 'a jump may clear a lower box')
  assert.ok(isWalkPositionFree(world, [4, 4], WALK_EYE_HEIGHT, .3))
  assert.equal(isWalkPositionFree(world, [4, 4], WALK_EYE_HEIGHT, .29), false)
  const doors = buildWalkWorld(scene())
  const stopped = moveWalkPosition(doors, [2, 3.75], [4, 0], WALK_EYE_HEIGHT, .4)
  assert.ok(stopped[0] < 4, 'being airborne raises the head into a doorway lintel')
})

test('vertical integration bounds delayed frames and handles nonfinite input without nonfinite output', () => {
  const world = buildWalkWorld(scene(false)), point: Point2D = [2, 2]
  const state = { offset: 0, velocity: 0, grounded: true }
  assert.deepEqual(stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, 500, true), stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, .05, true))
  assert.deepEqual(stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, NaN, true), state)
  assert.deepEqual(stepWalkVertical(world, point, WALK_EYE_HEIGHT, state, -1, true), state)
  assert.deepEqual(stepWalkVertical(world, point, WALK_EYE_HEIGHT, { offset: NaN, velocity: Infinity, grounded: false }, .05, false), state)
  assert.equal(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, -.01), false)
  assert.equal(isWalkPositionFree(world, point, WALK_EYE_HEIGHT, Infinity), false)
  const landed = stepWalkVertical(world, point, WALK_EYE_HEIGHT, { offset: .4, velocity: -1e100, grounded: false }, .05, false)
  assert.deepEqual(landed, state)
})

const doorPose = (x = 2.5, z = 3.75): WalkDoorPose => ({ x, z, yaw: -Math.PI / 2, pitch: 0, eyeHeight: WALK_EYE_HEIGHT, feetOffset: 0 })

test('door states copy saved openness, respect passage style overrides, and remain temporary', () => {
  const snapshot = doorScene()
  const door = snapshot.apartment.doors[0]
  assert.deepEqual(initialWalkDoorStates(snapshot), { passage: 1 })
  door.appearance = 'passage'
  snapshot.customization = { ...defaultDesignCustomization(), doors: { passage: { style: 'panel', color: '#aabbcc', openness: .3 } } }
  assert.deepEqual(initialWalkDoorStates(snapshot), { passage: .3 }, 'saved panel style takes precedence over source passage')
  snapshot.customization.doors.passage.style = 'passage'
  const original = frozen(snapshot), before = JSON.stringify(original)
  assert.deepEqual(initialWalkDoorStates(original), {})
  const world = buildWalkWorld(original, { passage: 0 })
  assert.equal(world.blockers.length, world.staticBlockers.length)
  assert.equal(findWalkDoorTarget(world, { passage: 0 }, doorPose()), null)
  assert.equal(canSetWalkDoorOpenness(world, { passage: 0 }, 'passage', 1, doorPose()), false)
  assert.equal(JSON.stringify(original), before)
  assert.equal(resolveWalkDoorOpenness({ passage: 2 }, 'passage'), 1)
  assert.equal(resolveWalkDoorOpenness({ passage: NaN }, 'passage', .3), .3)
})

test('closed leaves stop walking and an open leaf clears the doorway without accumulating colliders', () => {
  const input = doorScene()
  input.customization = { ...defaultDesignCustomization(), doors: { passage: { style: 'panel', color: '#aabbcc', openness: 0 } } }
  const snapshot = frozen(input), base = frozen(buildWalkWorld(snapshot))
  const states = frozen({ passage: 0 })
  const closed = withWalkDoorStates(base, states)
  assert.ok(moveWalkPosition(closed, [2, 3.75], [4, 0])[0] < 4)
  assert.equal(isWalkPositionFree(closed, [4, 3.75]), false)
  const opened = withWalkDoorStates(closed, { passage: 1 })
  assert.ok(moveWalkPosition(opened, [2, 3.75], [4, 0])[0] > 5.9)
  assert.equal(isWalkPositionFree(opened, [3.3, 3.024]), false, 'the open panel occupies its actual swung position')
  assert.equal(opened.blockers.length, base.blockers.length)
  assert.equal(closed.blockers.length, opened.blockers.length)
  assert.equal(base.staticBlockers, opened.staticBlockers)
  assert.deepEqual(buildWalkWorld(snapshot, states), closed)
  assert.deepEqual(states, { passage: 0 })
  assert.equal(isWalkPositionFree(base, [4, 3.75]), false, 'default callers respect the saved closed leaf')
})

test('leaf bounds reproduce both hinge positions and both swing directions in the wall frame', () => {
  const snapshot = doorScene(), half = (1.5 - .045) / 2
  for (const hinge of ['start', 'end'] as const) for (const opensToward of [1, -1] as const) {
    snapshot.apartment.doors[0] = { ...snapshot.apartment.doors[0], hinge, opensToward }
    const world = buildWalkWorld(snapshot), door = world.doors.find(item => item.id === 'passage')!
    const open = walkDoorLeaf(door, 1)!, closed = walkDoorLeaf(door, 0)!
    assert.ok(Math.abs(open.center[0] - (4 - opensToward * half)) < 1e-8)
    assert.ok(Math.abs(open.center[1] - (hinge === 'start' ? 3.024 : 4.476)) < 1e-8)
    assert.ok(Math.abs(closed.center[0] - 4) < 1e-8)
    assert.equal(closed.bottom, .025)
    assert.equal(closed.top, 2.1 - .025)
    assert.equal(closed.halfDepth, .035 / 2)
  }
})

test('door targeting requires looking toward a nearby leaf and honors pitch and current openness', () => {
  const world = buildWalkWorld(doorScene())
  assert.deepEqual(findWalkDoorTarget(world, { passage: 0 }, doorPose()), { id: 'passage', open: false })
  assert.equal(findWalkDoorTarget(world, { passage: 0 }, doorPose(1)), null)
  assert.equal(findWalkDoorTarget(world, { passage: 0 }, { ...doorPose(), yaw: Math.PI / 2 }), null)
  assert.equal(findWalkDoorTarget(world, { passage: 0 }, { ...doorPose(), pitch: Math.PI / 2 }), null)
  assert.equal(findWalkDoorTarget(world, { passage: 0 }, { ...doorPose(), x: NaN }), null)
  const openPose = { ...doorPose(3.2, 1.7), yaw: Math.PI }
  assert.deepEqual(findWalkDoorTarget(world, { passage: 1 }, openPose), { id: 'passage', open: true })
})

test('walls, furniture and a nearer door occlude interaction with a leaf behind them', () => {
  const snapshot = doorScene(), states = { passage: 0 }
  snapshot.apartment.walls.push({ id: 'occluder', from: [3, 2.5], to: [3, 5], height: 2.7, thickness: .1, kind: 'interior', estimated: true })
  assert.equal(findWalkDoorTarget(buildWalkWorld(snapshot), states, doorPose()), null)
  snapshot.apartment.walls.pop()
  fixture(snapshot, [.3, 2, .6], [3.2, 0, 3.75])
  assert.equal(findWalkDoorTarget(buildWalkWorld(snapshot), states, doorPose()), null)
  snapshot.assets[0].dimensions[1] = .4
  assert.deepEqual(findWalkDoorTarget(buildWalkWorld(snapshot), states, doorPose()), { id: 'passage', open: false }, 'a low object does not occlude the eye ray')
  snapshot.fixtures = []
  snapshot.apartment.walls.push({ ...snapshot.apartment.walls.find(item => item.id === 'partition')!, id: 'near-wall', from: [3, 0], to: [3, 8] })
  snapshot.apartment.doors.push({ ...snapshot.apartment.doors[0], id: 'near-door', wallId: 'near-wall' })
  assert.deepEqual(findWalkDoorTarget(buildWalkWorld(snapshot), { passage: 0, 'near-door': 0 }, doorPose()), { id: 'near-door', open: false })
})

test('opening and closing are rejected when the full swept arc would cross the visitor', () => {
  const world = frozen(buildWalkWorld(doorScene()))
  const inArc = doorPose(3.4, 3.624)
  assert.ok(isWalkPositionFree(withWalkDoorStates(world, { passage: 0 }), [inArc.x, inArc.z]))
  assert.ok(isWalkPositionFree(withWalkDoorStates(world, { passage: 1 }), [inArc.x, inArc.z]))
  assert.equal(canSetWalkDoorOpenness(world, { passage: 0 }, 'passage', 1, inArc), false, 'an intermediate panel angle crosses the body even though both endpoints are clear')
  assert.equal(canSetWalkDoorOpenness(world, { passage: 1 }, 'passage', 0, inArc), false)
  assert.equal(canSetWalkDoorOpenness(world, { passage: 1 }, 'passage', 0, doorPose(4, 3.75)), false, 'closing must not trap a visitor in the doorway')
  assert.equal(canSetWalkDoorOpenness(world, { passage: 0 }, 'passage', 1, doorPose(2.3)), true)
  assert.equal(canSetWalkDoorOpenness(world, { passage: 1 }, 'passage', 0, doorPose(2.3)), true)
  assert.equal(canSetWalkDoorOpenness(world, { passage: 0 }, 'missing', 1, doorPose()), false)
  assert.equal(canSetWalkDoorOpenness(world, { passage: 0 }, 'passage', Infinity, doorPose()), false)
})
