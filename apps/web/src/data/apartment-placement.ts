import { SITE_BUILDINGS, type SitePoint } from './building-site.ts'
import { t3Apartment } from './t3.ts'

export type Point3 = [number, number, number]
type ReadonlyPoint3 = readonly [number, number, number]

const target = SITE_BUILDINGS.find(building => building.isTarget)!
// The marked long elevation overlooks the courtyard and the row of low annexes.
// Its endpoints run northwest -> southeast in the true-east / true-south map.
const courtyardFacadeEdgeIndex = 2
const start = target.footprint[courtyardFacadeEdgeIndex]
const end = target.footprint[courtyardFacadeEdgeIndex + 1]
const length = Math.hypot(end[0] - start[0], end[1] - start[1])
const axisX: Point3 = [(end[0] - start[0]) / length, 0, (end[1] - start[1]) / length]
const axisZ: Point3 = [-axisX[2], 0, axisX[0]]
const origin: Point3 = [start[0], 0, start[1]]
const rotationY = -Math.atan2(axisX[2], axisX[0])

/** Along-facade X, upward Y, courtyard-facing Z. The courtyard edge is Z=0;
 * the main building interior has negative Z. Rotation matches a Three.js Y yaw. */
export function buildingFrameToSite([x, y, z]: ReadonlyPoint3): Point3 {
  return [origin[0] + axisX[0] * x + axisZ[0] * z, y, origin[2] + axisX[2] * x + axisZ[2] * z]
}

export function siteToBuildingFrame([x, y, z]: ReadonlyPoint3): Point3 {
  const dx = x - origin[0], dz = z - origin[2]
  return [dx * axisX[0] + dz * axisX[2], y, dx * axisZ[0] + dz * axisZ[2]]
}

const frameFootprint = target.footprint.map(([x, z]) => siteToBuildingFrame([x, 0, z]))
export const TARGET_BUILDING_FRAME = {
  origin,
  axisX,
  axisZ,
  rotationY,
  length,
  courtyardFacadeEdgeIndex,
  minX: Math.min(...frameFootprint.map(point => point[0])),
  maxX: Math.max(...frameFootprint.map(point => point[0])),
  minZ: Math.min(...frameFootprint.map(point => point[2])),
  maxZ: Math.max(...frameFootprint.map(point => point[2])),
}

const xs = t3Apartment.perimeter.map(point => point[0])
const zs = t3Apartment.perimeter.map(point => point[1])
const minX = Math.min(...xs), maxX = Math.max(...xs)
const minZ = Math.min(...zs), maxZ = Math.max(...zs)
const floorIndex = 3
const storeyHeight = target.height / (target.floors ?? 5)
const floorElevation = target.groundOffset + floorIndex * storeyHeight
const facadeOffset = 5.5
const exteriorInset = Math.max(...t3Apartment.walls.filter(wall => wall.kind === 'exterior').map(wall => wall.thickness)) / 2
const position = buildingFrameToSite([facadeOffset, floorElevation, -maxZ - exteriorInset])
const azimuth = ([x, , z]: ReadonlyPoint3) => (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360

/** Illustrative registration preserving the authored apartment geometry.
 * The third-floor placement, orientation and facade offsets are model
 * assumptions, not evidence of a surveyed or identified apartment. */
export const APARTMENT_PLACEMENT = {
  buildingId: target.id,
  confidence: 'estimated' as const,
  position,
  rotationY,
  floorIndex,
  storeyHeight,
  floorElevation,
  facadeOffset,
  exteriorInset,
  wallHeight: Math.max(...t3Apartment.walls.map(wall => wall.height)),
  bounds: { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ },
  livingFacadeAzimuth: azimuth(axisZ),
  bedroomFacadeAzimuth: azimuth([-axisZ[0], 0, -axisZ[2]]),
  label: 'T3 · 3.er piso estimado',
  assumption: 'Ubicación ilustrativa del modelo: tercer piso, living hacia el patio suroeste y habitaciones hacia el noreste.',
}

/** Transform a direction without translating it; preserves vector length. */
export function apartmentDirectionToSite([x, y, z]: ReadonlyPoint3): Point3 {
  return [axisX[0] * x + axisZ[0] * z, y, axisX[2] * x + axisZ[2] * z]
}

export function siteDirectionToApartment([x, y, z]: ReadonlyPoint3): Point3 {
  return [x * axisX[0] + z * axisX[2], y, x * axisZ[0] + z * axisZ[2]]
}

export function apartmentToSite(point: ReadonlyPoint3): Point3 {
  const rotated = apartmentDirectionToSite(point)
  return [rotated[0] + position[0], rotated[1] + position[1], rotated[2] + position[2]]
}

export function siteToApartment([x, y, z]: ReadonlyPoint3): Point3 {
  return siteDirectionToApartment([x - position[0], y - position[1], z - position[2]])
}

/** Clip the target's simple longitudinal footprint, keeping its true site
 * coordinates. A full cross-depth band avoids filling the unknown gap behind
 * the apartment's bedroom facade with an opaque building solid. */
function clipAtApartmentX(points: SitePoint[], boundary: number, keepGreater: boolean): SitePoint[] {
  const result: SitePoint[] = []
  const distance = ([x, z]: SitePoint) => (siteToApartment([x, 0, z])[0] - boundary) * (keepGreater ? 1 : -1)
  const push = (point: SitePoint) => {
    const previous = result.at(-1)
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-9) result.push(point)
  }
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]
    const da = distance(a), db = distance(b)
    if (da >= 0) push([...a])
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  })
  if (result.length > 1 && Math.hypot(result[0][0] - result.at(-1)![0], result[0][1] - result.at(-1)![1]) < 1e-9) result.pop()
  return result
}

/** Returns three non-overlapping rings in the site frame. Extruding `before`
 * and `after` at apartment height leaves a through-building void; full original
 * footprint layers above/below it retain the ceiling and floor shadow casters.
 * Padding includes the apartment walls, whose centre lines form its perimeter. */
export function splitTargetBuildingFootprint(padding = 0.2): {
  before: SitePoint[]
  apartmentBand: SitePoint[]
  after: SitePoint[]
} {
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError('Footprint padding must be finite and nonnegative')
  const left = minX - padding, right = maxX + padding
  return {
    before: clipAtApartmentX(target.footprint, left, false),
    apartmentBand: clipAtApartmentX(clipAtApartmentX(target.footprint, left, true), right, false),
    after: clipAtApartmentX(target.footprint, right, true),
  }
}
