import assert from 'node:assert/strict'
import test from 'node:test'
import { FoundationOfficialResearchSchema, FoundationGenerationResultSchema, ProjectFoundationsSchema, createProjectFoundations, type FoundationOfficialResearch } from '../src/index.ts'

function research(): FoundationOfficialResearch {
  return { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Parcela consultada; falta el edificio.', sources: [{ title: 'Catastro de prueba', url: 'https://catastro.example.gov/parcel', kind: 'official', claims: ['Parcela, no huella de edificio.'], retrievedAt: '2026-10-08' }], unknowns: ['Huella y altura desconocidas.'],
    geocode: { label: 'Dirección de prueba', longitude: -64.18, latitude: -31.42, provider: 'Georef', precision: 'approximate', recordId: 'record' },
    parcels: [{ id: '123', label: 'Parcela 123', area: 80, areaBasis: 'calculated', footprint: [[0, 0], [8, 0], [8, 10], [0, 10]], sourceUrl: 'https://catastro.example.gov/parcel', provider: 'Catastro', sourceDate: null, attribution: 'Datos públicos de prueba.' }], selectedParcelId: null, selectionEvidence: null }
}
test('partial official evidence survives serialization without inventing a building candidate or a selected parcel', () => {
  const value = research(), result = { status: 'needs_input', candidate: null, iterations: [], questions: ['Confirmá la referencia catastral.'], summary: value.summary, officialResearch: value }
  assert.deepEqual(FoundationGenerationResultSchema.parse(JSON.parse(JSON.stringify(result))), result)
  assert.equal(FoundationOfficialResearchSchema.safeParse({ ...value, selectedParcelId: '123', selectionEvidence: 'Referencia catastral indicada explícitamente por el usuario.' }).success, true)
  assert.equal(FoundationGenerationResultSchema.safeParse({ ...result, officialResearch: { ...value, buildings: [] } }).success, false)
})
test('acquired parcel research rejects invalid origins, references, sources and unbounded geometry', () => {
  const changes: Array<(value: FoundationOfficialResearch) => void> = [
    value => { value.geocode = null }, value => { value.selectedParcelId = 'missing'; value.selectionEvidence = 'Usuario' },
    value => { value.selectedParcelId = '123' }, value => { value.selectionEvidence = 'Usuario' },
    value => { value.parcels.push(structuredClone(value.parcels[0])) },
    value => { value.parcels[0].sourceUrl = 'https://catastro.example.gov/not-consulted' },
    value => { value.sources[0].url = 'file:///private/secret' },
    value => { value.parcels[0].footprint = [[0, 0], [8, 8], [0, 8], [8, 0]] },
    value => { value.parcels[0].footprint[0][0] = Infinity },
    value => { value.parcels[0].footprint[0][0] = 10001 },
    value => { value.parcels[0].area = 0 },
  ]
  for (const change of changes) { const value = research(); change(value); assert.equal(FoundationOfficialResearchSchema.safeParse(value).success, false) }
})
test('cadastral reference is optional for old intake and does not mark either foundation ready', () => {
  const value = createProjectFoundations()
  assert.deepEqual(ProjectFoundationsSchema.parse(value), value)
  value.building.cadastralReference = '  123  '
  const parsed = ProjectFoundationsSchema.parse(value)
  assert.equal(parsed.building.cadastralReference, '123'); assert.equal(parsed.building.status, 'draft')
  assert.equal(ProjectFoundationsSchema.safeParse({ ...value, building: { ...value.building, cadastralReference: 'a'.repeat(251) } }).success, false)
})
