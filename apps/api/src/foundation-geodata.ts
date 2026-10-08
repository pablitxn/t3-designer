import type { FoundationAgentEventInput, FoundationCandidate, FoundationOfficialResearch, FoundationSource, Point2D, ProjectFoundations } from '@t3-designer/scene-schema'

type BuildingCandidate = Extract<FoundationCandidate, { target: 'building' }>
type Building = BuildingCandidate['buildings'][number]
type Road = BuildingCandidate['roads'][number]
type Parcel = BuildingCandidate['parcel']
type RecordData = Record<string, unknown>
type Feature = { id?: unknown; geometry?: { type?: unknown; coordinates?: unknown }; properties?: RecordData }
type Collection = { features: Feature[]; crs?: { properties?: { name?: unknown } }; numberMatched?: unknown; numberReturned?: unknown }
type LocalOrigin = { point: Point2D; longitude: number }
export type FoundationGeodataContext = {
  status: 'available' | 'partial' | 'needs_input' | 'unsupported'; summary: string; questions: string[]
  officialResearch?: FoundationOfficialResearch
  sources: FoundationSource[]; unknowns: string[]
  geocode: { label: string; longitude: number; latitude: number; score: number; banId: string } | null
  context: { site: BuildingCandidate['site']; buildings: Building[]; roads: Road[]; parcel: Parcel | null } | null
}
export type FoundationGeodataOptions = {
  signal: AbortSignal; fetcher?: typeof fetch; now?: () => Date
  onEvent?: (event: FoundationAgentEventInput) => void
}

const RADIUS = 150
const MAX_BYTES = 2_000_000
const MAX_BUILDINGS = 60
const WFS = 'https://data.geopf.fr/wfs/ows'
const EPS = 1e-7
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const positive = (value: unknown): number | null => { const result = number(value); return result !== null && result > 0 ? result : null }
const record = (value: unknown): RecordData => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordData : {}
const same = (a: Point2D, b: Point2D) => Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS
const cross = (a: Point2D, b: Point2D, c: Point2D) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (point: Point2D, a: Point2D, b: Point2D) => Math.abs(cross(a, b, point)) < EPS && point[0] >= Math.min(a[0], b[0]) - EPS && point[0] <= Math.max(a[0], b[0]) + EPS && point[1] >= Math.min(a[1], b[1]) - EPS && point[1] <= Math.max(a[1], b[1]) + EPS
function intersects(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
  return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS
    || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}
function inside(point: Point2D, ring: Point2D[]) {
  let result = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (onSegment(point, a, b)) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
  }
  return result
}
function distance(points: Point2D[], closed = true) {
  if (closed && inside([0, 0], points)) return 0
  let closest = Infinity
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz
    const t = length ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dz) / length)) : 0
    closest = Math.min(closest, Math.hypot(a[0] + t * dx, a[1] + t * dz))
  }
  return closest
}
/** IGN ALG0060 uses clockwise grid-Y to geographic-north convergence:
 * gamma = (lambdaCentral - lambda) * n. Lambert-93 n is given by NT/G71.
 * Rotate the translated grid coordinates by -gamma after changing north to
 * south. This rigid transform preserves the source's metric lengths/areas.
 * https://geodesie.ign.fr/files/geodesie/2025-02/alg0060.pdf
 * https://geodesie.ign.fr/files/geodesie/2025-02/NTG_71.pdf */
export function lambert93ToLocal(point: Point2D, origin: Point2D, longitude: number): Point2D {
  const gamma = (3 - longitude) * Math.PI / 180 * .7256077650
  const x = point[0] - origin[0], z = origin[1] - point[1]
  return [Math.cos(gamma) * x + Math.sin(gamma) * z, -Math.sin(gamma) * x + Math.cos(gamma) * z]
}
function points(value: unknown, origin: LocalOrigin): Point2D[] | null {
  if (!Array.isArray(value) || value.length > 201) return null
  const result: Point2D[] = []
  for (const item of value) {
    if (!Array.isArray(item) || number(item[0]) === null || number(item[1]) === null) return null
    // IGN elevations occupy the optional third ordinate. Only plan coordinates
    // are projected here: absolute ground and height come from explicit fields.
    const point = lambert93ToLocal([item[0], item[1]], origin.point, origin.longitude)
    if (point.some(value => Math.abs(value) > 1000)) return null
    if (!result.length || !same(point, result.at(-1)!)) result.push(point)
  }
  return result
}
function ring(value: unknown, origin: LocalOrigin): Point2D[] | null {
  const result = points(value, origin)
  if (!result) return null
  if (result.length > 1 && same(result[0], result.at(-1)!)) result.pop()
  if (result.length < 3 || result.length > 200) return null
  let area = 0
  for (let i = 0; i < result.length; i++) {
    const a = result[i], b = result[(i + 1) % result.length]
    area += a[0] * b[1] - b[0] * a[1]
    for (let j = i + 1; j < result.length; j++) {
      if (j === i + 1 || i === 0 && j === result.length - 1) continue
      if (intersects(a, b, result[j], result[(j + 1) % result.length])) return null
    }
  }
  return Math.abs(area) > .02 ? result : null
}
function polygons(feature: Feature, origin: LocalOrigin): { footprint: Point2D[]; holes: Point2D[][] }[] {
  const geometry = feature.geometry
  const all = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null
  if (!Array.isArray(all) || all.length > 20) return []
  const result: { footprint: Point2D[]; holes: Point2D[][] }[] = []
  for (const polygon of all) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 21) return []
    const rings = polygon.map(value => ring(value, origin))
    if (rings.some(value => value === null)) return []
    const [footprint, ...holes] = rings as Point2D[][]
    if (holes.some(hole => !hole.every(point => inside(point, footprint)))) return []
    result.push({ footprint, holes })
  }
  return result
}

async function json(url: URL, options: FoundationGeodataOptions): Promise<Collection> {
  const response = await (options.fetcher ?? fetch)(url, {
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]), redirect: 'error',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`La fuente oficial respondió HTTP ${response.status}.`)
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('La respuesta oficial excede el tamaño máximo.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('La fuente oficial no devolvió datos.')
  let length = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > MAX_BYTES) throw new Error('La respuesta oficial excede el tamaño máximo.')
      chunks.push(part.value)
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const data = record(JSON.parse(new TextDecoder().decode(bytes)))
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 250) throw new Error('La fuente oficial no devolvió una colección geográfica acotada.')
  return data as unknown as Collection
}
function wfs(layer: string, origin: Point2D, radius = RADIUS) {
  const url = new URL(WFS)
  url.search = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
    SRSNAME: 'EPSG:2154', BBOX: `${origin[0] - radius},${origin[1] - radius},${origin[0] + radius},${origin[1] + radius},EPSG:2154`,
    OUTPUTFORMAT: 'application/json', COUNT: '250', TYPENAMES: layer }).toString()
  return url
}
function metric(data: Collection) {
  if (!/^urn:ogc:def:crs:EPSG::2154$|^EPSG:2154$/.test(text(data.crs?.properties?.name))) throw new Error('La fuente no confirmó coordenadas métricas Lambert-93; no se reinterpretaron sus coordenadas.')
  return data
}
function truncated(data: Collection) { return number(data.numberMatched) !== null && Number(data.numberMatched) > data.features.length }

/** Fixed official endpoints only. Address geocoding is an association cue, not
 * a cadastral certification. Raw recorded metric geometry never passes through
 * a language model, and absent parcel/height evidence is never manufactured. */
export async function acquireFrenchFoundationGeodata(
  input: Pick<ProjectFoundations['building'], 'countryCode' | 'address' | 'region'>,
  options: FoundationGeodataOptions,
): Promise<FoundationGeodataContext> {
  const result: FoundationGeodataContext = { status: 'needs_input', summary: '', questions: [], sources: [], unknowns: [], geocode: null, context: null }
  const needs = (summary: string, question: string) => { result.summary = summary; result.questions = [question]; return result }
  const retrievedAt = (options.now?.() ?? new Date()).toISOString().slice(0, 10)
  const source = (title: string, url: URL, claims: string[]) => result.sources.push({ title, url: url.href, kind: 'official', retrievedAt, claims })
  if (input.countryCode !== 'FR') return { ...result, status: 'unsupported', summary: 'Este proveedor de geometría oficial cubre Francia metropolitana.' }
  if (!input.address.trim()) return needs('Falta una dirección para localizar el edificio.', 'Indicá calle, número, ciudad y código postal del edificio.')
  options.signal.throwIfAborted()
  options.onEvent?.({ kind: 'search', message: 'Consultando la dirección y las geometrías oficiales de IGN.' })
  try {
    const addressUrl = new URL('https://data.geopf.fr/geocodage/search')
    // The BAN matcher expects a postal address; appending an administrative
    // region substantially lowers the score even for exact numbered addresses.
    addressUrl.search = new URLSearchParams({ q: input.address.trim(), limit: '3' }).toString()
    const addressData = await json(addressUrl, options), first = addressData.features[0], properties = first?.properties ?? {}
    const position = first?.geometry?.coordinates, score = number(properties.score)
    if (first?.geometry?.type !== 'Point' || !Array.isArray(position) || number(position[0]) === null || number(position[1]) === null || score === null) return needs('La búsqueda oficial no devolvió una dirección utilizable.', 'Confirmá calle, número, ciudad y código postal.')
    const longitude = Number(position[0]), latitude = Number(position[1]), label = text(properties.label), banId = text(properties.id)
    result.geocode = { label, longitude, latitude, score, banId }
    source('IGN Géoplateforme · dirección', addressUrl, [`Dirección devuelta: ${label}; identificador ${banId}; puntuación ${score}.`, 'La geocodificación no certifica la identidad catastral del edificio.'])
    const alternatives = addressData.features.slice(1).filter(feature => text(feature.properties?.id) !== banId && Number(feature.properties?.score) >= score - .03)
    if (properties.type !== 'housenumber' || score < .85 || alternatives.length) return needs('La dirección tiene coincidencias insuficientes o ambiguas.', `Confirmá la dirección completa. La primera coincidencia fue «${label}».`)
    const x = number(properties.x), y = number(properties.y)
    if (longitude < -5.5 || longitude > 10 || latitude < 41 || latitude > 51.5 || x === null || y === null || x < 0 || x > 1_400_000 || y < 6_000_000 || y > 7_300_000) return { ...result, status: 'unsupported', summary: 'La dirección queda fuera de la cobertura métrica de Francia metropolitana.', questions: ['Aportá una fuente local con huella y altura del edificio.'] }
    const origin: LocalOrigin = { point: [x, y], longitude }
    const buildingUrl = wfs('BDTOPO_V3:batiment', origin.point), roadUrl = wfs('BDTOPO_V3:troncon_de_route', origin.point), parcelUrl = wfs('CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle', origin.point, 2)
    const [buildingResponse, roadResponse, parcelResponse] = await Promise.allSettled([json(buildingUrl, options).then(metric), json(roadUrl, options).then(metric), json(parcelUrl, options).then(metric)])
    options.signal.throwIfAborted()
    if (buildingResponse.status !== 'fulfilled') return needs('No pudimos obtener las huellas oficiales del edificio y su entorno.', 'Volvé a intentar la consulta oficial o agregá una fuente con huella y altura.')
    const buildingData = buildingResponse.value
    const buildings: Building[] = [], missingTargets: string[] = [], targetClaims: string[] = []
    let omitted = 0
    for (const feature of buildingData.features) {
      const data = feature.properties ?? {}, id = text(data.cleabs) || text(feature.id), parts = polygons(feature, origin)
      if (!id || !parts.length) { omitted++; continue }
      const height = positive(data.hauteur), groundAltitude = number(data.altitude_minimale_sol)
      const floors = number(data.nombre_d_etages), rnbIds = text(data.identifiants_rnb).split(/[\s/,;]+/).filter(Boolean)
      const rnbId = rnbIds.length === 1 ? rnbIds[0] : null
      const minRoof = number(data.altitude_minimale_toit), maxRoof = number(data.altitude_maximale_toit)
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index], isTarget = inside([0, 0], part.footprint) && !part.holes.some(hole => inside([0, 0], hole))
        if (distance(part.footprint) > RADIUS) continue
        if (height === null || height > 1000) { if (isTarget) missingTargets.push(id); omitted++; continue }
        buildings.push({ id: parts.length === 1 ? id : `${id}:${index + 1}`, rnbId, isTarget,
          label: isTarget ? label : text(data.usage_1) || text(data.nature) || 'Edificio del entorno', ...part,
          height, roofHeight: minRoof !== null && maxRoof !== null && maxRoof >= minRoof ? maxRoof - minRoof : 0,
          groundAltitude, groundOffset: 0, floors: floors !== null && Number.isInteger(floors) && floors >= 0 ? floors : null,
          planarAccuracy: number(data.precision_planimetrique), verticalAccuracy: number(data.precision_altimetrique), source: 'ign-bdtopo' })
        if (isTarget) targetClaims.push(`Registro ${id}: altura publicada ${height} m; fecha de modificación del registro ${text(data.date_modification) || 'no indicada'}. La fecha de modificación no prueba la fecha de medición.`)
        if (isTarget && rnbIds.length > 1) result.unknowns.push(`La huella ${id} contiene varios identificadores RNB (${rnbIds.join(', ')}); no se eligió uno como identidad del inmueble.`)
        if (isTarget && (minRoof === null || maxRoof === null)) result.unknowns.push('No hay altura de cubierta utilizable: se representa sin detalle de tejado.')
      }
    }
    const targets = buildings.filter(building => building.isTarget)
    source('IGN BD TOPO · huellas y alturas', buildingUrl, ['Contornos y patios en Lambert-93, alturas, cotas y precisiones publicadas por IGN; traslación y rotación rígida por convergencia del meridiano para orientar el norte geográfico, sin alterar longitudes ni áreas del registro.', 'La consulta actual no equivale a una medición actual ni a una certificación catastral.', ...targetClaims])
    if (missingTargets.length) return needs('La huella encontrada no tiene una altura oficial utilizable.', 'Indicá una altura medida del edificio o una fuente pública que la documente.')
    if (targets.length !== 1) return needs('El punto de la dirección no identifica una única huella de edificio.', 'Confirmá qué edificio corresponde a la dirección con un plano de parcela o una fuente identificable.')
    const target = targets[0], ground = target.groundAltitude ?? 0
    if (target.groundAltitude === null) result.unknowns.push('Sin cota oficial del terreno del edificio: el origen vertical local se fijó en cero.')
    const selected = [target, ...buildings.filter(building => !building.isTarget).sort((a, b) => distance(a.footprint) - distance(b.footprint)).slice(0, MAX_BUILDINGS - 1)]
    for (const building of selected) {
      building.groundOffset = building.groundAltitude === null ? 0 : building.groundAltitude - ground
      if (building.planarAccuracy !== null && building.planarAccuracy < 0) building.planarAccuracy = null
      if (building.verticalAccuracy !== null && building.verticalAccuracy < 0) building.verticalAccuracy = null
    }
    if (omitted) result.unknowns.push(`${omitted} huellas o partes se omitieron por geometría no representable o altura ausente; no se inventaron volúmenes.`)
    if (truncated(buildingData) || buildings.length > selected.length) result.unknowns.push(`El contexto es parcial: se conservaron hasta ${MAX_BUILDINGS} edificios próximos en un radio de ${RADIUS} m.`)
    if (selected.some(building => building.groundAltitude === null)) result.unknowns.push('Los edificios sin cota de terreno se apoyan en el mismo nivel local; la pendiente entre ellos queda sin resolver.')
    result.unknowns.push('Las cubiertas son volúmenes simplificados; su forma, materiales y fachadas no se reconstruyen con estas fuentes.')

    const roads: Road[] = []
    if (roadResponse.status === 'fulfilled') {
      let omittedRoads = 0
      for (const feature of roadResponse.value.features) {
        const data = feature.properties ?? {}, id = text(data.cleabs) || text(feature.id), width = positive(data.largeur_de_chaussee)
        const geometries = feature.geometry?.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiLineString' ? feature.geometry.coordinates : null
        if (!id || !width || width > 100 || !Array.isArray(geometries)) { omittedRoads++; continue }
        for (let index = 0; index < geometries.length; index++) {
          const line = points(geometries[index], origin)
          if (!line || line.length < 2 || line.length > 200) { omittedRoads++; continue }
          if (distance(line, false) > RADIUS) continue
          roads.push({ id: geometries.length === 1 ? id : `${id}:${index + 1}`, name: text(data.nom_voie_ban_gauche) || text(data.nom_collaboratif_gauche) || text(data.nature) || 'Vía sin nombre publicado', points: line, width, isPath: /sentier|chemin|piéton/i.test(text(data.nature)) })
        }
      }
      roads.sort((a, b) => distance(a.points, false) - distance(b.points, false))
      if (roads.length > 100 || omittedRoads || truncated(roadResponse.value)) result.unknowns.push('La red vial es parcial: se omiten tramos sin ancho publicado, demasiado complejos o fuera del límite de 100 tramos.')
      roads.splice(100)
      source('IGN BD TOPO · red vial', roadUrl, ['Ejes de vía y anchos de calzada publicados; no se interpreta este ancho como ancho completo de calle o acera.'])
    } else result.unknowns.push('No se pudo consultar la red vial oficial; no se generaron calles ficticias.')

    let parcel: Parcel | null = null
    if (parcelResponse.status === 'fulfilled') {
      const matches: Parcel[] = []
      for (const feature of parcelResponse.value.features) {
        const data = feature.properties ?? {}, id = text(data.idu), area = positive(data.contenance), parts = polygons(feature, origin)
        // The scene parcel schema cannot represent several disjoint rings or
        // holes. Preserve this as unavailable rather than filling those voids.
        if (!id || !area || parts.length !== 1 || parts[0].holes.length) continue
        if (inside([0, 0], parts[0].footprint)) matches.push({ id, area, label: `Parcela ${id} · contenance catastral publicada`, footprint: parts[0].footprint })
      }
      if (matches.length === 1) parcel = matches[0]
      if (parcel && !target.footprint.every(point => inside(point, parcel!.footprint))) result.unknowns.push('La huella del edificio se extiende fuera de la parcela del punto de dirección; esa parcela no representa toda la superficie ocupada por el edificio.')
      source('IGN Parcellaire Express · parcela de la dirección', parcelUrl, ['Parcela que contiene el punto geocodificado; contenance publicada, no área calculada ni levantamiento topográfico.', 'El edificio puede ocupar más de una parcela; esta asociación puntual no prueba propiedad ni lindes jurídicos.'])
      if (!parcel) result.unknowns.push('La consulta no identificó una parcela única representable; no se creó una parcela catastral sustituta.')
    } else result.unknowns.push('No se pudo consultar la parcela oficial; la parcela queda sin resolver.')
    result.context = {
      site: { latitude, longitude, timeZone: 'Europe/Paris', address: input.address, officialAddress: label, targetId: target.id, rnbId: target.rnbId,
        groundAltitude: ground, retrievedAt, radiusMeters: RADIUS, attribution: 'IGN Géoplateforme · BD TOPO · Parcellaire Express · Licence Ouverte 2.0',
        rnbUrl: target.rnbId ? `https://rnb.beta.gouv.fr/carte?q=${encodeURIComponent(target.rnbId)}` : null, mapUrl: `https://www.geoportail.gouv.fr/carte?c=${longitude},${latitude}&z=19`,
        geolocationNote: `Asociación por punto de dirección dentro de una huella IGN; Lambert-93 trasladado y rotado al norte geográfico local (convergencia IGN ${((3 - longitude) * .7256077650).toFixed(6)}°). X este / Z sur; distancias del registro preservadas. No certifica el inmueble.` },
      buildings: selected, roads, parcel,
    }
    result.status = 'available'
    result.summary = `Se obtuvieron ${selected.length} edificios y ${roads.length} tramos de vía de fuentes IGN${parcel ? ', con la parcela del punto de dirección' : '; la parcela queda pendiente'}.`
    options.onEvent?.({ kind: 'search', message: result.summary })
    return result
  } catch (error) {
    if (options.signal.aborted) throw error
    result.unknowns.push(error instanceof Error ? error.message : 'La consulta de fuentes oficiales no se pudo completar.')
    return needs('No pudimos completar la adquisición oficial de geometría.', 'Reintentá la consulta o aportá una fuente con huella, altura y ubicación del edificio.')
  }
}
