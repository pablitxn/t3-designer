import type { Apartment, Door, Point2D, Wall, Window } from '@t3-designer/scene-schema'

// 1 world unit = 1 meter. All helpers use plan coordinates [X, Z].
export const METERS_PER_UNIT = 1

type WallEndpoints = Pick<Wall, 'from' | 'to'>
const epsilon = 1e-8

export function wallLength(wall: WallEndpoints): number {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
}

export function wallCenter(wall: WallEndpoints): Point2D {
  return [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2]
}

// Three.js rotation about +Y: local +X follows the wall, local +Z=(-dz, dx).
export function wallRotation(wall: WallEndpoints): number {
  return -Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0])
}

function twiceSignedArea(points: readonly Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0)
}

export function polygonArea(points: readonly Point2D[]): number {
  return Math.abs(twiceSignedArea(points)) / 2
}

// Area-weighted centroid, including concave polygons. Input must enclose area.
export function polygonCentroid(points: readonly Point2D[]): Point2D {
  const twiceArea = twiceSignedArea(points)
  if (points.length < 3 || Math.abs(twiceArea) <= epsilon) {
    throw new RangeError('A polygon centroid requires a nonzero area')
  }
  const sum: Point2D = [0, 0]
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const cross = point[0] * next[1] - next[0] * point[1]
    sum[0] += (point[0] + next[0]) * cross
    sum[1] += (point[1] + next[1]) * cross
  })
  return [sum[0] / (3 * twiceArea), sum[1] / (3 * twiceArea)]
}

export type PlanBounds = {
  min: Point2D
  max: Point2D
  width: number
  depth: number
  center: Point2D
}

export function polygonBounds(points: readonly Point2D[]): PlanBounds {
  if (points.length === 0) throw new RangeError('Bounds require at least one point')
  const min: Point2D = [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, z]) => z))]
  const max: Point2D = [Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, z]) => z))]
  return { min, max, width: max[0] - min[0], depth: max[1] - min[1], center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2] }
}

export function apartmentBounds(apartment: Pick<Apartment, 'perimeter' | 'balcony'>): PlanBounds {
  return polygonBounds([...apartment.perimeter, ...(apartment.balcony?.polygon ?? [])])
}

// Rectangles in the wall's local XY plane; offset is measured from wall.from.
export type WallSegment = { offset: number; length: number; bottom: number; height: number }

/** Partition a validated wall around door/window apertures without CSG. */
export function segmentWall(wall: Wall, openings: readonly (Door | Window)[]): WallSegment[] {
  const length = wallLength(wall)
  const apertures = openings.filter((opening) => opening.wallId === wall.id).map((opening) => ({
    from: opening.offset,
    to: opening.offset + opening.width,
    bottom: 'sillHeight' in opening ? opening.sillHeight : 0,
    top: ('sillHeight' in opening ? opening.sillHeight : 0) + opening.height,
  }))
  const cuts = [...new Set([0, length, ...apertures.flatMap((opening) => [opening.from, opening.to])])].sort((a, b) => a - b)
  const segments: WallSegment[] = []
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const from = cuts[index]
    const to = cuts[index + 1]
    if (to - from <= epsilon) continue
    const midpoint = (from + to) / 2
    const active = apertures.filter((opening) => midpoint > opening.from && midpoint < opening.to)
      .sort((a, b) => a.bottom - b.bottom)
    let bottom = 0
    for (const opening of active) {
      if (opening.bottom - bottom > epsilon) {
        segments.push({ offset: from, length: to - from, bottom, height: opening.bottom - bottom })
      }
      bottom = Math.max(bottom, opening.top)
    }
    if (wall.height - bottom > epsilon) {
      segments.push({ offset: from, length: to - from, bottom, height: wall.height - bottom })
    }
  }
  return segments
}
