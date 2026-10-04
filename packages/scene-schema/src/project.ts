import { z } from 'zod'
import { ApartmentSchema, AssetSchema, FixtureSchema, Point2DSchema } from './apartment.ts'
import { ProjectEditorSchema, validateEditorScene } from './editor.ts'
import { DesignCustomizationSchema } from './customization.ts'
import { BuildingEnergySchema } from './energy.ts'

export const PROJECT_SNAPSHOT_VERSION = 1
const number = z.number().finite()
const positive = number.positive()
const nonnegative = number.nonnegative()
const id = z.string().min(1)
const vector = z.tuple([number, number, number])
const polygon = z.array(Point2DSchema).min(3)
const utc = z.iso.datetime()
const date = z.iso.date()
const timeZone = id.refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}, 'Site time zone must be supported by the IANA time zone database')
const repoPath = z.string().min(1).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !path.includes(':')
  && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'),
'Asset path must be a normalized repository-relative path')

export const SiteBuildingSchema = z.object({
  id, rnbId: id.nullable(), isTarget: z.boolean(), label: id,
  footprint: polygon, holes: z.array(polygon).optional(),
  height: positive, roofHeight: nonnegative,
  groundAltitude: number.nullable(), groundOffset: number,
  floors: nonnegative.int().nullable(),
  planarAccuracy: nonnegative.nullable(), verticalAccuracy: nonnegative.nullable(),
  source: z.enum(['ign-bdtopo', 'estimated', 'generalized-demo']),
})

export const BuildingSiteSchema = z.object({
  latitude: number.min(-90).max(90), longitude: number.min(-180).max(180),
  timeZone, address: id, officialAddress: id, targetId: id, rnbId: id.nullable(),
  groundAltitude: number, retrievedAt: date, radiusMeters: positive,
  datasetKind: z.literal('generalized-demo').optional(), geolocationNote: z.string().optional(),
  attribution: id, rnbUrl: z.url().nullable(), mapUrl: z.url(),
})

const solarPosition = z.object({
  altitude: number.min(-90).max(90), azimuth: number.min(0).max(360),
  direction: vector.refine(value => Math.abs(Math.hypot(...value) - 1) < 1e-8, 'Solar direction must be a unit vector'),
  isDaylight: z.boolean(),
})
const solarSample = solarPosition.extend({
  frame: positive.int(), minutes: nonnegative.int().max(1439),
  localTime: z.string().regex(/^\d{2}:\d{2}$/), utc,
  elapsedMinutes: nonnegative,
})

export const SolarSnapshotSchema = z.object({
  date: date.refine(value => value >= '1900-01-01' && value <= '2100-12-31', 'Solar study date must be from 1900 through 2100'), timeZone: id, source: id,
  selected: solarPosition.extend({
    minutes: nonnegative.int().max(1439), utc,
    disambiguation: z.enum(['reject', 'earlier', 'later']),
  }),
  sampleIntervalMinutes: z.literal(15),
  defaultFrame: positive.int(),
  samples: z.array(solarSample).min(1),
  sunrise: utc.nullable(), sunset: utc.nullable(), solarNoon: utc,
  daylightMinutes: nonnegative.max(1500),
}).superRefine((solar, context) => {
  if (solar.defaultFrame > solar.samples.length) {
    context.addIssue({ code: 'custom', message: 'Default frame must reference an existing solar sample', path: ['defaultFrame'] })
  }
  // Nonfatal array constraints do not stop Zod's refinements. Let min(1)
  // report an empty timeline instead of throwing outside safeParse's contract.
  if (solar.samples.length === 0) return
  const first = Date.parse(solar.samples[0].utc)
  solar.samples.forEach((sample, index) => {
    if (sample.frame !== index + 1 || sample.elapsedMinutes !== index * solar.sampleIntervalMinutes
      || Date.parse(sample.utc) - first !== sample.elapsedMinutes * 60_000) {
      context.addIssue({ code: 'custom', message: 'Solar samples must follow actual elapsed time in sequential frames', path: ['samples', index] })
    }
    if (sample.isDaylight !== (sample.altitude > 0)) {
      context.addIssue({ code: 'custom', message: 'Solar daylight state must follow geometric altitude', path: ['samples', index, 'isDaylight'] })
    }
  })
  if (solar.selected.isDaylight !== (solar.selected.altitude > 0)) {
    context.addIssue({ code: 'custom', message: 'Selected daylight state must follow geometric altitude', path: ['selected', 'isDaylight'] })
  }
})

const placement = z.object({
  buildingId: id, confidence: z.literal('estimated'), position: vector, rotationY: number,
  floorIndex: nonnegative.int(), storeyHeight: positive, floorElevation: number,
  facadeOffset: nonnegative, exteriorInset: nonnegative, wallHeight: positive,
  bounds: z.object({ minX: number, maxX: number, minZ: number, maxZ: number, width: positive, depth: positive }),
  livingFacadeAzimuth: nonnegative.max(360), bedroomFacadeAzimuth: nonnegative.max(360),
  label: id, assumption: id,
})
const surface = z.object({ polygon, elevation: number, thickness: positive })
const solid = z.object({
  position: vector,
  scale: z.tuple([positive, positive, positive]),
  rotationY: number,
})

/** Renderer-neutral persisted project. Architectural values and solids use the
 * apartment's local axes; context rings and solar directions use the true site
 * axes. Placement is the sole local-to-site rigid transform. */
export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(PROJECT_SNAPSHOT_VERSION),
  project: z.object({ id, name: id }),
  units: z.literal('meters'),
  coordinates: z.object({
    apartment: z.literal('local plan X/right,Y/up,Z/down'),
    site: z.literal('X/east,Y/up,Z/south'),
    blender: z.literal('X/east,Y/north,Z/up'),
    siteToBlender: z.tuple([
      z.tuple([z.literal('x'), z.literal(1)]),
      z.tuple([z.literal('z'), z.literal(-1)]),
      z.tuple([z.literal('y'), z.literal(1)]),
    ]),
  }),
  apartment: ApartmentSchema,
  assets: z.array(AssetSchema.extend({ repoPath })),
  fixtures: z.array(FixtureSchema),
  customization: DesignCustomizationSchema.optional(),
  editor: ProjectEditorSchema.optional(),
  /** One installation belongs to the target building, outside apartment variants. */
  buildingEnergy: BuildingEnergySchema.optional(),
  placement,
  geometry: z.object({
    walls: z.array(z.object({ wallId: id, solids: z.array(solid) })),
    floor: surface,
    ceiling: surface,
    contextSections: z.object({
      before: z.array(Point2DSchema).refine(points => points.length === 0 || points.length >= 3), apartmentBand: polygon, after: z.array(Point2DSchema).refine(points => points.length === 0 || points.length >= 3),
      belowTop: number, ceilingBase: number,
    }),
  }),
  site: BuildingSiteSchema,
  buildings: z.array(SiteBuildingSchema).min(1),
  roads: z.array(z.object({ id, name: id, points: z.array(Point2DSchema).min(2), width: positive, isPath: z.boolean() })),
  parcel: z.object({ id, label: id, area: positive, footprint: polygon }),
  solar: SolarSnapshotSchema,
}).superRefine((snapshot, context) => {
  validateEditorScene(snapshot, context)
  const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: 'custom', message, path })
  const rooms = new Set(snapshot.apartment.rooms.map(room => room.id))
  const assetIds = new Set(snapshot.assets.map(asset => asset.id))
  if (assetIds.size !== snapshot.assets.length) issue('Asset IDs must be unique', ['assets'])
  snapshot.assets.forEach((asset, index) => {
    const privateModel = /^\/api\/projects\/([^/]+)\/assets\/([^/]+)\/files\/model\.glb$/.exec(asset.url)
    if (privateModel && (privateModel[1] !== snapshot.project.id || privateModel[2] !== asset.id)) {
      issue('Private model URL must match its project and asset IDs', ['assets', index, 'url'])
    }
  })
  const fixtureIds = new Set<string>()
  snapshot.fixtures.forEach((fixture, index) => {
    if (!assetIds.has(fixture.assetId)) issue('Fixture must reference an existing asset', ['fixtures', index, 'assetId'])
    if (!rooms.has(fixture.roomId)) issue('Fixture must reference an existing room', ['fixtures', index, 'roomId'])
    if (fixtureIds.has(fixture.id)) issue('Fixture IDs must be unique', ['fixtures', index, 'id'])
    fixtureIds.add(fixture.id)
  })
  const targets = snapshot.buildings.filter(building => building.isTarget)
  if (snapshot.buildingEnergy && snapshot.buildingEnergy.buildingId !== snapshot.site.targetId) {
    issue('Solar installation must belong to the target building', ['buildingEnergy', 'buildingId'])
  }
  if (targets.length !== 1 || targets[0]?.id !== snapshot.site.targetId) {
    issue('Site must reference its single target building', ['site', 'targetId'])
  }
  if (snapshot.placement.buildingId !== snapshot.site.targetId) {
    issue('Apartment placement must reference the target building', ['placement', 'buildingId'])
  }
  if (new Set(snapshot.buildings.map(building => building.id)).size !== snapshot.buildings.length) issue('Building IDs must be unique', ['buildings'])
  const walls = new Map(snapshot.apartment.walls.map(wall => [wall.id, wall]))
  const solidWallIds = new Set(snapshot.geometry.walls.map(wall => wall.wallId))
  if (solidWallIds.size !== snapshot.geometry.walls.length || solidWallIds.size !== walls.size) {
    issue('Wall geometry must cover every wall exactly once', ['geometry', 'walls'])
  }
  snapshot.geometry.walls.forEach((wall, index) => {
    if (!walls.has(wall.wallId)) issue('Wall geometry must reference an existing wall', ['geometry', 'walls', index, 'wallId'])
  })
  if (snapshot.solar.timeZone !== snapshot.site.timeZone) issue('Solar and site time zones must match', ['solar', 'timeZone'])
  if (Math.abs(snapshot.placement.floorElevation - snapshot.placement.position[1]) > 1e-8) {
    issue('Placement floor elevation must equal its vertical translation', ['placement', 'floorElevation'])
  }
  if (Math.abs(snapshot.geometry.contextSections.ceilingBase - snapshot.placement.floorElevation - snapshot.geometry.ceiling.elevation) > 1e-8) {
    issue('Context ceiling must align with the apartment ceiling in the site frame', ['geometry', 'contextSections', 'ceilingBase'])
  }
})

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
export type SolarSnapshot = z.infer<typeof SolarSnapshotSchema>
