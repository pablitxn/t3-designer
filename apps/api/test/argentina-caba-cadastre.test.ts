import assert from 'node:assert/strict'
import test from 'node:test'
import { acquireCabaParcels } from '../src/argentina-caba-cadastre.ts'

const ring = [[-58.384, -34.602], [-58.382, -34.602], [-58.382, -34.6], [-58.384, -34.6], [-58.384, -34.602]]
const normalized = { direccionesNormalizadas: [{ altura: 628, cod_calle: 3118, cod_partido: 'caba', tipo: 'calle_altura',
  coordenadas: { srid: 4326, x: '-58.382442', y: '-34.601054' }, direccion: 'CERRITO 628, CABA' }] }
const parcel = { smp: '005-056A-000', srid: 4326, superficie_total: '12271.00', fuente: 'AGIP (2008)',
  puertas: [{ codigo_calle: 3118, altura: 628, puerta_oficial: true }], irrelevantTaxField: 'must not be retained' }
const collection = () => ({ type: 'FeatureCollection', features: [{ type: 'Feature',
  properties: { tipo: 'parcela', codigo: '005-056A-000', fecha_actualizacion: '07/10/2026', fuente: 'UPDATE_OCTUBRE' },
  geometry: { type: 'MultiPolygon', coordinates: [[ring]] } }] })
function setup(values: unknown[]) {
  const requests: URL[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url)
    assert.equal(init?.redirect, 'error')
    assert.ok(['servicios.usig.buenosaires.gob.ar', 'epok.buenosaires.gob.ar'].includes(url.hostname))
    const value = values[requests.length - 1]
    if (value instanceof Error) throw value
    assert.notEqual(value, undefined, 'Unexpected extra request')
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'text/javascript' } })
  }
  return { requests, options: { signal: new AbortController().signal, fetcher, now: () => new Date('2026-10-08T10:00:00Z') } }
}

test('CABA uses the current address-to-SMP relation and preserves complete geographic geometry with provenance', async () => {
  const { requests, options } = setup([normalized, parcel, collection()])
  const result = await acquireCabaParcels({ address: 'Cerrito 628', reference: '005-056A-000' }, options)
  assert.equal(requests.length, 3)
  assert.equal(requests[0].searchParams.get('srid'), '4326')
  assert.equal(requests[1].searchParams.get('codigo_calle'), '3118')
  assert.equal(requests[1].searchParams.get('altura'), '628')
  assert.equal(requests[2].searchParams.get('smp'), '005-056A-000')
  assert.equal(result.geocode?.precision, 'address')
  assert.equal(result.geocode?.longitude, -58.382442)
  assert.equal(result.parcels[0].id, '005-056A-000')
  assert.equal(result.parcels[0].sourceDate, '2026-10-07')
  assert.equal(result.parcels[0].publishedArea, null, 'AGIP 2008 area must not describe a new geometry')
  assert.deepEqual(result.parcels[0].rings, [ring])
  assert.equal(result.sources.length, 3)
  assert.ok(result.sources.every(source => source.retrievedAt === '2026-10-08'))
  assert.match(result.parcels[0].attribution, /CC BY 2.5/)
  assert.ok(!JSON.stringify(result).includes('must not be retained'))
  assert.match(result.unknowns.join(' '), /no equivale a la huella/)
})

test('ambiguous addresses are not silently matched to the first parcel', async () => {
  const { requests, options } = setup([{ direccionesNormalizadas: [normalized.direccionesNormalizadas[0], { ...normalized.direccionesNormalizadas[0], direccion: 'OTRA CALLE 628, CABA' }] }])
  const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
  assert.equal(requests.length, 1)
  assert.equal(result.geocode, undefined)
  assert.deepEqual(result.parcels, [])
  assert.match(result.unknowns[0], /varias direcciones/)
})

test('a legacy or different reference is not automatically padded or substituted', async () => {
  const { requests, options } = setup([normalized, parcel])
  const result = await acquireCabaParcels({ address: 'Cerrito 628', reference: '05-056A-0000' }, options)
  assert.equal(requests.length, 2)
  assert.deepEqual(result.parcels, [])
  assert.match(result.unknowns[0], /no coincide exactamente/)
})

test('a normalized address outside CABA or with projected coordinates is not reinterpreted', async () => {
  for (const difference of [{ cod_partido: 'san_isidro' }, { coordenadas: { srid: 22185, x: 100000, y: 100000 } }]) {
    const { requests, options } = setup([{ direccionesNormalizadas: [{ ...normalized.direccionesNormalizadas[0], ...difference }] }])
    const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
    assert.equal(requests.length, 1)
    assert.equal(result.geocode, undefined)
    assert.deepEqual(result.parcels, [])
  }
})

test('holes remain holes and an absent official doorway leaves geocoding approximate', async () => {
  const geometry = collection(), hole = [[-58.3835, -34.6015], [-58.383, -34.6015], [-58.383, -34.601], [-58.3835, -34.601], [-58.3835, -34.6015]]
  geometry.features[0].geometry.coordinates[0].push(hole)
  const { options } = setup([normalized, { ...parcel, puertas: [] }, geometry])
  const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
  assert.equal(result.geocode?.precision, 'approximate')
  assert.deepEqual(result.parcels[0].rings, [ring, hole])
})

test('multiple components, unmatched identity, nonclosed rings and invalid coordinates are withheld', async () => {
  const multipart = collection(); multipart.features[0].geometry.coordinates.push([ring])
  const mismatch = collection(); mismatch.features[0].properties.codigo = '999-999-999'
  const open = collection(); open.features[0].geometry.coordinates = [[ring.slice(0, -1)]]
  const projected = collection(); projected.features[0].geometry.coordinates = [[[[100000, 100000], [100100, 100000], [100100, 100100], [100000, 100000]]]]
  for (const value of [multipart, mismatch, open, projected, {}]) {
    const { options } = setup([normalized, parcel, value])
    const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
    assert.deepEqual(result.parcels, [])
    assert.ok(result.unknowns.length)
  }
})

test('a failed geometry request preserves geocoding and identification without inventing a parcel', async () => {
  const { options } = setup([normalized, parcel, new Error('upstream unavailable')])
  const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
  assert.equal(result.geocode?.recordId, '3118:628')
  assert.equal(result.sources.length, 2)
  assert.deepEqual(result.parcels, [])
  assert.match(result.unknowns[0], /upstream unavailable/)
})

test('a malformed record date is not replaced with the retrieval date', async () => {
  const geometry = collection(); geometry.features[0].properties.fecha_actualizacion = '31/02/2026'
  const { options } = setup([normalized, parcel, geometry])
  const result = await acquireCabaParcels({ address: 'Cerrito 628' }, options)
  assert.equal(result.parcels[0].sourceDate, null)
})

test('abort propagates and invalid references do not start a public request', async () => {
  const { requests, options } = setup([])
  const result = await acquireCabaParcels({ address: 'Cerrito 628', reference: 'https://evil.test' }, options)
  assert.deepEqual(result.parcels, [])
  assert.equal(requests.length, 0)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(acquireCabaParcels({ address: 'Cerrito 628' }, { ...options, signal: controller.signal }), { name: 'AbortError' })
})
