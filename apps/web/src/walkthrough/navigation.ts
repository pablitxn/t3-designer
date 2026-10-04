import { polygonBounds, polygonCentroid, segmentWall, wallLength, wallRotation } from '@t3-designer/geometry'
import { pointInEditorPolygon, type Point2D, type ProjectSnapshot, type Room } from '@t3-designer/scene-schema'

export const WALK_RADIUS = .2
export const WALK_EYE_HEIGHT = 1.65
export const WALK_CROUCH_HEIGHT = .95
export const WALK_GRAVITY = 9.8
export const WALK_JUMP_SPEED = 2.8
const headClearance = .12
const epsilon = 1e-8
const maxMovement = 4
const movementStep = WALK_RADIUS / 4

type WalkBlocker = {
  center: Point2D
  halfWidth: number
  halfDepth: number
  cos: number
  sin: number
  bottom: number
  top: number
  doorId?: string
}
type WalkDoorLeaf = { hinge: Point2D; rotation: number; direction: number; swingSign: number; width: number; bottom: number; top: number; initialOpenness: number }
type WalkDoor = { center: Point2D; normal: Point2D; exterior: boolean; id: string; clearance: number; leaf?: WalkDoorLeaf }
export type WalkWorld = {
  perimeter: Point2D[]
  rooms: Room[]
  floorElevation: number
  ceilingElevation: number
  blockers: WalkBlocker[]
  staticBlockers: WalkBlocker[]
  doors: WalkDoor[]
}
export type WalkSpawn = { position: Point2D; yaw: number }
export type WalkVerticalState = { offset: number; velocity: number; grounded: boolean }
export type WalkDoorStates = Record<string, number>
export type WalkDoorPose = { x: number; z: number; yaw: number; pitch: number; eyeHeight: number; feetOffset: number }

export function resolveWalkDoorOpenness(states: WalkDoorStates | undefined, id: string, fallback = 1): number {
  const value = states?.[id]
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value! : Number.isFinite(fallback) ? fallback : 1))
}

/** Door settings are copied into a disposable visit, with passages excluded. */
export function initialWalkDoorStates(snapshot: ProjectSnapshot): WalkDoorStates {
  return Object.fromEntries(snapshot.apartment.doors.flatMap(door => {
    const customization = snapshot.customization?.doors[door.id]
    return (customization?.style ?? door.appearance ?? 'panel') === 'passage' ? []
      : [[door.id, resolveWalkDoorOpenness(undefined, door.id, customization?.openness ?? 1)]]
  }))
}

/** Collision is an upright body in the same local metre coordinates as the scene.
 * Models use their authored rotated bounds; leaves follow saved or visiting states.
 * Window openings remain barriers, including balcony glazing at the perimeter. */
export function buildWalkWorld(snapshot: ProjectSnapshot, doorStates = initialWalkDoorStates(snapshot)): WalkWorld {
  const blockers: WalkBlocker[] = []
  const doors: WalkDoor[] = []
  for (const wall of snapshot.apartment.walls) {
    const length = wallLength(wall)
    const ux = (wall.to[0] - wall.from[0]) / length
    const uz = (wall.to[1] - wall.from[1]) / length
    const angle = wallRotation(wall)
    for (const segment of segmentWall(wall, snapshot.apartment.doors)) {
      const distance = segment.offset + segment.length / 2
      blockers.push({
        center: [wall.from[0] + ux * distance, wall.from[1] + uz * distance],
        halfWidth: segment.length / 2, halfDepth: wall.thickness / 2,
        cos: Math.cos(angle), sin: Math.sin(angle),
        bottom: segment.bottom, top: segment.bottom + segment.height,
      })
    }
    for (const door of snapshot.apartment.doors.filter(item => item.wallId === wall.id)) {
      const distance = door.offset + door.width / 2
      const customization = snapshot.customization?.doors[door.id]
      const hingeAtStart = door.hinge === 'start'
      const hingeDistance = door.offset + (hingeAtStart ? .024 : door.width - .024)
      const direction = hingeAtStart ? 1 : -1
      doors.push({ id: door.id, center: [wall.from[0] + ux * distance, wall.from[1] + uz * distance],
        normal: [-uz, ux], exterior: wall.kind === 'exterior', clearance: wall.thickness / 2 + WALK_RADIUS + .08,
        ...((customization?.style ?? door.appearance ?? 'panel') === 'passage' ? {} : { leaf: {
          hinge: [wall.from[0] + ux * hingeDistance, wall.from[1] + uz * hingeDistance] as Point2D,
          rotation: angle, direction, swingSign: door.opensToward * -direction,
          width: Math.max(.001, door.width - .045), bottom: .025, top: door.height - .025,
          initialOpenness: resolveWalkDoorOpenness(undefined, door.id, customization?.openness ?? 1),
        } }) })
    }
  }
  const assets = new Map(snapshot.assets.map(asset => [asset.id, asset]))
  for (const fixture of snapshot.fixtures) {
    const asset = assets.get(fixture.assetId)
    if (!asset) continue
    blockers.push({ center: [fixture.position[0], fixture.position[2]],
      halfWidth: asset.dimensions[0] / 2, halfDepth: asset.dimensions[2] / 2,
      cos: Math.cos(fixture.rotation), sin: Math.sin(fixture.rotation),
      bottom: fixture.position[1], top: fixture.position[1] + asset.dimensions[1] })
  }
  const world: WalkWorld = { blockers, staticBlockers: blockers, doors,
    perimeter: snapshot.apartment.perimeter.map(point => [...point]),
    rooms: snapshot.apartment.rooms.map(room => ({ ...room, polygon: room.polygon.map(point => [...point]) })),
    floorElevation: snapshot.geometry.floor.elevation,
    ceilingElevation: snapshot.geometry.ceiling.elevation,
  }
  return withWalkDoorStates(world, doorStates)
}

function finitePoint(point: Point2D) { return point.every(Number.isFinite) }

function distanceToSegmentSquared(point: Point2D, from: Point2D, to: Point2D) {
  const dx = to[0] - from[0], dz = to[1] - from[1]
  const lengthSquared = dx * dx + dz * dz
  const t = lengthSquared > epsilon ? Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dz) / lengthSquared)) : 0
  return (point[0] - from[0] - t * dx) ** 2 + (point[1] - from[1] - t * dz) ** 2
}

export function roomAtPosition(world: WalkWorld, point: Point2D): Room | undefined {
  return finitePoint(point) ? world.rooms.find(room => pointInEditorPolygon(point, room.polygon)) : undefined
}

function overlapsFootprint(blocker: WalkBlocker, point: Point2D, radius = WALK_RADIUS): boolean {
  const dx = point[0] - blocker.center[0], dz = point[1] - blocker.center[1]
  // Inverse of Three's rotation around +Y; the same convention as fixture.rotation.
  const localX = blocker.cos * dx - blocker.sin * dz
  const localZ = blocker.sin * dx + blocker.cos * dz
  const outsideX = Math.max(0, Math.abs(localX) - blocker.halfWidth)
  const outsideZ = Math.max(0, Math.abs(localZ) - blocker.halfDepth)
  return outsideX * outsideX + outsideZ * outsideZ < radius ** 2 - epsilon
}

export function walkDoorLeaf(door: WalkDoor, openness: number): WalkBlocker | null {
  const leaf = door.leaf
  if (!leaf) return null
  // Mirrors Door.tsx: wall rotation, hinge rotation, then signed leaf scale.
  const angle = leaf.rotation + openness * Math.PI / 2 * leaf.swingSign
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return { doorId: door.id,
    center: [leaf.hinge[0] + cos * leaf.direction * leaf.width / 2, leaf.hinge[1] - sin * leaf.direction * leaf.width / 2],
    halfWidth: leaf.width / 2, halfDepth: .035 / 2, cos, sin, bottom: leaf.bottom, top: leaf.top,
  }
}

/** Reuses fixed geometry and replaces leaves, never accumulating old colliders. */
export function withWalkDoorStates(world: WalkWorld, states: WalkDoorStates): WalkWorld {
  const leaves = world.doors.flatMap(door => {
    const leaf = walkDoorLeaf(door, resolveWalkDoorOpenness(states, door.id, door.leaf?.initialOpenness))
    return leaf ? [leaf] : []
  })
  return { ...world, blockers: [...world.staticBlockers, ...leaves] }
}

type Vector3 = [number, number, number]

function rayBlockerDistance(origin: Vector3, direction: Vector3, blocker: WalkBlocker, limit: number, padding = 0): number | null {
  const dx = origin[0] - blocker.center[0], dz = origin[2] - blocker.center[1]
  const localOrigin = [blocker.cos * dx - blocker.sin * dz, origin[1], blocker.sin * dx + blocker.cos * dz]
  const localDirection = [blocker.cos * direction[0] - blocker.sin * direction[2], direction[1], blocker.sin * direction[0] + blocker.cos * direction[2]]
  const minimum = [-blocker.halfWidth - padding, blocker.bottom - padding, -blocker.halfDepth - padding]
  const maximum = [blocker.halfWidth + padding, blocker.top + padding, blocker.halfDepth + padding]
  let near = 0, far = limit
  for (let axis = 0; axis < 3; axis++) {
    const component = localDirection[axis]
    if (Math.abs(component) < epsilon) {
      if (localOrigin[axis] < minimum[axis] || localOrigin[axis] > maximum[axis]) return null
      continue
    }
    const a = (minimum[axis] - localOrigin[axis]) / component, b = (maximum[axis] - localOrigin[axis]) / component
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b))
    if (near > far) return null
  }
  return near
}

function closestBlockerPoint(point: Vector3, blocker: WalkBlocker): Vector3 {
  const dx = point[0] - blocker.center[0], dz = point[2] - blocker.center[1]
  const x = Math.max(-blocker.halfWidth, Math.min(blocker.halfWidth, blocker.cos * dx - blocker.sin * dz))
  const z = Math.max(-blocker.halfDepth, Math.min(blocker.halfDepth, blocker.sin * dx + blocker.cos * dz))
  return [blocker.center[0] + blocker.cos * x + blocker.sin * z,
    Math.max(blocker.bottom, Math.min(blocker.top, point[1])),
    blocker.center[1] - blocker.sin * x + blocker.cos * z]
}

function validDoorPose(pose: WalkDoorPose): boolean {
  return [pose.x, pose.z, pose.yaw, pose.pitch, pose.eyeHeight, pose.feetOffset].every(Number.isFinite)
    && pose.eyeHeight >= WALK_CROUCH_HEIGHT && pose.feetOffset >= 0
}

/** A forgiving eye ray selects an actual visible leaf within two metres.
 * Occlusion is checked to the real leaf, so the aim tolerance cannot reach
 * through an adjacent jamb or through furniture. */
export function findWalkDoorTarget(world: WalkWorld, states: WalkDoorStates, pose: WalkDoorPose): { id: string; open: boolean } | null {
  if (!validDoorPose(pose)) return null
  const origin: Vector3 = [pose.x, world.floorElevation + pose.feetOffset + pose.eyeHeight, pose.z]
  const direction: Vector3 = [-Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), -Math.cos(pose.yaw) * Math.cos(pose.pitch)]
  const current = withWalkDoorStates(world, states)
  let nearest: { id: string; open: boolean; distance: number } | null = null
  for (const door of world.doors) {
    const openness = resolveWalkDoorOpenness(states, door.id, door.leaf?.initialOpenness)
    const leaf = walkDoorLeaf(door, openness)
    if (!leaf) continue
    const hit = rayBlockerDistance(origin, direction, leaf, 2, .12)
    if (hit === null) continue
    const target = closestBlockerPoint([origin[0] + direction[0] * hit, origin[1] + direction[1] * hit, origin[2] + direction[2] * hit], leaf)
    const distance = Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2])
    if (distance > 2 || distance < epsilon || (nearest && distance >= nearest.distance)) continue
    const toward: Vector3 = [(target[0] - origin[0]) / distance, (target[1] - origin[1]) / distance, (target[2] - origin[2]) / distance]
    if (toward[0] * direction[0] + toward[1] * direction[1] + toward[2] * direction[2] <= 0) continue
    if (current.blockers.some(blocker => blocker.doorId !== door.id && rayBlockerDistance(origin, toward, blocker, Math.max(0, distance - .005)) !== null)) continue
    nearest = { id: door.id, open: openness >= .5, distance }
  }
  return nearest ? { id: nearest.id, open: nearest.open } : null
}

/** Reject a toggle whose entire leaf arc would sweep through the visitor.
 * Bounds at successive angles are conservatively inflated by the maximum
 * vertex travel between samples, covering the unsampled part of the arc. */
export function canSetWalkDoorOpenness(world: WalkWorld, states: WalkDoorStates, id: string, nextOpenness: number, pose: WalkDoorPose): boolean {
  if (!validDoorPose(pose) || !Number.isFinite(nextOpenness) || nextOpenness < 0 || nextOpenness > 1) return false
  const door = world.doors.find(item => item.id === id)
  if (!door?.leaf) return false
  const feet = world.floorElevation + pose.feetOffset, head = feet + pose.eyeHeight + headClearance
  if (door.leaf.top <= feet + epsilon || door.leaf.bottom >= head - epsilon) return true
  const current = resolveWalkDoorOpenness(states, id, door.leaf.initialOpenness)
  const angle = Math.abs(nextOpenness - current) * Math.PI / 2
  const steps = Math.max(1, Math.min(180, Math.ceil(angle * door.leaf.width / .025)))
  const arcPadding = 2 * Math.hypot(door.leaf.width, .035 / 2) * Math.sin(angle / steps / 4)
  for (let step = 0; step <= steps; step++) {
    const leaf = walkDoorLeaf(door, current + (nextOpenness - current) * step / steps)!
    if (overlapsFootprint(leaf, [pose.x, pose.z], WALK_RADIUS + arcPadding)) return false
  }
  return true
}

export function isWalkPositionFree(world: WalkWorld, point: Point2D, eyeHeight = WALK_EYE_HEIGHT, feetOffset = 0): boolean {
  if (!finitePoint(point) || !Number.isFinite(eyeHeight) || eyeHeight < WALK_CROUCH_HEIGHT || !Number.isFinite(feetOffset) || feetOffset < 0) return false
  const feet = world.floorElevation + feetOffset, head = feet + eyeHeight + headClearance
  if (head > world.ceilingElevation + epsilon || !pointInEditorPolygon(point, world.perimeter)) return false
  // Checking every edge also handles concave notches, rather than just a bounding box.
  if (world.perimeter.some((from, index) => distanceToSegmentSquared(point, from, world.perimeter[(index + 1) % world.perimeter.length]) < WALK_RADIUS ** 2 - epsilon)) return false
  return !world.blockers.some(blocker => {
    if (blocker.top <= feet + epsilon || blocker.bottom >= head - epsilon) return false
    return overlapsFootprint(blocker, point)
  })
}

/** Bounded substeps prevent a delayed frame from jumping through a thin partition.
 * When the complete step collides, independent axes retain motion along the wall. */
export function moveWalkPosition(world: WalkWorld, position: Point2D, displacement: Point2D, eyeHeight = WALK_EYE_HEIGHT, feetOffset = 0): Point2D {
  if (!finitePoint(position)) return findWalkSpawn(world, undefined, eyeHeight)?.position ?? [0, 0]
  let next: Point2D = [...position]
  if (!finitePoint(displacement) || !isWalkPositionFree(world, position, eyeHeight, feetOffset)) return next
  const distance = Math.hypot(...displacement)
  if (distance < epsilon) return next
  const bounded = Math.min(distance, maxMovement)
  const steps = Math.ceil(bounded / movementStep)
  const dx = displacement[0] / distance * bounded / steps
  const dz = displacement[1] / distance * bounded / steps
  for (let step = 0; step < steps; step++) {
    const candidate: Point2D = [next[0] + dx, next[1] + dz]
    if (isWalkPositionFree(world, candidate, eyeHeight, feetOffset)) { next = candidate; continue }
    const alongX: Point2D = [next[0] + dx, next[1]]
    if (isWalkPositionFree(world, alongX, eyeHeight, feetOffset)) next = alongX
    const alongZ: Point2D = [next[0], next[1] + dz]
    if (isWalkPositionFree(world, alongZ, eyeHeight, feetOffset)) next = alongZ
  }
  return next
}

/** Ballistic movement inside the free vertical interval at the current XZ point.
 * Sweeping the full body catches thin shelves and ceilings even across the apex.
 * Use the latest horizontal position: losing support starts a fall immediately.
 * jumpRequested is an input edge; callers should consume it once per press. */
export function stepWalkVertical(world: WalkWorld, point: Point2D, eyeHeight: number, state: WalkVerticalState, delta: number, jumpRequested: boolean): WalkVerticalState {
  const offset = Number.isFinite(state.offset) ? Math.max(0, state.offset) : 0
  let velocity = Number.isFinite(state.velocity) ? Math.max(-50, Math.min(50, state.velocity)) : 0
  if (!isWalkPositionFree(world, point, eyeHeight, offset)) return { offset, velocity: 0, grounded: false }

  // The body cannot move into a collider at either side of its current free
  // interval. Landing uses exactly the same footprint as lateral collision.
  let support = 0
  let upper = world.ceilingElevation - world.floorElevation - eyeHeight - headClearance
  for (const blocker of world.blockers) {
    if (!overlapsFootprint(blocker, point)) continue
    const top = blocker.top - world.floorElevation
    const underside = blocker.bottom - world.floorElevation - eyeHeight - headClearance
    if (top <= offset + epsilon) support = Math.max(support, top)
    if (underside >= offset - epsilon) upper = Math.min(upper, underside)
  }
  const onSupport = Math.abs(offset - support) <= epsilon && velocity <= epsilon
  const seconds = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0
  if (seconds === 0) return { offset, velocity, grounded: onSupport }
  if (jumpRequested && state.grounded && onSupport) velocity = WALK_JUMP_SPEED
  else if (onSupport) return { offset: support, velocity: 0, grounded: true }

  let remaining = seconds
  let start = offset
  // A frame can pass its apex and end below a low ceiling after crossing it.
  // Inspect the peak, then solve the first ascending impact analytically.
  if (velocity > 0) {
    const peakTime = Math.min(remaining, velocity / WALK_GRAVITY)
    const peak = start + velocity * peakTime - WALK_GRAVITY * peakTime * peakTime / 2
    if (peak >= upper - epsilon) {
      const distance = Math.max(0, upper - start)
      const discriminant = Math.max(0, velocity * velocity - 2 * WALK_GRAVITY * distance)
      const impact = distance === 0 ? 0 : 2 * distance / (velocity + Math.sqrt(discriminant))
      remaining = Math.max(0, remaining - impact)
      start = upper
      velocity = 0
    }
  }
  const next = start + velocity * remaining - WALK_GRAVITY * remaining * remaining / 2
  velocity -= WALK_GRAVITY * remaining
  if (next <= support + epsilon) return { offset: support, velocity: 0, grounded: true }
  return { offset: Math.max(support, Math.min(upper, next)), velocity, grounded: false }
}

function facing(from: Point2D, toward: Point2D): number {
  return Math.atan2(from[0] - toward[0], from[1] - toward[1])
}

function roomSpawn(world: WalkWorld, room: Room, eyeHeight: number): WalkSpawn | null {
  const center = polygonCentroid(room.polygon)
  const bounds = polygonBounds(room.polygon)
  // Include the centroid, then a bounded regular search for furnished/concave rooms.
  // No free point means no teleport: we never silently select another room.
  const candidates: Point2D[] = [center]
  const columns = Math.min(100, Math.max(1, Math.ceil(bounds.width / .16)))
  const rows = Math.min(100, Math.max(1, Math.ceil(bounds.depth / .16)))
  for (let x = 0; x < columns; x++) for (let z = 0; z < rows; z++) {
    candidates.push([bounds.min[0] + bounds.width * (x + .5) / columns, bounds.min[1] + bounds.depth * (z + .5) / rows])
  }
  candidates.sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]))
  const position = candidates.find(point => pointInEditorPolygon(point, room.polygon) && isWalkPositionFree(world, point, eyeHeight))
  if (!position) return null
  const nearestDoor = world.doors.filter(door => !door.exterior).sort((a, b) =>
    Math.hypot(a.center[0] - position[0], a.center[1] - position[1]) - Math.hypot(b.center[0] - position[0], b.center[1] - position[1]))[0]
  return { position, yaw: nearestDoor ? facing(position, nearestDoor.center) : 0 }
}

export function findWalkSpawn(world: WalkWorld, roomId?: string, eyeHeight = WALK_EYE_HEIGHT): WalkSpawn | null {
  if (!Number.isFinite(eyeHeight) || eyeHeight < WALK_CROUCH_HEIGHT || world.floorElevation + eyeHeight + headClearance > world.ceilingElevation + epsilon) return null
  if (roomId !== undefined) {
    const room = world.rooms.find(item => item.id === roomId)
    return room ? roomSpawn(world, room, eyeHeight) : null
  }
  const exteriorDoors = world.doors.filter(door => door.exterior)
    .sort((a, b) => Number(/entry|entrance/i.test(b.id)) - Number(/entry|entrance/i.test(a.id)))
  for (const door of exteriorDoors) for (const side of [1, -1]) {
    const position: Point2D = [door.center[0] + door.normal[0] * door.clearance * side, door.center[1] + door.normal[1] * door.clearance * side]
    if (isWalkPositionFree(world, position, eyeHeight)) {
      const toward: Point2D = [position[0] + door.normal[0] * side, position[1] + door.normal[1] * side]
      return { position, yaw: facing(position, toward) }
    }
  }
  const rooms = [...world.rooms].sort((a, b) => Number(/entrance|entry/i.test(b.id)) - Number(/entrance|entry/i.test(a.id)))
  for (const room of rooms) {
    const spawn = roomSpawn(world, room, eyeHeight)
    if (spawn) return spawn
  }
  return null
}
