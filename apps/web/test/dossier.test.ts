import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { buildDemoDossierEvidence, dossierFacts, dossierObservations, dossierQuestions, dossierRoomAreas, dossierSources } from '../src/data/dossier.ts'
import { t3Apartment } from '../src/data/t3.ts'
import { DEMO_LOCATION } from '../src/data/demo-location.ts'

const facts = new Map(dossierFacts.map(fact => [fact.id, fact]))
const sources = new Map(dossierSources.map(source => [source.id, source]))

test('dossier evidence resolves to identifiable sources', () => {
  for (const collection of [dossierFacts, dossierSources, dossierQuestions, dossierObservations]) {
    assert.equal(new Set(collection.map(item => item.id)).size, collection.length, 'IDs must be unique within each collection')
  }
  for (const item of [...dossierFacts, ...dossierQuestions, ...dossierObservations]) {
    assert.ok(item.sourceIds.length > 0, `${item.id}: source required`)
    for (const id of item.sourceIds) assert.ok(sources.has(id), `${item.id}: missing source ${id}`)
  }
  for (const fact of dossierFacts) {
    assert.deepEqual(fact.sourceIds, [...new Set(fact.evidence.map(citation => citation.sourceId))])
    assert.ok(fact.evidence.every(citation => citation.locator.trim()), `${fact.id}: precise evidence locator required`)
    if (fact.status === 'official') {
      assert.ok(fact.sourceIds.every(id => sources.get(id)?.kind === 'public-record'), `${fact.id}: a guide or model cannot establish an official property record`)
      assert.notEqual(fact.scope, 'Departamento', `${fact.id}: public records have not identified the apartment`)
    }
  }
  for (const source of dossierSources) {
    if (source.localUrl) assert.ok(existsSync(new URL(`../public${source.localUrl}`, import.meta.url)), `${source.id}: local evidence must remain accessible`)
  }
})

test('illustrative apartment areas retain shared geometry values without asserting document verification', () => {
  assert.equal(dossierRoomAreas.length, t3Apartment.rooms.length)
  for (const room of t3Apartment.rooms) {
    const area = dossierRoomAreas.find(fact => fact.roomId === room.id)!
    assert.equal(area.numericValue, room.reportedArea)
    assert.equal(area.status, 'estimated')
    assert.equal(area.review, 'checked')
    assert.equal(area.unit, 'm²')
  }
  const sum = dossierRoomAreas.reduce((total, fact) => total + fact.numericValue!, 0)
  assert.ok(Math.abs(sum - 49.18) < 1e-9)
  assert.equal(facts.get('apartment-carrez')?.numericValue, t3Apartment.metadata.reportedCarrezArea)
  assert.equal(facts.get('apartment-carrez')?.status, 'estimated')
  assert.equal(facts.get('apartment-area-sum')?.status, 'derived')
  assert.equal(facts.get('apartment-area-sum')?.numericValue, sum)
  assert.equal(facts.get('balcony-area')?.numericValue, t3Apartment.balcony?.reportedArea)
  assert.equal(facts.get('basement-area')?.numericValue, t3Apartment.metadata.reportedBasementArea)
  for (const id of ['balcony-area', 'basement-area']) assert.match(facts.get(id)!.note, /fuera del total interior/)
})

test('floor presentation preserves the model assumption without inventing a real diagnosis conflict', () => {
  assert.equal(facts.get('floor-plan')?.value, '3.er piso ilustrativo')
  assert.equal(facts.get('floor-model')?.value, '3.er piso estimado')
  for (const id of ['floor-plan', 'floor-model', 'living-orientation', 'ceiling-height']) {
    assert.equal(facts.get(id)?.status, 'estimated')
    assert.notEqual(facts.get(id)?.review, 'disputed')
  }
  assert.deepEqual(dossierQuestions, [])
})

test('complete energy and parcel scenario identifies fiction, annual scope and its own source', () => {
  for (const id of ['apartment-dpe', 'actual-energy-use', 'energy-cost', 'legal-lots', 'risks', 'planning']) {
    const fact = facts.get(id)!
    assert.equal(fact.status, 'demo')
    assert.equal(fact.review, 'checked')
    assert.deepEqual(fact.sourceIds, ['demo-scenario'])
    assert.deepEqual(fact.evidence, [{ sourceId: 'demo-scenario', locator: `demo-evidence.json#values.${id}` }])
    assert.match(fact.note, /2026/)
    assert.doesNotMatch(fact.value, /sin dato|pendiente|por completar/i)
  }
  assert.equal(sources.get('demo-scenario')?.kind, 'model')
  assert.equal(facts.get('apartment-dpe')?.value, 'D')
  assert.equal(facts.get('actual-energy-use')?.numericValue, 6200)
  assert.equal(facts.get('actual-energy-use')?.unit, 'kWh')
  assert.equal(facts.get('energy-cost')?.value, '900–1.200')
  assert.equal(facts.get('energy-cost')?.unit, '€')
  assert.match(facts.get('actual-energy-use')!.note, /1 de enero al 31 de diciembre/)
  assert.match(facts.get('actual-energy-use')!.note, /convencional del DPE/)
  assert.match(facts.get('energy-cost')!.note, /enero–diciembre/)
  assert.equal(facts.get('legal-lots')?.value, '12 · departamento / 42 · cave')
  assert.equal(facts.get('risks')?.value, 'Inundación baja · radón 3')
  assert.equal(facts.get('planning')?.value, 'UA · uso residencial')
  assert.ok(dossierFacts.every(fact => fact.status !== 'pending' && fact.review === 'checked'))
})

test('public evidence is a reproducible model extract without fake official records', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../public/dossier/demo-evidence.json', import.meta.url), 'utf8'))
  assert.deepEqual(snapshot, JSON.parse(JSON.stringify(buildDemoDossierEvidence())))
  assert.equal(snapshot.datasetKind, 'complete-demo')
  assert.equal(snapshot.geolocation.latitude, DEMO_LOCATION.latitude)
  assert.equal(snapshot.geolocation.longitude, DEMO_LOCATION.longitude)
  assert.equal(snapshot.geolocation.label, DEMO_LOCATION.label)
  assert.match(snapshot.geolocation.note, /not the location of the fictional residence/)
  assert.equal(snapshot.solarReference.latitude, 48)
  assert.equal(snapshot.solarReference.longitude, -4)
  assert.match(snapshot.solarReference.note, /not a surveyed location/)
  assert.deepEqual(snapshot.scenario, { fictional: true, name: 'Résidence du Jardin · Quimper', period: '2026-01-01/2026-12-31' })
  assert.equal(snapshot.values['official-address'].value, snapshot.scenario.name)
  assert.equal(snapshot.values['official-address'].status, 'demo')
  for (const fact of dossierFacts) {
    assert.notEqual(fact.status, 'official', `${fact.id}: demonstration is not an official finding`)
    assert.ok(fact.sourceIds.every(id => sources.get(id)?.kind === 'model'))
  }
  assert.ok(dossierSources.every(source => source.kind !== 'public-record'))
  assert.equal(facts.get('parcel-area')?.scope, 'Parcela')
  assert.equal(facts.get('building-footprint')?.scope, 'Grupo BDNB')
  assert.notEqual(facts.get('parcel-area')?.numericValue, facts.get('apartment-carrez')?.numericValue)
  for (const source of dossierSources) {
    if (source.url) assert.equal(new URL(source.url).search, '', 'methodology links must not query a specific property')
  }
  assert.doesNotMatch(JSON.stringify(snapshot), /BATIMENT\d+|TRONROUT\d+|code_insee=|response_sha256|\/Users\//)
})
