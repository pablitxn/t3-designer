import assert from 'node:assert/strict'
import test from 'node:test'
import { FoundationCandidateSchema, type FoundationBuildingEdit } from '@t3-designer/scene-schema'
import { applyBuildingCorrections, type BuildingCandidate } from '../src/foundation-building-corrections.ts'

function base(): BuildingCandidate {
  const footprint: [number, number][] = [[-10, -5], [10, -5], [10, 5], [-10, 5]]
  return {
    target: 'building', summary: 'Base oficial importada, extrusión estimada.', assumptions: ['Cubiertas simplificadas.'], unknowns: ['Sin detalle de fachada.'],
    sources: [{ title: 'Fuente oficial de prueba', url: 'https://data.geopf.fr/wfs/ows', kind: 'official', retrievedAt: '2026-10-07', claims: ['Registro target: cuerpo15m y cubierta3m.'] }],
    site: { address: 'Dirección de prueba', officialAddress: 'Dirección de prueba', latitude: 48.1, longitude: -1.7, timeZone: 'Europe/Paris', targetId: 'target', rnbId: 'RNB_TEST', groundAltitude: 39, radiusMeters: 150, retrievedAt: '2026-10-07', attribution: 'Fuente oficial de prueba', rnbUrl: null, mapUrl: 'https://www.geoportail.gouv.fr/carte' },
    buildings: [
      { id: 'target', rnbId: 'RNB_TEST', isTarget: true, label: 'Edificio principal', footprint, holes: [[[2, 1], [4, 1], [4, 3], [2, 3]]], height: 15, roofHeight: 3, groundAltitude: 39, groundOffset: 0, floors: 4, planarAccuracy: 3, verticalAccuracy: 1, source: 'ign-bdtopo' },
      { id: 'neighbor-42', rnbId: null, isTarget: false, label: 'Vecino', footprint: [[30, 5], [40, 5], [40, 15], [30, 15]], height: 12, roofHeight: 2, groundAltitude: 40, groundOffset: 1, floors: 3, planarAccuracy: 3, verticalAccuracy: 1, source: 'ign-bdtopo' },
    ],
    roads: [{ id: 'road', name: 'Calle publicada', points: [[-20, -40], [50, -40]], width: 6, isPath: false }],
    parcel: { id: 'parcel', label: 'Parcela publicada', area: 1200, footprint: [[-20, -15], [20, -15], [20, 15], [-20, 15]] },
  }
}
const height = (value = 18, quote = `Ajustá la altura del cuerpo sin cubierta a ${value} m.`): FoundationBuildingEdit => ({ type: 'set_height', buildingId: 'target', value, quote })
const run = (operations: FoundationBuildingEdit[], original = base(), message = operations.map(operation => operation.quote).join('\n')) => applyBuildingCorrections(original, operations, { message })
function unchangedContext(actual: BuildingCandidate, expected: BuildingCandidate) {
  assert.deepEqual(actual.site, expected.site); assert.deepEqual(actual.sources, expected.sources)
  assert.deepEqual(actual.buildings[1], expected.buildings[1]); assert.deepEqual(actual.roads, expected.roads); assert.deepEqual(actual.parcel, expected.parcel)
}

test('explicit body height changes only the selected volume and records immutable original plus literal evidence', () => {
  const original = base(), before = structuredClone(original), operation = height(), result = run([operation], original)
  assert.deepEqual(result.issues, []); assert.deepEqual(original, before)
  assert.equal(result.candidate.buildings[0].height, 18); assert.equal(result.candidate.buildings[0].roofHeight, 3)
  assert.equal(result.candidate.buildings[0].source, 'estimated'); assert.equal(result.candidate.buildings[0].verticalAccuracy, null)
  assert.equal(result.candidate.buildings[0].planarAccuracy, 3)
  assert.deepEqual(result.candidate.buildingCorrections, { baseBuildings: [original.buildings[0]], operations: [operation] })
  assert.match(result.candidate.assumptions.join(' '), /altura del cuerpo sin cubierta 18 m/)
  unchangedContext(result.candidate, original)
  assert.deepEqual(FoundationCandidateSchema.parse(result.candidate), result.candidate)
})

test('height semantics distinguish body, own roof height and total height', () => {
  assert.ok(run([height(18, 'Cambiá la altura a18m.')]).issues.length)
  assert.ok(run([height(18, 'Cambiá la altura total a18m.')]).issues.length)
  const total: FoundationBuildingEdit = { type: 'set_total_height', buildingId: 'target', value: 20, quote: 'Cambiá la altura total, incluida la cubierta, a20m.' }
  const roof: FoundationBuildingEdit = { type: 'set_roof_height', buildingId: 'target', value: 4, quote: 'Cambiá la altura de cubierta a4m.' }
  const result = run([total, roof])
  assert.deepEqual(result.issues, []); assert.equal(result.candidate.buildings[0].height, 16); assert.equal(result.candidate.buildings[0].roofHeight, 4)
  assert.deepEqual(result.candidate.buildingCorrections?.operations.map(operation => operation.type), ['set_roof_height', 'set_total_height'])
  assert.ok(run([{ ...total, value: 2, quote: 'Altura total2m.' }]).issues.length)
  assert.ok(run([{ ...roof, quote: 'Altura del cuerpo sin cubierta4m.' }]).issues.length)
})

test('metric conversions and decimal commas are accepted without interpreting feet as meters', () => {
  const quote = 'La altura del cuerpo de57pies equivale a17,3736m.'
  const converted = run([height(17.3736, quote)])
  assert.deepEqual(converted.issues, []); assert.equal(converted.candidate.buildings[0].height, 17.3736)
  assert.ok(run([height(18, 'La altura del cuerpo es18ft.')]).issues.length)
  assert.ok(run([height(18, 'La altura del cuerpo es18cm.')]).issues.length)
  assert.ok(run([height(18, 'La altura del cuerpo es18ft, equivalentes a5.4864m.')]).issues.length)
})

test('historical, absent, negated or wrong-field quotes cannot authorize a current change', () => {
  const operation = height(), original = base()
  for (const message of ['Revisá la fachada.', `No cambies ${operation.quote}`, `Antes pedí ${operation.quote}`]) {
    const result = applyBuildingCorrections(original, [operation], { message })
    assert.ok(result.issues.length); assert.deepEqual(result.candidate, original)
  }
  assert.ok(run([height(18, 'El ancho del cuerpo es18m.')]).issues.length)
  assert.ok(run([height(18, 'La altura del cuerpo es20m.')]).issues.length)
  assert.ok(run([height(18, 'La altura del cuerpo es18m y la cubierta2m.')]).issues.length)
})

test('a source disclaimer before a colon does not negate the following explicit current correction', () => {
  const quote = 'cambiá la altura del cuerpo sin cubierta a 18 m.'
  const message = `Corrección geométrica de prueba, aportada por el usuario; no es una actualización del catastro: ${quote} Conservá los vecinos y la parcela.`
  const corrected = applyBuildingCorrections(base(), [height(18, quote)], { message })
  assert.deepEqual(corrected.issues, []); assert.equal(corrected.candidate.buildings[0].height, 18)
  const negatedQuote = 'la altura del cuerpo sin cubierta a 18 m.'
  const negated = applyBuildingCorrections(base(), [height(18, negatedQuote)], { message: `No cambies ${negatedQuote}` })
  assert.ok(negated.issues.length); assert.equal(negated.candidate.buildings[0].height, 15)
})

test('cardinal translation moves the complete footprint and patios while preserving the geographic origin and context', () => {
  const original = base(), operation: FoundationBuildingEdit = { type: 'translate', buildingId: 'target', dx: 2, dz: -3, quote: 'Mové el edificio2m al este y3m al norte.' }
  const result = run([operation], original)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.candidate.buildings[0].footprint, original.buildings[0].footprint.map(([x, z]) => [x + 2, z - 3]))
  assert.deepEqual(result.candidate.buildings[0].holes, original.buildings[0].holes?.map(hole => hole.map(([x, z]) => [x + 2, z - 3])))
  assert.equal(result.candidate.buildings[0].planarAccuracy, null)
  unchangedContext(result.candidate, original)
  assert.ok(run([{ ...operation, dz: 3 }]).issues.length)
  assert.ok(run([{ ...operation, quote: 'Mové el edificio2m hacia la izquierda y3m arriba.' }]).issues.length)
  const west: FoundationBuildingEdit = { type: 'translate', buildingId: 'target', dx: -2, dz: 0, quote: 'Desplazá el edificio al oeste2m.' }
  assert.deepEqual(run([west]).issues, [])
})

test('footprint resizing preserves shape ratios, center and courtyards on the explicitly selected axis', () => {
  const original = base(), operation: FoundationBuildingEdit = { type: 'resize_footprint', buildingId: 'target', axis: 'width', value: 24, quote: 'Ajustá el ancho de la huella a24m.' }
  const result = run([operation], original)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.candidate.buildings[0].footprint, [[-12, -5], [12, -5], [12, 5], [-12, 5]])
  assert.deepEqual(result.candidate.buildings[0].holes, [[[2.4, 1], [4.8, 1], [4.8, 3], [2.4, 3]]])
  unchangedContext(result.candidate, original)
  assert.ok(run([{ ...operation, axis: 'depth' }]).issues.length)
  assert.ok(run([{ ...operation, value: 1000, quote: 'Ajustá el ancho a1000m.' }]).issues.length)
})

test('unknown IDs, implicit neighbor selection and duplicate dimensions are rejected atomically', () => {
  assert.ok(run([{ ...height(), buildingId: 'missing' }]).issues.length)
  assert.ok(run([{ ...height(), buildingId: 'neighbor-42' }]).issues.length)
  assert.ok(run([height(18, 'El vecino tiene altura del cuerpo18m.')]).issues.length)
  const neighbor = { ...height(18, 'En neighbor-42 ajustá la altura del cuerpo a18m.'), buildingId: 'neighbor-42' }
  const valid = run([neighbor]); assert.deepEqual(valid.issues, []); assert.equal(valid.candidate.buildings[1].height, 18)
  assert.deepEqual(valid.candidate.buildings[0], base().buildings[0])
  const duplicate = run([height(18), height(19)]); assert.ok(duplicate.issues.length); assert.deepEqual(duplicate.candidate, base())
  const invalidSecond = run([height(), { type: 'set_roof_height', buildingId: 'target', value: 500, quote: 'Altura de cubierta500m.' }])
  assert.ok(invalidSecond.issues.length); assert.deepEqual(invalidSecond.candidate, base())
})

test('trusted parent provenance replays once and preserves both original and complete history across future prose', () => {
  const original = base(), shift: FoundationBuildingEdit = { type: 'translate', buildingId: 'target', dx: 2, dz: 0, quote: 'Mové el edificio2m al este.' }
  const first = run([height(), shift], original).candidate
  const newProse = { ...structuredClone(first), assumptions: ['Cubiertas simplificadas.'] }
  const roof: FoundationBuildingEdit = { type: 'set_roof_height', buildingId: 'target', value: 2, quote: 'Ajustá la altura de cubierta a2m.' }
  const second = applyBuildingCorrections(newProse, [roof], { message: roof.quote, parentCandidate: first })
  assert.deepEqual(second.issues, [])
  assert.deepEqual(second.candidate.buildings[0].footprint, first.buildings[0].footprint, 'the previous2m translation must not be applied twice')
  assert.equal(second.candidate.buildings[0].height, 18); assert.equal(second.candidate.buildings[0].roofHeight, 2)
  assert.deepEqual(second.candidate.buildingCorrections?.baseBuildings, [original.buildings[0]])
  assert.equal(second.candidate.buildingCorrections?.operations.length, 3)
  for (const phrase of ['altura del cuerpo sin cubierta18m', 'desplazamiento este2m', 'altura de cubierta2m']) assert.ok(second.candidate.assumptions.join(' ').replaceAll(' ', '').includes(phrase.replaceAll(' ', '')))
  const again = applyBuildingCorrections(second.candidate, [], { message: 'Revisá las fuentes.', parentCandidate: second.candidate })
  assert.deepEqual(again.issues, []); assert.deepEqual(again.candidate.buildings, second.candidate.buildings)
  assert.deepEqual(again.candidate.buildingCorrections, second.candidate.buildingCorrections)
})

test('refreshed records cannot compound old edits and a new location cannot inherit their provenance', () => {
  const shift: FoundationBuildingEdit = { type: 'translate', buildingId: 'target', dx: 2, dz: 0, quote: 'Mové el edificio2m al este.' }
  const parent = run([shift]).candidate, refreshed = base()
  refreshed.buildings[0].footprint = refreshed.buildings[0].footprint.map(([x, z]) => [x + 5, z])
  const inherited = applyBuildingCorrections(refreshed, [], { message: 'Revisá la propuesta.', parentCandidate: parent })
  assert.deepEqual(inherited.issues, []); assert.deepEqual(inherited.candidate.buildings[0], parent.buildings[0])
  assert.deepEqual(inherited.candidate.buildingCorrections?.baseBuildings, parent.buildingCorrections?.baseBuildings)
  refreshed.site.longitude += .01
  assert.ok(applyBuildingCorrections(refreshed, [], { message: 'Revisá.', parentCandidate: parent }).issues.length)
})

test('model-provided provenance is stripped and forged parent current geometry cannot pass replay validation', () => {
  const generated = base(), forged = run([height()]).candidate
  generated.buildingCorrections = forged.buildingCorrections
  const withoutTrustedParent = applyBuildingCorrections(generated, [], { message: 'Revisá.' })
  assert.equal(withoutTrustedParent.candidate.buildingCorrections, undefined)
  assert.equal(withoutTrustedParent.candidate.buildings[0].height, 15)
  forged.buildings[0].height = 99
  assert.ok(applyBuildingCorrections(base(), [], { message: 'Revisá.', parentCandidate: forged }).issues.length)
})
