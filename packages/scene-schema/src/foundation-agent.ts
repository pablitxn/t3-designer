import { z } from 'zod'
import { ApartmentSchema } from './apartment.ts'
import { BuildingSiteSchema, ProjectSnapshotSchema, SiteBuildingSchema } from './project.ts'
import { FoundationBuildingCorrectionsSchema } from './foundation-building-corrections.ts'
import { FoundationConnectionSchema, dwellingCirculationIssues } from './circulation.ts'
import { FoundationOfficialResearchSchema } from './foundation-official-research.ts'

export const FoundationTargetSchema = z.enum(['dwelling', 'building'])
export type FoundationTarget = z.infer<typeof FoundationTargetSchema>
const text = z.string().max(8_000)
const messages = z.array(z.string().max(2_000)).max(100)
// Zod may run refinements after a URL-format issue. Invalid model output must
// remain a validation result so the generation loop can repair it.
function isHttpUrl(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value).protocol) }
  catch { return false }
}
const source = z.object({
  title: z.string().min(1).max(300),
  url: z.url().max(2_000).refine(isHttpUrl, 'Source links must use HTTP or HTTPS'),
  kind: z.enum(['official', 'user', 'other']), claims: messages, retrievedAt: z.iso.date(),
}).strict()
export type FoundationSource = z.infer<typeof source>
const common = { summary: text, assumptions: messages, unknowns: messages, sources: z.array(source).max(40) }
export const FoundationMeasurementCorrectionSchema = z.object({
  levelId: z.string().min(1).max(128), field: z.enum(['width', 'depth', 'ceilingHeight', 'elevation']),
  value: z.number().finite().min(-1_000).max(10_000), quote: z.string().min(1).max(4_000),
}).strict()
export type FoundationMeasurementCorrection = z.infer<typeof FoundationMeasurementCorrectionSchema>
export const FoundationDwellingRegistrationSchema = z.object({
  dwellingVersionId: z.uuid(),
  position: z.tuple([z.number().finite().min(-10_000).max(10_000), z.number().finite().min(-10_000).max(10_000), z.number().finite().min(-10_000).max(10_000)]),
  evidence: z.object({ confidence: z.enum(['observed', 'inferred', 'user']), note: z.string().min(20).max(2_000) }).strict(),
}).strict()
export type FoundationDwellingRegistration = z.infer<typeof FoundationDwellingRegistrationSchema>
export const FoundationCandidateSchema = z.discriminatedUnion('target', [
  z.object({ ...common, target: z.literal('dwelling'),
    measurementCorrections: z.array(FoundationMeasurementCorrectionSchema).max(120).optional(),
    levels: z.array(z.object({
      levelId: z.string().min(1).max(128), name: z.string().min(1).max(120), levelIndex: z.number().int().min(-20).max(200),
      elevation: z.number().finite().min(-1_000).max(10_000), ceilingHeight: z.number().finite().min(1.5).max(10),
      scaleEvidence: z.string().min(1).max(2_000), apartment: ApartmentSchema,
    }).strict()).min(1).max(30),
    connections: z.array(FoundationConnectionSchema).max(60),
  }).strict(),
  z.object({ ...common, target: z.literal('building'), site: BuildingSiteSchema,
    dwellingRegistration: FoundationDwellingRegistrationSchema.optional(),
    officialResearch: FoundationOfficialResearchSchema.optional(),
    buildingCorrections: FoundationBuildingCorrectionsSchema.optional(),
    buildings: z.array(SiteBuildingSchema).min(1).max(100),
    roads: ProjectSnapshotSchema.shape.roads,
    parcel: ProjectSnapshotSchema.shape.parcel,
  }).strict(),
]).superRefine((candidate, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  if (candidate.target === 'dwelling') {
    const ids = new Set(candidate.levels.map(level => level.levelId))
    if (ids.size !== candidate.levels.length || new Set(candidate.levels.map(level => level.levelIndex)).size !== candidate.levels.length) issue('Floor identities and numbers must be unique')
    for (const problem of dwellingCirculationIssues(candidate)) context.addIssue({ code: 'custom', ...problem })
  } else {
    for (const field of ['mapUrl', 'rnbUrl'] as const) {
      const url = candidate.site[field]
      if (url !== null && !isHttpUrl(url)) context.addIssue({ code: 'custom', message: 'Building source links must use HTTP or HTTPS', path: ['site', field] })
    }
    const target = candidate.buildings.filter(building => building.isTarget)
    if (target.length !== 1 || target[0].id !== candidate.site.targetId) issue('Exactly one target building must match the site')
    if (new Set(candidate.buildings.map(building => building.id)).size !== candidate.buildings.length) issue('Building IDs must be unique')
    if (candidate.buildingCorrections?.baseBuildings.some(original => !candidate.buildings.some(building => building.id === original.id))) issue('Building correction originals must reference current buildings')
    if (candidate.site.datasetKind === 'generalized-demo' || candidate.buildings.some(building => building.source === 'generalized-demo')) issue('A real project cannot use demonstration evidence')
  }
})
export type FoundationCandidate = z.infer<typeof FoundationCandidateSchema>
export const FoundationReviewSchema = z.object({ passed: z.boolean(), summary: text, issues: messages }).strict()
export type FoundationReview = z.infer<typeof FoundationReviewSchema>
export const FoundationIterationSchema = z.object({ index: z.number().int().min(1).max(3), candidate: FoundationCandidateSchema.nullable(), review: FoundationReviewSchema }).strict()
export type FoundationIteration = z.infer<typeof FoundationIterationSchema>
export const FoundationGenerationResultSchema = z.object({ status: z.enum(['ready', 'needs_input']), candidate: FoundationCandidateSchema.nullable(), summary: text, questions: messages, iterations: z.array(FoundationIterationSchema).max(3), officialResearch: FoundationOfficialResearchSchema.optional() }).strict()
export type FoundationGenerationResult = z.infer<typeof FoundationGenerationResultSchema>
export const FoundationAgentEventInputSchema = z.object({ kind: z.enum(['analysis', 'search', 'generation', 'validation', 'review', 'revision', 'question', 'error', 'complete']), message: z.string().max(500), detail: z.string().max(2_000).optional() }).strict()
export type FoundationAgentEventInput = z.infer<typeof FoundationAgentEventInputSchema>
export const FoundationAgentEventSchema = FoundationAgentEventInputSchema.extend({ id: z.number().int().nonnegative(), createdAt: z.iso.datetime() })
export type FoundationAgentEvent = z.infer<typeof FoundationAgentEventSchema>
export const FoundationAgentInputSchema = z.object({ target: FoundationTargetSchema, revision: z.number().int().positive(), message: z.string().trim().min(1).max(4_000), parentVersionId: z.uuid().optional() }).strict()
export type FoundationAgentInput = z.infer<typeof FoundationAgentInputSchema>
export const FoundationVersionSchema = FoundationGenerationResultSchema.extend({ id: z.uuid(), projectId: z.uuid(), target: FoundationTargetSchema, runId: z.uuid(), parentVersionId: z.uuid().nullable(), sourceRevision: z.number().int().positive(), foundationsFingerprint: z.string().min(1), createdAt: z.iso.datetime() })
export type FoundationVersion = z.infer<typeof FoundationVersionSchema>
export type FoundationAgentVersion = FoundationVersion
export const FoundationAgentRunSchema = z.object({
  id: z.uuid(), projectId: z.uuid(), target: FoundationTargetSchema,
  status: z.enum(['queued', 'running', 'completed', 'needs_input', 'failed', 'cancelled']),
  message: text, parentVersionId: z.uuid().nullable(), sourceRevision: z.number().int().positive(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), error: text.nullable(), versionId: z.uuid().nullable(),
  events: z.array(FoundationAgentEventSchema).max(250), iterations: z.array(FoundationIterationSchema).max(3),
  officialResearch: FoundationOfficialResearchSchema.optional(),
})
export type FoundationAgentRun = z.infer<typeof FoundationAgentRunSchema>
const accepted = z.object({ versionId: z.uuid(), candidate: FoundationCandidateSchema })
export const FoundationModelsSchema = z.object({
  dwelling: accepted.nullable(), building: accepted.nullable(),
  activeLevelId: z.string().nullable(),
  levels: z.array(z.object({ id: z.string(), name: z.string(), scene: ProjectSnapshotSchema })).max(30),
}).superRefine((models, context) => {
  if ((models.dwelling && models.dwelling.candidate.target !== 'dwelling') || (models.building && models.building.candidate.target !== 'building')) context.addIssue({ code: 'custom', message: 'Accepted model must match its target' })
  if (models.levels.length && !models.levels.some(level => level.id === models.activeLevelId)) context.addIssue({ code: 'custom', message: 'Active floor must exist' })
  if (new Set(models.levels.map(level => level.id)).size !== models.levels.length) context.addIssue({ code: 'custom', message: 'Floor IDs must be unique' })
})
export type FoundationModels = z.infer<typeof FoundationModelsSchema>

/** Intake readiness flags do not alter the inputs a generated version used. */
export function foundationInputFingerprintValue(foundations: unknown): string {
  const copy = structuredClone(foundations) as { dwelling?: { status?: string }; building?: { status?: string } }
  if (copy?.dwelling) delete copy.dwelling.status
  if (copy?.building) delete copy.building.status
  return JSON.stringify(copy)
}
