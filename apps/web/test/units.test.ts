import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseUnitSystem, readUnitPreference, saveUnitPreference, toDisplayArea, toDisplayLength, toMeters,
  UNIT_STORAGE_KEY,
} from '../src/lib/units.ts'

test('imperial lengths and areas use physical conversion factors and preserve SI round trips', () => {
  assert.equal(toDisplayLength(0.3048, 'imperial'), 1)
  assert.equal(toMeters(1, 'imperial'), 0.3048)
  assert.equal(toDisplayArea(0.3048 ** 2, 'imperial'), 1)
  for (const meters of [0, -2.4, 0.005, 3.72, 1000]) {
    assert.ok(Math.abs(toMeters(toDisplayLength(meters, 'imperial'), 'imperial') - meters) < 1e-10)
    assert.equal(toDisplayLength(meters, 'metric'), meters)
    assert.equal(toMeters(meters, 'metric'), meters)
  }
  assert.equal(toDisplayArea(49.18, 'metric'), 49.18)
})

test('unit preferences persist independently and invalid or unavailable storage defaults to metric', () => {
  const data = new Map<string, string>([['scene', 'unchanged']])
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
  assert.equal(readUnitPreference(storage), 'metric')
  assert.equal(saveUnitPreference(storage, 'imperial'), true)
  assert.equal(readUnitPreference(storage), 'imperial')
  assert.equal(data.get('scene'), 'unchanged')
  storage.setItem(UNIT_STORAGE_KEY, 'corrupt')
  assert.equal(readUnitPreference(storage), 'metric')
  assert.equal(readUnitPreference({ getItem() { throw new Error('Blocked') } }), 'metric')
  assert.equal(saveUnitPreference({ setItem() { throw new Error('Blocked') } }, 'imperial'), false)
  for (const value of [null, undefined, 'feet', {}, 'metric']) assert.equal(parseUnitSystem(value), 'metric')
})
