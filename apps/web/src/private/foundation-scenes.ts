import { ProjectSnapshotSchema, type FoundationCandidate, type FoundationModels, type Point2D, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { polygonCentroid, segmentWall, wallLength, wallRotation } from '../../../../packages/geometry/src/index.ts'
import { buildSiteSolarSnapshot } from '../lib/solar-snapshot.ts'
import { getLocalDate, getLocalMinutes, resolveLocalDateTime } from '../lib/solar.ts'

type Dwelling = Extract<FoundationCandidate, { target: 'dwelling' }>
type Building = Extract<FoundationCandidate, { target: 'building' }>

function rebaseSolar(previous: ProjectSnapshot, site: ProjectSnapshot['site']) {
  if (previous.site.latitude === site.latitude && previous.site.longitude === site.longitude && previous.site.timeZone === site.timeZone) return structuredClone(previous.solar)
  const instant = new Date(previous.solar.selected.utc)
  const date = getLocalDate(instant, site.timeZone), minutes = getLocalMinutes(instant, site.timeZone)
  const local = resolveLocalDateTime(date, minutes, site.timeZone)
  // Keep the UTC instant even if the new timezone repeats this clock minute.
  const disambiguation = local.status === 'ambiguous' ? (local.instants[0].getTime() === instant.getTime() ? 'earlier' : 'later') : 'reject'
  return buildSiteSolarSnapshot(site, { date, minutes, disambiguation })
}

/** Materialize each simultaneous floor independently; editor variants stay
 * alternatives within a floor, never substitutes for the other floors. */
export function assembleFoundationScenes(projectId: string, name: string, dwelling: Dwelling, building: Building, now = new Date()): FoundationModels['levels'] {
  const target = building.buildings.find(item => item.isTarget)!
  const [cx, cz] = polygonCentroid(target.footprint)
  const registration = building.dwellingRegistration
  // Every plan uses one dwelling coordinate frame. Without explicit registration,
  // center the stack once; independent storey centering displaces stairs/setbacks.
  const planPoints = dwelling.levels.flatMap(level => level.apartment.perimeter)
  const ax = (Math.min(...planPoints.map(point => point[0])) + Math.max(...planPoints.map(point => point[0]))) / 2
  const az = (Math.min(...planPoints.map(point => point[1])) + Math.max(...planPoints.map(point => point[1]))) / 2
  const x = registration?.position[0] ?? cx - ax, z = registration?.position[2] ?? cz - az
  const site = building.site
  const solar = buildSiteSolarSnapshot(site, { date: getLocalDate(now, site.timeZone), minutes: 720, disambiguation: 'earlier' })
  return dwelling.levels.map(level => {
    const apartment = level.apartment
    const xs = apartment.perimeter.map(point => point[0]), zs = apartment.perimeter.map(point => point[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const y = level.elevation + (registration?.position[1] ?? 0)
    const floorElevation = apartment.floorRegions ? Math.min(...apartment.floorRegions.map(region => region.floorElevation)) : 0
    const ceilingElevation = apartment.floorRegions ? Math.max(...apartment.floorRegions.map(region => region.ceilingElevation)) : level.ceilingHeight
    const band: Point2D[] = apartment.perimeter.map(([px, pz]) => [px + x, pz + z])
    const walls = apartment.walls.map(wall => {
      const length = wallLength(wall), ux = (wall.to[0] - wall.from[0]) / length, uz = (wall.to[1] - wall.from[1]) / length
      return { wallId: wall.id, solids: segmentWall(wall, [...apartment.doors, ...apartment.windows]).map(segment => ({
        position: [wall.from[0] + ux * (segment.offset + segment.length / 2), (wall.baseElevation ?? 0) + segment.bottom + segment.height / 2, wall.from[1] + uz * (segment.offset + segment.length / 2)] as [number, number, number],
        scale: [segment.length, segment.height, wall.thickness] as [number, number, number], rotationY: wallRotation(wall) || 0,
      })) }
    })
    const scene = ProjectSnapshotSchema.parse({
      schemaVersion: 1, project: { id: projectId, name }, units: 'meters',
      coordinates: { apartment: 'local plan X/right,Y/up,Z/down', site: 'X/east,Y/up,Z/south', blender: 'X/east,Y/north,Z/up', siteToBlender: [['x', 1], ['z', -1], ['y', 1]] },
      apartment, assets: [], fixtures: [],
      placement: { buildingId: site.targetId, confidence: 'estimated', position: [x, y, z], rotationY: 0, floorIndex: level.levelIndex, storeyHeight: level.ceilingHeight + .2, floorElevation: y, facadeOffset: 0, exteriorInset: 0, wallHeight: level.ceilingHeight,
        bounds: { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ }, livingFacadeAzimuth: 180, bedroomFacadeAzimuth: 0,
        label: level.name, assumption: `${registration ? `Registro explícito por traslación común, sin giro ni escala, de la vivienda ${registration.dwellingVersionId}. Evidencia ${registration.evidence.confidence}: ${registration.evidence.note}` : 'Ubicación conjunta de todas las plantas y orientación estimadas; se conserva el mismo origen horizontal entre pisos. Revisar registro entre plano y edificio.'} ${dwelling.connections.some(connection => connection.geometry) ? 'Las escaleras con geometría explícita permiten recorrer las plantas conectadas; revisar las dimensiones y cotas inferidas.' : 'Las conexiones sin geometría se documentan, no habilitan tránsito entre plantas.'}` },
      geometry: { walls, floor: { polygon: apartment.perimeter, elevation: floorElevation, thickness: .15 }, ceiling: { polygon: apartment.perimeter, elevation: ceilingElevation, thickness: .2 }, contextSections: { before: [], apartmentBand: band, after: [], belowTop: y + floorElevation - .15, ceilingBase: y + ceilingElevation } },
      site, buildings: building.buildings, roads: building.roads, parcel: building.parcel, solar,
    })
    return { id: level.levelId, name: level.name, scene }
  })
}

/** Update one floor while sharing the building's solar moment and installation. */
export function updateFoundationFloor(models: FoundationModels, scene: ProjectSnapshot): FoundationModels {
  return { ...models, levels: models.levels.map(level => ({
    ...level,
    scene: { ...(level.id === models.activeLevelId ? scene : level.scene), solar: structuredClone(scene.solar), buildingEnergy: scene.buildingEnergy ? structuredClone(scene.buildingEnergy) : undefined },
  })) }
}

/** Building corrections update geographic context without rebuilding a floor's
 * edited interior. Energy scenarios are user assumptions attached to the target
 * building; they contain no imported rooftop mesh to transfer. */
export function rebaseBuildingFoundation(previousModels: FoundationModels, newLevels: FoundationModels['levels'], registration?: Building['dwellingRegistration']): FoundationModels['levels'] {
  return newLevels.map(level => {
    const previous = previousModels.levels.find(item => item.id === level.id)?.scene
    if (!previous) return level
    const scene = level.scene
    const target = scene.buildings.find(building => building.id === scene.site.targetId)!
    const priorTarget = previous.buildings.find(building => building.id === previous.site.targetId)!
    const [cx, cz] = polygonCentroid(target.footprint)
    const [priorX, priorZ] = polygonCentroid(priorTarget.footprint)
    const [oldX, oldY, oldZ] = previous.placement.position
    // An explicit registration supersedes an earlier estimated placement, even
    // when the building footprint did not move. Keep edited floor-local data.
    const dx = registration ? scene.placement.position[0] - oldX : cx - priorX
    const dz = registration ? scene.placement.position[2] - oldZ : cz - priorZ
    const dy = registration ? scene.placement.position[1] - oldY : target.groundOffset - priorTarget.groundOffset
    const position = registration ? scene.placement.position : [oldX + dx, oldY + dy, oldZ + dz]
    return { ...level, scene: ProjectSnapshotSchema.parse({
      ...scene, apartment: previous.apartment, assets: previous.assets, fixtures: previous.fixtures, solar: rebaseSolar(previous, scene.site),
      ...(previous.editor ? { editor: previous.editor } : {}),
      ...(previous.customization ? { customization: previous.customization } : {}),
      ...(previous.buildingEnergy ? { buildingEnergy: { ...previous.buildingEnergy, buildingId: scene.site.targetId } } : {}),
      placement: { ...previous.placement, buildingId: scene.site.targetId, position, floorElevation: registration ? scene.placement.floorElevation : previous.placement.floorElevation + dy,
        ...(registration ? { rotationY: 0, assumption: scene.placement.assumption } : {}) },
      geometry: { ...previous.geometry, contextSections: {
        ...scene.geometry.contextSections,
        apartmentBand: registration ? previous.apartment.perimeter.map(([px, pz]) => [px + position[0], pz + position[2]]) : previous.geometry.contextSections.apartmentBand.map(([px, pz]) => [px + dx, pz + dz]),
        belowTop: previous.geometry.contextSections.belowTop + dy,
        ceilingBase: previous.geometry.contextSections.ceilingBase + dy,
      } },
    }) }
  })
}
