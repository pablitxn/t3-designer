import { segmentWall, wallLength, wallRotation } from '../../packages/geometry/src/index.ts'
import { ProjectSnapshotSchema, PROJECT_SNAPSHOT_VERSION, type ProjectSnapshot } from '../../packages/scene-schema/src/index.ts'
import { t3Apartment } from '../../apps/web/src/data/t3.ts'
import { assetCatalog, currentFixtures } from '../../apps/web/src/data/current-state.ts'
import { BUILDING_SITE, SITE_BUILDINGS, SITE_PARCEL, SITE_ROADS } from '../../apps/web/src/data/building-site.ts'
import { APARTMENT_PLACEMENT, splitTargetBuildingFootprint } from '../../apps/web/src/data/apartment-placement.ts'
import { buildSiteSolarSnapshot } from '../../apps/web/src/lib/solar-snapshot.ts'

export type SnapshotOptions = {
  date?: string
  minutes?: number
  disambiguation?: 'reject' | 'earlier' | 'later'
}
export const DEFAULT_SNAPSHOT_DATE = '2026-09-26'
export const DEFAULT_SNAPSHOT_MINUTES = 15 * 60

/** Deterministic canonical-site wrapper shared with the interactive editor. */
export function buildSolarSnapshot({ date = DEFAULT_SNAPSHOT_DATE, minutes = DEFAULT_SNAPSHOT_MINUTES, disambiguation = 'reject' }: SnapshotOptions = {}) {
  return buildSiteSolarSnapshot(BUILDING_SITE, { date, minutes, disambiguation })
}

/** Compatibility snapshot for the existing exterior Blender adapter. */
export function buildBuildingSnapshot(options: SnapshotOptions = {}) {
  return structuredClone({
    generatedAt: BUILDING_SITE.retrievedAt,
    coordinateSystem: 'x east / y up / z south, metres',
    site: BUILDING_SITE,
    buildings: SITE_BUILDINGS,
    roads: SITE_ROADS,
    parcel: SITE_PARCEL,
    solar: buildSolarSnapshot(options),
  })
}

export function buildProjectSnapshot(options: SnapshotOptions = {}): ProjectSnapshot {
  const walls = t3Apartment.walls.map(wall => {
    const length = wallLength(wall)
    const ux = (wall.to[0] - wall.from[0]) / length
    const uz = (wall.to[1] - wall.from[1]) / length
    const apertures = [...t3Apartment.doors, ...t3Apartment.windows].filter(opening => opening.wallId === wall.id)
    return {
      wallId: wall.id,
      solids: segmentWall(wall, apertures).map(segment => ({
        position: [
          wall.from[0] + ux * (segment.offset + segment.length / 2),
          segment.bottom + segment.height / 2,
          wall.from[1] + uz * (segment.offset + segment.length / 2),
        ],
        scale: [segment.length, segment.height, wall.thickness],
        // JSON has no distinct negative zero; keep the in-memory contract equal
        // to its persisted representation for axis-aligned walls as well.
        rotationY: wallRotation(wall) || 0,
      })),
    }
  })
  return ProjectSnapshotSchema.parse({
    schemaVersion: PROJECT_SNAPSHOT_VERSION,
    project: { id: 't3-designer', name: 'T3 Demo · apartment and building solar study' },
    units: 'meters',
    coordinates: {
      apartment: 'local plan X/right,Y/up,Z/down', site: 'X/east,Y/up,Z/south', blender: 'X/east,Y/north,Z/up',
      siteToBlender: [['x', 1], ['z', -1], ['y', 1]],
    },
    apartment: t3Apartment,
    assets: assetCatalog.map(asset => ({ ...asset, repoPath: `apps/web/public${asset.url}` })),
    fixtures: currentFixtures,
    placement: APARTMENT_PLACEMENT,
    geometry: {
      walls,
      floor: { polygon: t3Apartment.perimeter, elevation: 0, thickness: .14 },
      ceiling: { polygon: t3Apartment.perimeter, elevation: APARTMENT_PLACEMENT.wallHeight, thickness: .18 },
      contextSections: {
        ...splitTargetBuildingFootprint(),
        belowTop: APARTMENT_PLACEMENT.floorElevation - .14,
        ceilingBase: APARTMENT_PLACEMENT.floorElevation + APARTMENT_PLACEMENT.wallHeight,
      },
    },
    site: BUILDING_SITE,
    buildings: SITE_BUILDINGS,
    roads: SITE_ROADS,
    parcel: SITE_PARCEL,
    solar: buildSolarSnapshot(options),
  })
}
