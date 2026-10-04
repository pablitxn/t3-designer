import { z } from 'zod'
import { ApartmentSchema, FixtureSchema, type Apartment, type Fixture, type Point2D } from './apartment.ts'
import { DesignCustomizationSchema, MAX_DESIGN_LIGHTS, fixtureLightPosition, type DesignCustomization } from './customization.ts'

export const EDITOR_SCHEMA_VERSION = 1
const id = z.string().min(1).max(128).refine(value => value.trim().length > 0, 'ID must not be blank')
const name = z.string().trim().min(1).max(80)

/** Layouts share their architecture and the project's pinned asset catalogue. */
export const FurnitureLayoutSchema = z.object({
  id, name, fixtures: z.array(FixtureSchema).max(2000),
  customization: DesignCustomizationSchema.optional(),
})
export type FurnitureLayout = z.infer<typeof FurnitureLayoutSchema>

export const ArchitectureVariantSchema = z.object({
  id, name, apartment: ApartmentSchema,
  // Only explicitly authored partitions are removable in the first editor.
  partitionWallIds: z.array(id).max(128),
  activeLayoutId: id,
  layouts: z.array(FurnitureLayoutSchema).min(1).max(64),
}).superRefine((architecture, context) => {
  const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: 'custom', message, path })
  const roomIds = new Set(architecture.apartment.rooms.map(room => room.id))
  const layoutIds = new Set(architecture.layouts.map(layout => layout.id))
  if (layoutIds.size !== architecture.layouts.length) issue('Layout IDs must be unique within an architecture', ['layouts'])
  if (!layoutIds.has(architecture.activeLayoutId)) issue('Active layout must exist', ['activeLayoutId'])
  architecture.layouts.forEach((layout, layoutIndex) => {
    const fixtureIds = new Set<string>()
    layout.fixtures.forEach((fixture, fixtureIndex) => {
      const path = ['layouts', layoutIndex, 'fixtures', fixtureIndex]
      if (fixtureIds.has(fixture.id)) issue('Fixture IDs must be unique within a layout', [...path, 'id'])
      if (!roomIds.has(fixture.roomId)) issue('Fixture must reference a room in its architecture', [...path, 'roomId'])
      fixtureIds.add(fixture.id)
    })
  })
  if (new Set(architecture.partitionWallIds).size !== architecture.partitionWallIds.length) issue('Partition IDs must be unique', ['partitionWallIds'])
  architecture.partitionWallIds.forEach((wallId, index) => {
    const wall = architecture.apartment.walls.find(item => item.id === wallId)
    if (!wall || wall.kind !== 'interior' || !wall.estimated) issue('Partition must reference an estimated interior wall', ['partitionWallIds', index])
  })
})
export type ArchitectureVariant = z.infer<typeof ArchitectureVariantSchema>

/** Optional extension of snapshot v1. Root scene fields materialize the active
 * pair so existing renderers and exporters can keep reading snapshot v1. */
export const ProjectEditorSchema = z.object({
  schemaVersion: z.literal(EDITOR_SCHEMA_VERSION),
  activeArchitectureId: id,
  architectures: z.array(ArchitectureVariantSchema).min(1).max(32),
}).superRefine((editor, context) => {
  const ids = new Set(editor.architectures.map(architecture => architecture.id))
  if (ids.size !== editor.architectures.length) context.addIssue({ code: 'custom', message: 'Architecture IDs must be unique', path: ['architectures'] })
  if (!ids.has(editor.activeArchitectureId)) context.addIssue({ code: 'custom', message: 'Active architecture must exist', path: ['activeArchitectureId'] })
})
export type ProjectEditor = z.infer<typeof ProjectEditorSchema>

/** Inclusive plan containment, shared by editing and snapshot validation. */
export function pointInEditorPolygon([x, z]: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j], [bx, bz] = polygon[i]
    const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax)
    if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8 && z >= Math.min(az, bz) - 1e-8 && z <= Math.max(az, bz) + 1e-8) return true
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
  }
  return inside
}

function validateCustomizationScene(apartment: Apartment, fixtures: Fixture[], customization: DesignCustomization | undefined, ceiling: number, context: z.RefinementCtx, path: (string | number)[]) {
  const issue = (message: string, suffix: (string | number)[]) => context.addIssue({ code: 'custom', message, path: [...path, ...suffix] })
  const inside = ([x, y, z]: [number, number, number]) => y >= 0 && y <= ceiling + 1e-8 && pointInEditorPolygon([x, z], apartment.perimeter)
  const lights = customization?.lighting.lights ?? []
  if (lights.length + fixtures.filter(fixture => fixture.light).length > MAX_DESIGN_LIGHTS) issue(`A layout supports at most ${MAX_DESIGN_LIGHTS} light sources`, ['customization', 'lighting', 'lights'])
  fixtures.forEach((fixture, index) => {
    const position = fixtureLightPosition(fixture)
    if (position && !inside(position)) issue('Fixture light must stay inside the apartment and below its ceiling', ['fixtures', index, 'light', 'offset'])
  })
  if (!customization) return
  const refs = { wallColors: apartment.walls, floors: apartment.rooms, doors: apartment.doors, windows: apartment.windows }
  for (const collection of ['wallColors', 'floors', 'doors', 'windows'] as const) {
    const ids = new Set(refs[collection].map(item => item.id))
    for (const reference of Object.keys(customization[collection])) {
      if (!ids.has(reference)) issue('Customization must reference an existing architectural element', ['customization', collection, reference])
    }
  }
  const roomIds = new Set(apartment.rooms.map(room => room.id)), lightIds = new Set<string>()
  lights.forEach((light, index) => {
    const lightPath = ['customization', 'lighting', 'lights', index]
    if (lightIds.has(light.id)) issue('Fixed light IDs must be unique within a layout', [...lightPath, 'id'])
    if (!roomIds.has(light.roomId)) issue('Light must reference a room in its architecture', [...lightPath, 'roomId'])
    if (!inside(light.position)) issue('Light must stay inside the apartment and below its ceiling', [...lightPath, 'position'])
    lightIds.add(light.id)
  })
}

export function validateEditorScene(snapshot: { apartment: Apartment; fixtures: Fixture[]; customization?: DesignCustomization; assets: { id: string; dimensions: [number, number, number] }[]; geometry: { ceiling: { elevation: number } }; editor?: ProjectEditor }, context: z.RefinementCtx) {
  validateCustomizationScene(snapshot.apartment, snapshot.fixtures, snapshot.customization, snapshot.geometry.ceiling.elevation, context, [])
  const editor = snapshot.editor
  if (!editor) return
  const assets = new Map(snapshot.assets.map(asset => [asset.id, asset]))
  editor.architectures.forEach((architecture, architectureIndex) => {
    architecture.layouts.forEach((layout, layoutIndex) => {
      validateCustomizationScene(architecture.apartment, layout.fixtures, layout.customization, snapshot.geometry.ceiling.elevation, context, ['editor', 'architectures', architectureIndex, 'layouts', layoutIndex])
      layout.fixtures.forEach((fixture, fixtureIndex) => {
        const path = ['editor', 'architectures', architectureIndex, 'layouts', layoutIndex, 'fixtures', fixtureIndex]
        const asset = assets.get(fixture.assetId)
        if (!asset) context.addIssue({ code: 'custom', message: 'Fixture must reference a project asset, including inactive layouts', path: [...path, 'assetId'] })
        if (!pointInEditorPolygon([fixture.position[0], fixture.position[2]], architecture.apartment.perimeter)) context.addIssue({ code: 'custom', message: 'Object origin must stay inside its apartment', path: [...path, 'position'] })
        if (asset && fixture.position[1] + asset.dimensions[1] > snapshot.geometry.ceiling.elevation + 1e-8) context.addIssue({ code: 'custom', message: 'Object extends above the ceiling', path: [...path, 'position'] })
      })
    })
  })
  const architecture = editor.architectures.find(item => item.id === editor.activeArchitectureId)
  const layout = architecture?.layouts.find(item => item.id === architecture.activeLayoutId)
  if (architecture && JSON.stringify(snapshot.apartment) !== JSON.stringify(architecture.apartment)) context.addIssue({ code: 'custom', message: 'Root apartment must match the active architecture', path: ['apartment'] })
  if (layout && JSON.stringify(snapshot.fixtures) !== JSON.stringify(layout.fixtures)) context.addIssue({ code: 'custom', message: 'Root fixtures must match the active layout', path: ['fixtures'] })
  if (layout && JSON.stringify(snapshot.customization) !== JSON.stringify(layout.customization)) context.addIssue({ code: 'custom', message: 'Root customization must match the active layout', path: ['customization'] })
}
