import assert from 'node:assert/strict'
import test from 'node:test'
import { getPropertySourcePortals } from '../src/property-sources.ts'

test('official portals require a selected country and never guess from an address', () => {
  for (const countryCode of ['', 'US', 'Paris', 'Buenos Aires', 'France', 'UK', 'FRANCE', '__proto__', 'toString']) {
    assert.deepEqual(getPropertySourcePortals(countryCode), [], countryCode)
  }
  assert.deepEqual(getPropertySourcePortals(' fr '), getPropertySourcePortals('FR'))
  for (const countryCode of ['FR', 'AR', 'ES', 'NL', 'GB']) {
    const portals = getPropertySourcePortals(countryCode)
    assert.ok(portals.length > 0)
    assert.ok(portals.every((portal) => portal.countryCode === countryCode))
  }
})

test('a source directory lookup supplies consultation links, not retrieved property evidence', () => {
  const ids = new Set<string>()
  for (const countryCode of ['FR', 'AR', 'ES', 'NL', 'GB']) {
    for (const portal of getPropertySourcePortals(countryCode)) {
      assert.equal(portal.evidence, 'portal-only')
      const url = new URL(portal.url)
      assert.equal(url.protocol, 'https:')
      assert.equal(url.search, '', 'lookup must not submit an address or parcel')
      assert.equal(url.username, '')
      assert.equal(url.password, '')
      assert.ok(!ids.has(portal.id), 'source ids must stay unique for saved references')
      ids.add(portal.id)
      for (const language of ['en', 'es', 'fr'] as const) {
        assert.ok(portal.description[language].trim())
        assert.ok(portal.jurisdiction[language].trim())
      }
      assert.equal('geometry' in portal, false)
      assert.equal('parcelId' in portal, false)
    }
  }
})

test('address, cadastral and building sources retain distinct scopes', () => {
  assert.deepEqual(getPropertySourcePortals('AR').find((portal) => portal.id === 'ar-georef')?.kinds, ['address'])
  assert.deepEqual(getPropertySourcePortals('FR').find((portal) => portal.id === 'fr-ban')?.kinds, ['address'])
  assert.deepEqual(getPropertySourcePortals('NL').find((portal) => portal.id === 'nl-bag')?.kinds, ['address', 'building'])
  assert.match(getPropertySourcePortals('AR').find((portal) => portal.id === 'ar-arba')!.jurisdiction.es, /excluye CABA/)
  assert.match(getPropertySourcePortals('ES')[0]!.jurisdiction.es, /excluye País Vasco y Navarra/)
})

test('UK sources preserve separate registries and access limits', () => {
  const portals = getPropertySourcePortals('GB')
  assert.equal(portals.length, 3)
  assert.equal(new Set(portals.map((portal) => portal.jurisdiction.en)).size, 3)
  assert.ok(portals.every((portal) => portal.kinds.length === 1 && portal.kinds[0] === 'land-registry'))
  assert.equal(portals.find((portal) => portal.id === 'gb-lps')?.access, 'request-only')
  assert.equal(portals.find((portal) => portal.id === 'gb-hmlr')?.access, 'account-or-fees')
})

test('Argentina separates national address lookup from the three supported cadastral jurisdictions', () => {
  const portals = getPropertySourcePortals('AR')
  const jurisdictions = ['ar-arba', 'ar-idecor', 'ar-usig'].map(id => portals.find(portal => portal.id === id)!)
  assert.ok(jurisdictions.every(Boolean))
  assert.equal(new Set(jurisdictions.map(portal => portal.jurisdiction.es)).size, 3)
  assert.ok(jurisdictions.every(portal => portal.kinds.includes('cadastre') && !portal.kinds.includes('building')))
  assert.ok(jurisdictions.every(portal => portal.evidence === 'portal-only' && portal.checkedAt === '2026-10-08'))
  assert.match(jurisdictions[1].jurisdiction.es, /Solo provincia de Córdoba/)
  assert.match(jurisdictions[2].jurisdiction.es, /CABA.*excluye la provincia de Buenos Aires/)
  assert.deepEqual(portals.find(portal => portal.id === 'ar-georef')!.kinds, ['address'])
  assert.match(portals.find(portal => portal.id === 'ar-georef')!.description.es, /aproximada/)
  assert.deepEqual(portals.find(portal => portal.id === 'ar-ign')!.kinds, ['context'])
})
