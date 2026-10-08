import { z } from 'zod'

const label = z.string().trim().max(120)
const notes = z.string().max(20_000)
const id = z.string().min(1).max(128)
const dimension = z.number().finite().positive().max(1_000).nullable()
const status = z.enum(['draft', 'ready'])

export const ProjectPlanReferenceSchema = z.object({
  id: z.uuid(), name: label,
}).strict()

/** Intake is deliberately separate from a renderable scene: a plan attachment,
 * address or declared source is not a reviewed reconstruction. */
export const ProjectFoundationsSchema = z.object({
  schemaVersion: z.literal(1),
  dwelling: z.object({
    kind: z.enum(['apartment', 'house']),
    status,
    levels: z.array(z.object({
      id, name: label,
      levelIndex: z.number().int().min(-20).max(200),
      elevation: z.number().finite().min(-1_000).max(10_000).nullable(),
      ceilingHeight: dimension,
      width: dimension,
      depth: dimension,
      notes,
      planReferences: z.array(ProjectPlanReferenceSchema).max(4),
    }).strict()).min(1).max(30),
  }).strict(),
  building: z.object({
    status,
    address: z.string().trim().max(500),
    countryCode: z.string().trim().regex(/^(?:[A-Z]{2})?$/),
    region: z.string().trim().max(250),
    cadastralReference: z.string().trim().max(250).optional(),
    notes,
    sources: z.array(z.object({
      id, title: z.string().trim().max(250),
      url: z.union([z.literal(''), z.url().max(2_000).refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Source URL must use HTTP or HTTPS')]),
      kind: z.enum(['official', 'user']),
      retrievedAt: z.iso.date().optional(),
    }).strict()).max(50),
  }).strict(),
}).strict().superRefine((foundations, context) => {
  const levels = foundations.dwelling.levels
  if (new Set(levels.map(level => level.id)).size !== levels.length) {
    context.addIssue({ code: 'custom', message: 'Level IDs must be unique', path: ['dwelling', 'levels'] })
  }
  if (new Set(levels.map(level => level.levelIndex)).size !== levels.length) {
    context.addIssue({ code: 'custom', message: 'Level numbers must be unique', path: ['dwelling', 'levels'] })
  }
  levels.forEach((level, index) => {
    if (new Set(level.planReferences.map(reference => reference.id)).size !== level.planReferences.length) {
      context.addIssue({ code: 'custom', message: 'Plan references must be unique within each level', path: ['dwelling', 'levels', index, 'planReferences'] })
    }
  })
  if (new Set(foundations.building.sources.map(source => source.id)).size !== foundations.building.sources.length) {
    context.addIssue({ code: 'custom', message: 'Source IDs must be unique', path: ['building', 'sources'] })
  }
})

export type ProjectFoundations = z.infer<typeof ProjectFoundationsSchema>
export type ProjectPlanReference = z.infer<typeof ProjectPlanReferenceSchema>

export function createProjectFoundations(): ProjectFoundations {
  return {
    schemaVersion: 1,
    dwelling: {
      kind: 'apartment', status: 'draft',
      levels: [{ id: 'ground-floor', name: 'Planta baja', levelIndex: 0, elevation: null, ceilingHeight: null, width: null, depth: null, notes: '', planReferences: [] }],
    },
    building: { status: 'draft', address: '', countryCode: '', region: '', notes: '', sources: [] },
  }
}

/** Legacy projects already contain complete snapshots. New intake projects
 * require reviewed models for both foundations before downstream tools open. */
export function projectFoundationReadiness(foundations: ProjectFoundations | null, sceneAvailable: boolean) {
  const dwelling = sceneAvailable && (foundations === null || foundations.dwelling.status === 'ready')
  const building = sceneAvailable && (foundations === null || foundations.building.status === 'ready')
  return { dwelling, building, ready: dwelling && building }
}
