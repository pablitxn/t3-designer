import { SITE_BUILDINGS, type BuildingFootprint, type SitePoint } from '../data/building-site.ts'

export type RoofPoint3 = [number, number, number]

/** Inferred massing surface, in metres; x east, y up, z south. */
export type RoofSurface = {
  footprint: SitePoint[]
  holes?: SitePoint[][]
  eaveHeightM: number
  riseM: number
  ridgeAxis: SitePoint
  ridgeOffsetM: number
  halfSpanM: number
}

export type RoofSolarOptions = {
  panelCount: number
  tiltDeg: number
  /** Clockwise from true north: 0 north, 90 east, 180 south. */
  azimuthDeg: number
  panelWidthM?: number
  panelLengthM?: number
  edgeSetbackM?: number
  columnGapM?: number
  rowGapM?: number
}

export type RoofSolarPanel = {
  id: string
  position: RoofPoint3
  corners: RoofPoint3[]
  normal: RoofPoint3
  /** Three.js Euler angles with order YXZ. */
  rotation: RoofPoint3
  supports: { bottom: RoofPoint3; top: RoofPoint3 }[]
}

export type RoofSolarLayout = {
  panels: RoofSolarPanel[]
  requestedCount: number
  installedCount: number
  /** Capacity of this schematic regular grid, not an optimized engineering fit. */
  maxPanelCount: number
  limitedByRoof: boolean
  panelAreaM2: number
  footprintAreaM2: number
  panelWidthM: number
  panelLengthM: number
  tiltDeg: number
  azimuthDeg: number
  edgeSetbackM: number
  rowGapM: number
}

const EPSILON = 1e-8
const PANEL_THICKNESS = .04
const ROOF_CLEARANCE = .15
const dot = (a: SitePoint, b: SitePoint) => a[0] * b[0] + a[1] * b[1]

/** Mirrors BuildingContext's inferred longest-edge ridge and flat-roof fallback.
 * The source provides neither surveyed roof faces nor structural permissions. */
export function roofSurfaceFromBuilding(building: Pick<BuildingFootprint, 'footprint' | 'holes' | 'height' | 'roofHeight'>): RoofSurface {
  let ridgeAxis: SitePoint = [1, 0], longest = 0
  building.footprint.forEach((a, index) => {
    const b = building.footprint[(index + 1) % building.footprint.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length > longest) { longest = length; ridgeAxis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length] }
  })
  const offsets = building.footprint.map(([x, z]) => -ridgeAxis[1] * x + ridgeAxis[0] * z)
  const min = Math.min(...offsets), max = Math.max(...offsets)
  const inferredRise = building.holes?.length || building.footprint.length > 18 ? 0 : Math.min(5, building.roofHeight)
  return {
    footprint: building.footprint, holes: building.holes,
    eaveHeightM: building.height + (inferredRise > .4 ? 0 : .08),
    riseM: inferredRise > .4 ? inferredRise : 0,
    ridgeAxis, ridgeOffsetM: (min + max) / 2, halfSpanM: (max - min) / 2,
  }
}

export const TARGET_SOLAR_ROOF = roofSurfaceFromBuilding(SITE_BUILDINGS.find(building => building.isTarget)!)

export function roofHeightAt(roof: RoofSurface, [x, z]: SitePoint): number {
  const across = -roof.ridgeAxis[1] * x + roof.ridgeAxis[0] * z
  return roof.eaveHeightM + (roof.riseM > 0 && roof.halfSpanM > 0
    ? roof.riseM * Math.max(0, 1 - Math.abs(across - roof.ridgeOffsetM) / roof.halfSpanM) : 0)
}

function ringArea(points: SitePoint[]): number {
  return Math.abs(points.reduce((area, a, i) => { const b = points[(i + 1) % points.length]; return area + a[0] * b[1] - b[0] * a[1] }, 0)) / 2
}

function pointInRing([x, z]: SitePoint, ring: SitePoint[]): boolean {
  let inside = false
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  })
  return inside
}

function distanceToSegment(p: SitePoint, a: SitePoint, b: SitePoint): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], lengthSquared = dx * dx + dz * dz
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSquared)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
}

function segmentsCross(a: SitePoint, b: SitePoint, c: SitePoint, d: SitePoint): boolean {
  const cross = (p: SitePoint, q: SitePoint, r: SitePoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return cross(a, b, c) * cross(a, b, d) < -EPSILON && cross(c, d, a) * cross(c, d, b) < -EPSILON
}

/** Checks whole panel edges, including concave notches and courtyards. */
function fitsRoof(corners: SitePoint[], roof: RoofSurface, setback: number): boolean {
  if (corners.some(point => !pointInRing(point, roof.footprint))) return false
  if (roof.holes?.some(hole => corners.some(point => pointInRing(point, hole)) || hole.some(point => pointInRing(point, corners)))) return false
  for (const ring of [roof.footprint, ...(roof.holes ?? [])]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      for (let j = 0; j < corners.length; j++) {
        const c = corners[j], d = corners[(j + 1) % corners.length]
        if (segmentsCross(a, b, c, d)) return false
        const distance = Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b))
        if (distance < setback - EPSILON || distance < EPSILON) return false
      }
    }
  }
  return true
}

/** Regular rack grid. Gaps are user assumptions, not a self-shadow simulation.
 * Every panel stays inside the roof including the specified edge setback; its
 * four legs reach the inferred surface. Ridge intersections are checked too,
 * so a tilted panel cannot slice through the ridge between its corners. */
export function createRoofSolarLayout(roof: RoofSurface, options: RoofSolarOptions): RoofSolarLayout {
  const { panelCount, tiltDeg, azimuthDeg, panelWidthM = 1.134, panelLengthM = 1.762, edgeSetbackM = .6, columnGapM = .18, rowGapM = .8 } = options
  if (![panelCount, tiltDeg, azimuthDeg, panelWidthM, panelLengthM, edgeSetbackM, columnGapM, rowGapM].every(Number.isFinite)
    || !Number.isInteger(panelCount) || panelCount < 0 || panelCount > 10_000
    || tiltDeg < 0 || tiltDeg > 90 || panelWidthM <= 0 || panelLengthM <= 0
    || edgeSetbackM < 0 || columnGapM < 0 || rowGapM < 0) throw new RangeError('Invalid roof solar layout options')
  if (roof.footprint.length < 3 || ![roof.eaveHeightM, roof.riseM, roof.ridgeOffsetM, roof.halfSpanM, ...roof.ridgeAxis, ...roof.footprint.flat(), ...(roof.holes ?? []).flat(2)].every(Number.isFinite)) throw new RangeError('Invalid roof surface')
  const tilt = tiltDeg * Math.PI / 180, azimuth = azimuthDeg * Math.PI / 180
  const widthAxis: SitePoint = [-Math.cos(azimuth), -Math.sin(azimuth)]
  const facing: SitePoint = [Math.sin(azimuth), -Math.cos(azimuth)]
  const normal: RoofPoint3 = [Math.sin(azimuth) * Math.sin(tilt), Math.cos(tilt), -Math.cos(azimuth) * Math.sin(tilt)]
  const depth = panelLengthM * Math.cos(tilt)
  // Include both the frame and raised cell surface in the plan envelope. This
  // stays nonzero at 90 degrees, where the module centre plane becomes a line.
  const footprintDepth = depth + .07 * Math.sin(tilt)
  const us = roof.footprint.map(point => dot(point, widthAxis)), vs = roof.footprint.map(point => dot(point, facing))
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs)
  const columns = Math.max(0, Math.floor((maxU - minU - 2 * edgeSetbackM + columnGapM) / (panelWidthM + columnGapM)))
  const rows = Math.max(0, Math.floor((maxV - minV - 2 * edgeSetbackM + rowGapM) / (footprintDepth + rowGapM)))
  if (rows * columns > 100_000) throw new RangeError('Roof solar grid is too large')
  const candidates: { center: SitePoint; relativeCorners: RoofPoint3[] }[] = []
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const u = (minU + maxU) / 2 + (column - (columns - 1) / 2) * (panelWidthM + columnGapM)
    const v = (minV + maxV) / 2 + (row - (rows - 1) / 2) * (footprintDepth + rowGapM)
    const center: SitePoint = [widthAxis[0] * u + facing[0] * v, widthAxis[1] * u + facing[1] * v]
    const relativeCorners: RoofPoint3[] = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as SitePoint[]).map(([a, b]) => [
      center[0] + widthAxis[0] * a * panelWidthM / 2 + facing[0] * b * depth / 2,
      -b * panelLengthM * Math.sin(tilt) / 2,
      center[1] + widthAxis[1] * a * panelWidthM / 2 + facing[1] * b * depth / 2,
    ])
    const envelope: SitePoint[] = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as SitePoint[]).map(([a, b]) => [
      center[0] + widthAxis[0] * a * panelWidthM / 2 + facing[0] * b * footprintDepth / 2,
      center[1] + widthAxis[1] * a * panelWidthM / 2 + facing[1] * b * footprintDepth / 2,
    ])
    if (fitsRoof(envelope, roof, edgeSetbackM)) candidates.push({ center, relativeCorners })
  }
  // A partial installation grows outwards from the roof centre.
  const centerU = (minU + maxU) / 2, centerV = (minV + maxV) / 2
  candidates.sort((a, b) => Math.hypot(dot(a.center, widthAxis) - centerU, dot(a.center, facing) - centerV)
    - Math.hypot(dot(b.center, widthAxis) - centerU, dot(b.center, facing) - centerV))
  const panels = candidates.slice(0, panelCount).map(({ center, relativeCorners }, index): RoofSolarPanel => {
    const checkpoints = [...relativeCorners]
    const signedRidge = ([x, , z]: RoofPoint3) => -roof.ridgeAxis[1] * x + roof.ridgeAxis[0] * z - roof.ridgeOffsetM
    relativeCorners.forEach((a, i) => {
      const b = relativeCorners[(i + 1) % 4], da = signedRidge(a), db = signedRidge(b)
      if (da * db < 0) {
        const t = da / (da - db)
        checkpoints.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
      }
    })
    const height = Math.max(...checkpoints.map(([x, y, z]) => roofHeightAt(roof, [x, z]) - y)) + ROOF_CLEARANCE + PANEL_THICKNESS / 2
    const corners: RoofPoint3[] = relativeCorners.map(([x, y, z]) => [x, y + height, z])
    const supports = relativeCorners.map(([x, y, z]) => {
      const sx = center[0] + (x - center[0]) * .8, sz = center[1] + (z - center[1]) * .8
      return { bottom: [sx, roofHeightAt(roof, [sx, sz]), sz] as RoofPoint3, top: [sx, height + y * .8 - PANEL_THICKNESS / 2, sz] as RoofPoint3 }
    })
    return { id: `solar-panel-${index}`, position: [center[0], height, center[1]], corners, normal, rotation: [tilt, Math.PI - azimuth, 0], supports }
  })
  return {
    panels, requestedCount: panelCount, installedCount: panels.length, maxPanelCount: candidates.length,
    limitedByRoof: panelCount > candidates.length, panelAreaM2: panels.length * panelWidthM * panelLengthM,
    footprintAreaM2: ringArea(roof.footprint) - (roof.holes ?? []).reduce((sum, ring) => sum + ringArea(ring), 0),
    panelWidthM, panelLengthM, tiltDeg, azimuthDeg: (azimuthDeg % 360 + 360) % 360, edgeSetbackM, rowGapM,
  }
}
