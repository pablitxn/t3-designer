import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetPlanSchema, CreateJobInputSchema, ProductUrlSchema } from '../src/index.ts'

test('URL input preserves dimensions in width/height/depth metres', () => {
  const input = CreateJobInputSchema.parse({ url: 'https://www.ikea.com/es/es/p/example/', dimensions: [.82, 1.01, .96] })
  assert.deepEqual(input.dimensions, [.82, 1.01, .96])
  assert.equal(input.notes, '')
})

test('product URLs exclude local services, credentials and unsupported protocols', () => {
  assert.equal(ProductUrlSchema.safeParse('not a URL').success, false)
  for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'http://some.local/', 'https://user:secret@example.com/', 'file:///etc/passwd', 'https://example.com:8787/']) {
    assert.equal(ProductUrlSchema.safeParse(url).success, false, url)
  }
})

test('an incomplete plan must request input and cannot carry executable data', () => {
  const base = { status: 'needs_input', label: 'Chair', summary: 'Dimensions missing', warnings: [], recipe: null }
  assert.equal(AssetPlanSchema.safeParse({ ...base, questions: ['What are the outer dimensions?'] }).success, true)
  assert.equal(AssetPlanSchema.safeParse({ ...base, questions: [] }).success, false)
  assert.equal(AssetPlanSchema.safeParse({ ...base, questions: ['Size?'], python: 'print(123)' }).success, false)
})

test('all dimensions are finite, positive and bounded; notes cannot exhaust storage', () => {
  for (const dimensions of [[1, 0, 1], [1, Infinity, 1], [1, 50, 1], [1, 1]]) {
    assert.equal(CreateJobInputSchema.safeParse({ url: 'https://example.com/chair', dimensions }).success, false)
  }
  assert.equal(CreateJobInputSchema.safeParse({ url: 'https://example.com/chair', notes: 'x'.repeat(12001) }).success, false)
})
