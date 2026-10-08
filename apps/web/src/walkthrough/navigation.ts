import { polygonBounds, polygonCentroid, segmentWall, wallLength, wallRotation } from '@t3-designer/geometry'
import { pointInEditorPolygon, type FoundationCandidate, type Point2D, type ProjectSnapshot, type Room } from '@t3-designer/scene-schema'
import { stairGuardSegments } from './stair-guards.ts'

export const WALK_RADIUS = .2
export const WALK_EYE_HEIGHT = 1.65
export const WALK_CROUCH_HEIGHT = .95
export const WALK_GRAVITY = 9.8
export const WALK_JUMP_SPEED = 2.8
const headClearance = .12
const epsilon = 1e-8
const maxMovement = 4
const movementStep = WALK_RADIUS / 4
const stepHeight = .2

export type WalkFoundationContext = {
  levels: { id: string; name: string; elevation: number; scene: ProjectSnapshot }[]
  activeLevelId: string
  /** Source datum, before a building rebase moves the materialized scenes. */
  connections: Extract<FoundationCandidate, { target: 'dwelling' }>['connections']
}
export const walkEntityId = (levelId: string, id: string) => `${levelId}:${id}`
export function walkLevelOffset(context: WalkFoundationContext, levelId: string): [number, number, number] {
  const active = context.levels.find(level => level.id === context.activeLevelId)?.scene
  const scene = context.levels.find(level => level.id === levelId)?.scene
  if (!active || !scene) return [0, 0, 0]
  const dx = scene.placement.position[0] - active.placement.position[0], dz = scene.placement.position[2] - active.placement.position[2]
  const cos = Math.cos(active.placement.rotationY), sin = Math.sin(active.placement.rotationY)
  return [cos * dx - sin * dz, scene.placement.position[1] - active.placement.position[1], sin * dx + cos * dz]
}
export type WalkRoom = Room & { levelId?: string; levelName?: string; floorElevation?: number }
type WalkSurface = { polygon: Point2D[]; holes: Point2D[][]; elevation: number; thickness: number; levelId?: string; landing?: boolean }
type WalkRamp = { from: [number, number, number]; to: [number, number, number]; width: number; levelId: string; toLevelId: string }

type WalkBlocker = {
  center: Point2D
  halfWidth: number
  halfDepth: number
  cos: number
  sin: number
  bottom: number
  top: number
  doorId?: string
  threshold?: boolean
}
type WalkDoorLeaf = { hinge: Point2D; rotation: number; direction: number; swingSign: number; width: number; bottom: number; top: number; initialOpenness: number }
type WalkDoor = { center: Point2D; normal: Point2D; exterior: boolean; id: string; clearance: number; leaf?: WalkDoorLeaf; levelId?: string; elevation?: number }
export type WalkWorld = {
  perimeter: Point2D[]
  rooms: WalkRoom[]
  floorElevation: number
  ceilingElevation: number
  blockers: WalkBlocker[]
  staticBlockers: WalkBlocker[]
  doors: WalkDoor[]
  floors?: WalkSurface[]
  ceilings?: WalkSurface[]
  ramps?: WalkRamp[]
  boundaries?: { polygon: Point2D[]; bottom: number; top: number; levelId?: string }[]
  activeLevelId?: string
}
export type WalkSpawn = { position: Point2D; yaw: number; feetOffset?: number; levelId?: string }
export type WalkVerticalState = { offset: number; velocity: number; grounded: boolean }
export type WalkDoorStates = Record<string, number>
export type WalkDoorPose = { x: number; z: number; yaw: number; pitch: number; eyeHeight: number; feetOffset: number }

export function resolveWalkDoorOpenness(states: WalkDoorStates | undefined, id: string, fallback = 1): number {
  const value = states?.[id]
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value! : Number.isFinite(fallback) ? fallback : 1))
}

/** Door settings are copied into a disposable visit, with passages excluded. */
export function initialWalkDoorStates(snapshot: ProjectSnapshot, context?: WalkFoundationContext): WalkDoorStates {
  if (context) return Object.fromEntries(context.levels.flatMap(level => Object.entries(initialWalkDoorStates(level.id === context.activeLevelId ? snapshot : level.scene)).map(([id, openness]) => [`${level.id}:${id}`, openness])))
  return Object.fromEntries(snapshot.apartment.doors.flatMap(door => {
    const customization = snapshot.customization?.doors[door.id]
    return (customization?.style ?? door.appearance ?? 'panel') === 'passage' ? []
      : [[door.id, resolveWalkDoorOpenness(undefined, door.id, customization?.openness ?? 1)]]
  }))
}

/** Collision is an upright body in the same local metre coordinates as the scene.
 * Models use their authored rotated bounds; leaves follow saved or visiting states.
 * Window openings remain barriers, including balcony glazing at the perimeter. */
export function buildWalkWorld(snapshot: ProjectSnapshot, doorStates = initialWalkDoorStates(snapshot), context?: WalkFoundationContext): WalkWorld {
  if (context?.levels.length) return buildMultiLevelWorld(snapshot, doorStates, context)
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
        bottom: (wall.baseElevation ?? 0) + segment.bottom, top: (wall.baseElevation ?? 0) + segment.bottom + segment.height,
        threshold: snapshot.apartment.doors.some(door => door.wallId === wall.id && (door.thresholdHeight ?? 0) > 0
          && segment.offset >= door.offset - epsilon && segment.offset + segment.length <= door.offset + door.width + epsilon
          && segment.bottom + segment.height <= (door.thresholdHeight ?? 0) + epsilon),
      })
    }
    for (const door of snapshot.apartment.doors.filter(item => item.wallId === wall.id)) {
      const distance = door.offset + door.width / 2
      const customization = snapshot.customization?.doors[door.id]
      const hingeAtStart = door.hinge === 'start'
      const hingeDistance = door.offset + (hingeAtStart ? .024 : door.width - .024)
      const direction = hingeAtStart ? 1 : -1
      doors.push({ id: door.id, center: [wall.from[0] + ux * distance, wall.from[1] + uz * distance], elevation: (wall.baseElevation ?? 0) + (door.thresholdHeight ?? 0),
        normal: [-uz, ux], exterior: wall.kind === 'exterior', clearance: wall.thickness / 2 + WALK_RADIUS + .08,
        ...((customization?.style ?? door.appearance ?? 'panel') === 'passage' ? {} : { leaf: {
          hinge: [wall.from[0] + ux * hingeDistance, wall.from[1] + uz * hingeDistance] as Point2D,
          rotation: angle, direction, swingSign: door.opensToward * -direction,
          width: Math.max(.001, door.width - .045), bottom: (wall.baseElevation ?? 0) + (door.thresholdHeight ?? 0) + .025, top: (wall.baseElevation ?? 0) + (door.thresholdHeight ?? 0) + door.height - .025,
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
  const regions = snapshot.apartment.floorRegions
  const floorHoles = snapshot.apartment.floorOpenings?.map(opening => opening.polygon) ?? []
  const ceilingHoles = snapshot.apartment.ceilingOpenings?.map(opening => opening.polygon) ?? []
  const floors: WalkSurface[] = regions?.length ? regions.map(region => ({ polygon: region.polygon, holes: floorHoles, elevation: region.floorElevation, thickness: snapshot.geometry.floor.thickness }))
    : [{ polygon: snapshot.apartment.perimeter, holes: floorHoles, elevation: snapshot.geometry.floor.elevation, thickness: snapshot.geometry.floor.thickness }]
  const ceilings: WalkSurface[] = regions?.length ? regions.map(region => ({ polygon: region.polygon, holes: ceilingHoles, elevation: region.ceilingElevation, thickness: snapshot.geometry.ceiling.thickness }))
    : [{ polygon: snapshot.apartment.perimeter, holes: ceilingHoles, elevation: snapshot.geometry.ceiling.elevation, thickness: snapshot.geometry.ceiling.thickness }]
  const world: WalkWorld = { blockers, staticBlockers: blockers, doors, floors, ceilings,
    perimeter: snapshot.apartment.perimeter.map(point => [...point]),
    rooms: snapshot.apartment.rooms.map(room => ({ ...room, polygon: room.polygon.map(point => [...point]) })),
    floorElevation: Math.min(...floors.map(floor => floor.elevation)),
    ceilingElevation: Math.max(...ceilings.map(ceiling => ceiling.elevation)),
    boundaries: [{ polygon: snapshot.apartment.perimeter, bottom: Math.min(...floors.map(floor => floor.elevation)), top: Math.max(...ceilings.map(ceiling => ceiling.elevation)) }],
  }
  return withWalkDoorStates(world, doorStates)
}

/** Every floor is placed relative to the active scene. A building rebase moves
 * the whole assembly without changing this local navigation frame. */
function buildMultiLevelWorld(snapshot: ProjectSnapshot, doorStates: WalkDoorStates, context: WalkFoundationContext): WalkWorld {
  const base = snapshot.placement.position, rotation = snapshot.placement.rotationY
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const floors: WalkSurface[] = [], ceilings: WalkSurface[] = [], blockers: WalkBlocker[] = [], rooms: WalkRoom[] = [], doors: WalkDoor[] = []
  const boundaries: NonNullable<WalkWorld['boundaries']> = []
  for (const level of context.levels) {
    const scene = level.id === context.activeLevelId ? snapshot : level.scene
    const dx = scene.placement.position[0] - base[0], dz = scene.placement.position[2] - base[2]
    const tx = cos * dx - sin * dz, tz = sin * dx + cos * dz, ty = scene.placement.position[1] - base[1]
    const angle = scene.placement.rotationY - rotation, c = Math.cos(angle), s = Math.sin(angle)
    const point = ([x, z]: Point2D): Point2D => [c * x + s * z + tx, -s * x + c * z + tz]
    const polygon = (ring: Point2D[]) => ring.map(point)
    const local = buildWalkWorld(scene)
    floors.push(...local.floors!.map(surface => ({ ...surface, polygon: polygon(surface.polygon), holes: surface.holes.map(polygon), elevation: surface.elevation + ty, levelId: level.id })))
    ceilings.push(...local.ceilings!.map(surface => ({ ...surface, polygon: polygon(surface.polygon), holes: surface.holes.map(polygon), elevation: surface.elevation + ty, levelId: level.id })))
    blockers.push(...local.staticBlockers.map(blocker => ({ ...blocker, center: point(blocker.center), cos: Math.cos(Math.atan2(blocker.sin, blocker.cos) + angle), sin: Math.sin(Math.atan2(blocker.sin, blocker.cos) + angle), bottom: blocker.bottom + ty, top: blocker.top + ty })))
    rooms.push(...local.rooms.map(room => ({ ...room, id: `${level.id}:${room.id}`, polygon: polygon(room.polygon), levelId: level.id, levelName: level.name, floorElevation: ty + local.floorElevation })))
    doors.push(...local.doors.map(door => ({ ...door, id: `${level.id}:${door.id}`, center: point(door.center), normal: [c * door.normal[0] + s * door.normal[1], -s * door.normal[0] + c * door.normal[1]] as Point2D,
      levelId: level.id, elevation: ty + (door.elevation ?? local.floorElevation), ...(door.leaf ? { leaf: { ...door.leaf, hinge: point(door.leaf.hinge), rotation: door.leaf.rotation + angle, bottom: door.leaf.bottom + ty, top: door.leaf.top + ty } } : {}) })))
    boundaries.push(...local.boundaries!.map(boundary => ({ ...boundary, polygon: polygon(boundary.polygon), bottom: boundary.bottom + ty, top: boundary.top + ty, levelId: level.id })))
  }
  const ramps: WalkRamp[] = []
  const activeSourceElevation = context.levels.find(level => level.id === context.activeLevelId)?.elevation ?? snapshot.placement.floorElevation
  for (const connection of context.connections) {
    if (connection.kind !== 'stairs' || !connection.geometry) continue
    const geometry = connection.geometry
    for (const flight of geometry.flights) {
      const from: [number, number, number] = [flight.from[0], flight.from[1] - activeSourceElevation, flight.from[2]]
      const to: [number, number, number] = [flight.to[0], flight.to[1] - activeSourceElevation, flight.to[2]]
      ramps.push({ from, to, width: geometry.width, levelId: connection.fromLevelId, toLevelId: connection.toLevelId })
    }
    for (const landing of geometry.landings) floors.push({ polygon: landing.polygon, holes: [], elevation: landing.elevation - activeSourceElevation, thickness: .08, levelId: connection.fromLevelId, landing: true })
    for (const guard of stairGuardSegments(geometry)) {
      const dx = guard.to[0] - guard.from[0], dz = guard.to[2] - guard.from[2], length = Math.hypot(dx, dz), pieces = Math.max(1, Math.ceil(length / .15))
      const angle = Math.atan2(-dz, dx)
      for (let index = 0; index < pieces; index++) {
        const a = index / pieces, b = (index + 1) / pieces, middle = (a + b) / 2
        const y1 = guard.from[1] + (guard.to[1] - guard.from[1]) * a - activeSourceElevation, y2 = guard.from[1] + (guard.to[1] - guard.from[1]) * b - activeSourceElevation
        blockers.push({ center: [guard.from[0] + dx * middle, guard.from[2] + dz * middle], halfWidth: length / pieces / 2, halfDepth: .018, cos: Math.cos(angle), sin: Math.sin(angle), bottom: Math.min(y1, y2), top: Math.max(y1, y2) + .95 })
      }
    }
  }
  return withWalkDoorStates({ perimeter: snapshot.apartment.perimeter, floors, ceilings, ramps, boundaries, activeLevelId: context.activeLevelId,
    floorElevation: Math.min(...floors.map(floor => floor.elevation)), ceilingElevation: Math.max(...ceilings.map(ceiling => ceiling.elevation)),
    rooms, doors, blockers, staticBlockers: blockers }, doorStates)
}

function finitePoint(point: Point2D) { return point.every(Number.isFinite) }

function distanceToSegmentSquared(point: Point2D, from: Point2D, to: Point2D) {
  const dx = to[0] - from[0], dz = to[1] - from[1]
  const lengthSquared = dx * dx + dz * dz
  const t = lengthSquared > epsilon ? Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dz) / lengthSquared)) : 0
  return (point[0] - from[0] - t * dx) ** 2 + (point[1] - from[1] - t * dz) ** 2
}

export function roomAtPosition(world: WalkWorld, point: Point2D, feetOffset = 0): WalkRoom | undefined {
  if (!finitePoint(point)) return undefined
  const feet = world.floorElevation + feetOffset
  return world.rooms.filter(room => pointInEditorPolygon(point, room.polygon) && (room.floorElevation ?? world.floorElevation) <= feet + stepHeight)
    .sort((a, b) => (b.floorElevation ?? world.floorElevation) - (a.floorElevation ?? world.floorElevation))[0]
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

function onSurface(surface: WalkSurface, point: Point2D, head = false): boolean {
  if (!pointInEditorPolygon(point, surface.polygon)) return false
  return !surface.holes.some(hole => pointInEditorPolygon(point, hole)
    && (!head || hole.every((from, index) => distanceToSegmentSquared(point, from, hole[(index + 1) % hole.length]) >= WALK_RADIUS ** 2 - epsilon)))
}

function rampHeight(ramp: WalkRamp, point: Point2D): number | null {
  const dx = ramp.to[0] - ramp.from[0], dz = ramp.to[2] - ramp.from[2], length = Math.hypot(dx, dz)
  if (length < epsilon) return null
  const along = ((point[0] - ramp.from[0]) * dx + (point[1] - ramp.from[2]) * dz) / length
  const across = Math.abs((point[0] - ramp.from[0]) * dz - (point[1] - ramp.from[2]) * dx) / length
  if (along < -epsilon || along > length + epsilon || across > ramp.width / 2 - epsilon) return null
  return ramp.from[1] + Math.max(0, Math.min(1, along / length)) * (ramp.to[1] - ramp.from[1])
}

/** Only surfaces reachable from the current height count; an overlapping upper
 * floor never pulls a visitor upwards through its slab. */
function supportHeight(world: WalkWorld, point: Point2D, maximum: number, levelId?: string): number | null {
  const heights = (world.floors ?? []).filter(surface => (levelId === undefined || surface.levelId === levelId) && surface.elevation <= maximum + epsilon && onSurface(surface, point)).map(surface => surface.elevation)
  if (levelId === undefined) for (const ramp of world.ramps ?? []) {
    const height = rampHeight(ramp, point)
    if (height !== null && height <= maximum + epsilon) heights.push(height)
  }
  return heights.length ? Math.max(...heights) : world.floors ? null : world.floorElevation
}

export function walkLevelAtPosition(world: WalkWorld, point: Point2D, feetOffset = 0): string | undefined {
  const feet = world.floorElevation + feetOffset
  const support = (world.floors ?? []).filter(surface => surface.levelId && onSurface(surface, point) && surface.elevation <= feet + stepHeight)
    .sort((a, b) => Math.abs(a.elevation - feet) - Math.abs(b.elevation - feet))[0]
  if (support && Math.abs(support.elevation - feet) < .3) return support.levelId
  const ramp = (world.ramps ?? []).find(ramp => { const y = rampHeight(ramp, point); return y !== null && Math.abs(y - feet) < .4 })
  return ramp?.levelId ?? roomAtPosition(world, point, feetOffset)?.levelId ?? world.activeLevelId
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
  if (head > world.ceilingElevation + epsilon) return false
  // Use complete storey outlines, not region seams; their shared threshold is
  // walkable. The footprint at another height cannot open an exterior wall.
  const boundaries = world.boundaries ?? [{ polygon: world.perimeter, bottom: world.floorElevation, top: world.ceilingElevation }]
  const onConnection = (world.ramps ?? []).some(ramp => { const y = rampHeight(ramp, point); return y !== null && feet >= y - stepHeight && feet <= y + .5 })
    || (world.floors ?? []).some(floor => floor.landing && onSurface(floor, point) && feet >= floor.elevation - stepHeight && feet <= floor.elevation + .5)
  const withinBoundary = boundaries.some(boundary => (onConnection || feet >= boundary.bottom - stepHeight - epsilon && feet < boundary.top + epsilon)
    && pointInEditorPolygon(point, boundary.polygon) && boundary.polygon.every((from, index) => distanceToSegmentSquared(point, from, boundary.polygon[(index + 1) % boundary.polygon.length]) >= WALK_RADIUS ** 2 - epsilon))
  if (!withinBoundary) return false
  for (const floor of world.floors ?? []) {
    if (feet < floor.elevation - epsilon && head > floor.elevation - floor.thickness + epsilon && onSurface(floor, point, feet < floor.elevation - stepHeight)) return false
  }
  for (const ceiling of world.ceilings ?? []) {
    if (feet < ceiling.elevation + ceiling.thickness - epsilon && head > ceiling.elevation + epsilon && onSurface(ceiling, point, feet < ceiling.elevation + ceiling.thickness - stepHeight)) return false
  }
  for (const ramp of world.ramps ?? []) {
    const height = rampHeight(ramp, point)
    if (height !== null && feet < height - .09 && head > height - .08 + epsilon) return false
  }
  return !world.blockers.some(blocker => {
    if (blocker.top <= feet + epsilon || blocker.bottom >= head - epsilon) return false
    return overlapsFootprint(blocker, point)
  })
}

/** Follow a supported ramp or a small source-level threshold in bounded steps.
 * Airborne motion keeps its ballistic height, and furniture is never an
 * automatic step. Return height with XZ so a long frame cannot tunnel upstairs. */
export function moveWalkBody(world: WalkWorld, position: Point2D, displacement: Point2D, eyeHeight: number, state: WalkVerticalState): { position: Point2D; vertical: WalkVerticalState } {
  let next: Point2D = [...position], vertical = { ...state }
  if (!finitePoint(position) || !finitePoint(displacement) || !isWalkPositionFree(world, position, eyeHeight, state.offset)) return { position: next, vertical }
  const distance = Math.hypot(...displacement)
  if (distance < epsilon) return { position: next, vertical }
  const bounded = Math.min(distance, maxMovement), steps = Math.ceil(bounded / movementStep)
  const dx = displacement[0] / distance * bounded / steps, dz = displacement[1] / distance * bounded / steps
  const attempt = (candidate: Point2D) => {
    const feet = world.floorElevation + vertical.offset
    let support = supportHeight(world, candidate, feet + (vertical.grounded ? stepHeight : 0))
    if (vertical.grounded) for (const blocker of world.blockers) {
      if (blocker.threshold && blocker.top <= feet + stepHeight + epsilon && overlapsFootprint(blocker, candidate)) support = Math.max(support ?? -Infinity, blocker.top)
    }
    const follows = vertical.grounded && support !== null && Math.abs(support - feet) <= stepHeight + epsilon
    let offset = follows ? support! - world.floorElevation : vertical.offset
    if (!isWalkPositionFree(world, candidate, eyeHeight, offset)) {
      // Descending off a supported ledge may retain contact under the trailing
      // part of the body. Keep that support until gravity can lower the body.
      if (follows && offset < vertical.offset && isWalkPositionFree(world, candidate, eyeHeight, vertical.offset)) offset = vertical.offset
      else return false
    }
    // Keep bodies inside the guarded width; entering/exiting is through the
    // flight ends or a landing, not over a side rail at an arbitrary height.
    for (const ramp of world.ramps ?? []) {
      const oldY = rampHeight(ramp, next), newY = rampHeight(ramp, candidate)
      const dx = ramp.to[0] - ramp.from[0], dz = ramp.to[2] - ramp.from[2], length = Math.hypot(dx, dz)
      if (length < epsilon) continue
      const along = ((candidate[0] - ramp.from[0]) * dx + (candidate[1] - ramp.from[2]) * dz) / length
      const across = Math.abs((candidate[0] - ramp.from[0]) * dz - (candidate[1] - ramp.from[2]) * dx) / length
      if ((oldY !== null && Math.abs(oldY - feet) < .3 || newY !== null && Math.abs(newY - (world.floorElevation + offset)) < .3)
        && along > epsilon && along < length - epsilon && across > ramp.width / 2 - WALK_RADIUS + epsilon) return false
    }
    next = candidate
    if (follows) vertical = { offset, velocity: 0, grounded: true }
    else if (support === null || support < feet - epsilon) vertical.grounded = false
    return true
  }
  for (let step = 0; step < steps; step++) {
    if (attempt([next[0] + dx, next[1] + dz])) continue
    attempt([next[0] + dx, next[1]])
    attempt([next[0], next[1] + dz])
  }
  return { position: next, vertical }
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
  let support = (supportHeight(world, point, world.floorElevation + offset) ?? world.floorElevation) - world.floorElevation
  let upper = world.ceilingElevation - world.floorElevation - eyeHeight - headClearance
  for (const ceiling of world.ceilings ?? []) {
    const top = ceiling.elevation + ceiling.thickness - world.floorElevation
    if (top <= offset + epsilon && onSurface(ceiling, point)) support = Math.max(support, top)
  }
  for (const surface of [...(world.floors ?? []).map(floor => ({ ...floor, underside: floor.elevation - floor.thickness })), ...(world.ceilings ?? []).map(ceiling => ({ ...ceiling, underside: ceiling.elevation }))]) {
    if (!onSurface(surface, point, true)) continue
    const underside = surface.underside - world.floorElevation - eyeHeight - headClearance
    if (underside >= offset - epsilon) upper = Math.min(upper, underside)
  }
  for (const ramp of world.ramps ?? []) {
    const height = rampHeight(ramp, point)
    if (height === null) continue
    const underside = height - .08 - world.floorElevation - eyeHeight - headClearance
    if (underside >= offset - epsilon) upper = Math.min(upper, underside)
  }
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

function spawnFeet(world: WalkWorld, point: Point2D, levelId?: string): number | null {
  const surfaces = (world.floors ?? []).filter(floor => !floor.landing && floor.levelId === levelId && onSurface(floor, point))
  return surfaces.length ? Math.max(...surfaces.map(surface => surface.elevation)) - world.floorElevation : world.floors ? null : 0
}

function roomSpawn(world: WalkWorld, room: WalkRoom, eyeHeight: number): WalkSpawn | null {
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
  const position = candidates.find(point => {
    const feet = spawnFeet(world, point, room.levelId)
    return feet !== null && pointInEditorPolygon(point, room.polygon) && isWalkPositionFree(world, point, eyeHeight, feet)
  })
  if (!position) return null
  const nearestDoor = world.doors.filter(door => !door.exterior && door.levelId === room.levelId).sort((a, b) =>
    Math.hypot(a.center[0] - position[0], a.center[1] - position[1]) - Math.hypot(b.center[0] - position[0], b.center[1] - position[1]))[0]
  return { position, yaw: nearestDoor ? facing(position, nearestDoor.center) : 0, feetOffset: spawnFeet(world, position, room.levelId)!, levelId: room.levelId }
}

export function findWalkSpawn(world: WalkWorld, roomId?: string, eyeHeight = WALK_EYE_HEIGHT): WalkSpawn | null {
  if (!Number.isFinite(eyeHeight) || eyeHeight < WALK_CROUCH_HEIGHT || world.floorElevation + eyeHeight + headClearance > world.ceilingElevation + epsilon) return null
  if (roomId !== undefined) {
    const room = world.rooms.find(item => item.id === roomId)
    return room ? roomSpawn(world, room, eyeHeight) : null
  }
  const exteriorDoors = world.doors.filter(door => door.exterior && door.levelId === world.activeLevelId)
    .sort((a, b) => Number(/entry|entrance/i.test(b.id)) - Number(/entry|entrance/i.test(a.id)))
  for (const door of exteriorDoors) for (const side of [1, -1]) {
    const position: Point2D = [door.center[0] + door.normal[0] * door.clearance * side, door.center[1] + door.normal[1] * door.clearance * side]
    const feetOffset = spawnFeet(world, position, door.levelId)
    if (feetOffset !== null && isWalkPositionFree(world, position, eyeHeight, feetOffset)) {
      const toward: Point2D = [position[0] + door.normal[0] * side, position[1] + door.normal[1] * side]
      return { position, yaw: facing(position, toward), feetOffset, levelId: door.levelId }
    }
  }
  const rooms = world.rooms.filter(room => room.levelId === world.activeLevelId).sort((a, b) => Number(/entrance|entry/i.test(b.id)) - Number(/entrance|entry/i.test(a.id)))
  for (const room of rooms) {
    const spawn = roomSpawn(world, room, eyeHeight)
    if (spawn) return spawn
  }
  return null
}
