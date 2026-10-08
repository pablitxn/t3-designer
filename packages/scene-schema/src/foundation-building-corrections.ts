import { z } from 'zod'
import { SiteBuildingSchema } from './project.ts'

const evidence = { buildingId: z.string().min(1).max(128), quote: z.string().min(1).max(4_000) }
const dimension = z.number().finite().positive().max(1_000)
/** Model proposals are constrained operations. The API owns validation of their
 * current-user quote and produces the canonical provenance below. */
export const FoundationBuildingEditSchema = z.discriminatedUnion('type', [
  z.object({ ...evidence, type: z.literal('set_height'), value: dimension }).strict(),
  z.object({ ...evidence, type: z.literal('set_roof_height'), value: z.number().finite().min(0).max(200) }).strict(),
  z.object({ ...evidence, type: z.literal('set_total_height'), value: dimension }).strict(),
  z.object({ ...evidence, type: z.literal('translate'), dx: z.number().finite().min(-1_000).max(1_000), dz: z.number().finite().min(-1_000).max(1_000) }).strict(),
  z.object({ ...evidence, type: z.literal('resize_footprint'), axis: z.enum(['width', 'depth']), value: dimension }).strict(),
])
export type FoundationBuildingEdit = z.infer<typeof FoundationBuildingEditSchema>

export const FoundationBuildingCorrectionsSchema = z.object({
  baseBuildings: z.array(SiteBuildingSchema).min(1).max(100),
  operations: z.array(FoundationBuildingEditSchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.baseBuildings.map(building => building.id))
  if (ids.size !== value.baseBuildings.length) context.addIssue({ code: 'custom', message: 'Original building records must be unique', path: ['baseBuildings'] })
  if (value.operations.some(operation => !ids.has(operation.buildingId))) context.addIssue({ code: 'custom', message: 'Every building correction requires its immutable original record', path: ['operations'] })
})
export type FoundationBuildingCorrections = z.infer<typeof FoundationBuildingCorrectionsSchema>
