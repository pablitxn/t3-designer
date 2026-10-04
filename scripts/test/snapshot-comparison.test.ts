import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotsMatch } from '../lib/snapshot-comparison.ts'

const reference = {
  geometry: { walls: [{ thickness: 0.12 }] },
  solar: {
    selected: { altitude: -26.175592807029155, azimuth: 132.5, direction: [0.1, 0.2, 0.3], utc: '2026-09-26T13:00:00.000Z' },
    samples: [{ altitude: 2.708955961692155, azimuth: 34.5, direction: [0.2, 0.3, 0.4], frame: 1, minutes: 0 }],
    daylightMinutes: 710,
  },
}

test('accepts observed one-ULP solar differences without changing either input', () => {
  const actual = structuredClone(reference)
  actual.solar.selected.altitude = -26.175592807029158
  actual.solar.samples[0].altitude = 2.7089559616921544
  actual.solar.selected.direction[0] += Number.EPSILON
  const saved = structuredClone(actual)
  assert.equal(snapshotsMatch(actual, reference), true)
  assert.deepEqual(actual, saved)
})

test('rejects meaningful solar drift and exact authored geometry, time and sampling changes', () => {
  for (const mutate of [
    (value: typeof reference) => { value.solar.selected.altitude += 1e-9 },
    (value: typeof reference) => { value.solar.samples[0].direction[0] += 1e-9 },
    (value: typeof reference) => { value.geometry.walls[0].thickness += Number.EPSILON },
    (value: typeof reference) => { value.solar.selected.utc = '2026-09-26T13:01:00.000Z' },
    (value: typeof reference) => { value.solar.samples[0].frame = 2 },
    (value: typeof reference) => { value.solar.samples[0].minutes = 15 },
    (value: typeof reference) => { value.solar.samples.push(structuredClone(value.solar.samples[0])) },
    (value: typeof reference) => { value.solar.daylightMinutes += 1e-10 },
  ]) {
    const actual = structuredClone(reference)
    mutate(actual)
    assert.equal(snapshotsMatch(actual, reference), false)
  }
})

test('rejects missing or added fields, array/object mismatches and coercion', () => {
  assert.equal(snapshotsMatch({ ...reference, extra: true }, reference), false)
  assert.equal(snapshotsMatch({ solar: reference.solar }, reference), false)
  assert.equal(snapshotsMatch({ solar: { samples: {} } }, { solar: { samples: [] } }), false)
  assert.equal(snapshotsMatch({ solar: { selected: { altitude: '1' } } }, { solar: { selected: { altitude: 1 } } }), false)
})
