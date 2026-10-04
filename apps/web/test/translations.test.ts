import assert from 'node:assert/strict'
import test from 'node:test'
import { createInstance } from 'i18next'
import { resources } from '../src/i18n/resources.ts'
import { t3Apartment } from '../src/data/t3.ts'
import { assetCatalog } from '../src/data/current-state.ts'
import { dossierFacts, dossierObservations, dossierQuestions, dossierSources } from '../src/data/dossier.ts'
import { assetEvidence, assetLabel, roomLabel } from '../src/i18n/workspace-labels.ts'

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  assert.ok(value && typeof value === 'object', `Invalid resource at ${prefix}`)
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => Object.entries(flatten(child, prefix ? `${prefix}.${key}` : key))))
}

function placeholders(value: string) {
  return [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1]).sort()
}

test('every locale has exactly the source keys and interpolation arguments', () => {
  const source = flatten(resources.es)
  for (const locale of ['en', 'fr'] as const) {
    const translated = flatten(resources[locale])
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort(), `${locale} key parity`)
    for (const [key, value] of Object.entries(translated)) {
      assert.ok(value.trim(), `${locale}.${key} must not be empty`)
      assert.deepEqual(placeholders(value), placeholders(source[key]), `${locale}.${key} interpolation`)
    }
  }
})

test('all bundled messages resolve without fallback or leaking interpolation tokens', async () => {
  const instance = createInstance()
  await instance.init({ resources, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false } })
  for (const locale of ['es', 'en', 'fr'] as const) {
    for (const namespace of ['common', 'workspace', 'dossier', 'assets'] as const) {
      const catalog = resources[locale][namespace]
      for (const [key, value] of Object.entries(flatten(catalog))) {
        const args = Object.fromEntries(placeholders(value).map(name => [name, name === 'count' ? 2 : 'sample']))
        assert.equal(instance.exists(key, { ns: namespace, lng: locale }), true, `${locale}:${namespace}:${key}`)
        // Iteration validates keys at runtime; production callers remain strictly typed.
        const rendered = instance.t(key as never, { ...args, ns: namespace, lng: locale }) as string
        assert.equal(rendered.includes('{{'), false, `${locale}:${namespace}:${key}`)
      }
    }
  }
})

test('every domain record has localized presentation in every language', async () => {
  const instance = createInstance()
  await instance.init({ resources, fallbackLng: false, initAsync: false })
  for (const locale of ['es', 'en', 'fr'] as const) {
    const { workspace, dossier } = resources[locale]
    for (const room of [...t3Apartment.rooms, ...(t3Apartment.balcony ? [t3Apartment.balcony] : [])]) {
      assert.ok(Object.hasOwn(workspace.rooms, room.id), `${locale}: room ${room.id}`)
    }
    for (const asset of assetCatalog) assert.ok(Object.hasOwn(workspace.assets, asset.id), `${locale}: asset ${asset.id}`)
    for (const fact of dossierFacts.filter(fact => !fact.roomId)) assert.ok(Object.hasOwn(dossier.facts, fact.id), `${locale}: fact ${fact.id}`)
    for (const [records, translations] of [[dossierSources, dossier.sources], [dossierQuestions, dossier.questions], [dossierObservations, dossier.observations]] as const) {
      for (const record of records) assert.ok(Object.hasOwn(translations, record.id), `${locale}: record ${record.id}`)
    }
    const t = instance.getFixedT(locale, 'workspace')
    for (const id of ['missing', 'constructor', '__proto__']) {
      assert.equal(roomLabel(t, id), workspace.rooms.unknown)
      assert.equal(assetLabel(t, id), workspace.apartment.unknownAsset)
      assert.equal(assetEvidence(t, id), '')
    }
  }
})

test('search counts use each language’s plural rules', async () => {
  const instance = createInstance()
  await instance.init({ resources, fallbackLng: false, initAsync: false })
  for (const [locale, count, expected] of [
    ['es', 0, '0 resultados'], ['es', 1, '1 resultado'], ['es', 2, '2 resultados'],
    ['en', 0, '0 results'], ['en', 1, '1 result'], ['en', 2, '2 results'],
    ['fr', 0, '0 résultat'], ['fr', 1, '1 résultat'], ['fr', 2, '2 résultats'],
  ] as const) {
    assert.ok(instance.t('ui.results', { ns: 'dossier', lng: locale, count, query: 'test' }).startsWith(expected))
  }
})
