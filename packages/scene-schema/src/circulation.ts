import { z } from 'zod'

type Point = [number, number]
const epsilon = 1e-7
const coordinate = z.number().finite().min(-10_000).max(10_000)
const point = z.tuple([coordinate, coordinate])
const vector = z.tuple([coordinate, coordinate, coordinate])
const id = z.string().min(1).max(128)

/** Confidence describes the evidence, never structural or regulatory approval. */
export const CirculationEvidenceSchema = z.object({
  confidence: z.enum(['observed', 'inferred', 'user']),
  note: z.string().min(1).max(2_000),
}).strict()
export type CirculationEvidence = z.infer<typeof CirculationEvidenceSchema>

const area = (points: Point[]) => Math.abs(points.reduce((sum, [x, z], index) => {
  const next = points[(index + 1) % points.length]
  return sum + x * next[1] - next[0] * z
}, 0)) / 2
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const edgePairs = (points: Point[]) => points.map((from, index) => [from, points[(index + 1) % points.length]] as const)
const onSegment = (p: Point, a: Point, b: Point) => Math.abs(cross(a, b, p)) <= epsilon
  && p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon
  && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon
function intersects(a: Point, b: Point, c: Point, d: Point, proper = false): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true
  return !proper && (onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b))
}
function inside(p: Point, polygon: Point[], boundary = true): boolean {
  if (edgePairs(polygon).some(([a, b]) => onSegment(p, a, b))) return boundary
  let value = false
  for (const [a, b] of edgePairs(polygon)) if ((a[1] > p[1]) !== (b[1] > p[1])
    && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) value = !value
  return value
}
function simple(points: Point[]): boolean {
  if (points.length < 3 || area(points) <= epsilon) return false
  for (const [index, [a, b]] of edgePairs(points).entries()) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= epsilon) return false
    for (let other = index + 1; other < points.length; other++) {
      if (other === index + 1 || (index === 0 && other === points.length - 1)) continue
      if (intersects(a, b, points[other], points[(other + 1) % points.length])) return false
    }
  }
  return true
}
function segmentInside(a: Point, b: Point, polygon: Point[]): boolean {
  return inside(a, polygon) && inside(b, polygon)
    && inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], polygon)
    && !edgePairs(polygon).some(([c, d]) => intersects(a, b, c, d, true))
}
function contained(polygon: Point[], perimeter: Point[]): boolean {
  return edgePairs(polygon).every(([a, b]) => segmentInside(a, b, perimeter))
}
function overlaps(a: Point[], b: Point[]): boolean {
  if (a.some(p => inside(p, b, false)) || b.some(p => inside(p, a, false))) return true
  if (edgePairs(a).some(([p, q]) => edgePairs(b).some(([r, s]) => intersects(p, q, r, s, true)))) return true
  // Coincident rings can have no strictly interior vertices or crossing edges.
  return edgePairs(a).some(([p, q]) => {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (length <= epsilon) return false
    const d = Math.min(.00001, length / 100)
    return [-1, 1].some(sign => {
      const probe: Point = [(p[0] + q[0]) / 2 - sign * (q[1] - p[1]) / length * d, (p[1] + q[1]) / 2 + sign * (q[0] - p[0]) / length * d]
      return inside(probe, a, false) && inside(probe, b, false)
    })
  })
}
const ring = z.array(point).min(3).max(128).refine(simple, 'Circulation polygon must be simple and enclose nonzero area')

/** If present, regions partition the entire perimeter. They replace the legacy
 * floor and ceiling rather than adding overlapping platforms. Y is floor-local. */
export const FloorRegionSchema = z.object({
  id, polygon: ring, floorElevation: coordinate, ceilingElevation: coordinate,
  evidence: CirculationEvidenceSchema,
}).strict().refine(region => region.ceilingElevation > region.floorElevation + epsilon, {
  message: 'Region ceiling must be above its floor', path: ['ceilingElevation'],
})
export type FloorRegion = z.infer<typeof FloorRegionSchema>
export const SurfaceOpeningSchema = z.object({
  id, polygon: ring, connectionId: id.optional(), evidence: CirculationEvidenceSchema,
}).strict()
export type SurfaceOpening = z.infer<typeof SurfaceOpeningSchema>

export const StairGeometrySchema = z.object({
  width: z.number().finite().min(.45).max(10),
  // From/to are the centers of each flight's lower/upper threshold. The upper
  // threshold belongs to the next landing/floor; steps counts the equal risers.
  flights: z.array(z.object({ from: vector, to: vector, steps: z.number().int().min(1).max(100) }).strict()).min(1).max(12),
  // Exactly one horizontal landing joins each consecutive pair of flights.
  landings: z.array(z.object({ polygon: ring, elevation: coordinate }).strict()).max(11),
  evidence: CirculationEvidenceSchema,
}).strict().superRefine((geometry, context) => {
  const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: 'custom', message, path })
  if (geometry.landings.length !== geometry.flights.length - 1) issue('Every pair of flights needs one intermediate landing', ['landings'])
  geometry.flights.forEach((flight, index) => {
    if (flight.to[1] <= flight.from[1] + epsilon) issue('Stair flights must ascend in route order', ['flights', index, 'to'])
    if (Math.hypot(flight.to[0] - flight.from[0], flight.to[2] - flight.from[2]) < .05) issue('Stair flight must have horizontal run', ['flights', index, 'to'])
    const next = geometry.flights[index + 1], landing = geometry.landings[index]
    if (!next || !landing) return
    if (Math.abs(flight.to[1] - landing.elevation) > epsilon || Math.abs(next.from[1] - landing.elevation) > epsilon) issue('Landing must join consecutive flight elevations', ['landings', index, 'elevation'])
    if (!crossSection(flight, 1, geometry.width).every(p => inside(p, landing.polygon))
      || !crossSection(next, 0, geometry.width).every(p => inside(p, landing.polygon))) issue('Landing must contain both flight thresholds at their full width', ['landings', index, 'polygon'])
  })
})
export type StairGeometry = z.infer<typeof StairGeometrySchema>
export const FoundationConnectionSchema = z.object({
  id: id.optional(), fromLevelId: id, toLevelId: id,
  kind: z.enum(['stairs', 'opening']), notes: z.string().max(8_000),
  geometry: StairGeometrySchema.optional(),
}).strict().superRefine((connection, context) => {
  if (connection.geometry && (!connection.id || connection.kind !== 'stairs')) context.addIssue({ code: 'custom', message: 'Stair geometry requires a stair connection with an ID', path: ['geometry'] })
})
export type FoundationConnection = z.infer<typeof FoundationConnectionSchema>

export type CirculationIssue = { message: string; path: (string | number)[] }
type FloorPlan = {
  perimeter: Point[]; floorRegions?: FloorRegion[]; floorOpenings?: SurfaceOpening[]; ceilingOpenings?: SurfaceOpening[]
}
type Level = { levelId: string; elevation: number; ceilingHeight: number; apartment: FloorPlan }

export function apartmentCirculationIssues(apartment: FloorPlan): CirculationIssue[] {
  const issues: CirculationIssue[] = [], ids = new Set<string>()
  const issue = (message: string, path: (string | number)[]) => issues.push({ message, path })
  for (const field of ['floorRegions', 'floorOpenings', 'ceilingOpenings'] as const) {
    const values = apartment[field] ?? []
    values.forEach((value, index) => {
      if (ids.has(value.id)) issue('Circulation entity IDs must be unique within a floor', [field, index, 'id'])
      ids.add(value.id)
      if (!contained(value.polygon, apartment.perimeter)) issue('Circulation polygon must stay inside the floor perimeter', [field, index, 'polygon'])
      if (values.slice(0, index).some(previous => overlaps(previous.polygon, value.polygon))) issue('Circulation polygons on the same surface must not overlap', [field, index, 'polygon'])
    })
  }
  if (apartment.floorRegions) {
    const regionArea = apartment.floorRegions.reduce((sum, region) => sum + area(region.polygon), 0)
    if (Math.abs(regionArea - area(apartment.perimeter)) > Math.max(epsilon, area(apartment.perimeter) * 1e-6)) issue('Floor regions must cover the entire perimeter exactly once', ['floorRegions'])
  }
  return issues
}

function crossSection(flight: StairGeometry['flights'][number], t: number, width: number): Point[] {
  const dx = flight.to[0] - flight.from[0], dz = flight.to[2] - flight.from[2], length = Math.hypot(dx, dz)
  const x = flight.from[0] + dx * t, z = flight.from[2] + dz * t
  if (length <= epsilon) return [[x, z]]
  return [-.5, 0, .5].map(side => [x - dz / length * width * side, z + dx / length * width * side])
}
function supportAt(level: Level, point: Point): number[] {
  if (!inside(point, level.apartment.perimeter) || level.apartment.floorOpenings?.some(opening => inside(point, opening.polygon, false))) return []
  return level.apartment.floorRegions
    ? level.apartment.floorRegions.filter(region => inside(point, region.polygon)).map(region => level.elevation + region.floorElevation)
    : [level.elevation]
}

/** Deterministic checks shared by persisted candidates and direct generation
 * validation. Does not certify building-code dimensions or inferred headroom. */
export function dwellingCirculationIssues(candidate: { levels: Level[]; connections: FoundationConnection[] }): CirculationIssue[] {
  const issues: CirculationIssue[] = []
  const issue = (message: string, path: (string | number)[]) => issues.push({ message, path })
  const levels = new Map(candidate.levels.map(level => [level.levelId, level]))
  const connectionIds = new Set<string>()
  candidate.connections.forEach((connection, index) => {
    const path = ['connections', index]
    if (connection.id) {
      if (connectionIds.has(connection.id)) issue('Connection IDs must be unique', [...path, 'id'])
      connectionIds.add(connection.id)
    }
    const from = levels.get(connection.fromLevelId), to = levels.get(connection.toLevelId)
    if (!from || !to) { issue('Connections must reference existing floors', path); return }
    const geometry = connection.geometry
    if (!geometry) {
      if (from === to) issue('A same-floor connection needs explicit geometry between distinct elevations', path)
      return
    }
    const parsed = StairGeometrySchema.safeParse(geometry)
    if (!parsed.success) {
      for (const problem of parsed.error.issues) issue(problem.message, [...path, 'geometry', ...problem.path.filter(part => typeof part !== 'symbol')])
      return
    }
    const first = geometry.flights[0], last = geometry.flights.at(-1)!
    for (const [level, flight, t, label] of [[from, first, 0, 'lower'], [to, last, 1, 'upper']] as const) {
      const y = t === 0 ? flight.from[1] : flight.to[1]
      if (!crossSection(flight, t, geometry.width).every(p => supportAt(level, p).some(height => Math.abs(height - y) <= .001))) issue(`Stair ${label} threshold must meet its floor support across its full width`, [...path, 'geometry', 'flights'])
    }
    // Every flight is contained by at least one connected floor. The full route
    // may cross a setback; checking the union keeps those plans representable.
    const perimeters = [from.apartment.perimeter, to.apartment.perimeter]
    for (const [flightIndex, flight] of geometry.flights.entries()) {
      for (let step = 0; step <= 20; step++) if (!crossSection(flight, step / 20, geometry.width).every(p => perimeters.some(perimeter => inside(p, perimeter)))) {
        issue('Stair width must stay inside the connected floor outlines', [...path, 'geometry', 'flights', flightIndex]); break
      }
      for (const [levelIndex, level] of candidate.levels.entries()) {
        const regions = level.apartment.floorRegions ?? [{ polygon: level.apartment.perimeter, floorElevation: 0, ceilingElevation: level.ceilingHeight }]
        for (const region of regions) for (const field of ['floor', 'ceiling'] as const) {
          const planeY = level.elevation + (field === 'floor' ? region.floorElevation : region.ceilingElevation)
          if (planeY <= flight.from[1] + epsilon || planeY > flight.to[1] + epsilon) continue
          // A floor slab begins just below the upper support. Sampling immediately
          // before arrival allows a threshold on the opening edge, not inside it.
          const probeY = field === 'floor' ? Math.max(flight.from[1], planeY - .02) : planeY
          const t = (probeY - flight.from[1]) / (flight.to[1] - flight.from[1])
          const points = crossSection(flight, t, geometry.width).filter(p => inside(p, region.polygon, false))
          if (!points.length) continue
          const openings = field === 'floor' ? level.apartment.floorOpenings : level.apartment.ceilingOpenings
          if (!points.every(p => openings?.some(opening => (!opening.connectionId || opening.connectionId === connection.id) && inside(p, opening.polygon)))) {
            issue(`Stair flight crosses an unperforated ${field} on ${level.levelId}`, [...path, 'geometry', 'flights', flightIndex])
            // The path identifies the source opening list as well as the flight.
            issue(`Add the ${field} opening required by ${connection.id}`, ['levels', levelIndex, 'apartment', `${field}Openings`])
          }
        }
      }
    }
    geometry.landings.forEach((landing, landingIndex) => {
      if (!landing.polygon.every(p => perimeters.some(perimeter => inside(p, perimeter)))) issue('Landing must stay inside the connected floor outlines', [...path, 'geometry', 'landings', landingIndex])
    })
  })
  candidate.levels.forEach((level, levelIndex) => {
    for (const problem of apartmentCirculationIssues(level.apartment)) issue(problem.message, ['levels', levelIndex, 'apartment', ...problem.path])
    for (const field of ['floorOpenings', 'ceilingOpenings'] as const) level.apartment[field]?.forEach((opening, index) => {
      if (!opening.connectionId) return
      const connection = candidate.connections.find(item => item.id === opening.connectionId)
      if (!connection?.geometry || ![connection.fromLevelId, connection.toLevelId].includes(level.levelId)) issue('Opening must reference a geometric connection using this floor', ['levels', levelIndex, 'apartment', field, index, 'connectionId'])
    })
  })
  return issues
}
