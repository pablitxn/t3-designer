import type { FoundationOfficialResearch, FoundationSource } from '@t3-designer/scene-schema'
import { officialJson, officialRecord, type OfficialFetchOptions } from './official-geodata-http.ts'

export const normalizeArgentineName = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const provinces: [string, string][] = [
  ['02', 'Ciudad Autónoma de Buenos Aires'], ['06', 'Buenos Aires'], ['10', 'Catamarca'], ['14', 'Córdoba'], ['18', 'Corrientes'], ['22', 'Chaco'],
  ['26', 'Chubut'], ['30', 'Entre Ríos'], ['34', 'Formosa'], ['38', 'Jujuy'], ['42', 'La Pampa'], ['46', 'La Rioja'], ['50', 'Mendoza'], ['54', 'Misiones'],
  ['58', 'Neuquén'], ['62', 'Río Negro'], ['66', 'Salta'], ['70', 'San Juan'], ['74', 'San Luis'], ['78', 'Santa Cruz'], ['82', 'Santa Fe'],
  ['86', 'Santiago del Estero'], ['90', 'Tucumán'], ['94', 'Tierra del Fuego'],
]
/** Resolve an explicitly named province; a city name is never silently used as
 * another province. CABA and Buenos Aires province have different providers. */
export function argentineProvince(region: string, address: string): { id: string; name: string } | null {
  const parts = [...region.split(/[,;]/), ...address.split(/[,;]/).slice(1)].map(normalizeArgentineName)
  const matches = new Map<string, string>()
  if (parts.some(part => ['caba', 'capital federal', 'ciudad de buenos aires', 'ciudad autonoma de buenos aires'].includes(part))) matches.set('02', provinces[0][1])
  for (const raw of parts) {
    const part = raw.replace(/^provincia (?:de |del )?/, '')
    const found = provinces.find(([id, name]) => id !== '02' && (part === id || normalizeArgentineName(name) === part))
    if (found) matches.set(found[0], found[1])
    if (['pba', 'bs as'].includes(part)) matches.set('06', 'Buenos Aires')
  }
  const entries = [...matches]
  return entries.length === 1 ? { id: entries[0][0], name: entries[0][1] } : null
}

export type ArgentineAddressResult = {
  geocode: FoundationOfficialResearch['geocode']; provinceId: string; jurisdiction: string
  sources: FoundationSource[]; unknowns: string[]; questions: string[]
}
export async function acquireArgentineAddress(input: { address: string; region: string }, options: OfficialFetchOptions): Promise<ArgentineAddressResult> {
  const province = argentineProvince(input.region, input.address)
  const result: ArgentineAddressResult = { geocode: null, provinceId: province?.id ?? '', jurisdiction: province?.name ?? input.region, sources: [], unknowns: [], questions: [] }
  if (!province) { result.questions = ['Indicá la provincia en Región y la dirección como calle, número y localidad. CABA y Provincia de Buenos Aires son jurisdicciones diferentes.']; return result }
  const addressParts = input.address.split(/[,;]/).map(part => part.trim()).filter(Boolean)
  const regionParts = input.region.split(/[,;]/).map(part => part.trim()).filter(Boolean)
  const locality = addressParts[1] ?? regionParts.find(part => normalizeArgentineName(part) !== normalizeArgentineName(province.name) && !/^provincia /i.test(part))
  if (!addressParts[0] || !locality && province.id !== '02') { result.questions = ['Agregá la localidad después de la dirección, por ejemplo «Avenida Colón 151, Córdoba», y la provincia en Región.']; return result }
  const url = new URL('https://apis.datos.gob.ar/georef/api/v2.0/direcciones')
  url.search = new URLSearchParams({ direccion: addressParts[0], provincia: province.id, max: '3', ...(province.id !== '02' && locality ? { localidad_censal: locality } : {}) }).toString()
  try {
    const data = officialRecord(await officialJson(url, options)), addresses = data.direcciones
    if (!Array.isArray(addresses) || addresses.length > 3) throw new Error('GeoRef no devolvió una lista de direcciones acotada.')
    const retrievedAt = (options.now?.() ?? new Date()).toISOString().slice(0, 10)
    result.sources.push({ title: 'GeoRef · normalización oficial de direcciones', url: url.href, kind: 'official', retrievedAt,
      claims: ['Dirección normalizada y ubicación aproximada por interpolación; no identifica por sí sola una parcela ni la huella del edificio. Datos Argentina, CC BY 4.0.'] })
    if (addresses.length !== 1) {
      const labels = addresses.map(value => String(officialRecord(value).nomenclatura ?? '').slice(0, 300)).filter(Boolean)
      result.questions = [labels.length ? `La dirección tiene varias coincidencias: ${labels.join(' / ')}. Precisá calle, número y localidad.` : 'GeoRef no encontró una dirección: revisá calle, número, localidad y provincia.']
      return result
    }
    const address = officialRecord(addresses[0]), point = officialRecord(address.ubicacion), authority = officialRecord(address.provincia)
    const height = officialRecord(address.altura), street = officialRecord(address.calle), city = officialRecord(address.localidad_censal)
    const longitude = point.lon, latitude = point.lat
    if (authority.id !== province.id || locality && province.id !== '02' && normalizeArgentineName(String(city.nombre ?? '')) !== normalizeArgentineName(locality)) {
      result.questions = ['La coincidencia oficial no corresponde exactamente a la provincia y localidad indicadas. Confirmá la ubicación.']; return result
    }
    if (typeof longitude !== 'number' || typeof latitude !== 'number' || !Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -74 || longitude > -52 || latitude < -56 || latitude > -21 || typeof height.valor !== 'number' || height.valor <= 0 || !street.id) {
      result.questions = ['GeoRef no devolvió una ubicación utilizable para una dirección numerada. Confirmá calle, número y localidad o aportá un plano georreferenciado.']; return result
    }
    result.geocode = { label: String(address.nomenclatura ?? '').slice(0, 500), longitude, latitude, provider: 'georef', precision: 'approximate', recordId: `${String(street.id)}:${height.valor}` }
    result.unknowns.push('GeoRef aproxima la ubicación de la puerta: las parcelas cercanas requieren confirmación mediante su referencia catastral. No se eligió la más cercana automáticamente.')
    return result
  } catch (error) {
    if (options.signal.aborted) throw error
    result.unknowns.push(error instanceof Error ? error.message : 'GeoRef no respondió.')
    result.questions = ['No se pudo completar la consulta a GeoRef. Reintentá o aportá una dirección y referencia catastral verificables.']
    return result
  }
}
