import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createProjectFoundations, FoundationCandidateSchema, type FoundationCandidate, type FoundationVersion, foundationInputFingerprintValue } from '@t3-designer/scene-schema'
import { acquireFrenchFoundationGeodata, lambert93ToLocal, type FoundationGeodataContext } from '../src/foundation-geodata.ts'
import { createFoundationGenerator, validateFoundationGeometry } from '../src/foundation-agent-model.ts'
import type { ProjectDocument } from '../src/projects.ts'

const origin = [700000, 6600000]
const ring = (points: number[][]) => [...points, points[0]].map(([x, z]) => [origin[0] + x, origin[1] - z, 55])
const square = (x = -10, z = -10, size = 20) => ring([[x, z], [x + size, z], [x + size, z + size], [x, z + size]])
function feature(id = 'recorded-building', x = -10, z = -10) {
  return { id, geometry: { type: 'MultiPolygon', coordinates: [[square(x, z), ...(id === 'recorded-building' ? [square(2, 2, 2)] : [])]] }, properties: {
    cleabs: id, hauteur: 15.9, altitude_minimale_sol: 39, altitude_minimale_toit: 55, altitude_maximale_toit: 65,
    precision_planimetrique: 3, precision_altimetrique: 1, nombre_d_etages: null, identifiants_rnb: 'RNB_A/RNB_B',
  } }
}
const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features, crs: { properties: { name: 'urn:ogc:def:crs:EPSG::2154' } }, numberMatched: features.length })
function fixtures() {
  return {
    geocode: { type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [3, 46.5] }, properties: { label: '4 Example, France', id: 'test-ban', score: .97, type: 'housenumber', x: origin[0], y: origin[1] } }] },
    buildings: collection([feature(), feature('neighbor', 30, 30)]),
    roads: collection([{ id: 'road', geometry: { type: 'LineString', coordinates: ring([[-30, 0], [-30, 80]]).slice(0, 2) }, properties: { cleabs: 'road', largeur_de_chaussee: 4, nature: 'Route', nom_voie_ban_gauche: 'Published road' } }]),
    parcels: collection([{ id: 'parcel', geometry: { type: 'Polygon', coordinates: [square(-25, -25, 50)] }, properties: { idu: 'published-parcel', contenance: 2500 } }]),
  }
}
const input = { countryCode: 'FR', address: '4 Example, France', region: 'Test region' }
const options = () => ({ signal: new AbortController().signal, now: () => new Date('2026-10-07T12:00:00Z') })
test('Lambert-93 meridian correction aligns geographic north/east and preserves metric lengths', () => {
  // Independent forward Lambert calculation with IGN NT/G71 ALG0003 at
  // (-1.67494,48.093066), then latitude/longitude separately +0.00001 degree.
  // Unlike the local rigid transform, these coordinates use the ellipsoidal
  // isometric latitude and conic radius. Their direction validates the sign.
  const origin: [number, number] = [352160.4804684607, 6787265.5462597385]
  const projectedNorth: [number, number] = [352160.54622338066, 6787266.655600779]
  const projectedEast: [number, number] = [352161.22365021746, 6787265.502208537]
  const north = lambert93ToLocal(projectedNorth, origin, -1.67494)
  const east = lambert93ToLocal(projectedEast, origin, -1.67494)
  assert.ok(Math.abs(north[0]) < 1e-7); assert.ok(north[1] < -1.1)
  assert.ok(Math.abs(east[1]) < 1e-7); assert.ok(east[0] > .74)
  assert.ok(Math.abs(Math.hypot(...north) - Math.hypot(projectedNorth[0] - origin[0], projectedNorth[1] - origin[1])) < 1e-12)
  assert.deepEqual(lambert93ToLocal([100, 200], [0, 0], 3), [100, -200])
})
function fetcher(data = fixtures(), seen: URL[] = []): typeof fetch {
  return async (url, init) => {
    const address = new URL(String(url)); seen.push(address)
    assert.equal(address.origin, 'https://data.geopf.fr')
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    let body: unknown = data.geocode
    if (address.pathname === '/wfs/ows') {
      assert.equal(address.searchParams.get('SRSNAME'), 'EPSG:2154')
      assert.equal(address.searchParams.get('COUNT'), '250')
      const layer = address.searchParams.get('TYPENAMES')
      body = layer === 'BDTOPO_V3:batiment' ? data.buildings : layer === 'BDTOPO_V3:troncon_de_route' ? data.roads : data.parcels
    }
    return Response.json(body)
  }
}

test('official acquisition preserves metric footprints, courtyard, recorded heights and exact parcel provenance', async () => {
  const seen: URL[] = [], result = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher(fixtures(), seen) })
  assert.equal(result.status, 'available'); assert.equal(seen.length, 4)
  assert.equal(seen[0].searchParams.get('q'), input.address)
  const { site, buildings, roads, parcel } = result.context!
  assert.equal(site.targetId, 'recorded-building'); assert.equal(site.timeZone, 'Europe/Paris'); assert.equal(site.radiusMeters, 150)
  assert.deepEqual(buildings[0].footprint, [[-10, -10], [10, -10], [10, 10], [-10, 10]])
  assert.deepEqual(buildings[0].holes, [[[2, 2], [4, 2], [4, 4], [2, 4]]])
  assert.equal(buildings[0].height, 15.9); assert.equal(buildings[0].roofHeight, 10); assert.equal(buildings[0].groundAltitude, 39)
  assert.equal(buildings[0].floors, null); assert.equal(buildings[0].rnbId, null); assert.equal(buildings[0].source, 'ign-bdtopo')
  assert.equal(roads[0].width, 4); assert.equal(parcel?.id, 'published-parcel'); assert.equal(parcel?.area, 2500)
  assert.equal(result.sources.length, 4); assert.ok(result.sources.every(source => source.retrievedAt === '2026-10-07'))
  assert.match(result.unknowns.join(' '), /varios identificadores RNB/)
})

test('unsupported country and insufficient address never manufacture a geographic context', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; throw new Error('must not fetch') }
  assert.equal((await acquireFrenchFoundationGeodata({ ...input, countryCode: 'US' }, { ...options(), fetcher })).status, 'unsupported')
  assert.equal((await acquireFrenchFoundationGeodata({ ...input, address: '' }, { ...options(), fetcher })).status, 'needs_input')
  assert.equal(calls, 0)
})

test('weak, street-only and competing geocodes ask for address confirmation before querying geometry', async () => {
  for (const kind of ['weak', 'street', 'ambiguous']) {
    const data = fixtures(), seen: URL[] = []
    if (kind === 'weak') data.geocode.features[0].properties.score = .5
    if (kind === 'street') data.geocode.features[0].properties.type = 'street'
    if (kind === 'ambiguous') data.geocode.features.push({ ...data.geocode.features[0], properties: { ...data.geocode.features[0].properties, id: 'different-address', score: .96 } })
    const result = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher(data, seen) })
    assert.equal(result.status, 'needs_input'); assert.equal(result.context, null); assert.equal(seen.length, 1)
  }
})

test('unknown target height or multiple containing footprints is needs_input, never a guessed volume', async () => {
  for (const kind of ['height', 'ambiguous', 'courtyard']) {
    const data = fixtures()
    if (kind === 'height') data.buildings.features[0] = { ...feature(), properties: { ...feature().properties, hauteur: null } }
    if (kind === 'ambiguous') data.buildings.features.push(feature('second-target', -5, -5))
    if (kind === 'courtyard') data.buildings.features[0] = { ...feature(), geometry: { type: 'Polygon', coordinates: [square(), square(-2, -2, 4)] } }
    const result = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher(data) })
    assert.equal(result.status, 'needs_input'); assert.equal(result.context, null)
  }
})

test('missing parcel and unavailable roads stay unknown without inventing official records', async () => {
  const data = fixtures(); data.parcels.features = []
  const inner = fetcher(data)
  const result = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: async (url, init) => String(url).includes('troncon_de_route') ? new Response('', { status: 503 }) : inner(url, init) })
  assert.equal(result.status, 'available'); assert.equal(result.context?.parcel, null); assert.deepEqual(result.context?.roads, [])
  assert.equal(result.sources.length, 3); assert.match(result.unknowns.join(' '), /calles ficticias/)
})

test('bounded context retains target plus nearest59 valid buildings and records omissions', async () => {
  const data = fixtures()
  data.buildings.features = [feature(), ...Array.from({ length: 90 }, (_, index) => feature(`neighbor-${index}`, 25 + index, 25))]
  data.buildings.features.push({ ...feature('missing-height', 30, 40), properties: { ...feature().properties, hauteur: null } })
  const result = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher(data) })
  assert.equal(result.context?.buildings.length, 60); assert.equal(result.context?.buildings[0].isTarget, true)
  assert.ok(!result.context?.buildings.some(building => building.id === 'missing-height'))
  assert.match(result.unknowns.join(' '), /contexto es parcial/); assert.match(result.unknowns.join(' '), /altura ausente/)
})

test('wrong projection and oversized response fail closed; abortion is propagated', async () => {
  const data = fixtures(); data.buildings.crs.properties.name = 'EPSG:4326'
  assert.equal((await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher(data) })).status, 'needs_input')
  const tooLarge: typeof fetch = async () => new Response(' ', { headers: { 'content-length': '2000001' } })
  assert.equal((await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: tooLarge })).status, 'needs_input')
  const controller = new AbortController(); controller.abort()
  await assert.rejects(acquireFrenchFoundationGeodata(input, { ...options(), signal: controller.signal, fetcher: fetcher() }), /abort/i)
})

function project(): ProjectDocument {
  const foundations = createProjectFoundations(); Object.assign(foundations.building, input)
  return { id: '861d161a-b6d0-4686-a2d5-b74d2bfb43c8', name: 'Public building test', notes: '', ownerId: 'owner', role: 'owner', revision: 1, createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', stage: 'setup', foundations, scene: null, foundationModels: null }
}
const prose = { target: 'building', summary: 'Extrusión estimada a partir de datos IGN.', assumptions: ['Cubierta simplificada.'], unknowns: ['Fachadas sin detalle.'], sources: [] }
const ready = (candidate = prose) => JSON.stringify({ status: 'ready', summary: candidate.summary, candidateJson: JSON.stringify(candidate), buildingEdits: [], measurementCorrections: [], questions: [] })
const accept = JSON.stringify({ verdict: 'accept', summary: 'Se revisaron datos y límites de la reconstrucción.', issues: [], questions: [] })

test('building generation attaches immutable source geometry and citations; model writes only reviewable prose', async () => {
  const acquired = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
  let calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => acquired, turn: async (input, _schema, settings, search) => {
    calls++; assert.equal(search, false); assert.equal(JSON.stringify(_schema).includes('oneOf'), false, 'Responses structured output requires anyOf for operation alternatives'); assert.equal(settings.reasoningEffort, 'high'); assert.equal(settings.maxOutputTokens, undefined, 'hosted generation retains the shared reasoning/output allowance')
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /SOURCE CONTEXT/); assert.match(prompt, /never claim it was applied/i)
    return calls === 1 ? ready() : accept
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Creá el contexto de este edificio.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(calls, 2)
  assert.equal(result.candidate?.target, 'building')
  const candidate = result.candidate as Extract<FoundationCandidate, { target: 'building' }>
  assert.deepEqual(candidate.buildings, acquired.context!.buildings); assert.deepEqual(candidate.sources, acquired.sources)
  assert.deepEqual(FoundationCandidateSchema.parse(candidate), candidate)
  assert.deepEqual(validateFoundationGeometry(candidate, project().foundations!, acquired), [])
  assert.ok(validateFoundationGeometry(candidate, project().foundations!).some(issue => issue.includes('estimada')))
  assert.ok(candidate.unknowns.includes(acquired.unknowns[0]))
})

test('failed supported acquisition and missing parcel return questions without any paid inference', async () => {
  for (const missingParcel of [false, true]) {
    const acquired = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
    if (missingParcel) acquired.context!.parcel = null
    else { acquired.status = 'needs_input'; acquired.questions = ['Confirmá el número de calle.'] }
    const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => acquired, turn: async () => { throw new Error('must not infer') } })
    const result = await generate({ project: project(), target: 'building', message: 'Construí el contexto.' }, options())
    assert.equal(result.status, 'needs_input'); assert.equal(result.iterations.length, 0)
  }
})

test('source geometry cannot be changed by emitted model fields, and user corrections can return targeted needs_input', async () => {
  const acquired = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
  let calls = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => acquired, turn: async () => {
    calls++
    if (calls === 1) return ready({ ...prose, buildings: [{ height: 999 }] } as typeof prose)
    return calls === 2 ? ready() : accept
  } })
  const result = await generate({ project: project(), target: 'building', message: 'Creá el contexto.' }, options())
  assert.equal(result.status, 'ready'); assert.equal(result.iterations.length, 2)
  assert.equal(result.iterations[0].candidate, null)
  assert.equal((result.candidate as Extract<FoundationCandidate, { target: 'building' }>).buildings[0].height, 15.9)
  const correct = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => acquired, turn: async () => JSON.stringify({ status: 'needs_input', summary: 'La altura solicitada cambia el registro IGN.', candidateJson: '', buildingEdits: [], measurementCorrections: [], questions: ['¿La altura medida de18m corresponde al alero o a la cumbrera?'] }) })
  assert.equal((await correct({ project: project(), target: 'building', message: 'Cambiá la altura a18m.' }, options())).status, 'needs_input')
})

test('validator only trusts the exact acquired IGN building values', async () => {
  const acquired: FoundationGeodataContext = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
  const candidate = FoundationCandidateSchema.parse({ ...prose, ...acquired.context, sources: acquired.sources })
  assert.equal(candidate.target, 'building')
  if (candidate.target !== 'building') return
  candidate.buildings[0].height += 1
  assert.ok(validateFoundationGeometry(candidate, project().foundations!, acquired).some(issue => issue.includes('estimada')))
})


test('real building correction orchestration preserves a saved source snapshot across multiple chat turns', async () => {
  const acquired = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
  const base = FoundationCandidateSchema.parse({ ...prose, ...acquired.context, sources: acquired.sources })
  if (base.target !== 'building') throw new Error('Expected building')
  const unchanged = structuredClone(base)
  const current = project()
  current.foundationModels = { dwelling: null, building: { versionId: '861d161a-b6d0-4686-a2d5-b74d2bfb43c8', candidate: base }, levels: [], activeLevelId: null }
  const firstQuote = 'Cambiá la altura del cuerpo sin cubierta a 18 m'
  const secondQuote = 'Mové el edificio 2 m al este y 1 m al sur'
  let calls = 0, acquisitions = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async () => { acquisitions++; throw new Error('Chat must retain its accepted snapshot') }, turn: async (input, _schema, _settings, search) => {
    assert.equal(search, false)
    const prompt = input[0].type === 'text' ? input[0].text : ''
    assert.match(prompt, /no volvió a consultar las fuentes/)
    const call = calls++
    if (call % 2) return accept
    const edit = call === 0 ? { type: 'set_height', buildingId: base.site.targetId, value: 18, quote: firstQuote }
      : { type: 'translate', buildingId: base.site.targetId, dx: 2, dz: 1, quote: secondQuote }
    return JSON.stringify({ ...JSON.parse(ready()), buildingEdits: [edit] })
  } })
  const first = await generate({ project: current, target: 'building', message: firstQuote }, options())
  assert.equal(first.status, 'ready')
  if (first.candidate?.target !== 'building') throw new Error('Expected first building')
  assert.equal(first.candidate.buildings[0].height, 18)
  assert.equal(first.candidate.buildings[0].source, 'estimated')
  const parent = { ...first, id: 'parent', target: 'building', foundationsFingerprint: createHash('sha256').update(foundationInputFingerprintValue(current.foundations)).digest('hex'), iterations: first.iterations } as FoundationVersion
  const second = await generate({ project: current, target: 'building', message: secondQuote, parentVersion: parent }, options())
  assert.equal(second.status, 'ready')
  if (second.candidate?.target !== 'building') throw new Error('Expected second building')
  assert.equal(second.candidate.buildings[0].height, 18)
  assert.deepEqual(second.candidate.buildings[0].footprint, base.buildings[0].footprint.map(([x, z]) => [x + 2, z + 1]))
  assert.deepEqual(second.candidate.buildings[0].holes, base.buildings[0].holes?.map(ring => ring.map(([x, z]) => [x + 2, z + 1])))
  assert.deepEqual(second.candidate.buildings.slice(1), base.buildings.slice(1))
  assert.deepEqual(second.candidate.roads, base.roads); assert.deepEqual(second.candidate.parcel, base.parcel)
  assert.deepEqual(second.candidate.sources, base.sources)
  assert.deepEqual(second.candidate.buildingCorrections?.baseBuildings, [base.buildings[0]])
  assert.equal(second.candidate.buildingCorrections?.operations.length, 2)
  assert.deepEqual(base, unchanged); assert.equal(acquisitions, 0); assert.equal(calls, 4)
})


test('a reviewed parent for obsolete project inputs cannot relabel an old address as the new building', async () => {
  const acquired = await acquireFrenchFoundationGeodata(input, { ...options(), fetcher: fetcher() })
  const candidate = FoundationCandidateSchema.parse({ ...prose, ...acquired.context, sources: acquired.sources })
  const current = project()
  const oldFingerprint = createHash('sha256').update(foundationInputFingerprintValue(current.foundations)).digest('hex')
  current.foundations!.building.address = 'New address 99'
  const parent = { status: 'ready', target: 'building', candidate, foundationsFingerprint: oldFingerprint, iterations: [{ index: 1, candidate, review: { passed: true, summary: '', issues: [] } }] } as unknown as FoundationVersion
  let acquisitions = 0
  const generate = createFoundationGenerator({ references: { file: async () => null }, acquireGeodata: async actual => {
    acquisitions++; assert.equal(actual.address, 'New address 99')
    return { ...acquired, status: 'needs_input', questions: ['Confirmá esta nueva dirección.'] }
  }, turn: async () => { throw new Error('Old geometry must not become a new ready candidate') } })
  const result = await generate({ project: current, target: 'building', message: 'Continuá.', parentVersion: parent }, options())
  assert.equal(acquisitions, 1); assert.equal(result.status, 'needs_input'); assert.equal(result.candidate, null)
})
