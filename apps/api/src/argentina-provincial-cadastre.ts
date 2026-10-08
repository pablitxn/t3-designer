import type { Point2D } from '@t3-designer/scene-schema'
import type { ArgentineParcelLookup, ArgentineParcelRecord, OfficialFetchOptions } from './argentina-geodata-types.ts'
import { officialJson, officialRecord } from './official-geodata-http.ts'

type Input = { provinceId: string; longitude: number; latitude: number; reference?: string }
type Provider = {
  id: string; title: string; endpoint: string; layer: string; referenceField: string; referencePattern: RegExp
  fields: string; jurisdiction: string; attribution: string; claims: string[]
}

const MAX_FEATURES = 20
const RADIUS_METERS = 60
const arba: Provider = {
  id: 'arba', title: 'ARBA · parcelas de la provincia de Buenos Aires',
  endpoint: 'https://geo.arba.gov.ar/geoserver/idera/wfs', layer: 'idera:Parcela',
  referenceField: 'cca', referencePattern: /^[A-Z0-9]{12,60}$/, fields: 'geom,cca',
  jurisdiction: 'Provincia de Buenos Aires (excluye CABA)', attribution: 'ARBA · GeoARBA · CC BY 2.5 Argentina',
  claims: [
    'Nomenclatura y geometría parcelaria de ARBA; no se solicitaron titulares ni partidas tributarias.',
    'Capa bajo CC BY 2.5 Argentina según el catálogo oficial IDEBA: https://geonetwork.ideba.gba.gob.ar/geonetwork/srv/api/records/4c46d362-980d-4438-a002-069ea76235d4.',
    'Metadatos históricos de escala 1:5.000 y mantenimiento diario declarado; no acreditan la fecha actual de medición. Se exigió la salida WGS84 confirmada por el servicio.',
  ],
}
const idecor: Provider = {
  id: 'idecor', title: 'IDECOR · parcelas de la provincia de Córdoba',
  endpoint: 'https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/parcelas/wfs/json', layer: 'idecor:parcelas',
  referenceField: 'Nomenclatura', referencePattern: /^[0-9]{10,20}$/, fields: 'geom,Nomenclatura,Tipo_Parcela,Superficie_Tierra_Urbana',
  jurisdiction: 'Provincia de Córdoba', attribution: 'Dirección General de Catastro de Córdoba · IDECOR · CC BY-SA 4.0',
  claims: [
    'Geometría y nomenclatura parcelaria de la Dirección General de Catastro de Córdoba, publicadas por IDECOR. Superficie urbana publicada en m²; sin titulares, cuentas ni valuaciones.',
    'Metadatos parcelarios: CC BY-SA; escala media declarada 1:5.000 urbana y 1:50.000 rural. El documento de metadatos no acredita la fecha actual de medición.',
    'Atribución y compartir igual según https://www.idecor.gob.ar/terminos-y-condiciones/; metadatos: https://obs-idecor-lib.obs.sa-argentina-1.myhuaweicloud.com/metadatos/metadatos_parcelas.pdf.',
  ],
}
const text = (value: unknown) => typeof value === 'string' ? value : ''
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const inArgentina = (longitude: number, latitude: number) => finite(longitude) && finite(latitude) && longitude >= -74 && longitude <= -53 && latitude >= -56 && latitude <= -21

function rings(value: unknown): Point2D[][] | null {
  if (!Array.isArray(value) || !value.length || value.length > 21) return null
  const result: Point2D[][] = []
  for (const rawRing of value) {
    if (!Array.isArray(rawRing) || rawRing.length < 4 || rawRing.length > 201) return null
    const points: Point2D[] = []
    for (const rawPoint of rawRing) {
      if (!Array.isArray(rawPoint) || !finite(rawPoint[0]) || !finite(rawPoint[1]) || !inArgentina(rawPoint[0], rawPoint[1])) return null
      points.push([rawPoint[0], rawPoint[1]])
    }
    const first = points[0], last = points.at(-1)!
    if (first[0] !== last[0] || first[1] !== last[1]) return null
    result.push(points)
  }
  return result
}

/** Official cadastral candidates, not an address-to-property assertion. The
 * caller validates topology, projects locally and asks for a parcel reference.
 * Disjoint MultiPolygons are withheld rather than silently losing a component. */
export async function acquireProvincialParcels(input: Input, options: OfficialFetchOptions): Promise<ArgentineParcelLookup> {
  const result: ArgentineParcelLookup = { parcels: [], sources: [], unknowns: [] }
  const provider = input.provinceId === '06' ? arba : input.provinceId === '14' ? idecor : null
  if (!provider) return { ...result, unknowns: ['No hay un adaptador parcelario público verificado para esta provincia.'] }
  if (!inArgentina(input.longitude, input.latitude)) return { ...result, unknowns: ['Las coordenadas no son utilizables para consultar el catastro argentino.'] }
  const reference = input.reference?.trim().toUpperCase() ?? ''
  if (reference && !provider.referencePattern.test(reference)) return { ...result, unknowns: ['La referencia no tiene el formato de nomenclatura de este proveedor; copiá la nomenclatura completa del registro provincial.'] }
  options.signal.throwIfAborted()
  const url = new URL(provider.endpoint)
  const latitudeDelta = RADIUS_METERS / 111_320
  const longitudeDelta = latitudeDelta / Math.cos(input.latitude * Math.PI / 180)
  const filter = reference ? `${provider.referenceField}='${reference}'`
    : `BBOX(geom,${input.longitude - longitudeDelta},${input.latitude - latitudeDelta},${input.longitude + longitudeDelta},${input.latitude + latitudeDelta},'EPSG:4326')`
  url.search = new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: provider.layer,
    outputFormat: 'application/json', srsName: 'EPSG:4326', CQL_FILTER: filter, propertyName: provider.fields, maxFeatures: String(MAX_FEATURES) }).toString()
  let data: Record<string, unknown>
  try {
    data = officialRecord(await officialJson(url, options))
    options.signal.throwIfAborted()
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > MAX_FEATURES) throw new Error('La fuente no devolvió una colección parcelaria acotada.')
    const crs = text(officialRecord(officialRecord(data.crs).properties).name)
    if (!/^urn:ogc:def:crs:EPSG::4326$|^EPSG:4326$/.test(crs)) throw new Error('La fuente no confirmó coordenadas WGS84; no se reinterpretó su geometría.')
  } catch (error) {
    options.signal.throwIfAborted()
    result.unknowns.push(`No se pudo obtener el parcelario de ${provider.jurisdiction}: ${error instanceof Error ? error.message : 'respuesta no utilizable'}`)
    return result
  }
  const features = data.features as unknown[]
  const count = finite(data.numberMatched) ? data.numberMatched : finite(data.totalFeatures) ? data.totalFeatures : null
  if (features.length === MAX_FEATURES || count !== null && count > features.length) {
    result.unknowns.push(`La consulta parcelaria es parcial: se recibieron ${features.length} registros (límite ${MAX_FEATURES}). Una nomenclatura exacta evita elegir entre resultados truncados.`)
  }
  const duplicates = new Set<string>()
  let omitted = 0
  for (const rawFeature of features) {
    const feature = officialRecord(rawFeature), properties = officialRecord(feature.properties), geometry = officialRecord(feature.geometry)
    const id = text(properties[provider.referenceField])
    if (!provider.referencePattern.test(id) || reference && id !== reference) { omitted++; continue }
    if (duplicates.has(id)) { omitted++; continue }
    if (result.parcels.some(parcel => parcel.id === id)) {
      result.parcels = result.parcels.filter(parcel => parcel.id !== id)
      duplicates.add(id); omitted += 2; continue
    }
    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
      result.unknowns.push(`La parcela ${id} tiene varios polígonos separados; no se eligió una parte ni se representó como una parcela completa.`)
      continue
    }
    const coordinates = geometry.type === 'Polygon' ? geometry.coordinates
      : geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length === 1 ? geometry.coordinates[0] : null
    const geographicRings = rings(coordinates)
    if (!geographicRings) { omitted++; continue }
    const published = provider === idecor && text(properties.Tipo_Parcela).toUpperCase() === 'URBANO' ? properties.Superficie_Tierra_Urbana : null
    const parcel: ArgentineParcelRecord = { id, label: `Parcela ${id}`, rings: geographicRings,
      publishedArea: finite(published) && published > 0 ? published : null,
      sourceDate: null, sourceUrl: url.href, provider: provider.id, jurisdiction: provider.jurisdiction, attribution: provider.attribution }
    result.parcels.push(parcel)
  }
  if (omitted) result.unknowns.push(`Se omitieron ${omitted} registros parcelarios con geometría, referencia o duplicación no utilizable.`)
  if (!result.parcels.length) result.unknowns.push(reference ? 'No se encontró una parcela utilizable con esa nomenclatura en esta provincia.' : 'No se encontraron parcelas utilizables en la zona consultada.')
  result.unknowns.push('Las parcelas no aportan huella construida, altura ni distribución interior. La fecha de medición de estas geometrías no está acreditada en la respuesta.')
  if (provider === arba) result.unknowns.push('La superficie publicada de ARBA no se incorporó porque no se confirmó la unidad del campo.')
  result.sources.push({ title: provider.title, url: url.href, kind: 'official', retrievedAt: (options.now?.() ?? new Date()).toISOString().slice(0, 10), claims: [
    ...provider.claims,
    `Consulta ${reference ? `por nomenclatura exacta ${reference}` : 'por entorno aproximado de 60 m'}; ${result.parcels.length} candidatas utilizables de ${features.length} registros recibidos. No establece la identidad de la propiedad a partir de la dirección.`,
    'Coordenadas devueltas en WGS84 (longitud, latitud); anillos interiores conservados. La fecha de consulta no es fecha de medición.',
  ] })
  return result
}
