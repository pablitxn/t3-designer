import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createProjectFoundations, foundationInputFingerprintValue, type FoundationOfficialResearch, type FoundationVersion } from '@t3-designer/scene-schema'
import { createFoundationGenerator } from '../src/foundation-agent-model.ts'
import type { ProjectDocument } from '../src/projects.ts'

function research(): FoundationOfficialResearch {
  return { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Parcela consultada; falta reconstruir el edificio.', sources: [{ title: 'Catastro sintético', url: 'https://catastro.example.gov/parcel', kind: 'official', claims: ['Parcela consultada, no huella del edificio.'], retrievedAt: '2026-10-08' }], unknowns: ['Falta confirmar la parcela y la altura del edificio.'],
    geocode: { label: 'Dirección sintética', longitude: -64.18, latitude: -31.42, provider: 'Georef', precision: 'approximate', recordId: 'record' },
    parcels: [{ id: '123', label: 'Parcela 123', area: 80, areaBasis: 'calculated', footprint: [[0, 0], [8, 0], [8, 10], [0, 10]], sourceUrl: 'https://catastro.example.gov/parcel', provider: 'Catastro', sourceDate: null, attribution: 'Datos de prueba.' }], selectedParcelId: null, selectionEvidence: null }
}
function project(): ProjectDocument {
  const foundations = createProjectFoundations(); Object.assign(foundations.building, { countryCode: 'AR', region: 'Córdoba', address: 'Dirección sintética' })
  return { id: '861d161a-b6d0-4686-a2d5-b74d2bfb43c8', name: 'Parcela', ownerId: 'owner', role: 'owner', revision: 1, notes: '', createdAt: '2026-10-08T12:00:00Z', updatedAt: '2026-10-08T12:00:00Z', stage: 'setup', foundations, scene: null, foundationModels: null }
}
test('partial acquisition checkpoints and returns exact cadastral evidence without model inference or a fabricated candidate', async () => {
  const value = research(), checkpoints: FoundationOfficialResearch[] = []
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => ({ status: 'partial', officialResearch: value, summary: value.summary, questions: ['Confirmá la referencia catastral.'], sources: value.sources, unknowns: value.unknowns, geocode: null, context: null }), turn: async () => { throw new Error('Partial unconfirmed evidence must not run inference') } })
  const result = await generate({ project: project(), target: 'building', message: 'Investigá la dirección.' }, { signal: new AbortController().signal, onOfficialResearch: async value => { checkpoints.push(value) } })
  assert.equal(result.status, 'needs_input'); assert.equal(result.candidate, null); assert.deepEqual(result.iterations, [])
  assert.deepEqual(result.officialResearch, value); assert.deepEqual(checkpoints, [value]); assert.deepEqual(result.questions, ['Confirmá la referencia catastral.'])
})
test('needs-input research is inherited only within its project, target, location inputs and country', async () => {
  const current = project(), value = research()
  const parent = { id: 'parent', projectId: current.id, target: 'building', status: 'needs_input', candidate: null, iterations: [], questions: [], summary: value.summary, officialResearch: value, foundationsFingerprint: createHash('sha256').update(foundationInputFingerprintValue(current.foundations)).digest('hex') } as unknown as FoundationVersion
  let acquisitions = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => { acquisitions++; return { status: 'needs_input', summary: 'Ubicación nueva.', questions: ['Confirmá dirección.'], sources: [], unknowns: [], geocode: null, context: null } }, turn: async () => { throw new Error('must not infer') } })
  const run = (parentVersion: FoundationVersion, currentProject = current) => generate({ project: currentProject, target: 'building', message: 'Continuá la investigación.', parentVersion }, { signal: new AbortController().signal })
  assert.deepEqual((await run(parent)).officialResearch, value); assert.equal(acquisitions, 0)
  for (const changed of [{ ...parent, projectId: 'foreign' }, { ...parent, target: 'dwelling' as const }, { ...parent, foundationsFingerprint: 'stale' }]) assert.equal((await run(changed)).officialResearch, undefined)
  const anotherCountry = structuredClone(current); anotherCountry.foundations!.building.countryCode = 'FR'
  assert.equal((await run(parent, anotherCountry)).officialResearch, undefined); assert.equal(acquisitions, 4)
})
