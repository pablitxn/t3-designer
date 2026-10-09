import assert from 'node:assert/strict'
import test from 'node:test'
import { operationTokens, usageLinks, usagePeriod, usageQuery, type UsageCall, type UsageFilters } from '../src/private/usage-api.ts'
import { getUsageCopy } from '../src/private/usage-copy.ts'

const filters: UsageFilters = { from: '', to: '', projectId: '', operationType: '', provider: '', status: '' }
const call = (tokens: Partial<UsageCall>): UsageCall => ({
  id: 'call', operationId: 'operation', stage: 'generation', iteration: 1, provider: 'codex-local', authMode: 'chatgpt',
  requestedModel: 'requested', effectiveModel: null, startedAt: '2026-10-08T10:00:00Z', endedAt: null,
  durationMs: null, status: 'interrupted', measurement: 'unknown', source: null,
  inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, ...tokens,
})

test('usage filters retain the full period across pages and make the final local day inclusive', () => {
  const query = new URL(usageQuery({ ...filters, from: '2026-10-01', to: '2026-10-08', projectId: 'my-project', operationType: 'revision', provider: 'codex-local', status: 'invalid' }, 40), 'http://localhost').searchParams
  assert.equal(query.get('from'), new Date(2026, 9, 1).toISOString())
  assert.equal(query.get('to'), new Date(2026, 9, 9).toISOString())
  assert.equal(query.get('offset'), '40')
  assert.equal(query.get('limit'), '20')
  assert.equal(query.get('projectId'), 'my-project')
  assert.equal(query.get('operationType'), 'revision')
  assert.equal(query.get('provider'), 'codex-local')
  assert.equal(query.get('status'), 'invalid')
  assert.deepEqual([...new URL(usageQuery(filters), 'http://localhost').searchParams.keys()], ['limit', 'offset'])
})

test('calendar periods cover month boundaries without using UTC dates', () => {
  const now = new Date(2026, 0, 12, 0, 30)
  assert.deepEqual(usagePeriod('today', now), { from: '2026-01-12', to: '2026-01-12' })
  assert.deepEqual(usagePeriod('month', now), { from: '2026-01-01', to: '2026-01-12' })
  assert.deepEqual(usagePeriod('last30', now), { from: '2025-12-14', to: '2026-01-12' })
  assert.deepEqual(usagePeriod('all', now), { from: '', to: '' })
})

test('operation rows keep absent measurements unknown and avoid adding cache or reasoning twice', () => {
  assert.equal(operationTokens([], 'inputTokens'), null)
  assert.equal(operationTokens([call({})], 'outputTokens'), null)
  assert.equal(operationTokens([call({ inputTokens: 0 })], 'inputTokens'), 0)
  const calls = [call({ inputTokens: 100, outputTokens: 50, cachedInputTokens: 80, reasoningOutputTokens: 40 }), call({}), call({ inputTokens: 30, outputTokens: 10 })]
  assert.equal(operationTokens(calls, 'inputTokens'), 130)
  assert.equal(operationTokens(calls, 'outputTokens'), 60)
})

test('usage links target historical jobs, foundation runs and exact furniture versions', () => {
  assert.deepEqual(usageLinks({ projectId: null, jobId: 'job-2', runId: null, assetId: 'version-1' }), { project: null, job: '/app/assets?jobId=job-2', asset: '/app/assets?assetId=version-1' })
  assert.deepEqual(usageLinks({ projectId: 'duplex', jobId: null, runId: 'run-1', assetId: null }), { project: '/app/projects/duplex', job: '/app/projects/duplex?runId=run-1#foundation-agents', asset: null })
  assert.deepEqual(usageLinks({ projectId: null, jobId: null, runId: null, assetId: null }), { project: null, job: null, asset: null })
})

test('Codex subscription usage has the requested unambiguous wording in every locale', () => {
  for (const locale of ['es', 'en', 'fr']) assert.equal(getUsageCopy(locale).subscription, 'Uso mediante suscripción de Codex')
})
