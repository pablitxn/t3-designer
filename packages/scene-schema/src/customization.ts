import { z } from 'zod'
import type { Fixture } from './apartment.ts'

export const MAX_DESIGN_LIGHTS = 8
const id = z.string().min(1).max(128).refine(value => value.trim().length > 0, 'ID must not be blank')
const color = z.string().regex(/^#[\da-f]{6}$/i)
const number = z.number().finite()
const lightFields = {
  enabled: z.boolean(),
  kelvin: number.min(1800).max(6500),
  lumens: number.min(0).max(3000),
}

/** Local metres from the asset origin; moves and rotates with its fixture. */
export const LightSourceSchema = z.object({
  ...lightFields,
  offset: z.tuple([number.min(-10).max(10), number.min(-10).max(10), number.min(-10).max(10)]),
})
export type LightSource = z.infer<typeof LightSourceSchema>

/** A freely placed light in the apartment's local coordinate system. */
export const FixedLightSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  roomId: id,
  position: z.tuple([number, number.nonnegative(), number]),
  ...lightFields,
})
export type FixedLight = z.infer<typeof FixedLightSchema>

export const DesignCustomizationSchema = z.object({
  wallColors: z.record(id, color),
  floors: z.record(id, z.object({ material: z.enum(['parquet', 'slate', 'ivory-tile', 'entry-tile', 'concrete']), color })),
  doors: z.record(id, z.object({ style: z.enum(['panel', 'glazed', 'passage']), color, openness: number.min(0).max(1) })),
  windows: z.record(id, z.object({
    style: z.enum(['casement', 'sliding', 'fixed']), frameColor: color,
    covering: z.enum(['none', 'curtain', 'blind', 'shutter']), coveringColor: color, closure: number.min(0).max(1),
  })),
  lighting: z.object({ naturalEnabled: z.boolean(), artificialEnabled: z.boolean(), lights: z.array(FixedLightSchema).max(MAX_DESIGN_LIGHTS) }),
})
export type DesignCustomization = z.infer<typeof DesignCustomizationSchema>

/** Absence remains the legacy scene; callers receive independent editable defaults. */
export function defaultDesignCustomization(): DesignCustomization {
  return { wallColors: {}, floors: {}, doors: {}, windows: {}, lighting: { naturalEnabled: true, artificialEnabled: true, lights: [] } }
}

export function fixtureLightPosition(fixture: Pick<Fixture, 'position' | 'rotation' | 'light'>): [number, number, number] | undefined {
  if (!fixture.light) return undefined
  const [x, y, z] = fixture.light.offset, c = Math.cos(fixture.rotation), s = Math.sin(fixture.rotation)
  return [fixture.position[0] + c * x + s * z, fixture.position[1] + y, fixture.position[2] - s * x + c * z]
}
