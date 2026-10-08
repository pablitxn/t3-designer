import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectFoundations } from '@t3-designer/scene-schema'
import { acquireArgentineFoundationGeodata } from '../src/argentina-geodata.ts'
import { acquireArgentineAddress, argentineProvince } from '../src/argentina-georef.ts'
import { localArea, localParcelRings, wgs84ToLocal } from '../src/argentina-local-geometry.ts'
import { officialJson } from '../src/official-geodata-http.ts'

const input = { ...createProjectFoundations().building, countryCode: 'AR', address: 'Avenida Colón 151, Córdoba', region: 'Córdoba' }
const origin: [number, number] = [-64.18507808357143, -31.41304475360204]
const geo = { direcciones: [{ altura: { valor: 151 }, calle: { id: '140140100002060' }, provincia: { id: '14' },
  localidad_censal: { nombre: 'Córdoba' }, nomenclatura: 'AV COLON 151, Córdoba, Capital, Córdoba', ubicacion: { lon: origin[0], lat: origin[1] } }], cantidad: 1, total: 88 }
const reference = '11010101010101'
const ring = [[origin[0], origin[1]], [origin[0] + .0001, origin[1]], [origin[0] + .0001, origin[1] + .0001], [origin[0], origin[1] + .0001], [origin[0], origin[1]]]
const parcels = { type: 'FeatureCollection', crs: { properties: { name: 'urn:ogc:def:crs:EPSG::4326' } }, features: [
  { type: 'Feature', properties: { Nomenclatura: reference, Tipo_Parcela: 'URBANO', Superficie_Tierra_Urbana: 120 }, geometry: { type: 'Polygon', coordinates: [ring] } },
] }
const options = (fetcher: typeof fetch) => ({ signal: new AbortController().signal, now: () => new Date('2026-10-08T10:00:00Z'), fetcher })
function fake(address: unknown = geo, lot: unknown = parcels, seen: URL[] = []): typeof fetch {
  return async (url, init) => {
    const parsed = new URL(String(url)); seen.push(parsed)
    assert.equal(init?.redirect, 'error'); assert.ok(init?.signal)
    if (parsed.hostname === 'apis.datos.gob.ar') {
      assert.equal(parsed.searchParams.get('direccion'), 'Avenida Colón 151')
      assert.equal(parsed.searchParams.get('provincia'), '14')
      assert.equal(parsed.searchParams.get('localidad_censal'), 'Córdoba')
      return Response.json(address)
    }
    assert.equal(parsed.hostname, 'idecor-ws.mapascordoba.gob.ar')
    return Response.json(lot)
  }
}
test('Argentina preserves actual parcel records and does not select a parcel from approximate geocoding', async () => {
  const seen: URL[] = [], result = await acquireArgentineFoundationGeodata(input, options(fake(geo, parcels, seen)))
  assert.equal(result.status, 'partial'); assert.equal(result.context, null); assert.equal(seen.length, 2)
  const research = result.officialResearch!
  assert.equal(research.selectedParcelId, null); assert.equal(research.geocode!.precision, 'approximate')
  assert.equal(research.parcels[0].id, reference); assert.equal(research.parcels[0].area, 120); assert.equal(research.parcels[0].areaBasis, 'published')
  assert.equal(research.parcels[0].sourceDate, null)
  assert.equal(research.sources.length, 2); assert.ok(research.sources.every(source => source.retrievedAt === '2026-10-08'))
  assert.match(result.questions.join(' '), /referencia catastral/)
  assert.ok(research.parcels[0].footprint[1][0] > 9); assert.ok(research.parcels[0].footprint[2][1] < -11)
})
test('only an explicit exact reference selects a acquired parcel; mismatch never chooses another', async () => {
  for (const cadastralReference of [reference, '11010101010102']) {
    const result = await acquireArgentineFoundationGeodata({ ...input, cadastralReference }, options(fake()))
    assert.equal(result.officialResearch!.selectedParcelId, cadastralReference === reference ? reference : null)
    if (cadastralReference === reference) assert.match(result.officialResearch!.selectionEvidence!, new RegExp(reference))
  }
})
test('geocoding ambiguity and wrong province/locality stop before any cadastral request', async () => {
  for (const address of [{ ...geo, direcciones: [geo.direcciones[0], geo.direcciones[0]] },
    { ...geo, direcciones: [{ ...geo.direcciones[0], provincia: { id: '06' } }] },
    { ...geo, direcciones: [{ ...geo.direcciones[0], localidad_censal: { nombre: 'Villa María' } }] },
    { ...geo, direcciones: [{ ...geo.direcciones[0], ubicacion: { lon: null, lat: null } }] }]) {
    const seen: URL[] = [], result = await acquireArgentineFoundationGeodata(input, options(fake(address, parcels, seen)))
    assert.equal(seen.length, 1); assert.equal(result.officialResearch!.geocode, null); assert.equal(result.officialResearch!.parcels.length, 0)
    assert.ok(result.questions.length)
  }
})
test('missing province or locality is clarified before sending an ambiguous countrywide address', async () => {
  const forbidden: typeof fetch = async () => { throw new Error('Must not fetch') }
  for (const value of [{ address: 'Av Colón 151', region: '' }, { address: 'Av Colón 151', region: 'Córdoba' }]) {
    const result = await acquireArgentineAddress(value, options(forbidden))
    assert.equal(result.geocode, null); assert.ok(result.questions.length)
  }
  assert.equal(argentineProvince('Provincia de Buenos Aires', '')?.id, '06')
  assert.equal(argentineProvince('CABA', '')?.id, '02')
  assert.equal(argentineProvince('Mendoza', '')?.id, '50')
  assert.equal(argentineProvince('Córdoba', 'Cerrito 628, CABA'), null)
  assert.equal(argentineProvince('Provincia de Buenos Aires', 'Cerrito 628, CABA'), null)
})
test('published geographic boundaries retain holes and malformed geometry is withheld', () => {
  const hole = [[origin[0] + .00002, origin[1] + .00002], [origin[0] + .00004, origin[1] + .00002], [origin[0] + .00004, origin[1] + .00004], [origin[0] + .00002, origin[1] + .00004], [origin[0] + .00002, origin[1] + .00002]] as [number, number][]
  const projected = localParcelRings([ring as [number, number][], hole], origin)!
  assert.equal(projected.length, 2); assert.ok(localArea(projected[0]) > localArea(projected[1]))
  assert.equal(localParcelRings([ring.slice(0, 4) as [number, number][]], origin), null)
  assert.equal(localParcelRings([[ring[0], ring[2], ring[1], ring[3], ring[0]] as [number, number][]], origin), null)
  assert.equal(localParcelRings([ring as [number, number][], ring as [number, number][]], origin), null)
  assert.equal(localParcelRings([ring.map(p => [p[0] + 1, p[1]]) as [number, number][]], origin), null)
})
test('local WGS84 projection uses ground metres and geographic east/south axes', () => {
  // WGS84 equatorial meridian and prime-vertical radii give these displacements.
  const east = wgs84ToLocal([.00001, 0], [0, 0]), north = wgs84ToLocal([0, .00001], [0, 0])
  assert.ok(Math.abs(east[0] - 1.11319490793273) < 1e-9); assert.equal(east[1], 0)
  assert.ok(Math.abs(north[1] + 1.10574275821594) < 1e-9); assert.equal(north[0], 0)
  assert.deepEqual(wgs84ToLocal(origin, origin), [0, 0])
})
test('public-data reader bounds declared and streaming bodies and propagates aborts', async () => {
  const url = new URL('https://apis.datos.gob.ar/georef/api/v2.0/direcciones')
  await assert.rejects(officialJson(url, options(async () => new Response('{}', { headers: { 'content-length': '2000001' } }))), /tamaño/)
  await assert.rejects(officialJson(url, options(async () => new Response('x'.repeat(2000001)))), /tamaño/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(officialJson(url, { signal: controller.signal, fetcher: fake() }), { name: 'AbortError' })
})
