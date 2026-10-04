import { z } from 'zod'

const finite = (min: number, max: number) => z.number().finite().min(min).max(max)
export const DimensionsSchema = z.tuple([finite(.05, 20), finite(.05, 20), finite(.05, 20)])
const vector = (min: number, max: number) => z.tuple([finite(min, max), finite(min, max), finite(min, max)])
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const ProductUrlSchema = z.string().max(2048).url().refine((value) => {
  let url: URL
  try { url = new URL(value) } catch { return false }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    && !url.port && host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost')
    && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')
}, 'Use a public product URL without credentials, an IP address, or a custom port')

export const CreateJobInputSchema = z.strictObject({
  url: ProductUrlSchema,
  notes: z.string().trim().max(12000).default(''),
  dimensions: DimensionsSchema.optional(),
  referenceImageIds: z.array(z.uuid()).max(4).optional(),
})
export type CreateJobInput = z.infer<typeof CreateJobInputSchema>
export const AnswersInputSchema = z.strictObject({
  notes: z.string().trim().min(1).max(12000),
  dimensions: DimensionsSchema.optional(),
  referenceImageIds: z.array(z.uuid()).max(4).optional(),
})
export type AnswersInput = z.infer<typeof AnswersInputSchema>
export const RevisionInputSchema = z.strictObject({
  feedback: z.string().trim().min(1).max(12000),
  referenceImageIds: z.array(z.uuid()).max(4).optional(),
})
export type RevisionInput = z.infer<typeof RevisionInputSchema>
export interface ReferenceImage { id: string; name: string; url: string }

export const SourceSchema = z.object({
  url: ProductUrlSchema.optional(),
  description: z.string().trim().min(1).max(12000),
  dimensionalStatus: z.enum(['estimated', 'user-supplied', 'manufacturer-specified']),
  references: z.array(ProductUrlSchema).max(20).optional(),
  notes: z.array(z.string().max(2000)).max(20).optional(),
})
export type Source = z.infer<typeof SourceSchema>
export const PartSchema = z.strictObject({
  name: z.string().min(1).max(100),
  shape: z.enum(['box', 'ellipsoid', 'cylinder', 'cone', 'cushion']),
  dimensions: vector(.005, 20),
  position: vector(-20, 20),
  rotation: vector(-180, 180),
  color,
  roughness: finite(0, 1),
  metallic: finite(0, 1),
  bevel: finite(0, .1),
  upholstery: z.strictObject({
    roundness: finite(.15, 1),
    tuftRows: z.number().int().min(0).max(4),
    tuftColumns: z.number().int().min(0).max(4),
    texture: z.enum(['plain', 'woven', 'corduroy']),
  }).optional(),
})
const base = {
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  label: z.string().trim().min(1).max(200),
  units: z.literal('meters'),
  dimensions: DimensionsSchema,
  material: z.strictObject({ baseColor: color, roughness: finite(0, 1) }),
  source: SourceSchema,
}
export const AssetRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('table'), parameters: z.strictObject({
    topThickness: finite(.005, 10), legWidth: finite(.005, 5), legInset: finite(0, 10),
  }) }),
  z.strictObject({ ...base, kind: z.literal('wingback-chair'), parameters: z.strictObject({ seatDimensions: vector(.1, 20) }) }),
  z.strictObject({ ...base, kind: z.literal('procedural'), parameters: z.strictObject({ parts: z.array(PartSchema).min(1).max(128) }) }),
]).superRefine((request, ctx) => {
  const [width, height, depth] = request.dimensions
  if (request.kind === 'table') {
    const { topThickness, legWidth, legInset } = request.parameters
    if (topThickness > height / 2 || legWidth > Math.min(width, depth) / 4 || 2 * (legInset + legWidth) >= Math.min(width, depth)) {
      ctx.addIssue({ code: 'custom', message: 'Table parameters must fit its outer dimensions', path: ['parameters'] })
    }
  } else if (request.kind === 'wingback-chair' && request.parameters.seatDimensions.some((value, i) => value > request.dimensions[i])) {
    ctx.addIssue({ code: 'custom', message: 'Seat dimensions must fit the chair', path: ['parameters'] })
  }
})
export type AssetRequest = z.infer<typeof AssetRequestSchema>
export const AssetPlanSchema = z.strictObject({
  status: z.enum(['ready', 'needs_input']),
  label: z.string().max(200),
  summary: z.string().max(12000),
  questions: z.array(z.string().min(1).max(2000)).max(8),
  warnings: z.array(z.string().max(2000)).max(20),
  recipe: AssetRequestSchema.nullable(),
}).superRefine((plan, ctx) => {
  if (plan.status === 'ready' && !plan.recipe) ctx.addIssue({ code: 'custom', message: 'A ready plan requires a recipe' })
  if (plan.status === 'needs_input' && (!plan.questions.length || plan.recipe)) ctx.addIssue({ code: 'custom', message: 'An incomplete plan requires questions and no recipe' })
})
export type AssetPlan = z.infer<typeof AssetPlanSchema>
export const VisualReviewSchema = z.strictObject({
  verdict: z.enum(['accept', 'revise', 'needs_input']),
  summary: z.string().min(1).max(6000),
  issues: z.array(z.string().min(1).max(2000)).max(12),
  recipe: AssetRequestSchema.nullable(),
  questions: z.array(z.string().min(1).max(2000)).max(3),
}).superRefine((review, ctx) => {
  if (review.verdict === 'revise' && !review.recipe) ctx.addIssue({ code: 'custom', message: 'A revision requires a recipe' })
  if (review.verdict !== 'revise' && review.recipe) ctx.addIssue({ code: 'custom', message: 'Only revisions carry recipes' })
  if (review.verdict === 'needs_input' && !review.questions.length) ctx.addIssue({ code: 'custom', message: 'Missing evidence requires a question' })
})
export type VisualReview = z.infer<typeof VisualReviewSchema>

export const jobStatuses = ['queued', 'analyzing', 'needs_input', 'generating', 'completed', 'failed', 'cancelled'] as const
export type JobStatus = typeof jobStatuses[number]
export const jobEventKinds = ['queued', 'analysis', 'search', 'source', 'reference', 'plan', 'question', 'answer', 'modeling', 'render', 'validation', 'review', 'revision', 'complete', 'error', 'cancelled', 'retry'] as const
export type JobEventKind = typeof jobEventKinds[number]
/** Observable tool actions and milestones; never a model's internal reasoning. */
export interface JobEventInput {
  kind: JobEventKind
  message: string
  detail?: string
  url?: string
}
export interface JobEvent extends JobEventInput {
  seq: number
  jobId: string
  attempt: number
  at: string
}
export interface Job {
  id: string
  status: JobStatus
  input: CreateJobInput
  createdAt: string
  updatedAt: string
  stage: string
  questions: string[]
  error: string | null
  assetId: string | null
  warnings: string[]
  parentAssetId?: string
  feedback?: string
}
export interface Asset {
  id: string
  jobId: string
  label: string
  kind: AssetRequest['kind']
  dimensions: [number, number, number]
  createdAt: string
  source: Source
  fidelityStatus: 'draft'
  files: { model: string; preview: string; blend: string; manifest: string; request: string }
  warnings: string[]
  parentAssetId?: string
  revision?: number
  referenceImages?: ReferenceImage[]
  visualReview?: { verdict: VisualReview['verdict']; summary: string; issues: string[]; iterations: number }
}
export interface Health {
  status: 'ok'
  projectGenerationEnabled?: boolean
  generationEnabled?: boolean
  codex: { available: boolean; authenticated: boolean; authMode: 'chatgpt' | 'api-key' | 'unavailable' }
  blender: { available: boolean }
  activeJobId: string | null
}
