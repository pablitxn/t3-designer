import { isDeepStrictEqual } from 'node:util'
import {
  FoundationBuildingCorrectionsSchema, FoundationBuildingEditSchema,
  type FoundationBuildingEdit, type FoundationCandidate, type Point2D,
} from '@t3-designer/scene-schema'

export type BuildingCandidate = Extract<FoundationCandidate, { target: 'building' }>
type Building = BuildingCandidate['buildings'][number]
type CorrectionResult = { candidate: BuildingCandidate; issues: string[] }
const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const equal = (first: number, second: number) => Math.abs(first - second) < 1e-7
const metricPattern = '([+-]?\\d+(?:[.,]\\d+)?)\\s*(?:metros?|meters?|metres?|m)(?![\\p{L}\\p{N}²³^])'
const metricValues = (quote: string) => [...normalized(quote).matchAll(new RegExp(metricPattern, 'gu'))].map(match => Number(match[1].replace(',', '.')))
const words = {
  height: /\b(?:altura|height|hauteur)\b/,
  body: /\b(?:cuerpo|muros?|paredes?|cornisa|alero|body|walls?|eaves|corps|murs?)\b|\bsin (?:la )?cubierta\b|\bwithout (?:the )?roof\b/,
  roof: /\b(?:cubierta|tejado|roof|toit|toiture)\b/,
  total: /\b(?:total|totale|overall)\b|\binclu(?:ida|yendo) (?:la )?cubierta\b|\bincluding (?:the )?roof\b/,
  width: /\b(?:ancho|anchura|width|largeur)\b/,
  depth: /\b(?:profundidad|fondo|largo|depth|profondeur)\b/,
  move: /\b(?:mov(?:er|e|elo|ela|amos)?|mueve|desplaza\w*|traslada\w*|corre(?:r|lo|la)?|move|translate|shift|deplac\w*)\b/,
}
function bounds(points: Point2D[]) {
  const xs = points.map(point => point[0]), zs = points.map(point => point[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}
function operationKey(operation: FoundationBuildingEdit) {
  return `${operation.buildingId}:${operation.type === 'set_height' || operation.type === 'set_total_height' ? 'body_height' : operation.type === 'resize_footprint' ? operation.axis : operation.type}`
}
function transform(building: Building, map: (point: Point2D) => Point2D) {
  building.footprint = building.footprint.map(map)
  if (building.holes) building.holes = building.holes.map(hole => hole.map(map))
  building.planarAccuracy = null
}
function apply(building: Building, operation: FoundationBuildingEdit): string | null {
  if (operation.type === 'set_height') { building.height = operation.value; building.verticalAccuracy = null }
  else if (operation.type === 'set_roof_height') { building.roofHeight = operation.value; building.verticalAccuracy = null }
  else if (operation.type === 'set_total_height') {
    if (operation.value <= building.roofHeight) return 'La altura total debe superar la altura de la cubierta; confirmá ambas medidas.'
    building.height = operation.value - building.roofHeight; building.verticalAccuracy = null
  } else if (operation.type === 'translate') {
    if (equal(operation.dx, 0) && equal(operation.dz, 0)) return 'El desplazamiento debe indicar una distancia distinta de cero.'
    transform(building, ([x, z]) => [x + operation.dx, z + operation.dz])
  } else {
    const box = bounds(building.footprint), axis = operation.axis === 'width' ? 0 : 1
    const extent = axis === 0 ? box.maxX - box.minX : box.maxZ - box.minZ
    const center = axis === 0 ? (box.maxX + box.minX) / 2 : (box.maxZ + box.minZ) / 2
    const factor = operation.value / extent
    if (!Number.isFinite(factor) || factor < .1 || factor > 10) return 'La nueva dimensión excede el rango de ajuste de la huella (entre 0,1 y 10 veces su dimensión actual).'
    transform(building, point => axis === 0 ? [center + (point[0] - center) * factor, point[1]] : [point[0], center + (point[1] - center) * factor])
  }
  building.source = 'estimated'
  if (building.height <= 0 || building.height > 1000 || building.roofHeight < 0 || building.roofHeight > 200
    || [building.footprint, ...(building.holes ?? [])].some(ring => ring.some(point => point.some(value => !Number.isFinite(value) || Math.abs(value) > 10_000)))) return 'La corrección deja la geometría fuera de los límites permitidos.'
  return null
}

function affirmativeCurrentQuote(message: string, quote: string) {
  let offset = message.indexOf(quote)
  while (offset !== -1) {
    // Include the start of the current clause, so extracting a positive-looking
    // substring from "no cambies la altura ..." cannot authorize the change.
    const preceding = message.slice(Math.max(0, offset - 80), offset)
    const clauseStart = Math.max(preceding.lastIndexOf(';'), preceding.lastIndexOf(':'), preceding.lastIndexOf('\n'), preceding.lastIndexOf(','), preceding.lastIndexOf('. '))
    const clause = normalized(preceding.slice(clauseStart + 1) + quote)
    const negated = /\b(?:no|not|never|nunca|jamas|ne pas|don't|doesn't)\b/.test(clause)
    const oldValue = /\b(?:antes|anterior|previous|formerly|old|instead of)\b/.test(clause)
    if (!negated && !oldValue) return true
    offset = message.indexOf(quote, offset + 1)
  }
  return false
}
function directions(quote: string): { dx: number; dz: number } | null {
  const text = normalized(quote), values: { axis: 'dx' | 'dz'; value: number }[] = []
  const direction = '(este|east|est|oeste|west|ouest|norte|north|nord|sur|south|sud)'
  const after = new RegExp(`${metricPattern}\\s*(?:(?:hacia|to|vers)\\s*(?:el|the|le)?|al|au)?\\s*${direction}\\b`, 'gu')
  const before = new RegExp(`\\b${direction}\\s*(?:[:=]|de)?\\s*${metricPattern}`, 'gu')
  const add = (word: string, raw: string) => {
    const amount = Number(raw.replace(',', '.'))
    const axis = /^(?:este|east|est|oeste|west|ouest)$/.test(word) ? 'dx' : 'dz'
    values.push({ axis, value: amount * (/^(?:oeste|west|ouest|norte|north|nord)$/.test(word) ? -1 : 1) })
  }
  for (const match of text.matchAll(after)) add(match[2], match[1])
  for (const match of text.matchAll(before)) add(match[1], match[2])
  if (!values.length || ['dx', 'dz'].some(axis => values.filter(item => item.axis === axis).length > 1)) return null
  return { dx: values.find(item => item.axis === 'dx')?.value ?? 0, dz: values.find(item => item.axis === 'dz')?.value ?? 0 }
}
function evidenceIssue(operation: FoundationBuildingEdit, message: string, targetId: string): string | null {
  if (!affirmativeCurrentQuote(message, operation.quote)) return 'La corrección requiere una cita literal y afirmativa del mensaje actual; una instrucción pasada o negada no alcanza.'
  const quote = normalized(operation.quote)
  if (operation.buildingId !== targetId && !operation.quote.includes(operation.buildingId)) return 'Para corregir otro edificio, indicá su identificador exacto en el mensaje.'
  if (operation.buildingId === targetId && /\b(?:vecino|neighbor|neighbour|voisin)\b/.test(quote) && !operation.quote.includes(targetId)) return 'La cita se refiere a un vecino: no autoriza cambiar el edificio principal.'
  if (/\b(?:cuadrad\w*|cubicos?|square|cubic)\b/.test(quote)) return 'La corrección necesita una distancia en metros, no una superficie o volumen.'
  if (operation.type === 'translate') {
    const movement = directions(operation.quote)
    if (!words.move.test(quote) || !movement || !equal(movement.dx, operation.dx) || !equal(movement.dz, operation.dz)) return 'Indicá el desplazamiento en metros y direcciones cardinales explícitas (este, oeste, norte o sur).'
    return null
  }
  const metric = metricValues(operation.quote)
  if (!metric.length || metric.some(value => !equal(value, operation.value))) return 'La cita debe indicar exactamente esta medida en metros; usá una cita separada para cada dimensión.'
  if (operation.type === 'resize_footprint') {
    if (!words[operation.axis].test(quote)) return 'La cita debe identificar si cambia el ancho este-oeste o la profundidad norte-sur de la huella.'
  } else if (operation.type === 'set_total_height') {
    if (!words.height.test(quote) || !words.total.test(quote)) return 'Aclarar que se trata de la altura total del edificio, incluida su cubierta.'
  } else if (operation.type === 'set_height') {
    if (!words.height.test(quote) || !words.body.test(quote) || words.total.test(quote)) return 'Aclarar si la altura corresponde al cuerpo hasta la cornisa, sin incluir la cubierta, o a la altura total.'
  } else if (!words.height.test(quote) || !words.roof.test(quote) || words.body.test(quote) || words.total.test(quote)) return 'Aclarar la altura propia de la cubierta, sin confundirla con la altura total del edificio.'
  return null
}
function description(operation: FoundationBuildingEdit) {
  const measurement = operation.type === 'translate' ? `desplazamiento este ${operation.dx} m / sur ${operation.dz} m`
    : operation.type === 'resize_footprint' ? `${operation.axis === 'width' ? 'ancho este-oeste' : 'profundidad norte-sur'} de huella ${operation.value} m, centrado en su caja actual`
      : `${operation.type === 'set_height' ? 'altura del cuerpo sin cubierta' : operation.type === 'set_total_height' ? 'altura total con cubierta' : 'altura de cubierta'} ${operation.value} m`
  return `Corrección del usuario para ${operation.buildingId}: ${measurement}. Cita: «${operation.quote.slice(0, 1400)}». La geometría editada es estimada; se conserva el registro original.`
}

/** Caller supplies only a reviewed/accepted parent, never raw model provenance.
 * Replaying originals once avoids applying translations again on every turn.
 * Every proposed operation is authorized by CURRENT user text and all new
 * operations are atomic: an invalid proposal never partially mutates a model. */
export function applyBuildingCorrections(
  base: BuildingCandidate, proposed: FoundationBuildingEdit[],
  options: { message: string; parentCandidate?: BuildingCandidate },
): CorrectionResult {
  const untouched = structuredClone(base)
  delete untouched.buildingCorrections
  const candidate = structuredClone(untouched), originals = new Map<string, Building>(), history: FoundationBuildingEdit[] = []
  const fail = (issues: string[]): CorrectionResult => ({ candidate: untouched, issues: [...new Set(issues)].slice(0, 20) })
  const parent = options.parentCandidate
  if (parent?.buildingCorrections) {
    if (parent.site.targetId !== candidate.site.targetId || !equal(parent.site.latitude, candidate.site.latitude) || !equal(parent.site.longitude, candidate.site.longitude)) return fail(['La versión anterior pertenece a otra ubicación o edificio; no se trasladaron sus correcciones.'])
    const parsed = FoundationBuildingCorrectionsSchema.safeParse(parent.buildingCorrections)
    if (!parsed.success) return fail(['No se pudo validar la procedencia de las correcciones anteriores.'])
    for (const original of parsed.data.baseBuildings) originals.set(original.id, structuredClone(original))
    const replay = new Map([...originals].map(([id, building]) => [id, structuredClone(building)]))
    for (const operation of parsed.data.operations) {
      const building = replay.get(operation.buildingId)!
      if (apply(building, operation)) return fail(['Las correcciones anteriores no se pueden reproducir dentro de los límites actuales.'])
    }
    for (const [id, building] of replay) {
      const index = candidate.buildings.findIndex(value => value.id === id)
      if (index < 0 || !isDeepStrictEqual(building, parent.buildings.find(value => value.id === id))) return fail(['La geometría anterior no coincide con sus operaciones registradas; se necesita revisar la base.'])
      // The trusted parent is authoritative for edited records. A refreshed
      // source may have changed, so never compound prior edits on that new record.
      candidate.buildings[index] = building
    }
    history.push(...parsed.data.operations)
  }
  if (!Array.isArray(proposed) || proposed.length > 20 || history.length + proposed.length > 100) return fail(['La corrección excede el máximo de operaciones por turno o por historial.'])
  const operations: FoundationBuildingEdit[] = [], issues: string[] = [], seen = new Set<string>()
  for (const raw of proposed) {
    const parsed = FoundationBuildingEditSchema.safeParse(raw)
    if (!parsed.success) { issues.push('La operación no cumple el contrato geométrico acotado.'); continue }
    const operation = parsed.data
    if (!candidate.buildings.some(building => building.id === operation.buildingId)) { issues.push('La corrección debe identificar un edificio existente.'); continue }
    const key = operationKey(operation)
    if (seen.has(key)) issues.push('Una dimensión o desplazamiento no puede recibir dos instrucciones en el mismo turno.')
    seen.add(key)
    const issue = evidenceIssue(operation, options.message, candidate.site.targetId)
    if (issue) issues.push(issue)
    operations.push(operation)
  }
  if (issues.length) return fail(issues)
  // A requested total height is evaluated after a roof-height change in the
  // same turn, so both explicitly requested final dimensions remain true.
  operations.sort((first, second) => Number(second.type === 'set_roof_height') - Number(first.type === 'set_roof_height'))
  for (const operation of operations) {
    const building = candidate.buildings.find(value => value.id === operation.buildingId)!
    if (!originals.has(building.id)) originals.set(building.id, structuredClone(building))
    const issue = apply(building, operation)
    if (issue) return fail([issue])
  }
  history.push(...operations)
  if (history.length) {
    candidate.buildingCorrections = FoundationBuildingCorrectionsSchema.parse({ baseBuildings: [...originals.values()], operations: history })
    const notes = history.map(description)
    candidate.assumptions = [...new Set([...candidate.assumptions, ...notes])]
    if (history.some(operation => operation.type === 'translate' || operation.type === 'resize_footprint')) candidate.unknowns = [...new Set([...candidate.unknowns, 'La posición o huella corregida por el usuario no modifica la parcela ni certifica su encaje catastral.'])]
    if (candidate.assumptions.length > 100 || candidate.unknowns.length > 100) return fail(['El historial excede la capacidad de notas de esta versión; revisá la base antes de agregar otra corrección.'])
  }
  return { candidate, issues: [] }
}
