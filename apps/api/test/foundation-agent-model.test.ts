import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectFoundations, FoundationCandidateSchema, type FoundationCandidate, type FoundationMeasurementCorrection, type FoundationIteration, type FoundationVersion, type ProjectFoundations } from '@t3-designer/scene-schema'
import { createFoundationGenerator, validateFoundationGeometry } from '../src/foundation-agent-model.ts'
import type { ProjectDocument } from '../src/projects.ts'
import type { openaiVisualTurn } from '../src/openai.ts'

const referenceId = '91ca1154-8dc6-4b0f-b078-64026c67654c'
const projectId = '861d161a-b6d0-4686-a2d5-b74d2bfb43c8'
function foundations(): ProjectFoundations {
  const result = createProjectFoundations()
  Object.assign(result.dwelling.levels[0], { ceilingHeight: 2.7, elevation: 0, width: 8, depth: 6, planReferences: [{ id: referenceId, name: 'Ground floor plan' }] })
  result.building = { status: 'draft', countryCode: 'AR', address: 'User-provided street 10', region: 'Córdoba', sources: [], notes: '' }
  return result
}
function project(value = foundations()): ProjectDocument {
  return { id: projectId, name: 'Casa', notes: '', ownerId: 'owner', role: 'owner', revision: 1, createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', stage: 'setup', foundations: value, scene: null, foundationModels: null }
}
function dwelling(): Extract<FoundationCandidate, { target: 'dwelling' }> {
  const polygon: [number, number][] = [[0, 0], [8, 0], [8, 3], [4, 3], [4, 6], [0, 6]]
  return {
    target: 'dwelling', summary: 'Planta en L basada en el plano adjunto.', assumptions: ['Orientación local supuesta.'], unknowns: ['El detalle de la escalera no está dibujado.'], sources: [], connections: [],
    levels: [{ levelId: 'ground-floor', name: 'Planta baja', levelIndex: 0, elevation: 0, ceilingHeight: 2.7, scaleEvidence: `Ancho 8 metros indicado por el usuario; plano ${referenceId}.`, apartment: {
      schemaVersion: 1, id: 'floor-0', name: 'Planta baja', units: 'meters', coordinateSystem: { x: 'east', y: 'up', z: 'south' }, perimeter: polygon,
      rooms: [{ id: 'room-0', name: 'Ambiente en L', polygon, reportedArea: 36, color: '#dddddd' }],
      walls: polygon.map((from, index) => ({ id: `wall-${index}`, from, to: polygon[(index + 1) % polygon.length], height: 2.7, thickness: .2, kind: 'exterior', estimated: true })),
      doors: [{ id: 'door', wallId: 'wall-0', offset: 1, width: .9, height: 2, estimated: true, hinge: 'start', opensToward: 1, locationConfidence: 'observed', evidence: 'Plano adjunto.' }],
      windows: [{ id: 'window', wallId: 'wall-1', offset: 1, width: 1.2, height: 1.2, sillHeight: .9, estimated: true, kind: 'casement', locationConfidence: 'observed', evidence: 'Plano adjunto.' }],
      metadata: { source: `Plano adjunto ${referenceId}; dimensiones indicadas por el usuario.`, description: 'Reconstrucción estimada de la planta en L.', reportedCarrezArea: 36, reportedBasementArea: 0, assumptions: ['Área calculada del polígono, no medición legal Carrez.'], unresolved: ['Norte geográfico.'] },
    } }],
  }
}
function building(): Extract<FoundationCandidate, { target: 'building' }> {
  const footprint: [number, number][] = [[0, 0], [8, 0], [8, 6], [0, 6]]
  return {
    target: 'building', summary: 'Volumen estimado; fuente citada por el agente.', assumptions: ['Cota cero local.'], unknowns: ['Vecinos sin datos.'],
    sources: [{ title: 'Fuente de prueba', url: 'https://datos.example.gov/record/10', kind: 'official', retrievedAt: '2026-10-07', claims: ['Huella y altura citadas para esta prueba.'] }],
    site: { latitude: -31.4, longitude: -64.2, timeZone: 'America/Argentina/Cordoba', address: 'User-provided street 10', officialAddress: 'Dirección citada, no certificada', targetId: 'target', rnbId: null, groundAltitude: 0, retrievedAt: '2026-10-07', radiusMeters: 50, attribution: 'Fuente citada por el agente, geometría estimada.', rnbUrl: null, mapUrl: 'https://map.example.gov/' },
    buildings: [{ id: 'target', rnbId: null, isTarget: true, label: 'Edificio estimado', footprint, height: 6, roofHeight: 0, groundAltitude: null, groundOffset: 0, floors: 2, planarAccuracy: null, verticalAccuracy: null, source: 'estimated' }],
    roads: [], parcel: { id: 'support', label: 'Contorno de apoyo; no parcela catastral', area: 48, footprint },
  }
}
const ready = (candidate: FoundationCandidate, measurementCorrections: FoundationMeasurementCorrection[] = []) => JSON.stringify({ ...(candidate.target === 'building' ? { buildingEdits: [] } : {}), measurementCorrections, status: 'ready', summary: candidate.summary, questions: [], candidateJson: JSON.stringify(candidate) })
const accept = JSON.stringify({ verdict: 'accept', summary: 'Datos contrastados con el plano; permanecen estimados.', issues: [], questions: [] })
const noInput = JSON.stringify({ status: 'needs_input', summary: 'El plano no tiene una escala legible.', measurementCorrections: [], questions: ['¿Cuánto mide una pared identificable?'], candidateJson: '' })
const references = { file: async () => ({ path: '/fixture/plan.png', mime: 'image/png' }) }
const options = () => ({ signal: new AbortController().signal })

test('source-supported ridge axis survives building candidate normalization and independent review', async () => {
  const candidate = building(); candidate.buildings[0].roofHeight = 2; candidate.buildings[0].roofRidgeAzimuthDeg = 0
  candidate.assumptions.push('Eje de cumbrera norte-sur respaldado por la elevación de prueba.')
  const outputs = [ready(candidate), accept], prompts: string[] = []
  const generate = createFoundationGenerator({ references,
    acquireGeodata: async () => ({ status: 'unsupported', summary: 'Controlled source fixture.', sources: [], questions: [], unknowns: [], geocode: null, context: null }),
    turn: async input => {
    prompts.push(input[0].type === 'text' ? input[0].text : '')
    return outputs.shift()!
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Reconstruí el edificio con la cumbrera norte-sur documentada.' }, options())
  assert.equal(result.status, 'ready'); assert.deepEqual(result.candidate, candidate)
  assert.equal(result.iterations[0].review.passed, true)
  assert.equal(prompts.length, 2)
  for (const prompt of prompts) {
    assert.match(prompt, /roofRidgeAzimuthDeg/)
    assert.match(prompt, /0 means north-south, 90 means east-west/)
  }
})

test('real provider format and opening failures supply exact paths and the rejected candidate to repair', async () => {
  const malformed = structuredClone(dwelling()) as unknown as { levels: { apartment: { metadata: { source: unknown } } }[] }
  malformed.levels[0].apartment.metadata.source = ['uploaded plan']
  const outside = dwelling(); outside.levels[0].apartment.windows[0].width = 100
  const outputs = [JSON.stringify({ status: 'ready', summary: 'First attempt', questions: [], measurementCorrections: [], candidateJson: JSON.stringify(malformed) }), ready(outside), ready(dwelling()), accept]
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    if (calls === 1) {
      assert.match(prompt, /levels\.0\.apartment\.metadata\.source: Invalid input: expected string, received array/)
      assert.match(prompt, /uploaded plan/)
    }
    if (calls === 2) assert.match(prompt, /levels\.0\.apartment\.windows\.0\.width: Opening extends beyond its wall/)
    return outputs[calls++]
  } })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí el plano.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(result.iterations.length, 3)
  assert.equal(result.iterations[0].candidate, null); assert.equal(result.iterations[1].candidate, null)
  assert.equal(result.iterations[2].review.passed, true)
})

test('an explicit metric conversion is valid even when the same quote mentions the original imperial value', async () => {
  const message = 'El ancho de 25.5906 pies equivale a 7.8 metros.'
  const correction: FoundationMeasurementCorrection = { levelId: 'ground-floor', field: 'width', value: 7.8, quote: message }
  const outputs = [ready(widthCandidate(7.8), [correction]), accept]
  const generate = createFoundationGenerator({ references, turn: async () => outputs.shift()! })
  const result = await generate({ project: project(), target: 'dwelling', message }, options())
  assert.equal(result.status, 'ready')
  assert.equal(result.candidate?.target, 'dwelling')
  if (result.candidate?.target === 'dwelling') assert.deepEqual(result.candidate.measurementCorrections, [correction])
})
function widthCandidate(width: number) {
  const result = dwelling(), apartment = result.levels[0].apartment, factor = width / 8
  const resize = (points: [number, number][]) => points.map(([x, z]) => [x * factor, z] as [number, number])
  apartment.perimeter = resize(apartment.perimeter)
  apartment.rooms = apartment.rooms.map(room => ({ ...room, polygon: resize(room.polygon), reportedArea: room.reportedArea * factor }))
  apartment.walls = apartment.walls.map(wall => ({ ...wall, from: resize([wall.from])[0], to: resize([wall.to])[0] }))
  apartment.metadata.reportedCarrezArea *= factor
  return result
}

test('nonrectangular measured floor reconstruction preserves polygon, openings and source uncertainty', async () => {
  const candidate = dwelling(), iterations: FoundationIteration[] = [], calls: boolean[] = []
  assert.deepEqual(FoundationCandidateSchema.parse(candidate), candidate)
  assert.deepEqual(validateFoundationGeometry(candidate, foundations()), [])
  const generate = createFoundationGenerator({ references, turn: async (input, schema, settings, search) => {
    calls.push(search)
    assert.ok(input.some(item => item.type === 'local_image' && item.path === '/fixture/plan.png'))
    assert.equal((schema as { additionalProperties: boolean }).additionalProperties, false)
    assert.equal(settings.workingDirectory, '.')
    if (calls.length === 2) assert.match(input[0].type === 'text' ? input[0].text : '', /No generated 3D render is supplied/)
    return calls.length === 1 ? ready(candidate) : accept
  } })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, { ...options(), onIteration: async value => { iterations.push(value) } })
  assert.equal(result.status, 'ready'); assert.deepEqual(result.candidate, candidate)
  assert.deepEqual(calls, [false, false]); assert.equal(iterations.length, 1); assert.equal(iterations[0].review.passed, true)
})

test('missing or unreadable plan is needs_input without inference', async () => {
  let calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, turn: async () => { calls++; throw new Error('must not call') } })
  const missingPlan = foundations(); missingPlan.dwelling.levels[0].planReferences = []
  for (const value of [missingPlan, foundations()]) {
    const result = await generate({ project: project(value), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, options())
    assert.equal(result.status, 'needs_input'); assert.equal(result.candidate, null); assert.equal(result.iterations.length, 0)
  }
  assert.equal(calls, 0)
})

test('lack of reliable metric scale asks for a known dimension and never creates a ready candidate', async () => {
  const value = foundations(); value.dwelling.levels[0].width = null; value.dwelling.levels[0].depth = null
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async (input) => {
    calls++
    assert.match(input[0].type === 'text' ? input[0].text : '', /Never infer metric scale solely from furniture/)
    return noInput
  } })
  const result = await generate({ project: project(value), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, options())
  assert.equal(result.status, 'needs_input'); assert.equal(result.candidate, null); assert.equal(calls, 1)
  assert.match(result.questions[0], /pared/)
})

test('two floors require exact floor coverage and preserve both floor elevations', async () => {
  const value = foundations(), candidate = dwelling()
  value.dwelling.levels.push({ ...structuredClone(value.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
  assert.ok(validateFoundationGeometry(candidate, value).some(issue => /cada planta/.test(issue)))
  candidate.levels.push({ ...structuredClone(candidate.levels[0]), levelId: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
  candidate.connections.push({ fromLevelId: 'ground-floor', toLevelId: 'upper-floor', kind: 'stairs', notes: 'Posición visible en plano; geometría detallada pendiente.' })
  assert.deepEqual(validateFoundationGeometry(candidate, value), [])
  candidate.levels[1].elevation = 2.8
  assert.ok(validateFoundationGeometry(candidate, value).some(issue => /elevación/.test(issue)))
})

test('a shared section image is attached once while both floor associations remain visible', async () => {
  const value = foundations(), candidate = dwelling()
  value.dwelling.levels.push({ ...structuredClone(value.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
  candidate.levels.push({ ...structuredClone(candidate.levels[0]), levelId: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
  let reads = 0, calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => { reads++; return { path: '/fixture/shared-section.png', mime: 'image/png' } } }, turn: async input => {
    assert.equal(input.filter(item => item.type === 'local_image').length, 1)
    const labels = input.filter(item => item.type === 'text').slice(1).map(item => item.text).join(' ')
    assert.match(labels, /ground-floor/); assert.match(labels, /upper-floor/); assert.match(labels, /already attached/)
    return calls++ === 0 ? ready(candidate) : accept
  } })
  const result = await generate({ project: project(value), target: 'dwelling', message: 'Reconstruí ambas plantas.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(reads, 1)
})

test('rejects self-intersection, concavity chords, overlapping rooms and user dimension drift', () => {
  const fixtures = [
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.perimeter = [[0, 0], [8, 6], [0, 6], [8, 0]] },
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.rooms[0].polygon = [[0, 0], [8, 0], [4, 6], [0, 6]] },
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.rooms.push({ ...structuredClone(c.levels[0].apartment.rooms[0]), id: 'duplicate' }) },
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.walls.push({ ...c.levels[0].apartment.walls[0], id: 'outside', from: [8, 3], to: [4, 6] }) },
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.perimeter = [[0, 0], [7, 0], [7, 6], [0, 6]] },
    (c: ReturnType<typeof dwelling>) => { c.levels[0].apartment.walls[0].estimated = false },
  ]
  for (const mutate of fixtures) {
    const candidate = dwelling(); mutate(candidate)
    assert.ok(validateFoundationGeometry(candidate, foundations()).length > 0)
  }
})

test('adjacent rooms sharing a boundary are valid without forcing them to tile a rectangle', () => {
  const candidate = dwelling()
  candidate.levels[0].apartment.rooms = [
    { id: 'first', name: 'Primero', polygon: [[0, 0], [4, 0], [4, 6], [0, 6]], reportedArea: 24, color: '#dddddd' },
    { id: 'second', name: 'Segundo', polygon: [[4, 0], [8, 0], [8, 3], [4, 3]], reportedArea: 12, color: '#aaaaaa' },
  ]
  assert.deepEqual(validateFoundationGeometry(candidate, foundations()), [])
})

test('source review requests a repair and only the corrected candidate becomes ready', async () => {
  const candidate = dwelling(), corrected = dwelling(); corrected.levels[0].apartment.doors[0].offset = 2
  const responses = [ready(candidate), JSON.stringify({ verdict: 'revise', summary: 'El acceso está desplazado.', issues: ['Mover el acceso a 2 m del inicio del muro.'], questions: [] }), ready(corrected), accept]
  const iterations: FoundationIteration[] = []
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls === 2) assert.match(input[0].type === 'text' ? input[0].text : '', /Mover el acceso a 2 m/)
    return responses[calls++]
  } })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, { ...options(), onIteration: value => { iterations.push(value) } })
  assert.equal(calls, 4); assert.equal(result.status, 'ready'); assert.deepEqual(result.candidate, corrected)
  assert.deepEqual(iterations.map(value => value.review.passed), [false, true]); assert.equal(result.iterations.length, 2)
})

test('geometry failure skips source review, then retries with actionable validation errors', async () => {
  const bad = dwelling(); bad.levels[0].apartment.walls[0].estimated = false
  const responses = [ready(bad), ready(dwelling()), accept]
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls === 1) assert.match(input[0].type === 'text' ? input[0].text : '', /condición estimada/)
    return responses[calls++]
  } })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, options())
  assert.equal(calls, 3); assert.equal(result.status, 'ready'); assert.equal(result.iterations[0].review.passed, false)
})

test('invalid model output is bounded to three attempts without leaking raw response contents', async () => {
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async () => { calls++; return 'secret-provider-output-not-json' } })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, options())
  assert.equal(calls, 3); assert.equal(result.status, 'needs_input'); assert.equal(result.iterations.length, 3)
  assert.equal(JSON.stringify(result).includes('secret-provider-output'), false)
})

test('three unsuccessful reviews preserve preview and findings without marking ready', async () => {
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async () => ++calls % 2 ? ready(dwelling()) : JSON.stringify({ verdict: 'revise', summary: 'Falta corregir aberturas.', issues: ['Alinear la ventana con el plano.'], questions: [] }) })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reconstruí mi vivienda.' }, options())
  assert.equal(calls, 6); assert.equal(result.status, 'needs_input'); assert.equal(result.iterations.length, 3)
  assert.ok(result.candidate); assert.ok(result.iterations.every(iteration => !iteration.review.passed))
})

test('building generation and review use web search and country-specific evidence constraints', async () => {
  let calls = 0
  const value = foundations(); value.dwelling.levels[0].planReferences = []
  const proposed = building()
  proposed.officialResearch = { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Untrusted model-made acquisition.', sources: [], unknowns: [], geocode: null, parcels: [], selectedParcelId: null, selectionEvidence: null }
  const generate = createFoundationGenerator({ references,
    acquireGeodata: async () => ({ status: 'unsupported', summary: 'Synthetic adapter does not cover this case.', sources: [], questions: [], unknowns: [], geocode: null, context: null }),
    turn: async (input, _schema, _settings, search) => {
    calls++
    assert.equal(search, true); assert.ok(input.every(item => item.type === 'text'))
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /Cadastral parcel != building footprint/)
    assert.match(prompt, /Córdoba/)
    return calls === 1 ? ready(proposed) : accept
  } })
  const result = await generate({ project: project(value), target: 'building', message: 'Consultá las fuentes oficiales.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(calls, 2)
  const candidate = result.candidate as ReturnType<typeof building>
  assert.equal(candidate.buildings[0].source, 'estimated'); assert.equal(candidate.sources[0].kind, 'official')
  assert.deepEqual(candidate.roads, [])
  assert.equal(candidate.officialResearch, undefined, 'model output cannot fabricate server-acquired research')
  assert.equal(result.officialResearch, undefined)
})

const unavailableGeodata = async () => ({ status: 'unsupported' as const, summary: 'Controlled unavailable source.', sources: [], questions: [], unknowns: [], geocode: null, context: null })

test('building generation and review receive the same saved images and level labels without duplicate attachments', async () => {
  const value = foundations(), upperReference = '5685a0dc-31af-440f-87c9-7438f3099560'
  value.dwelling.levels.push({ ...structuredClone(value.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3,
    planReferences: [{ id: referenceId, name: 'Shared section' }, { id: upperReference, name: 'Upper plan' }] })
  const reads: string[] = [], attached: Parameters<typeof openaiVisualTurn>[0][] = []
  const generate = createFoundationGenerator({ references: { file: async id => { reads.push(id); return { path: `/fixture/${id}.png`, mime: 'image/png' } } },
    acquireGeodata: unavailableGeodata, turn: async input => {
      attached.push(structuredClone(input.slice(1)))
      return attached.length === 1 ? ready(building()) : accept
    } })
  const result = await generate({ project: project(value), target: 'building', message: 'Usá los planos guardados para reconstruir el edificio.' }, options())
  assert.equal(result.status, 'ready'); assert.deepEqual(reads, [referenceId, upperReference])
  assert.equal(attached.length, 2); assert.deepEqual(attached[1], attached[0])
  assert.deepEqual(attached[0].filter(item => item.type === 'local_image').map(item => item.path), [`/fixture/${referenceId}.png`, `/fixture/${upperReference}.png`])
  const labels = attached[0].filter(item => item.type === 'text').map(item => item.text).join('\n')
  assert.match(labels, /ground-floor/); assert.match(labels, /upper-floor/); assert.match(labels, /already attached/)
})

test('unreadable optional building plans are disclosed and never claimed as attached', async () => {
  for (const failure of ['missing', 'unsupported', 'read-error']) {
    const value = foundations()
    value.dwelling.levels.push({ ...structuredClone(value.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
    let reads = 0, calls = 0
    const events: string[] = []
    const generate = createFoundationGenerator({ references: { file: async () => {
      reads++
      if (failure === 'read-error') throw new Error('Controlled unreadable reference')
      return failure === 'missing' ? null : { path: '/fixture/not-an-image.pdf', mime: 'application/pdf' }
    } }, acquireGeodata: unavailableGeodata, turn: async input => {
      assert.equal(input.filter(item => item.type === 'local_image').length, 0)
      const labels = input.slice(1).filter(item => item.type === 'text').map(item => item.text).join('\n')
      assert.match(labels, /UNAVAILABLE: no image is attached/); assert.match(labels, /Do not claim to have inspected/)
      return calls++ === 0 ? ready(building()) : accept
    } })
    const result = await generate({ project: project(value), target: 'building', message: 'Consultá otras fuentes disponibles.' }, { ...options(), onEvent: event => events.push(event.message) })
    assert.equal(result.status, 'ready'); assert.equal(calls, 2); assert.equal(reads, 1)
    assert.equal(events.filter(message => message.startsWith('No se pudo adjuntar')).length, 1)
  }
})

test('building receives identical compact accepted dwelling coordinates and local floor regions in generation and review', async () => {
  const source = project(), accepted = dwelling()
  source.foundations!.dwelling.status = 'ready'
  accepted.levels[0].apartment.floorRegions = [
    { id: 'main', polygon: [[0, 0], [4, 0], [4, 6], [0, 6]], floorElevation: 0, ceilingElevation: 2.7, evidence: { confidence: 'user', note: 'Main floor datum.' } },
    { id: 'annex', polygon: [[4, 0], [8, 0], [8, 3], [4, 3]], floorElevation: -.127, ceilingElevation: 2.3368, evidence: { confidence: 'observed', note: 'Section A: lower annex.' } },
  ]
  accepted.levels.push({ ...structuredClone(accepted.levels[0]), levelId: 'upper-floor', name: 'Upper', levelIndex: 1, elevation: 3 })
  source.foundationModels = { dwelling: { versionId: referenceId, candidate: accepted }, building: null, activeLevelId: null, levels: [] }
  const before = JSON.stringify(source), contexts: unknown[] = []
  const generate = createFoundationGenerator({ references, acquireGeodata: unavailableGeodata, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    const data = JSON.parse(prompt.split(contexts.length === 0 ? 'USER PROJECT DATA (JSON): ' : 'USER DATA (JSON): ')[1].split('\n')[0])
    contexts.push(data.acceptedDwellingContext)
    assert.match(prompt, /never independently recenter or rotate levels/)
    assert.match(prompt, /Never overwrite server-owned SOURCE CONTEXT/)
    return contexts.length === 1 ? ready(building()) : accept
  } })
  const result = await generate({ project: source, target: 'building', message: 'Contrastá la envolvente con mi vivienda aceptada.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(contexts.length, 2); assert.deepEqual(contexts[1], contexts[0])
  assert.deepEqual(contexts[0], {
    versionId: referenceId, evidenceKind: 'accepted estimated dwelling', geographicRegistration: 'unverified',
    summary: accepted.summary, assumptions: accepted.assumptions, unknowns: accepted.unknowns, sources: accepted.sources,
    levels: accepted.levels.map(level => ({ levelId: level.levelId, name: level.name, levelIndex: level.levelIndex, elevation: level.elevation,
      ceilingHeight: level.ceilingHeight, scaleEvidence: level.scaleEvidence, coordinateSystem: level.apartment.coordinateSystem,
      perimeter: level.apartment.perimeter, floorRegions: level.apartment.floorRegions })),
  })
  assert.doesNotMatch(JSON.stringify(contexts), /"rooms"|"walls"|"doors"|"windows"/)
  assert.equal(JSON.stringify(source), before)
})

test('building receives no dwelling context until a dwelling candidate is accepted and ready', async () => {
  for (const condition of ['absent', 'draft', 'wrong-target']) {
    const source = project()
    if (condition !== 'absent') source.foundationModels = { dwelling: { versionId: referenceId, candidate: condition === 'draft' ? dwelling() : building() }, building: null, activeLevelId: null, levels: [] }
    if (condition === 'wrong-target') source.foundations!.dwelling.status = 'ready'
    let calls = 0
    const generate = createFoundationGenerator({ references, acquireGeodata: unavailableGeodata, turn: async input => {
      const prompt = input[0].type === 'text' ? input[0].text : ''
      const data = JSON.parse(prompt.split(calls === 0 ? 'USER PROJECT DATA (JSON): ' : 'USER DATA (JSON): ')[1].split('\n')[0])
      assert.equal(Object.hasOwn(data, 'acceptedDwellingContext'), false)
      return calls++ === 0 ? ready(building()) : accept
    } })
    assert.equal((await generate({ project: source, target: 'building', message: 'Reconstruí el edificio.' }, options())).status, 'ready')
    assert.equal(calls, 2)
  }
})

test('full and acquired building formats retain explicit registration and reuse it on unrelated corrections', async () => {
  const source = project(), dwellingRegistration = { dwellingVersionId: referenceId, position: [0, 0, 0] as [number, number, number], evidence: { confidence: 'user' as const, note: 'The accepted plan and building use the same documented origin.' } }
  source.foundations!.dwelling.status = 'ready'
  source.foundationModels = { dwelling: { versionId: referenceId, candidate: dwelling() }, building: null, activeLevelId: null, levels: [] }
  const first = building(); first.dwellingRegistration = dwellingRegistration
  let calls = 0
  const generate = createFoundationGenerator({ references, acquireGeodata: unavailableGeodata, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    if (calls % 2 === 1) assert.deepEqual(JSON.parse(prompt.split('CANDIDATE (JSON): ')[1]).dwellingRegistration, dwellingRegistration)
    return calls++ % 2 === 0 ? ready(first) : accept
  } })
  const initial = await generate({ project: source, target: 'building', message: 'Usá el mismo origen para ambos modelos.' }, options())
  assert.equal(initial.status, 'ready'); assert.deepEqual(initial.candidate?.target === 'building' && initial.candidate.dwellingRegistration, dwellingRegistration)
  source.foundationModels.building = { versionId: projectId, candidate: initial.candidate! }
  const corrected = createFoundationGenerator({ references, acquireGeodata: async () => { throw new Error('Reuse saved source only') }, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    if (calls++ % 2 === 0) {
      assert.deepEqual(JSON.parse(prompt.split('USER PROJECT DATA (JSON): ')[1].split('\n')[0]).previous.dwellingRegistration, dwellingRegistration)
      return JSON.stringify({ status: 'ready', summary: 'Registro conservado.', questions: [], measurementCorrections: [], buildingEdits: [], candidateJson: JSON.stringify({ target: 'building', summary: 'Sin cambios geométricos.', assumptions: [], unknowns: [], sources: [] }) })
    }
    assert.deepEqual(JSON.parse(prompt.split('CANDIDATE (JSON): ')[1]).dwellingRegistration, dwellingRegistration)
    return accept
  } })
  const next = await corrected({ project: source, target: 'building', message: 'Revisá las fuentes manteniendo la geometría.' }, options())
  assert.equal(next.status, 'ready'); assert.deepEqual(next.candidate?.target === 'building' && next.candidate.dwellingRegistration, dwellingRegistration)
  assert.equal(calls, 4)
})

test('stale inherited registration cannot reach source review or silently fall back when omitted', async () => {
  const source = project(), previous = building()
  source.foundations!.dwelling.status = 'ready'
  previous.dwellingRegistration = { dwellingVersionId: projectId, position: [0, 0, 0], evidence: { confidence: 'inferred', note: 'Registration refers to the previously accepted dwelling.' } }
  source.foundationModels = { dwelling: { versionId: referenceId, candidate: dwelling() }, building: { versionId: projectId, candidate: previous }, activeLevelId: null, levels: [] }
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /USER PROJECT DATA/)
    if (calls++) assert.match(prompt, /versión de vivienda actualmente aceptada/)
    return JSON.stringify({ status: 'ready', summary: 'Omitted registration.', questions: [], measurementCorrections: [], buildingEdits: [], candidateJson: JSON.stringify({ target: 'building', summary: 'Conservar contexto.', assumptions: [], unknowns: [], sources: [] }) })
  } })
  const result = await generate({ project: source, target: 'building', message: 'Actualizá con mi vivienda actual.' }, options())
  assert.equal(result.status, 'needs_input'); assert.equal(calls, 3)
  assert.ok(result.iterations.every(iteration => !iteration.review.passed && iteration.review.issues.some(issue => issue.startsWith('dwellingRegistration:'))))
  assert.deepEqual(result.candidate?.target === 'building' && result.candidate.dwellingRegistration, previous.dwellingRegistration)
})

test('accepted dwelling context cannot replace server acquired building geometry', async () => {
  const source = project(), accepted = dwelling(), acquired = building()
  const dwellingRegistration = { dwellingVersionId: referenceId, position: [0, 0, 0], evidence: { confidence: 'user', note: 'The accepted dwelling uses the documented site origin.' } }
  source.foundations!.dwelling.status = 'ready'
  source.foundationModels = { dwelling: { versionId: referenceId, candidate: accepted }, building: null, activeLevelId: null, levels: [] }
  acquired.buildings[0].footprint = acquired.buildings[0].footprint.map(([x, z]) => [x + 100, z + 200])
  const original = structuredClone(acquired)
  let calls = 0
  const generate = createFoundationGenerator({ references, acquireGeodata: async () => ({ status: 'available', summary: 'Controlled recorded geometry.', sources: acquired.sources, questions: [], unknowns: acquired.unknowns, geocode: null,
    context: { site: acquired.site, buildings: acquired.buildings, roads: acquired.roads, parcel: acquired.parcel } }), turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /acceptedDwellingContext/)
    return calls++ === 0 ? JSON.stringify({ status: 'ready', summary: 'Contexto conservado.', questions: [], measurementCorrections: [], buildingEdits: [],
      candidateJson: JSON.stringify({ target: 'building', summary: 'Geometría registrada conservada; alineación estimada.', assumptions: [], unknowns: [], sources: [], dwellingRegistration }) }) : accept
  } })
  const result = await generate({ project: source, target: 'building', message: 'Usá el contexto registrado disponible.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(calls, 2)
  assert.equal(result.candidate?.target, 'building')
  if (result.candidate?.target !== 'building') throw new Error('Missing building candidate')
  assert.deepEqual(result.candidate.buildings, original.buildings); assert.deepEqual(result.candidate.parcel, original.parcel)
  assert.deepEqual(result.candidate.dwellingRegistration, dwellingRegistration)
  assert.deepEqual(acquired, original)
})

test('building cannot proceed with missing country or unsupported geometry', async () => {
  let calls = 0
  const value = foundations(); value.building.countryCode = ''
  const generate = createFoundationGenerator({ references, turn: async () => { calls++; return ready(building()) } })
  const result = await generate({ project: project(value), target: 'building', message: 'Consultá las fuentes.' }, options())
  assert.equal(result.status, 'needs_input'); assert.equal(calls, 0)
  const noSources = building(); noSources.sources = []
  assert.ok(validateFoundationGeometry(noSources, foundations()).length)
  const officialGeometry = building(); officialGeometry.buildings[0].source = 'ign-bdtopo'
  assert.ok(validateFoundationGeometry(officialGeometry, foundations()).some(issue => /estimada/.test(issue)))
})

test('parent version and user correction are both included without altering the parent', async () => {
  const parent = { candidate: dwelling() } as FoundationVersion, before = JSON.stringify(parent)
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    calls++
    if (calls === 1) {
      const prompt = input[0].type === 'text' ? input[0].text : ''
      assert.match(prompt, /Corrigí la posición de la ventana/); assert.match(prompt, /previous/); assert.match(prompt, /floor-0/)
    }
    return calls === 1 ? ready(dwelling()) : accept
  } })
  await generate({ project: project(), target: 'dwelling', message: 'Corrigí la posición de la ventana.', parentVersion: parent }, options())
  assert.equal(JSON.stringify(parent), before)
})

test('corrections in copied projects use the accepted base without requiring original run history', async () => {
  const copy = project(), accepted = dwelling()
  accepted.summary = 'Base aceptada copiada de otro proyecto.'
  copy.foundationModels = { dwelling: { versionId: referenceId, candidate: accepted }, building: null, activeLevelId: null, levels: [] }
  const before = JSON.stringify(copy)
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls++ === 0) {
      const prompt = input[0].type === 'text' ? input[0].text : ''
      assert.match(prompt, /Base aceptada copiada de otro proyecto/)
      assert.match(prompt, /Corrigí la ventana de mi copia/)
      return ready(accepted)
    }
    return accept
  } })
  const result = await generate({ project: copy, target: 'dwelling', message: 'Corrigí la ventana de mi copia.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(JSON.stringify(copy), before)
})

test('short answers preserve prior questions and review findings in generation and independent review', async () => {
  const parent = {
    status: 'needs_input', candidate: null, summary: 'Falta una medida para calibrar el plano.',
    questions: ['¿Cuánto mide la pared sur del dormitorio?'],
    iterations: [{ index: 1, candidate: null, review: { passed: false, summary: 'La escala del dormitorio no se puede leer.', issues: ['Usar la longitud real de la pared sur como referencia.'] } }],
  } as FoundationVersion
  const conversation = [
    { message: 'Reconstruí mi casa respetando el dormitorio al fondo.', summary: 'Falta una medida para calibrar el plano.', questions: parent.questions },
  ]
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /3,4m/)
    assert.match(prompt, /Cuánto mide la pared sur del dormitorio/)
    assert.match(prompt, /Usar la longitud real de la pared sur como referencia/)
    assert.match(prompt, /Reconstruí mi casa respetando el dormitorio al fondo/)
    assert.match(prompt, /needs_input/)
    return calls++ === 0 ? ready(dwelling()) : accept
  } })
  const result = await generate({ project: project(), target: 'dwelling', message: '3,4m', parentVersion: parent, conversation }, options())
  assert.equal(calls, 2); assert.equal(result.status, 'ready')
  assert.equal(parent.candidate, null)
})

test('conversation context is bounded and retains the latest answer chain in chronological order', async () => {
  const conversation = Array.from({ length: 15 }, (_, index) => ({ message: `message-${index}`, summary: 'Contexto conocido.', questions: [`question-${index}`] }))
  const parent = { status: 'needs_input', candidate: null, summary: 'Medida pendiente.', questions: ['question-14'], iterations: [] } as unknown as FoundationVersion
  const generate = createFoundationGenerator({ references, turn: async input => {
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.equal(prompt.includes('message-0"'), false)
    assert.equal(prompt.includes('message-2"'), false)
    assert.ok(prompt.indexOf('message-3"') < prompt.indexOf('message-14"'))
    assert.match(prompt, /question-14/)
    return noInput
  } })
  await generate({ project: project(), target: 'dwelling', message: 'La medida es 3,4m.', parentVersion: parent, conversation }, options())
})

test('explicit user measurement overrides intake and is retained as checked provenance', async () => {
  const quote = 'El ancho total ahora es 9 m.'
  const correction: FoundationMeasurementCorrection = { levelId: 'ground-floor', field: 'width', value: 9, quote }
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls++ === 0) return ready(widthCandidate(9), [correction])
    const prompt = input[0].type === 'text' ? input[0].text : ''
    const data = JSON.parse(prompt.split('USER DATA (JSON): ')[1].split('\nCANDIDATE (JSON):')[0])
    assert.equal(data.foundations.dwelling.levels[0].width, 9)
    assert.equal(data.originalFoundations.dwelling.levels[0].width, 8)
    assert.deepEqual(data.verifiedMeasurementCorrections, [correction])
    return accept
  } })
  const source = project()
  const result = await generate({ project: source, target: 'dwelling', message: quote }, options())
  assert.equal(result.status, 'ready'); assert.equal(calls, 2)
  const candidate = result.candidate as ReturnType<typeof dwelling>
  assert.deepEqual(candidate.measurementCorrections, [correction])
  assert.match(candidate.levels[0].scaleEvidence, /ancho 9 m/)
  assert.ok(candidate.levels[0].apartment.metadata.assumptions.some(assumption => assumption.includes(quote)))
  assert.equal(source.foundations!.dwelling.levels[0].width, 8, 'original intake remains unchanged')
})

test('silent drift, forged candidate provenance and unsupported quotes cannot override intake', async () => {
  const quote = 'El ancho total ahora es 9 m.'
  const correction: FoundationMeasurementCorrection = { levelId: 'ground-floor', field: 'width', value: 9, quote }
  const cases = [
    { message: 'Corregí las ventanas.', corrections: [] },
    { message: 'Corregí las ventanas.', corrections: [correction] },
    { message: 'El ancho total es 19 m.', corrections: [{ ...correction, quote: 'El ancho total es 19 m.' }] },
    { message: quote, corrections: [{ ...correction, levelId: 'unknown-floor' }] },
    { message: 'El ancho total es 9 ft.', corrections: [{ ...correction, quote: 'El ancho total es 9 ft.' }] },
  ]
  for (const entry of cases) {
    let calls = 0
    const candidate = widthCandidate(9); candidate.measurementCorrections = [correction]
    const generate = createFoundationGenerator({ references, turn: async () => { calls++; return ready(candidate, entry.corrections) } })
    const result = await generate({ project: project(), target: 'dwelling', message: entry.message }, options())
    assert.equal(result.status, 'needs_input'); assert.equal(calls, 3, 'invalid evidence never reaches independent review')
    assert.ok(result.iterations.every(iteration => !iteration.review.passed))
    assert.equal((result.candidate as ReturnType<typeof dwelling>)?.measurementCorrections, undefined)
  }
})

test('decimal-comma short answer can answer a concrete measurement question', async () => {
  const parent = { status: 'needs_input', candidate: null, summary: 'Confirmá el ancho.', questions: ['¿Cuál es el ancho total en metros?'], iterations: [] } as unknown as FoundationVersion
  const correction: FoundationMeasurementCorrection = { levelId: 'ground-floor', field: 'width', value: 9.5, quote: '9,5m' }
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async () => calls++ === 0 ? ready(widthCandidate(9.5), [correction]) : accept })
  const result = await generate({ project: project(), target: 'dwelling', message: '9,5m', parentVersion: parent }, options())
  assert.equal(result.status, 'ready')
  assert.deepEqual((result.candidate as ReturnType<typeof dwelling>).measurementCorrections, [correction])
})

test('accepted measurement correction remains the baseline in future edits and copied projects', async () => {
  const correction: FoundationMeasurementCorrection = { levelId: 'ground-floor', field: 'width', value: 9, quote: 'El ancho total ahora es 9 m.' }
  const accepted = widthCandidate(9); accepted.measurementCorrections = [correction]
  const copy = project(); copy.foundationModels = { dwelling: { versionId: referenceId, candidate: accepted }, building: null, levels: [], activeLevelId: null }
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls++ === 0) {
      const prompt = input[0].type === 'text' ? input[0].text : ''
      const data = JSON.parse(prompt.split('USER PROJECT DATA (JSON): ')[1].split('\nCURRENT REPAIR DATA')[0])
      assert.equal(data.foundations.dwelling.levels[0].width, 9)
      return ready(accepted)
    }
    return accept
  } })
  const result = await generate({ project: copy, target: 'dwelling', message: 'Ajustá la ventana lateral.' }, options())
  assert.equal(result.status, 'ready')
  assert.deepEqual((result.candidate as ReturnType<typeof dwelling>).measurementCorrections, [correction])
  assert.equal(copy.foundations!.dwelling.levels[0].width, 8)
})

test('failed geometry does not establish a future measurement baseline', async () => {
  const candidate = widthCandidate(9)
  candidate.measurementCorrections = [{ levelId: 'ground-floor', field: 'width', value: 9, quote: 'El ancho total ahora es 9 m.' }]
  const parent = { status: 'needs_input', candidate, summary: 'Geometría inválida.', questions: [], iterations: [{ index: 1, candidate, review: { passed: false, summary: 'No pasó la validación.', issues: [] } }] } as unknown as FoundationVersion
  const generate = createFoundationGenerator({ references, turn: async () => ready(candidate) })
  const result = await generate({ project: project(), target: 'dwelling', message: 'Reintentá.', parentVersion: parent }, options())
  assert.equal(result.status, 'needs_input')
  assert.ok(result.iterations.every(iteration => iteration.review.issues.some(issue => issue.includes('width'))))
})

test('historical measurements cannot supersede a newer accepted correction during an unrelated edit', async () => {
  const oldQuote = 'El ancho total es 8 m.'
  const accepted = widthCandidate(9)
  accepted.measurementCorrections = [{ levelId: 'ground-floor', field: 'width', value: 9, quote: 'El ancho total ahora es 9 m.' }]
  const current = project(); current.foundationModels = { dwelling: { versionId: referenceId, candidate: accepted }, building: null, levels: [], activeLevelId: null }
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async () => {
    calls++
    return ready(widthCandidate(8), [{ levelId: 'ground-floor', field: 'width', value: 8, quote: oldQuote }])
  } })
  const result = await generate({ project: current, target: 'dwelling', message: 'Corregí solo la puerta.', conversation: [{ message: oldQuote, summary: 'Medida inicial.', questions: [] }] }, options())
  assert.equal(result.status, 'needs_input'); assert.equal(calls, 3)
  assert.ok(result.iterations.every(iteration => iteration.review.issues.some(issue => issue.includes('mensaje actual'))))
  assert.equal(current.foundationModels.dwelling!.candidate.target === 'dwelling' && current.foundationModels.dwelling!.candidate.measurementCorrections?.[0].value, 9)
})

test('abort prevents inference and discards results arriving after cancellation', async () => {
  const before = new AbortController(); before.abort()
  let calls = 0
  const turn: typeof openaiVisualTurn = async () => { calls++; return ready(dwelling()) }
  const generate = createFoundationGenerator({ references, turn })
  await assert.rejects(generate({ project: project(), target: 'dwelling', message: 'Crear.' }, { signal: before.signal }), { name: 'AbortError' })
  assert.equal(calls, 0)
  const during = new AbortController()
  const delayed = createFoundationGenerator({ references, turn: async () => { during.abort(); return ready(dwelling()) } })
  await assert.rejects(delayed({ project: project(), target: 'dwelling', message: 'Crear.' }, { signal: during.signal }), { name: 'AbortError' })
})

test('chat elevation corrections repair connected stair endpoints before independent review accepts them', async () => {
  const value = foundations(), candidate = dwelling()
  value.dwelling.levels.push({ ...structuredClone(value.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3 })
  candidate.levels.push({ ...structuredClone(candidate.levels[0]), levelId: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 3.3 })
  const evidence = { confidence: 'inferred' as const, note: 'Source-grounded route with synthetic test dimensions.' }
  const polygon: [number, number][] = [[.5, 1.3], [1.5, 1.3], [1.5, 4.5], [.5, 4.5]]
  candidate.levels[0].apartment.ceilingOpenings = [{ id: 'opening-below', polygon, connectionId: 'stair', evidence }]
  candidate.levels[1].apartment.floorOpenings = [{ id: 'opening-above', polygon, connectionId: 'stair', evidence }]
  candidate.connections = [{ id: 'stair', fromLevelId: 'ground-floor', toLevelId: 'upper-floor', kind: 'stairs', notes: 'Inter-floor route.', geometry: { width: .8, flights: [{ from: [1, 0, 1], to: [1, 3, 4.5], steps: 18 }], landings: [], evidence } }]
  const corrected = structuredClone(candidate)
  corrected.connections[0].geometry!.flights[0].to[1] = 3.3
  const message = 'La cota de la planta alta debe ser 3.3 metros; ajustá la escalera sin cambiar las habitaciones.'
  const correction: FoundationMeasurementCorrection = { levelId: 'upper-floor', field: 'elevation', value: 3.3, quote: 'La cota de la planta alta debe ser 3.3 metros' }
  const outputs = [ready(candidate, [correction]), ready(corrected, [correction]), accept]
  let calls = 0
  const generate = createFoundationGenerator({ references, turn: async input => {
    if (calls === 1) assert.match(input[0].type === 'text' ? input[0].text : '', /upper threshold must meet its floor support/)
    return outputs[calls++]
  } })
  const result = await generate({ project: project(value), target: 'dwelling', message }, options())
  assert.equal(result.status, 'ready')
  assert.equal(result.iterations.length, 2)
  assert.equal(result.iterations[0].candidate, null)
  assert.equal(result.candidate?.target, 'dwelling')
  if (result.candidate?.target === 'dwelling') {
    assert.equal(result.candidate.connections[0].geometry?.flights[0].to[1], 3.3)
    assert.deepEqual(result.candidate.levels[0].apartment.rooms, candidate.levels[0].apartment.rooms)
    assert.equal(result.iterations[1].review.passed, true)
  }
})

test('regional annex heights use wall bases and preserve their local floor datum', () => {
  const candidate = dwelling(), apartment = candidate.levels[0].apartment
  const evidence = { confidence: 'observed' as const, note: 'Synthetic source section for a floor 0.127 m below the main datum.' }
  apartment.floorRegions = [{ id: 'annex', polygon: structuredClone(apartment.perimeter), floorElevation: -.127, ceilingElevation: 2.3368, evidence }]
  apartment.walls = apartment.walls.map(wall => ({ ...wall, baseElevation: -.127, height: 2.4638 }))
  assert.equal(FoundationCandidateSchema.safeParse(candidate).success, true)
  assert.deepEqual(validateFoundationGeometry(candidate, foundations()), [])
  apartment.walls[0].height = 2.7
  assert.ok(validateFoundationGeometry(candidate, foundations()).some(issue => /dimensiones de muro/.test(issue)))
})
