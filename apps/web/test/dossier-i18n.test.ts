import assert from 'node:assert/strict'
import test from 'node:test'
import { createInstance } from 'i18next'
import { dossierFacts, dossierSources } from '../src/data/dossier.ts'
import { localizeDossier, matchesDossierQuery } from '../src/i18n/dossier-content.ts'
import { resources } from '../src/i18n/resources.ts'

test('localized dossier preserves every source identity, measurement and evidence relationship', async () => {
  const before = structuredClone({ dossierFacts, dossierSources })
  const instance = createInstance()
  await instance.init({ resources, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false } })
  for (const locale of ['es', 'en', 'fr'] as const) {
    const content = localizeDossier(locale, instance.getFixedT(locale, 'dossier'), instance.getFixedT(locale, 'workspace'))
    assert.equal(content.facts.length, dossierFacts.length)
    content.facts.forEach((fact, index) => {
      const original = dossierFacts[index]
      for (const key of ['id', 'section', 'unit', 'status', 'review', 'numericValue', 'roomId', 'sourceIds'] as const) {
        assert.deepEqual(fact[key], original[key], `${locale} ${fact.id}.${key}`)
      }
      assert.deepEqual(fact.evidence.map(item => item.sourceId), original.evidence.map(item => item.sourceId))
      for (const text of [fact.label, fact.value, fact.note, fact.scope, ...fact.evidence.map(item => item.locator)]) {
        assert.ok(text?.trim(), `${locale} ${fact.id}: empty presentation`)
        assert.ok(!text.includes('{{'), `${locale} ${fact.id}: unresolved interpolation`)
      }
    })
    content.sources.forEach((source, index) => {
      for (const key of ['id', 'url', 'localUrl', 'date', 'kind'] as const) assert.equal(source[key], dossierSources[index][key])
    })
    const value = (id: string) => content.facts.find(fact => fact.id === id)!.value
    assert.equal(value('construction-year'), '1956')
    assert.equal(value('dwelling-count'), '30')
    assert.equal(value('building-height'), locale === 'en' ? '15.5' : '15,5')
    assert.equal(value('room-area-bedroom-1'), locale === 'en' ? '11.81' : '11,81')
    assert.equal(value('ground-altitudes'), locale === 'en' ? '8.8 / 8.8' : '8,8 / 8,8')
    assert.equal(value('source-accuracy'), locale === 'en' ? '3 m / 2.5 m' : '3 m / 2,5 m')
    assert.match(value('living-orientation'), locale === 'en' ? /210\.79°/ : /210,79°/)
  }
  assert.deepEqual({ dossierFacts, dossierSources }, before)
})

test('localized search is accent/case insensitive and uses translated room data', async () => {
  const instance = createInstance()
  await instance.init({ resources, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false } })
  const french = localizeDossier('fr', instance.getFixedT('fr', 'dossier'), instance.getFixedT('fr', 'workspace'))
  const kitchen = french.facts.find(fact => fact.id === 'room-area-kitchen')!
  assert.equal(matchesDossierQuery(' CUISINE ', kitchen.label), true)
  assert.equal(matchesDossierQuery('cocina', kitchen.label), false)
  assert.equal(matchesDossierQuery('energie', 'Énergie et environnement'), true)
  assert.equal(matchesDossierQuery('unknown', 'Énergie et environnement'), false)
})
