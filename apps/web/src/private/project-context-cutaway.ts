import { polygonArea } from '@t3-designer/geometry'
import type { Point2D, ProjectSnapshot } from '@t3-designer/scene-schema'
import { surfacePolygons } from '../components/surface-geometry.ts'

export type ContextCutaway = { polygon: Point2D[]; base: number; ceiling: number }
export type ContextVolume = { polygon: Point2D[]; holes?: Point2D[][]; base: number; height: number }
type Building = Pick<ProjectSnapshot['buildings'][number], 'footprint' | 'holes' | 'groundOffset' | 'height'>
const epsilon = 1e-8

/** Region elevations matter: an annex may sit below the principal floor. */
export function projectContextCutaways({ apartment, placement, geometry }: Pick<ProjectSnapshot, 'apartment' | 'placement' | 'geometry'>): ContextCutaway[] {
  const regions = apartment.floorRegions?.length ? apartment.floorRegions : [{ polygon: apartment.perimeter, floorElevation: geometry.floor.elevation, ceilingElevation: geometry.ceiling.elevation }]
  const [x, y, z] = placement.position, cosine = Math.cos(placement.rotationY), sine = Math.sin(placement.rotationY)
  return regions.map(region => ({
    polygon: region.polygon.map(([px, pz]): Point2D => [x + cosine * px + sine * pz, z - sine * px + cosine * pz]),
    base: y + region.floorElevation - geometry.floor.thickness,
    ceiling: y + region.ceilingElevation,
  }))
}

/** Visual cutaway only. The authored building and solar model remain untouched. */
export function contextBuildingVolumes(building: Building, regions: ContextCutaway[]): ContextVolume[] {
  const base = building.groundOffset, top = base + building.height
  const whole = { polygon: building.footprint, holes: building.holes, base, height: building.height }
  const overlapping = regions.filter(region => region.base < top - epsilon && region.ceiling > base + epsilon
    && surfacePolygons(building.footprint, building.holes, region.polygon).reduce((area, piece) => area + polygonArea(piece), 0) > epsilon)
  if (!overlapping.length) return [whole]
  const heights = [...new Set([base, top, ...overlapping.map(region => region.base).filter(height => height > base && height < top)])].sort((a, b) => a - b)
  return heights.slice(0, -1).flatMap((base, index) => {
    const height = heights[index + 1] - base
    if (height <= epsilon) return []
    // Open upwards over the active rooms so caps above their ceilings do not
    // cover the plan. All mass outside those rooms keeps its original height.
    const cutouts = overlapping.filter(region => region.base <= base + epsilon).map(region => region.polygon)
    if (!cutouts.length) return [{ ...whole, base, height }]
    return surfacePolygons(building.footprint, [...(building.holes ?? []), ...cutouts]).map(polygon => ({ polygon, base, height }))
  })
}
