import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectFoundations, type FoundationOfficialResearch } from '@t3-designer/scene-schema'
import { attachPartialBuilding } from '../src/foundation-partial-building.ts'
import { createFoundationGenerator } from '../src/foundation-agent-model.ts'
import type { ProjectDocument } from '../src/projects.ts'

const foundations = createProjectFoundations()
Object.assign(foundations.building, { countryCode: 'AR', region: 'Córdoba', address: 'Dirección QA', cadastralReference: 'lot' })
function research(): FoundationOfficialResearch {
  return { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Parcela oficial seleccionada.', sources: [{ title: 'Fixture oficial', url: 'https://example.gov/lot', kind: 'official', claims: ['Límite parcelario'], retrievedAt: '2026-10-08' }], unknowns: [],
    geocode: { label: 'Dirección QA', longitude: -64.18, latitude: -31.42, provider: 'georef', precision: 'approximate', recordId: 'address' },
    parcels: [{ id: 'lot', label: 'Parcela lot', area: 400, areaBasis: 'published', footprint: [[-10, -10], [10, -10], [10, 10], [-10, 10]], sourceUrl: 'https://example.gov/lot', provider: 'idecor', sourceDate: null, attribution: 'Test authority' }],
    selectedParcelId: 'lot', selectionEvidence: 'El usuario indicó la referencia lot.' }
}
function proposal() {
  return { target: 'building', summary: 'Construcción con medidas del usuario.', assumptions: [] as string[], unknowns: [] as string[], sources: [],
    buildings: [{ id: 'house', rnbId: null, isTarget: true, label: 'Edificio QA', footprint: [[-4, -3], [4, -3], [4, 3], [-4, 3]], height: 5, roofHeight: 0, groundAltitude: null, groundOffset: 0, floors: null, planarAccuracy: null, verticalAccuracy: null, source: 'estimated' }],
    footprintEvidence: 'El usuario aportó ancho 8 m y profundidad 6 m, centrado en el origen y alineado este-sur.', heightEvidence: 'El usuario aportó una altura total medida de 5 m, sin cubierta adicional.' }
}
function project(): ProjectDocument { return { id: '9b63d334-47e5-4cb4-ae25-5c7700f0a5b5', name: 'QA', notes: '', ownerId: 'owner', role: 'owner', revision: 1, createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z', stage: 'setup', foundations: structuredClone(foundations), scene: null, foundationModels: null } }

test('partial cadastre pins official parcel/origin/citations and keeps independent building geometry estimated', () => {
  const evidence = research(), candidate = attachPartialBuilding(proposal(), evidence, foundations)
  assert.deepEqual(candidate.parcel.footprint, evidence.parcels[0].footprint); assert.equal(candidate.parcel.area, 400)
  assert.equal(candidate.site.longitude, evidence.geocode!.longitude); assert.equal(candidate.site.timeZone, 'America/Argentina/Cordoba')
  assert.equal(candidate.site.groundAltitude, 0); assert.equal(candidate.buildings[0].source, 'estimated')
  assert.deepEqual(candidate.officialResearch, evidence); assert.deepEqual(candidate.sources, evidence.sources)
  assert.deepEqual(candidate.roads, []); assert.match(candidate.unknowns.join(' '), /cota altimétrica/)
})
test('partial cadastre retains explicit dwelling registration without translating its official parcel', () => {
  const evidence = research(), dwellingRegistration = { dwellingVersionId: '23fe1dc6-642e-4d99-9b6c-fd853a42a960', position: [0, -.127, 6.375], evidence: { confidence: 'user', note: 'User supplied the common origin relative to the parcel.' } }
  const candidate = attachPartialBuilding({ ...proposal(), dwellingRegistration }, evidence, foundations)
  assert.deepEqual(candidate.dwellingRegistration, dwellingRegistration)
  assert.deepEqual(candidate.parcel.footprint, evidence.parcels[0].footprint)
  assert.deepEqual(candidate.buildings, proposal().buildings)
})
test('unconfirmed parcels, holes, forged provenance and parcel-as-building proposals cannot become a 3D candidate', () => {
  const unselected = research(); unselected.selectedParcelId = null; unselected.selectionEvidence = null
  assert.throws(() => attachPartialBuilding(proposal(), unselected, foundations), /Confirmá/)
  const perforated = research(); perforated.parcels[0].holes = [[[-1, -1], [1, -1], [1, 1], [-1, 1]]]
  assert.throws(() => attachPartialBuilding(proposal(), perforated, foundations), /anillos/)
  const cloned = proposal(); cloned.buildings[0].footprint = [...research().parcels[0].footprint].reverse()
  assert.throws(() => attachPartialBuilding(cloned, research(), foundations), /evidencia independiente/)
  cloned.buildings[0].footprint = [[-10, -10], [0, -10], [10, -10], [10, 10], [-10, 10]]
  assert.throws(() => attachPartialBuilding(cloned, research(), foundations), /evidencia independiente/)
  const remote = proposal(); remote.buildings[0].footprint = remote.buildings[0].footprint.map(([x, z]) => [x + 500, z])
  assert.throws(() => attachPartialBuilding(remote, research(), foundations), /superpone/)
  const official = proposal(); official.buildings[0].source = 'ign-bdtopo'
  assert.throws(() => attachPartialBuilding(official, research(), foundations), /estimada/)
  assert.throws(() => attachPartialBuilding({ ...proposal(), parcel: { id: 'fake' } }, research(), foundations))
})
test('registration allows a building to span parcels and preserves evidence when prose reaches its limit', () => {
  const data = proposal(); data.buildings[0].footprint = [[-10, -10], [15, -10], [15, 0], [-10, 0]]
  data.assumptions = Array.from({ length: 100 }, (_, index) => `Assumption ${index}`)
  data.unknowns = Array.from({ length: 100 }, (_, index) => `Unknown ${index}`)
  const candidate = attachPartialBuilding(data, research(), foundations)
  assert.equal(candidate.assumptions.length, 100); assert.match(candidate.assumptions[0], /Huella construida/); assert.match(candidate.assumptions[1], /Altura/)
  assert.equal(candidate.unknowns.length, 100); assert.match(candidate.unknowns[0], /altimétrica/)
})
test('selected parcel can progress through independent generation/review; missing measurements retain research for next chat', async () => {
  for (const missing of [false, true]) {
    const evidence = research(); let calls = 0
    const generator = createFoundationGenerator({ references: { file: async () => null },
      acquireGeodata: async () => ({ status: 'partial', officialResearch: evidence, summary: evidence.summary, questions: ['Falta la altura.'], sources: evidence.sources, unknowns: [], geocode: null, context: null }),
      turn: async (input) => {
        calls++; const prompt = JSON.stringify(input)
        assert.match(prompt, /PARTIAL OFFICIAL RESEARCH/)
        if (calls === 1) { assert.match(prompt, /PARTIAL OFFICIAL CADASTRE/); return JSON.stringify({ status: missing ? 'needs_input' : 'ready', summary: missing ? 'Falta altura.' : 'Propuesta', questions: missing ? ['Indicá una altura medida.'] : [], candidateJson: missing ? '' : JSON.stringify(proposal()), measurementCorrections: [], buildingEdits: [] }) }
        assert.match(prompt, /independent evidence/)
        return JSON.stringify({ verdict: 'accept', summary: 'Dimensiones del usuario contrastadas.', issues: [], questions: [] })
      } })
    const result = await generator({ project: project(), target: 'building', message: 'Huella rectangular de 8 m este-oeste por 6 m norte-sur centrada en el origen. Altura total de 5 m.' }, { signal: new AbortController().signal })
    assert.equal(result.status, missing ? 'needs_input' : 'ready'); assert.equal(calls, missing ? 1 : 2)
    assert.deepEqual(result.officialResearch, evidence)
    if (!missing) { assert.ok(result.candidate?.target === 'building'); assert.deepEqual(result.candidate.officialResearch, evidence) }
  }
})
