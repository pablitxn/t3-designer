import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectFoundations, FoundationCandidateSchema, type FoundationBuildingEdit, type Point2D } from '@t3-designer/scene-schema'
import { createFoundationGenerator, inspectSourcedBuildingIntegrity } from '../src/foundation-agent-model.ts'
import { applyBuildingCorrections, type BuildingCandidate } from '../src/foundation-building-corrections.ts'
import type { FoundationGeodataContext } from '../src/foundation-geodata.ts'
import type { ProjectDocument } from '../src/projects.ts'

const projectId = '861d161a-b6d0-4686-a2d5-b74d2bfb43c8'
const rect = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
function building(): BuildingCandidate {
  const target: BuildingCandidate['buildings'][number] = { id: 'target', rnbId: null, isTarget: true, label: 'Synthetic source building', footprint: rect(0, 0, 8, 6), height: 10, roofHeight: 1, groundAltitude: 50, groundOffset: 0, floors: 3, planarAccuracy: 2.5, verticalAccuracy: 1, source: 'ign-bdtopo' }
  const buildings = [target, ...Array.from({ length: 59 }, (_, index) => ({ ...target, id: `neighbor-${index + 1}`, isTarget: false, label: `Synthetic neighbor ${index + 1}`, height: 12 + index / 1000,
    footprint: Array.from({ length: 32 }, (_, point): Point2D => [20 + index % 8 * 15 + 4 * Math.cos(point * Math.PI / 16), 20 + Math.floor(index / 8) * 15 + 4 * Math.sin(point * Math.PI / 16)]),
  }))]
  return { target: 'building', summary: 'Datos sintéticos de una adquisición oficial; no representan una propiedad.', assumptions: ['Cubierta simplificada.'], unknowns: ['Sin detalle de fachadas.'],
    sources: [{ title: 'Synthetic official dataset', url: 'https://data.example.gov/buildings?bbox=fixture', kind: 'official', retrievedAt: '2026-10-07', claims: ['Huella y altura del juego sintético, sin certificación.'] }],
    site: { latitude: 48.11, longitude: -1.68, timeZone: 'Europe/Paris', address: 'Synthetic address 1', officialAddress: 'Synthetic address 1', targetId: 'target', rnbId: null, groundAltitude: 50, retrievedAt: '2026-10-07', radiusMeters: 150, attribution: 'Synthetic test source', rnbUrl: null, mapUrl: 'https://map.example.gov/' },
    buildings, roads: [{ id: 'road', name: 'Synthetic road', points: [[-10, -10], [10, -10]], width: 5, isPath: false }],
    parcel: { id: 'parcel', label: 'Synthetic parcel', area: 100, footprint: rect(-1, -1, 10, 10) },
  }
}
function context(candidate = building()): FoundationGeodataContext {
  return { status: 'available', summary: 'Datos adquiridos del proveedor sintético.', questions: [], sources: structuredClone(candidate.sources), unknowns: candidate.unknowns, geocode: null,
    context: structuredClone({ site: candidate.site, buildings: candidate.buildings, roads: candidate.roads, parcel: candidate.parcel }),
  }
}
function project(accepted?: BuildingCandidate): ProjectDocument {
  const foundations = createProjectFoundations()
  Object.assign(foundations.building, { countryCode: 'FR', address: 'Synthetic address 1', region: 'Rennes' })
  return { id: projectId, name: 'Synthetic building review', notes: '', ownerId: 'owner', role: 'owner', revision: 1, createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', stage: 'setup', foundations, scene: null,
    foundationModels: accepted ? { dwelling: null, building: { versionId: projectId, candidate: accepted }, activeLevelId: null, levels: [] } : null,
  }
}
const prose = { target: 'building', summary: 'Extrusión estimada, con límites documentados.', assumptions: ['Cubierta simplificada.'], unknowns: ['Sin detalle de fachadas.'], sources: [] }
const ready = (edits: FoundationBuildingEdit[] = []) => JSON.stringify({ status: 'ready', summary: prose.summary, questions: [], candidateJson: JSON.stringify(prose), buildingEdits: edits, measurementCorrections: [] })
const accept = JSON.stringify({ verdict: 'accept', summary: 'Revisado contra los registros suministrados y la petición.', issues: [], questions: [] })
const options = () => ({ signal: new AbortController().signal })
type PromptProjection = {
  context: NonNullable<FoundationGeodataContext['context']> & { buildingSummary: { total: number; supplied: number; omitted: number } }
  sources: BuildingCandidate['sources']; buildings: BuildingCandidate['buildings']; buildingCorrections: NonNullable<BuildingCandidate['buildingCorrections']>
  serverVerification: { passed: boolean; unchangedBuildingsVerified: number; roadsUnchanged: boolean; exactChangesFromSource: { buildingId: string; fields: { field: string; before: unknown; after: unknown }[] }[] }
}
function section(prompt: string, name: string): PromptProjection {
  const prefix = `${name} (JSON): `, line = prompt.split('\n').find(line => line.startsWith(prefix))
  assert.ok(line, `${name} section exists`)
  return JSON.parse(line.slice(prefix.length)) as PromptProjection
}

test('first acquisition supplies a compact source and review projection but persists all 60 exact buildings and roads', async () => {
  const source = context(), before = structuredClone(source), prompts: string[] = []
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => source, turn: async (input, _schema, _settings, search) => {
    assert.equal(search, false)
    const prompt = input[0].type === 'text' ? input[0].text : ''; prompts.push(prompt)
    return prompts.length === 1 ? ready() : accept
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Prepará el contexto adquirido.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(prompts.length, 2)
  assert.equal(result.candidate?.target, 'building')
  if (result.candidate?.target !== 'building') return
  assert.deepEqual(result.candidate.buildings, before.context!.buildings)
  assert.deepEqual(result.candidate.roads, before.context!.roads)
  assert.deepEqual(result.candidate.sources, before.sources)
  assert.deepEqual(FoundationCandidateSchema.parse(result.candidate), result.candidate)
  assert.deepEqual(source, before)
  for (const prompt of prompts) {
    const projection = section(prompt, 'SOURCE CONTEXT')
    assert.deepEqual(projection.context.buildings, [before.context!.buildings[0]])
    assert.deepEqual(projection.context.buildingSummary, { total: 60, supplied: 1, omitted: 59 })
    assert.deepEqual(projection.context.roads, { count: 1, numericRecordsOmitted: true })
    assert.deepEqual(projection.context.site, before.context!.site); assert.deepEqual(projection.context.parcel, before.context!.parcel)
    assert.deepEqual(projection.sources, before.sources)
    assert.ok(JSON.stringify(projection).length < JSON.stringify(before).length / 10)
    assert.ok(!prompt.includes('neighbor-59'))
    assert.match(prompt, /Do not compare numeric values that are not supplied/)
  }
  const projectedCandidate = section(prompts[1], 'CANDIDATE')
  assert.deepEqual(projectedCandidate.buildings, [result.candidate.buildings[0]])
  assert.equal(projectedCandidate.serverVerification.passed, true)
  assert.equal(projectedCandidate.serverVerification.unchangedBuildingsVerified, 60)
  assert.deepEqual(projectedCandidate.serverVerification.exactChangesFromSource, [])
  assert.equal(projectedCandidate.serverVerification.roadsUnchanged, true)
})

test('chat projects exact edited fields, original records and historical evidence while retaining unrelated neighbors byte-for-byte', async () => {
  const base = building(), history: FoundationBuildingEdit[] = [
    { type: 'set_height', buildingId: 'target', value: 18, quote: 'Cambiá la altura del cuerpo sin cubierta a 18 m' },
    { type: 'set_roof_height', buildingId: 'neighbor-3', value: 2, quote: 'Cambiá la altura de cubierta de neighbor-3 a 2 m' },
  ]
  const applied = applyBuildingCorrections(base, history, { message: history.map(edit => edit.quote).join('; ') })
  assert.deepEqual(applied.issues, [])
  const parent = applied.candidate, current: FoundationBuildingEdit[] = [
    { type: 'translate', buildingId: 'target', dx: 2, dz: 1, quote: 'Mové el edificio 2 m al este y 1 m al sur' },
    { type: 'resize_footprint', buildingId: 'target', axis: 'width', value: 12, quote: 'Cambiá el ancho de la huella a 12 m' },
  ]
  const message = `${current.map(edit => edit.quote).join('; ')}. Conservá neighbor-10 sin modificaciones.`
  const prompts: string[] = []
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => { throw new Error('Saved source cannot be refreshed during correction') }, turn: async input => {
    prompts.push(input[0].type === 'text' ? input[0].text : '')
    return prompts.length === 1 ? ready(current) : accept
  } })
  const result = await generate({ project: project(parent), target: 'building', message }, options())
  assert.equal(result.status, 'ready'); assert.equal(prompts.length, 2)
  if (result.candidate?.target !== 'building') throw new Error('Expected building')
  const expected = applyBuildingCorrections(parent, current, { message, parentCandidate: parent })
  assert.deepEqual(expected.issues, []); assert.deepEqual(result.candidate.buildings, expected.candidate.buildings)
  assert.deepEqual(result.candidate.buildings.slice(1), parent.buildings.slice(1))
  assert.deepEqual(result.candidate.buildingCorrections, expected.candidate.buildingCorrections)
  for (const prompt of prompts) {
    const projected = section(prompt, 'SOURCE CONTEXT')
    assert.deepEqual(projected.context.buildings, parent.buildings.filter(building => ['target', 'neighbor-3', 'neighbor-10'].includes(building.id)))
    assert.deepEqual(projected.context.buildingSummary, { total: 60, supplied: 3, omitted: 57 })
    assert.equal(projected.context.buildings.some((building: { id: string }) => building.id === 'neighbor-1'), false, 'ID matching does not select a prefix')
    assert.ok(prompt.includes(history[0].quote) && prompt.includes(history[1].quote))
  }
  const reviewed = section(prompts[1], 'CANDIDATE'), exact = reviewed.serverVerification.exactChangesFromSource
  assert.equal(reviewed.serverVerification.unchangedBuildingsVerified, 59)
  assert.deepEqual(reviewed.buildingCorrections.baseBuildings, parent.buildingCorrections!.baseBuildings)
  assert.deepEqual(reviewed.buildingCorrections.operations, [...parent.buildingCorrections!.operations, ...current])
  assert.deepEqual(exact.map((change: { buildingId: string }) => change.buildingId), ['target'])
  assert.deepEqual(exact[0].fields.find((change: { field: string }) => change.field === 'footprint'), { field: 'footprint', before: parent.buildings[0].footprint, after: result.candidate.buildings[0].footprint })
  assert.equal(exact[0].fields.some((change: { field: string }) => change.field === 'height'), false, 'accepted height difference against original is not a new change')
  assert.deepEqual(reviewed.buildings[0], result.candidate.buildings[0], 'complete numeric record is present for independent review')
})

test('full source invariants reject omitted-neighbor precision drift, source drift and changes to every protected collection', () => {
  const base = building(), acquired = context(base)
  assert.equal(inspectSourcedBuildingIntegrity(base, acquired).passed, true)
  const mutations: Array<[string, (candidate: BuildingCandidate) => void]> = [
    ['neighbor-59', candidate => { candidate.buildings[59].verticalAccuracy = 2.5; candidate.buildings[59].source = 'estimated' }],
    ['buildings', candidate => { candidate.buildings.pop() }],
    ['buildings', candidate => { candidate.buildings.reverse() }],
    ['roads', candidate => { candidate.roads[0].points[0][0] += .01 }],
    ['parcel', candidate => { candidate.parcel.footprint[0][0] += .01 }],
    ['site', candidate => { candidate.site.groundAltitude += .01 }],
    ['sources', candidate => { candidate.sources[0].claims[0] = 'Invented claim' }],
  ]
  for (const [field, mutate] of mutations) {
    const candidate = structuredClone(base); mutate(candidate)
    const integrity = inspectSourcedBuildingIntegrity(candidate, acquired, ['target'])
    assert.equal(integrity.passed, false, field)
    assert.ok(integrity.issues.some(issue => issue.includes(field)), `${field}: ${integrity.issues}`)
    if (field === 'neighbor-59') assert.match(integrity.issues.join(' '), /verticalAccuracy/)
  }
})

test('compact review retains an independent needs-input verdict and never converts intact context into approval', async () => {
  let calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => context(), turn: async () => ++calls === 1 ? ready() : JSON.stringify({ verdict: 'needs_input', summary: 'Hace falta aclarar la cubierta del edificio.', issues: ['Falta evidencia del perfil de cubierta.'], questions: ['¿Tenés una sección de la cubierta?'] }) })
  const result = await generate({ project: project(), target: 'building', message: 'Revisá el edificio.' }, options())
  assert.equal(calls, 2); assert.equal(result.status, 'needs_input'); assert.equal(result.iterations[0].review.passed, false)
  assert.equal(result.candidate?.target, 'building'); assert.deepEqual(result.questions, ['¿Tenés una sección de la cubierta?'])
})

test('model attempts to replace server-owned neighbor arrays fail before reviewer inference', async () => {
  let calls = 0
  const fake = { ...prose, buildings: [{ id: 'neighbor-59', verticalAccuracy: 2.5 }] }
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => context(), turn: async input => {
    calls++
    assert.ok(!(input[0].type === 'text' ? input[0].text : '').startsWith('You are an independent'))
    return JSON.stringify({ ...JSON.parse(ready()), candidateJson: JSON.stringify(fake) })
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Prepará el contexto.' }, options())
  assert.equal(calls, 3); assert.equal(result.status, 'needs_input'); assert.equal(result.candidate, null)
  assert.ok(result.iterations.every(iteration => !iteration.review.passed && iteration.candidate === null))
})

test('acquired source is detached from adapter-owned objects before generation starts', async () => {
  const acquired = context(), original = structuredClone(acquired)
  let calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => acquired, turn: async () => {
    if (++calls === 1) { acquired.context!.buildings[59].verticalAccuracy = 2.5; acquired.sources[0].claims = ['Changed outside the snapshot']; return ready() }
    return accept
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Prepará el contexto.' }, options())
  assert.equal(result.status, 'ready')
  if (result.candidate?.target !== 'building') throw new Error('Expected building')
  assert.deepEqual(result.candidate.buildings, original.context!.buildings); assert.deepEqual(result.candidate.sources, original.sources)
})
