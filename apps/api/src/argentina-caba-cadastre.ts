import type { FoundationSource, Point2D } from '@t3-designer/scene-schema'
import type { ArgentineParcelLookup, OfficialFetchOptions } from './argentina-geodata-types.ts'
import { officialJson, officialRecord } from './official-geodata-http.ts'

type CabaLookup = ArgentineParcelLookup & { geocode?: {
  label: string; longitude: number; latitude: number; recordId: string; precision: 'address' | 'approximate'
} }
const text = (value: unknown) => typeof value === 'string' ? value : ''
const number = (value: unknown) => typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN
const inCaba = (longitude: number, latitude: number) => Number.isFinite(longitude) && Number.isFinite(latitude)
  && longitude >= -58.6 && longitude <= -58.3 && latitude >= -34.75 && latitude <= -34.5
const referencePattern = /^[A-Za-z0-9]{1,12}-[A-Za-z0-9]{1,12}-[A-Za-z0-9]{1,12}$/
const jurisdiction = 'Ciudad Autónoma de Buenos Aires'
const attribution = 'Gobierno de la Ciudad Autónoma de Buenos Aires · USIG · CC BY 2.5 Argentina'

function sourceDate(value: unknown): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(value))
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

function rings(value: unknown): Point2D[][] | null {
  if (!Array.isArray(value) || !value.length || value.length > 21) return null
  const result: Point2D[][] = []
  for (const rawRing of value) {
    if (!Array.isArray(rawRing) || rawRing.length < 4 || rawRing.length > 201) return null
    const points: Point2D[] = []
    for (const rawPoint of rawRing) {
      if (!Array.isArray(rawPoint) || rawPoint.length !== 2 || typeof rawPoint[0] !== 'number' || typeof rawPoint[1] !== 'number' || !inCaba(rawPoint[0], rawPoint[1])) return null
      points.push([rawPoint[0], rawPoint[1]])
    }
    const first = points[0], last = points.at(-1)!
    if (first[0] !== last[0] || first[1] !== last[1] || new Set(points.map(point => point.join(','))).size < 3) return null
    result.push(points)
  }
  return result
}

/** Current USIG address -> cadastral reference -> complete parcel geometry.
 * The legacy geocoder SMP uses a different identifier format and must not be
 * padded, truncated or substituted for the current cadastral response. */
export async function acquireCabaParcels(input: { address: string; reference?: string }, options: OfficialFetchOptions): Promise<CabaLookup> {
  const result: CabaLookup = { parcels: [], sources: [], unknowns: [] }
  options.signal.throwIfAborted()
  const address = input.address.trim(), reference = input.reference?.trim() ?? ''
  if (!address || address.length > 500 || reference && !referencePattern.test(reference)) {
    result.unknowns.push('Indicá una dirección de CABA y, si la tenés, la nomenclatura catastral actual completa, respetando sus letras y ceros.')
    return result
  }
  const retrievedAt = (options.now?.() ?? new Date()).toISOString().slice(0, 10)
  const addSource = (title: string, url: URL, claims: string[]) => result.sources.push({ title, url: url.href, kind: 'official', retrievedAt, claims } satisfies FoundationSource)
  const normalizeUrl = new URL('https://servicios.usig.buenosaires.gob.ar/normalizar/')
  normalizeUrl.search = new URLSearchParams({ direccion: /\bCABA\b|Ciudad Aut[oó]noma de Buenos Aires|Capital Federal/i.test(address) ? address : `${address}, CABA`, geocodificar: 'TRUE', srid: '4326', maxOptions: '3' }).toString()
  try {
    const normalized = officialRecord(await officialJson(normalizeUrl, options)), addresses = normalized.direccionesNormalizadas
    addSource('USIG · normalización de direcciones de CABA', normalizeUrl, [
      'Direcciones numeradas y coordenadas solicitadas en WGS84 (longitud, latitud). La ubicación de la puerta no representa el centro ni la huella del edificio.',
    ])
    if (!Array.isArray(addresses) || addresses.length !== 1) {
      const labels = Array.isArray(addresses) ? addresses.slice(0, 3).map(value => text(officialRecord(value).direccion).slice(0, 200)).filter(Boolean) : []
      result.unknowns.push(labels.length ? `USIG devolvió varias direcciones: ${labels.join(' / ')}. Precisá el nombre completo de la calle; no se eligió la primera coincidencia.` : 'USIG no encontró una dirección única y numerada en CABA.')
      return result
    }
    const selected = officialRecord(addresses[0]), coordinates = officialRecord(selected.coordenadas)
    const streetCode = number(selected.cod_calle), height = number(selected.altura), longitude = number(coordinates.x), latitude = number(coordinates.y)
    if (selected.cod_partido !== 'caba' || selected.tipo !== 'calle_altura' || number(coordinates.srid) !== 4326
      || !Number.isSafeInteger(streetCode) || streetCode <= 0 || !Number.isSafeInteger(height) || height <= 0 || !inCaba(longitude, latitude)) {
      result.unknowns.push('La coincidencia no confirma una dirección numerada de CABA en WGS84; no se reinterpretaron las coordenadas.')
      return result
    }
    result.geocode = { label: text(selected.direccion).slice(0, 500) || address, longitude, latitude, recordId: `${streetCode}:${height}`, precision: 'approximate' }
    const parcelUrl = new URL('https://epok.buenosaires.gob.ar/catastro/parcela/')
    parcelUrl.search = new URLSearchParams({ codigo_calle: String(streetCode), altura: String(height) }).toString()
    const parcel = officialRecord(await officialJson(parcelUrl, options)), id = text(parcel.smp)
    if (!referencePattern.test(id) || number(parcel.srid) !== 4326) {
      result.unknowns.push('El catastro de CABA no devolvió una nomenclatura actual con referencia WGS84 para esta dirección.')
      return result
    }
    const doors = Array.isArray(parcel.puertas) ? parcel.puertas : []
    const door = doors.map(officialRecord).find(value => number(value.codigo_calle) === streetCode && number(value.altura) === height && value.puerta_oficial === true)
    if (door) result.geocode.precision = 'address'
    addSource('USIG · identificación parcelaria por dirección', parcelUrl, [
      `La dirección consultada está asociada por el servicio a la nomenclatura actual ${id}${door ? '; el número figura entre las puertas oficiales' : '; no se confirmó una puerta oficial exacta'}. Esto no acredita titularidad.`,
      'Se conservan identificación y geometría, sin titulares ni datos tributarios. No se usa la superficie de la ficha histórica AGIP como medida de la geometría actual.',
    ])
    if (reference && reference !== id) {
      result.unknowns.push(`La referencia indicada (${reference}) no coincide exactamente con la nomenclatura actual asociada por USIG a esta dirección (${id}). Confirmá dirección y referencia; no se alteraron ceros ni letras.`)
      return result
    }
    const geometryUrl = new URL('https://epok.buenosaires.gob.ar/catastro/geometria/')
    geometryUrl.search = new URLSearchParams({ smp: id }).toString()
    const collection = officialRecord(await officialJson(geometryUrl, options))
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length !== 1) {
      result.unknowns.push('USIG no devolvió una geometría parcelaria única para la nomenclatura actual.')
      return result
    }
    const feature = officialRecord(collection.features[0]), properties = officialRecord(feature.properties), geometry = officialRecord(feature.geometry)
    if (properties.tipo !== 'parcela' || properties.codigo !== id) {
      result.unknowns.push('La geometría no confirma el tipo parcela y la nomenclatura consultada; no se asignó a esta dirección.')
      return result
    }
    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
      result.unknowns.push(`La parcela ${id} tiene varios polígonos separados; no se eligió una sola parte como si fuera el terreno completo.`)
      return result
    }
    const coordinatesValue = geometry.type === 'Polygon' ? geometry.coordinates
      : geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length === 1 ? geometry.coordinates[0] : null
    const geographicRings = rings(coordinatesValue)
    if (!geographicRings) {
      result.unknowns.push('El contorno parcelario no se pudo conservar íntegro y cerrado en WGS84 dentro de los límites de tamaño; no se simplificó ni sustituyó.')
      return result
    }
    const date = sourceDate(properties.fecha_actualizacion)
    result.parcels.push({ id, label: `Parcela ${id}`, rings: geographicRings, publishedArea: null, sourceDate: date,
      sourceUrl: geometryUrl.href, provider: 'usig-caba', jurisdiction, attribution })
    addSource('USIG · geometría catastral de CABA', geometryUrl, [
      `Contorno de la parcela ${id} en WGS84; anillos interiores conservados. Fecha de actualización publicada: ${date ?? 'no utilizable'}. La fecha de actualización no acredita una medición de campo.`,
      'Catálogo oficial de parcelas y licencia CC BY 2.5 Argentina: https://data.buenosaires.gob.ar/dataset/parcelas. Fuente de geometría publicada: ' + text(properties.fuente).slice(0, 200),
      'La superficie se calcula desde el polígono actual: no se mezcla con la superficie de la ficha histórica AGIP. El catastro no aporta aquí huella construida, altura, techos ni distribución interior.',
    ])
    result.unknowns.push('El límite catastral no equivale a la huella construida ni aporta altura. La superficie de la ficha AGIP histórica no se incorporó: puede no corresponder a la geometría actual. Confirmá la parcela antes de reconstruir el edificio.')
    options.signal.throwIfAborted()
    return result
  } catch (error) {
    options.signal.throwIfAborted()
    result.unknowns.push(`No se pudo completar el catastro de CABA: ${error instanceof Error ? error.message : 'respuesta no utilizable'}`)
    return result
  }
}
