import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { buildDemoDossierEvidence, dossierFacts, dossierObservations, dossierQuestions, dossierRoomAreas, dossierSources } from '../src/data/dossier.ts'
import { t3Apartment } from '../src/data/t3.ts'

const facts = new Map(dossierFacts.map(fact => [fact.id, fact]))
const sources = new Map(dossierSources.map(source => [source.id, source]))

test('dossier evidence and open questions resolve to identifiable sources', () => {
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
  const question = dossierQuestions.find(question => question.id === 'floor-discrepancy')!
  assert.ok(question.sourceIds.includes('plan') && question.sourceIds.includes('model'))
  assert.match(question.needed, /lote/)
})

test('energy and parcel-context gaps do not invent an apartment diagnosis, consumption or risk conclusion', () => {
  const energy = dossierFacts.filter(fact => fact.section === 'energy')
  assert.ok(energy.length > 0)
  for (const fact of energy) {
    assert.equal(fact.status, 'pending')
    assert.equal(fact.review, 'pending')
    assert.equal(fact.numericValue, undefined)
    assert.equal(fact.scope, 'Departamento')
  }
  for (const id of ['risks', 'planning', 'legal-lots']) assert.equal(facts.get(id)?.status, 'pending')
  assert.match(facts.get('apartment-dpe')!.note, /Ninguna clase energética/)
  assert.match(facts.get('actual-energy-use')!.note, /convencional del DPE/)
})

test('public evidence is a reproducible model extract without fake official records', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../public/dossier/demo-evidence.json', import.meta.url), 'utf8'))
  assert.deepEqual(snapshot, JSON.parse(JSON.stringify(buildDemoDossierEvidence())))
  assert.equal(snapshot.datasetKind, 'generalized-demo')
  assert.equal(snapshot.geolocation.latitude, 48)
  assert.equal(snapshot.geolocation.longitude, -4)
  assert.match(snapshot.geolocation.note, /not a surveyed location/)
  for (const fact of dossierFacts) {
    assert.notEqual(fact.status, 'official', `${fact.id}: demonstration is not an official finding`)
    if (fact.status !== 'pending') {
      assert.ok(fact.sourceIds.every(id => sources.get(id)?.kind === 'model'))
    }
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
