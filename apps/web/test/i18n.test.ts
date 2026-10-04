import assert from 'node:assert/strict'
import test from 'node:test'
import { compassBearing, dateFormatter, detectLocale, numberFormatter, parsePreference, resolveLocale } from '../src/i18n/locale.ts'

test('browser negotiation respects order, regions and scripts', () => {
  for (const [languages, expected] of [
    [['es-AR'], 'es'], [['fr-CA'], 'fr'], [['en-US'], 'en'],
    [['de-DE', 'fr-CH', 'es'], 'fr'], [['fr-Latn-FR', 'en'], 'fr'],
    [['ES-ar'], 'es'], [['invalid_locale', 'es-MX'], 'es'],
    [['de-DE'], 'en'], [[], 'en'],
  ] as const) assert.equal(detectLocale(languages), expected)
})

test('only explicit supported preferences override the browser', () => {
  assert.equal(resolveLocale('es', ['fr-CA']), 'es')
  assert.equal(resolveLocale('auto', ['fr-CA']), 'fr')
  for (const value of [null, undefined, '', 'auto', 'de', 'fr-CA', '{}', '__proto__']) {
    assert.equal(parsePreference(value), 'auto')
  }
  for (const value of ['es', 'en', 'fr'] as const) assert.equal(parsePreference(value), value)
})

test('locale formats measurements and compass bearings without changing geometry', () => {
  assert.equal(numberFormatter('en', 2).format(49.18), '49.18')
  assert.equal(numberFormatter('es', 2).format(49.18), '49,18')
  assert.equal(numberFormatter('fr', 2).format(49.18), '49,18')
  assert.equal(compassBearing('en', 270), 'W')
  assert.equal(compassBearing('es', 270), 'O')
  assert.equal(compassBearing('fr', 225), 'SO')
  assert.equal(compassBearing('en', -90), 'W')
})

test('all display languages retain Regional demo civil time and daylight saving', () => {
  for (const locale of ['es', 'en', 'fr'] as const) {
    const formatter = dateFormatter(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
    assert.equal(formatter.format(new Date('2026-06-21T12:00:00Z')), '14:00')
    assert.equal(formatter.format(new Date('2026-12-21T12:00:00Z')), '13:00')
  }
})
