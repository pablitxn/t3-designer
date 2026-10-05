import { z } from 'zod'
import { LightSourceSchema } from './customization.ts'

export const SCENE_SCHEMA_VERSION = 1

// Every linear quantity is in meters. Plan points are [X, Z]; Y is height.
export const Point2DSchema = z.tuple([z.number().finite(), z.number().finite()])
export type Point2D = z.infer<typeof Point2DSchema>

const positive = z.number().finite().positive()
const nonnegative = z.number().finite().nonnegative()
const id = z.string().min(1)
const tolerance = 1e-8

const polygon = z.array(Point2DSchema).min(3).refine((points) => {
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0)
  return Math.abs(twiceArea) > tolerance
}, 'Polygon must enclose a nonzero area')

export const RoomSchema = z.object({
  id,
  name: z.string().min(1),
  polygon,
  // Reported area is source evidence, distinct from the reconstructed polygon.
  reportedArea: positive,
  color: z.string().regex(/^#[\da-f]{6}$/i),
})
export type Room = z.infer<typeof RoomSchema>

export const WallSchema = z.object({
  id,
  from: Point2DSchema,
  to: Point2DSchema,
  height: positive,
  thickness: positive,
  kind: z.enum(['exterior', 'interior']),
  estimated: z.boolean(),
}).refine((wall) => Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) > tolerance, {
  message: 'Wall endpoints must differ',
  path: ['to'],
})
export type Wall = z.infer<typeof WallSchema>

const openingFields = {
  id,
  wallId: id,
  // Distance along the wall from wall.from to the opening's first edge.
  offset: nonnegative,
  width: positive,
  height: positive,
  estimated: z.boolean(),
}

export const DoorSchema = z.object({
  ...openingFields,
  hinge: z.enum(['start', 'end']),
  // Wall-local +X follows from → to; +Z points (-dz, dx) in the plan.
  opensToward: z.union([z.literal(1), z.literal(-1)]),
  locationConfidence: z.enum(['schematic', 'inferred', 'observed']),
  appearance: z.enum(['passage', 'panel', 'glazed']).optional(),
  finish: z.enum(['blue-gray', 'gray', 'white']).optional(),
  condition: z.enum(['damaged-panel']).optional(),
  evidence: z.string().optional(),
})
export type Door = z.infer<typeof DoorSchema>

export const WindowSchema = z.object({
  ...openingFields,
  sillHeight: nonnegative,
  kind: z.enum(['casement', 'balcony-door']).optional(),
  locationConfidence: z.enum(['observed', 'inferred']).optional(),
  evidence: z.string().optional(),
})
export type Window = z.infer<typeof WindowSchema>

export const ApartmentSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  id,
  name: z.string().min(1),
  units: z.literal('meters'),
  coordinateSystem: z.object({
    x: z.literal('east'),
    y: z.literal('up'),
    z: z.literal('south'),
  }),
  perimeter: polygon,
  rooms: z.array(RoomSchema).min(1),
  walls: z.array(WallSchema).min(1),
  doors: z.array(DoorSchema),
  windows: z.array(WindowSchema),
  balcony: z.object({ id, name: z.string().min(1), polygon, reportedArea: positive }).optional(),
  metadata: z.object({
    source: z.string().min(1),
    description: z.string().min(1),
    reportedCarrezArea: positive,
    reportedBasementArea: nonnegative,
    assumptions: z.array(z.string()),
    unresolved: z.array(z.string()),
  }),
}).superRefine((apartment, context) => {
  const ids = new Set<string>()
  for (const collection of ['rooms', 'walls', 'doors', 'windows'] as const) {
    apartment[collection].forEach((entity, index) => {
      if (ids.has(entity.id)) {
        context.addIssue({ code: 'custom', message: 'Entity IDs must be unique', path: [collection, index, 'id'] })
      }
      ids.add(entity.id)
    })
  }
  if (apartment.balcony && ids.has(apartment.balcony.id)) {
    context.addIssue({ code: 'custom', message: 'Entity IDs must be unique', path: ['balcony', 'id'] })
  }

  const walls = new Map(apartment.walls.map((wall) => [wall.id, wall]))
  const openings = [
    ...apartment.doors.map((door, index) => ({ ...door, bottom: 0, path: ['doors', index] })),
    ...apartment.windows.map((window, index) => ({ ...window, bottom: window.sillHeight, path: ['windows', index] })),
  ]
  openings.forEach((opening, index) => {
    const wall = walls.get(opening.wallId)
    if (!wall) {
      context.addIssue({ code: 'custom', message: 'Opening must reference an existing wall', path: [...opening.path, 'wallId'] })
      return
    }
    const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
    if (opening.offset + opening.width > length + tolerance) {
      context.addIssue({ code: 'custom', message: 'Opening extends beyond its wall', path: [...opening.path, 'width'] })
    }
    if (opening.bottom + opening.height > wall.height + tolerance) {
      context.addIssue({ code: 'custom', message: 'Opening extends above its wall', path: [...opening.path, 'height'] })
    }
    for (const previous of openings.slice(0, index)) {
      if (previous.wallId !== opening.wallId) continue
      const horizontalOverlap = Math.min(previous.offset + previous.width, opening.offset + opening.width)
        - Math.max(previous.offset, opening.offset)
      const verticalOverlap = Math.min(previous.bottom + previous.height, opening.bottom + opening.height)
        - Math.max(previous.bottom, opening.bottom)
      if (horizontalOverlap > tolerance && verticalOverlap > tolerance) {
        context.addIssue({ code: 'custom', message: `Opening overlaps ${previous.id}`, path: opening.path })
      }
    }
  })
})
export type Apartment = z.infer<typeof ApartmentSchema>

// Reusable authored assets remain distinct from architectural geometry.
// Private models are fetched through project authorization, never arbitrary URLs.
export const MobilitySchema = z.enum(['fixed', 'movable'])
export type Mobility = z.infer<typeof MobilitySchema>

const modelURL = z.string().regex(/^(?:\/models\/(?:[\w-]+\/)*[\w.-]+\.glb|\/demo-assets\/[\w-]+-v\d+\/model\.glb|\/api\/projects\/[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\/assets\/[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\/files\/model\.glb)$/i)
export const AssetSchema = z.object({
  id, label: z.string().min(1), url: modelURL,
  dimensions: z.tuple([positive, positive, positive]),
  evidence: z.string().min(1),
  dimensionalStatus: z.literal('estimated'),
  // Optional for stored v1 scenes. New catalog entries should set this explicitly.
  mobility: MobilitySchema.optional(),
  light: LightSourceSchema.optional(),
})
export type Asset = z.infer<typeof AssetSchema>
export const FixtureSchema = z.object({
  id, assetId: id, roomId: id, label: z.string().min(1),
  position: z.tuple([z.number().finite(), nonnegative, z.number().finite()]),
  rotation: z.number().finite(),
  evidence: z.string().min(1),
  placementStatus: z.literal('estimated'),
  // An installed instance can override its reusable asset's classification.
  mobility: MobilitySchema.optional(),
  light: LightSourceSchema.optional(),
})
export type Fixture = z.infer<typeof FixtureSchema>

// Compatibility with v1 snapshots authored before mobility was recorded. IDs,
// never translated display labels, identify the original catalog entries.
const legacyAssetMobility: Readonly<Record<string, Mobility>> = {
  'fridge-freezer': 'movable', 'washing-machine': 'fixed', 'oven-cooktop': 'fixed',
  microwave: 'movable', 'extractor-hood': 'fixed', boiler: 'fixed',
  'base-cabinet': 'fixed', 'sink-cabinet': 'fixed', 'wall-cabinet': 'fixed',
  'bathroom-vanity': 'fixed', toilet: 'fixed', radiator: 'fixed',
  'towel-rail': 'fixed', 'glass-block-screen': 'fixed', 'shower-tray': 'fixed',
  'electrical-panel': 'fixed', 'low-table': 'movable', 'wall-mirror': 'fixed',
}

export function getAssetMobility(asset: Pick<Asset, 'id' | 'mobility'> & Partial<Pick<Asset, 'url'>>): Mobility {
  if (asset.mobility) return asset.mobility
  if (Object.hasOwn(legacyAssetMobility, asset.id)) return legacyAssetMobility[asset.id]
  // Previously imported private furniture used an exact project-scoped model
  // route. Retain its editing behavior without guessing from names or labels.
  const privateModel = /^\/api\/projects\/[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\/assets\/([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})\/files\/model\.glb$/i.exec(asset.url ?? '')
  return privateModel?.[1] === asset.id ? 'movable' : 'fixed'
}

export function getFixtureMobility(fixture: Pick<Fixture, 'assetId' | 'mobility'>, asset?: Asset): Mobility {
  return fixture.mobility ?? getAssetMobility(asset?.id === fixture.assetId ? asset : { id: fixture.assetId })
}

export function isFixtureMovable(fixture: Pick<Fixture, 'assetId' | 'mobility'>, asset?: Asset): boolean {
  return getFixtureMobility(fixture, asset) === 'movable'
}
