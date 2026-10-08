import assert from 'node:assert/strict'
import test from 'node:test'
import { ApartmentSchema, FoundationCandidateSchema, StairGeometrySchema, dwellingCirculationIssues, type Apartment, type FoundationCandidate, type Point2D } from '../src/index.ts'

const evidence = { confidence: 'inferred' as const, note: 'Geometría aproximada para prueba, no relevamiento.' }
const rect = (x: number, z: number, width: number, depth: number): Point2D[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
function apartment(): Apartment {
  const perimeter = rect(0, 0, 8, 6)
  return { schemaVersion: 1, id: 'plan', name: 'Planta', units: 'meters', coordinateSystem: { x: 'east', y: 'up', z: 'south' }, perimeter,
    rooms: [{ id: 'room', name: 'Ambiente', polygon: perimeter, reportedArea: 48, color: '#eeeeee' }],
    walls: perimeter.map((from, index) => ({ id: `wall-${index}`, from, to: perimeter[(index + 1) % perimeter.length], height: 2.8, thickness: .15, kind: 'exterior', estimated: true })),
    doors: [], windows: [], metadata: { source: 'Prueba', description: 'Prueba de circulación', reportedCarrezArea: 48, reportedBasementArea: 0, assumptions: [], unresolved: [] },
  }
}
function dwelling(): Extract<FoundationCandidate, { target: 'dwelling' }> {
  const lower = apartment(), upper = apartment(), opening = rect(1, .5, 4, 2)
  lower.ceilingOpenings = [{ id: 'lower-ceiling', polygon: opening, connectionId: 'stairs', evidence }]
  upper.floorOpenings = [{ id: 'upper-floor', polygon: opening, connectionId: 'stairs', evidence }]
  return { target: 'dwelling', summary: 'Dos plantas con retorno.', assumptions: [], unknowns: [], sources: [],
    levels: [
      { levelId: 'lower', name: 'Baja', levelIndex: 0, elevation: 0, ceilingHeight: 2.8, scaleEvidence: 'Prueba 8 × 6 m', apartment: lower },
      { levelId: 'upper', name: 'Alta', levelIndex: 1, elevation: 3, ceilingHeight: 2.8, scaleEvidence: 'Prueba 8 × 6 m', apartment: upper },
    ],
    connections: [{ id: 'stairs', fromLevelId: 'lower', toLevelId: 'upper', kind: 'stairs', notes: 'Retorno con descanso inferido.', geometry: {
      width: .8, flights: [{ from: [1, 0, 1], to: [4, 1.5, 1], steps: 8 }, { from: [4, 1.5, 2], to: [1, 3, 2], steps: 8 }],
      landings: [{ polygon: rect(4, .5, 1, 2), elevation: 1.5 }], evidence,
    } }],
  }
}

test('legacy v1 floors and descriptive connections remain unchanged after parsing', () => {
  assert.deepEqual(ApartmentSchema.parse(apartment()), apartment())
  const value = dwelling()
  delete value.levels[0].apartment.ceilingOpenings; delete value.levels[1].apartment.floorOpenings
  value.connections = [{ fromLevelId: 'lower', toLevelId: 'upper', kind: 'stairs', notes: 'Pendiente de medir.' }]
  assert.deepEqual(FoundationCandidateSchema.parse(value), value)
})

test('a U-shaped stair preserves intermediate landing, floor apertures and inferred provenance', () => {
  const value = dwelling()
  assert.deepEqual(dwellingCirculationIssues(value), [])
  assert.deepEqual(FoundationCandidateSchema.parse(JSON.parse(JSON.stringify(value))), value)
})

test('a raised annex replaces part of its floor and can connect within the same level', () => {
  const value = dwelling(), plan = value.levels[0].apartment
  value.levels = value.levels.slice(0, 1); delete plan.ceilingOpenings
  plan.floorRegions = [
    { id: 'main', polygon: rect(0, 0, 6, 6), floorElevation: 0, ceilingElevation: 2.8, evidence },
    { id: 'annex', polygon: rect(6, 0, 2, 6), floorElevation: .45, ceilingElevation: 3.2, evidence },
  ]
  value.connections = [{ id: 'annex-stairs', kind: 'stairs', fromLevelId: 'lower', toLevelId: 'lower', notes: 'Tres contrahuellas inferidas.', geometry: { width: .8, flights: [{ from: [5, 0, 2], to: [6, .45, 2], steps: 3 }], landings: [], evidence } }]
  assert.deepEqual(dwellingCirculationIssues(value), [])
  assert.deepEqual(FoundationCandidateSchema.parse(value), value)
  value.connections[0].geometry!.flights[0].to[1] = .6
  assert.equal(FoundationCandidateSchema.safeParse(value).success, false, 'arrival must match the actual local region elevation')
  delete value.connections[0].geometry
  assert.equal(FoundationCandidateSchema.safeParse(value).success, false, 'same-floor legacy notes cannot silently enable traversal')
})

test('regions must partition the floor, and openings remain simple contained nonoverlapping polygons', () => {
  const plan = apartment()
  plan.floorRegions = [{ id: 'left', polygon: rect(0, 0, 4, 6), floorElevation: 0, ceilingElevation: 2.8, evidence }]
  assert.equal(ApartmentSchema.safeParse(plan).success, false, 'a partial region list must not silently remove the rest of the floor')
  plan.floorRegions.push({ ...plan.floorRegions[0], id: 'duplicate-area' })
  assert.equal(ApartmentSchema.safeParse(plan).success, false, 'same total area is insufficient if regions overlap')
  plan.floorRegions[1] = { ...plan.floorRegions[1], polygon: rect(4, 0, 4, 6) }
  assert.equal(ApartmentSchema.safeParse(plan).success, true)
  plan.floorRegions[1].ceilingElevation = -1
  assert.equal(ApartmentSchema.safeParse(plan).success, false)
  delete plan.floorRegions
  for (const polygon of [rect(7, 2, 2, 1), [[1, 1], [3, 3], [3, 1], [1, 3]] as Point2D[]]) {
    plan.floorOpenings = [{ id: 'void', polygon, evidence }]
    assert.equal(ApartmentSchema.safeParse(plan).success, false)
  }
  plan.floorOpenings = [{ id: 'void-1', polygon: rect(1, 1, 2, 2), evidence }, { id: 'void-2', polygon: rect(2, 2, 2, 2), evidence }]
  assert.equal(ApartmentSchema.safeParse(plan).success, false)
  plan.floorOpenings[1].polygon = rect(3, 1, 1, 2)
  assert.equal(ApartmentSchema.safeParse(plan).success, true, 'adjacent openings may share an edge')
})

test('stairs reject broken routes, wrong references, missing apertures and unsupported endpoints', () => {
  const changes: Array<(value: ReturnType<typeof dwelling>) => void> = [
    value => { value.connections[0].toLevelId = 'absent' },
    value => { value.connections.push(structuredClone(value.connections[0])) },
    value => { delete value.connections[0].id },
    value => { value.connections[0].kind = 'opening' },
    value => { value.connections[0].geometry!.landings = [] },
    value => { value.connections[0].geometry!.landings[0].elevation = 1.6 },
    value => { value.connections[0].geometry!.landings[0].polygon = rect(4, .9, .1, .2) },
    value => { value.connections[0].geometry!.flights[0].steps = 3.2 },
    value => { value.connections[0].geometry!.flights[0].to[1] = -.2 },
    value => { value.connections[0].geometry!.flights[0].from[0] = -1 },
    value => { value.connections[0].geometry!.flights[1].to[0] = 2 },
    value => { delete value.levels[0].apartment.ceilingOpenings },
    value => { delete value.levels[1].apartment.floorOpenings },
    value => { value.levels[1].apartment.floorOpenings![0].connectionId = 'another-stair' },
  ]
  for (const [index, change] of changes.entries()) {
    const value = dwelling(); change(value)
    assert.equal(FoundationCandidateSchema.safeParse(value).success, false, `Malformed circulation case ${index} was accepted`)
  }
})

test('malformed stair arrays and nonfinite dimensions return schema errors rather than throwing', () => {
  const geometry = dwelling().connections[0].geometry!
  for (const changed of [{ ...geometry, flights: [] }, { ...geometry, width: Infinity }, { ...geometry, flights: [{ from: [0, 0, 0], to: [0, 1, 0], steps: 2 }] }, { ...geometry, evidence: { confidence: 'observed', note: '' } }]) {
    assert.equal(StairGeometrySchema.safeParse(changed).success, false)
  }
})

test('raised door thresholds are relative to wall base and must fit their wall', () => {
  const plan = apartment()
  plan.walls[0].baseElevation = -.4
  plan.doors = [{ id: 'annex-door', wallId: 'wall-0', offset: 1, width: .9, height: 2, thresholdHeight: .45, estimated: true, hinge: 'start', opensToward: 1, locationConfidence: 'inferred' }]
  assert.deepEqual(ApartmentSchema.parse(plan), plan)
  plan.doors[0].thresholdHeight = 1
  assert.equal(ApartmentSchema.safeParse(plan).success, false)
})
