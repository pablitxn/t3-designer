import assert from 'node:assert/strict'
import test from 'node:test'
import { acquireProvincialParcels } from '../src/argentina-provincial-cadastre.ts'

const ring = [[-64.1909, -31.4157], [-64.1907, -31.4157], [-64.1907, -31.4155], [-64.1909, -31.4155], [-64.1909, -31.4157]]
const hole = [[-64.19085, -31.41565], [-64.1908, -31.41565], [-64.1908, -31.4156], [-64.19085, -31.4156], [-64.19085, -31.41565]]
const cordobaReference = '1101010405006013'
const arbaReference = '055010H00000000000000000000006440000000000'
const input = { provinceId: '14', longitude: -64.1908, latitude: -31.4156 }
const options = () => ({ signal: new AbortController().signal, now: () => new Date('2026-10-08T10:00:00Z') })
const feature = (id = cordobaReference) => ({ type: 'Feature', id: 'internal-record', geometry: { type: 'MultiPolygon', coordinates: [[ring, hole]] }, properties: {
  Nomenclatura: id, Tipo_Parcela: 'URBANO', Superficie_Tierra_Urbana: 1494.46, Superficie_Tierra_Rural: 2,
  owner: 'must not be copied', Nro_Cuenta: 123, Valuacion: 200_000, Fecha_Creacion: '2024-01-01',
} })
const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features, crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } }, numberMatched: features.length, timeStamp: '2026-10-08T09:00:00Z' })
const respond = (body: unknown, seen: URL[] = []): typeof fetch => async (url, init) => {
  seen.push(new URL(String(url)))
  assert.equal(init?.redirect, 'error')
  assert.ok(init?.signal)
  return Response.json(body)
}

test('Córdoba preserves published WGS84 rings and urban square metres while excluding unrelated attributes', async () => {
  const seen: URL[] = []
  const result = await acquireProvincialParcels(input, { ...options(), fetcher: respond(collection([feature()]), seen) })
  assert.equal(seen.length, 1)
  const url = seen[0]
  assert.equal(url.origin, 'https://idecor-ws.mapascordoba.gob.ar')
  assert.equal(url.searchParams.get('typeName'), 'idecor:parcelas')
  assert.equal(url.searchParams.get('propertyName'), 'geom,Nomenclatura,Tipo_Parcela,Superficie_Tierra_Urbana')
  assert.equal(url.searchParams.get('srsName'), 'EPSG:4326')
  assert.equal(url.searchParams.get('maxFeatures'), '20')
  assert.match(url.searchParams.get('CQL_FILTER')!, /^BBOX\(geom,.*,'EPSG:4326'\)$/)
  assert.deepEqual(result.parcels[0].rings, [ring, hole])
  assert.equal(result.parcels[0].id, cordobaReference)
  assert.equal(result.parcels[0].publishedArea, 1494.46)
  assert.equal(result.parcels[0].sourceDate, null, 'record creation and HTTP response time are not geometry measurement dates')
  assert.equal(result.parcels[0].provider, 'idecor')
  assert.match(result.parcels[0].attribution, /CC BY-SA 4.0/)
  assert.equal(JSON.stringify(result).includes('must not be copied'), false)
  assert.equal(JSON.stringify(result.parcels).includes('Valuacion'), false)
  assert.equal(result.sources[0].retrievedAt, '2026-10-08')
  assert.match(result.unknowns.join(' '), /no aportan huella construida/)
})

test('ARBA selects its own authority and nomenclature without treating unknown area units as square metres', async () => {
  const seen: URL[] = []
  const parcel = { ...feature(), properties: { cca: arbaReference, ara1: 14382.72, tpa: 'Urbano', pda: 'excluded' } }
  const result = await acquireProvincialParcels({ provinceId: '06', longitude: -57.9535, latitude: -34.9204, reference: arbaReference }, { ...options(), fetcher: respond(collection([parcel]), seen) })
  assert.equal(seen[0].origin, 'https://geo.arba.gov.ar')
  assert.equal(seen[0].searchParams.get('typeName'), 'idera:Parcela')
  assert.equal(seen[0].searchParams.get('propertyName'), 'geom,cca')
  assert.equal(seen[0].searchParams.get('CQL_FILTER'), `cca='${arbaReference}'`)
  assert.equal(result.parcels[0].id, arbaReference)
  assert.equal(result.parcels[0].publishedArea, null)
  assert.equal(result.parcels[0].sourceDate, null)
  assert.match(result.parcels[0].attribution, /CC BY 2.5 Argentina/)
  assert.match(result.parcels[0].jurisdiction, /excluye CABA/)
  assert.match(result.unknowns.join(' '), /no se confirmó la unidad/)
})

test('exact reference searches cannot become CQL expressions and ignore unrelated returned records', async () => {
  let calls = 0
  const never: typeof fetch = async () => { calls++; throw new Error('unexpected fetch') }
  for (const reference of ["1101010405006013' OR 1=1", 'https://example.com', '055 1 H 644']) {
    const result = await acquireProvincialParcels({ ...input, reference }, { ...options(), fetcher: never })
    assert.equal(result.parcels.length, 0)
    assert.match(result.unknowns[0], /formato/)
  }
  assert.equal(calls, 0)
  const seen: URL[] = []
  const result = await acquireProvincialParcels({ ...input, reference: cordobaReference }, { ...options(), fetcher: respond(collection([feature(), feature('1101010405006014')]), seen) })
  assert.equal(seen[0].searchParams.get('CQL_FILTER'), `Nomenclatura='${cordobaReference}'`)
  assert.deepEqual(result.parcels.map(parcel => parcel.id), [cordobaReference])
  assert.match(result.unknowns.join(' '), /omitieron 1/)
})

test('unsupported provinces and invalid geographic origins do not request another jurisdiction', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; throw new Error('unexpected fetch') }
  for (const provinceId of ['02', '82', 'Buenos Aires', '', 'toString']) {
    const result = await acquireProvincialParcels({ ...input, provinceId }, { ...options(), fetcher })
    assert.equal(result.parcels.length, 0)
    assert.match(result.unknowns[0], /provincia/)
  }
  for (const longitude of [NaN, Infinity, 3, -31.4]) {
    const result = await acquireProvincialParcels({ ...input, longitude }, { ...options(), fetcher })
    assert.equal(result.parcels.length, 0)
    assert.match(result.unknowns[0], /coordenadas/)
  }
  assert.equal(calls, 0)
})

test('disjoint components and duplicate references are withheld instead of choosing arbitrary geometry', async () => {
  const disjoint = { ...feature(), geometry: { type: 'MultiPolygon', coordinates: [[ring], [hole]] } }
  const result = await acquireProvincialParcels(input, { ...options(), fetcher: respond(collection([disjoint, feature('1101010405006014'), feature('1101010405006014')])) })
  assert.equal(result.parcels.length, 0)
  assert.match(result.unknowns.join(' '), /varios polígonos separados/)
  assert.match(result.unknowns.join(' '), /duplicación/)
})

test('malformed and projected coordinates fail closed and rural areas are never interpreted as urban square metres', async () => {
  const wrongCrs = { ...collection([feature()]), crs: { type: 'name', properties: { name: 'EPSG:22174' } } }
  const failed = await acquireProvincialParcels(input, { ...options(), fetcher: respond(wrongCrs) })
  assert.deepEqual(failed.parcels, [])
  assert.deepEqual(failed.sources, [])
  assert.match(failed.unknowns.join(' '), /WGS84/)
  const invalid = { ...feature(), geometry: { type: 'Polygon', coordinates: [ring.slice(0, -1)] } }
  const rural = { ...feature('1101010405006014'), properties: { ...feature('1101010405006014').properties, Tipo_Parcela: 'RURAL' } }
  const result = await acquireProvincialParcels(input, { ...options(), fetcher: respond(collection([invalid, rural])) })
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcels[0].publishedArea, null)
})

test('a full page is flagged partial even when provider counters only report the limited response', async () => {
  const data = collection(Array.from({ length: 20 }, (_, index) => feature(String(1101010405006013 + index))))
  const result = await acquireProvincialParcels(input, { ...options(), fetcher: respond(data) })
  assert.equal(result.parcels.length, 20)
  assert.match(result.unknowns.join(' '), /parcial.*límite 20/)
  const oversized = await acquireProvincialParcels(input, { ...options(), fetcher: respond(collection([...data.features, feature()])) })
  assert.deepEqual(oversized.parcels, [])
  assert.match(oversized.unknowns.join(' '), /acotada/)
})

test('official service failure returns no invented data and user cancellation propagates', async () => {
  const failed = await acquireProvincialParcels(input, { ...options(), fetcher: async () => new Response('', { status: 503 }) })
  assert.deepEqual(failed.parcels, [])
  assert.deepEqual(failed.sources, [])
  assert.match(failed.unknowns.join(' '), /HTTP 503/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(acquireProvincialParcels(input, { ...options(), signal: controller.signal, fetcher: respond(collection([])) }), /abort/i)
})
