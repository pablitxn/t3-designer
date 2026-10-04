import assert from 'node:assert/strict'
import test from 'node:test'
import { dimensionsFromCentimetres } from '../src/lib/asset-api.ts'

test('asset dimensions preserve width/height/depth and convert centimetres to metres', () => {
  assert.deepEqual(dimensionsFromCentimetres(['82', '101', '96']), [.82, 1.01, .96])
  assert.equal(dimensionsFromCentimetres(['', ' ', '']), undefined)
})

test('asset dimension overrides reject partial, non-finite and out-of-range values', () => {
  for (const values of [['82', '', '96'], ['NaN', '101', '96'], ['Infinity', '101', '96'], ['0', '101', '96'], ['2001', '101', '96']]) {
    assert.throws(() => dimensionsFromCentimetres(values))
  }
})
