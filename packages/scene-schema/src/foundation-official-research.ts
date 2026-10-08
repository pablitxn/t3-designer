import { z } from 'zod'

type Point = [number, number]
const number = z.number().finite(), id = z.string().trim().min(1).max(250)
const messages = z.array(z.string().max(2_000)).max(100)
const url = z.url().max(2_000).refine(value => { try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false } }, 'Source URL must use HTTP or HTTPS')
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
function on(a: Point, b: Point, p: Point) { return Math.abs(cross(a, b, p)) < 1e-7 && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7 && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7 }
function intersects(a: Point, b: Point, c: Point, d: Point) { return cross(a, b, c) * cross(a, b, d) < -1e-7 && cross(c, d, a) * cross(c, d, b) < -1e-7 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b) }
function simple(ring: Point[]) {
  if (Math.abs(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)) < 1e-7) return false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) return false
    for (let j = i + 1; j < ring.length; j++) if (j !== i + 1 && !(i === 0 && j === ring.length - 1) && intersects(a, b, ring[j], ring[(j + 1) % ring.length])) return false
  }
  return true
}
const coordinate = number.min(-10_000).max(10_000)
const ring = z.array(z.tuple([coordinate, coordinate])).min(3).max(200).refine(simple, 'Parcel ring must be simple and have nonzero area')
const parcel = z.object({
  id, label: z.string().min(1).max(500), area: number.positive().max(1e10), areaBasis: z.enum(['published', 'calculated']),
  footprint: ring, holes: z.array(ring).max(20).optional(), sourceUrl: url, provider: id,
  sourceDate: z.string().min(1).max(250).nullable(), attribution: z.string().min(1).max(2_000),
}).strict()

/** Acquired cadastral evidence is useful before a renderable building exists.
 * Local X east / Z south metres use geocode as origin. A parcel is never a
 * building footprint; an approximate geocode cannot choose a parcel by itself. */
export const FoundationOfficialResearchSchema = z.object({
  countryCode: z.literal('AR'), jurisdiction: z.string().min(1).max(500), summary: z.string().max(8_000),
  sources: z.array(z.object({ title: z.string().min(1).max(300), url, kind: z.enum(['official', 'user', 'other']), claims: messages, retrievedAt: z.iso.date() }).strict()).max(40),
  unknowns: messages,
  geocode: z.object({ label: z.string().min(1).max(500), longitude: number.min(-180).max(180), latitude: number.min(-90).max(90), provider: id, precision: z.enum(['approximate', 'address']), recordId: id }).strict().nullable(),
  parcels: z.array(parcel).max(20), selectedParcelId: id.nullable(), selectionEvidence: z.string().min(1).max(2_000).nullable(),
}).strict().superRefine((research, context) => {
  if (research.parcels.length && !research.geocode) context.addIssue({ code: 'custom', message: 'Local parcel geometry requires a geographic origin', path: ['geocode'] })
  if (new Set(research.parcels.map(parcel => parcel.id)).size !== research.parcels.length) context.addIssue({ code: 'custom', message: 'Parcel IDs must be unique', path: ['parcels'] })
  if (research.selectedParcelId !== null && (!research.parcels.some(parcel => parcel.id === research.selectedParcelId) || !research.selectionEvidence?.trim())) context.addIssue({ code: 'custom', message: 'Selected parcel must exist and record explicit selection evidence', path: ['selectedParcelId'] })
  if (research.selectedParcelId === null && research.selectionEvidence !== null) context.addIssue({ code: 'custom', message: 'Selection evidence requires a selected parcel', path: ['selectionEvidence'] })
  for (const [index, parcel] of research.parcels.entries()) if (!research.sources.some(source => source.url === parcel.sourceUrl)) context.addIssue({ code: 'custom', message: 'Parcel source must be included in the acquired sources', path: ['parcels', index, 'sourceUrl'] })
})
export type FoundationOfficialResearch = z.infer<typeof FoundationOfficialResearchSchema>
