import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import type { Asset, Job } from '@t3-designer/asset-schema'
import { createAccounts } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { GenerationCredits } from '../src/generation-credits.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { AssetWorker, type Planner, type ReferenceLoader } from '../src/worker.ts'

const input = { url: 'https://example.com/product', notes: '' }
const question = { status: 'needs_input' as const, label: 'Chair', summary: 'Need dimensions', questions: ['Width?'], warnings: [], recipe: null }
async function setup(t: TestContext, options: { planner?: Planner; referenceLoader?: ReferenceLoader; pendingLimit?: number; paused?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 't3-generation-credit-'))
  const database = openAppDatabase()
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const invite = await accounts.createBootstrapInvitation('admin@example.test')
  const user = await accounts.acceptInvitation({ token: invite.token, email: 'admin@example.test', name: 'Admin', password: 'correct-test-password-123' })
  const trialInvite = await accounts.createInvitation('user@example.test', user.id)
  const normal = await accounts.acceptInvitation({ token: trialInvite.token, email: 'user@example.test', name: 'User', password: 'correct-test-password-123' })
  const credits = accounts.credits
  const store = new AssetStore(':memory:')
  const metering = new GenerationCredits(credits, store)
  const worker = new AssetWorker({ store, directory, planner: options.planner ?? (async (_input, callbacks) => { callbacks.onInference?.(); return question }), renderer: async () => {}, referenceLoader: options.referenceLoader,
    canProcess: job => metering.authorized(job.id), onInference: id => metering.started(id), onSettled: id => metering.settle(id) })
  if (options.paused) t.mock.method(worker, 'kick', () => {})
  const server = createApi({ store, worker, credits, metering, publicOrigin: 'http://localhost:5173', access: { authorize: async () => normal },
    generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 100, pendingLimit: options.pendingLimit ?? 20 },
    health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'api-key' }, blender: { available: true } }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await worker.close(); store.close(); await database.close(); await rm(directory, { recursive: true, force: true }) })
  const request = async (path: string, body: unknown = {}, key?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() as { job: Job; error?: string } }
  }
  return { directory, database, credits, store, metering, worker, normal, request }
}
async function drained(worker: AssetWorker, store: AssetStore) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) { if (!worker.activeJobId && !store.nextJob()) return; await delay(5) }
  throw new Error('Worker did not settle')
}

test('HTTP generations reserve atomically; cancellations/retries and revisions apply the right price', async t => {
  const { credits, normal, request, store } = await setup(t, { paused: true })
  const submissions = await Promise.all(Array.from({ length: 6 }, () => request('/api/jobs', input)))
  assert.equal(submissions.filter(result => result.status === 202).length, 5)
  assert.equal(submissions.filter(result => result.status === 402).length, 1)
  assert.equal((await credits.summary(normal.id)).balance, 0)
  const job = submissions.find(result => result.status === 202)!.body.job
  assert.equal((await request(`/api/jobs/${job.id}/cancel`)).status, 200)
  assert.equal((await credits.summary(normal.id)).balance, 20)
  const retries = await Promise.all([request(`/api/jobs/${job.id}/retry`), request(`/api/jobs/${job.id}/retry`)])
  assert.deepEqual(retries.map(result => result.status).sort(), [202, 409])
  assert.equal((await credits.summary(normal.id)).balance, 0)
  await request(`/api/jobs/${job.id}/cancel`)
  const assetId = randomUUID()
  const asset: Asset = { id: assetId, jobId: job.id, label: 'Example', kind: 'table', dimensions: [1, 1, 1], createdAt: new Date().toISOString(), source: { url: input.url, description: 'Test', dimensionalStatus: 'user-supplied' }, fidelityStatus: 'draft', warnings: [], files: { model: '/model.glb', preview: '/preview.png', blend: '/source.blend', manifest: '/manifest.json', request: '/request.json' } }
  store.completeJob(job.id, asset, '/tmp/unused')
  const revisions = await Promise.all([request(`/api/assets/${assetId}/revisions`, { feedback: 'Change the shape' }), request(`/api/assets/${assetId}/revisions`, { feedback: 'Change it again' })])
  assert.deepEqual(revisions.map(result => result.status).sort(), [202, 409])
  assert.equal((await credits.summary(normal.id)).balance, 10)
})

test('AI clarification charges once, later cancellation preserves charge, answer reserves another attempt', async t => {
  const { credits, normal, request, store, worker } = await setup(t)
  const created = await request('/api/jobs', input)
  assert.equal(created.status, 202)
  await drained(worker, store)
  assert.equal(store.getJob(created.body.job.id)!.status, 'needs_input')
  assert.equal((await credits.summary(normal.id)).balance, 80)
  assert.equal((await credits.summary(normal.id)).reserved, 0)
  const answered = await request(`/api/jobs/${created.body.job.id}/answers`, { notes: 'The chair is one meter wide' })
  assert.equal(answered.status, 202, answered.body.error)
  await drained(worker, store)
  assert.equal((await credits.summary(normal.id)).balance, 60)
  const cancelled = await request(`/api/jobs/${created.body.job.id}/cancel`)
  assert.equal(cancelled.status, 200, cancelled.body.error)
  assert.equal((await credits.summary(normal.id)).balance, 60)
  const retry = await request(`/api/jobs/${created.body.job.id}/retry`)
  assert.equal(retry.status, 202, retry.body.error)
  await drained(worker, store)
  assert.equal((await credits.summary(normal.id)).balance, 40)
})

test('missing references and inference failures refund once and remain retryable', async t => {
  for (const scenario of ['references', 'provider'] as const) await t.test(scenario, async t => {
    const { credits, normal, request, store, worker } = await setup(t, scenario === 'references'
      ? { referenceLoader: async () => { throw new Error('missing image') } }
      : { planner: async (_input, callbacks) => { callbacks.onInference?.(); throw new Error('provider failed') } })
    const created = await request('/api/jobs', input)
    await drained(worker, store)
    assert.equal(store.getJob(created.body.job.id)!.status, scenario === 'references' ? 'needs_input' : 'failed')
    assert.equal((await credits.summary(normal.id)).balance, 100)
    assert.equal((await credits.summary(normal.id)).reserved, 0)
    const retry = await request(`/api/jobs/${created.body.job.id}/${scenario === 'references' ? 'answers' : 'retry'}`, scenario === 'references' ? { notes: 'Retry the product images please' } : {})
    assert.equal(retry.status, 202, retry.body.error)
    await drained(worker, store)
    assert.equal((await credits.summary(normal.id)).balance, 100)
  })
})

test('queue rejection refunds the new attempt without making a prior clarification unanswerable', async t => {
  const { credits, normal, request, store, worker } = await setup(t, { pendingLimit: 1 })
  const created = await request('/api/jobs', input)
  await drained(worker, store)
  t.mock.method(worker, 'kick', () => {})
  const queued = await request('/api/jobs', input)
  assert.equal(queued.status, 202)
  const denied = await request(`/api/jobs/${created.body.job.id}/answers`, { notes: 'More information for this chair' })
  assert.equal(denied.status, 429)
  assert.equal((await credits.summary(normal.id)).balance, 60)
  await request(`/api/jobs/${queued.body.job.id}/cancel`)
  const accepted = await request(`/api/jobs/${created.body.job.id}/answers`, { notes: 'The queue now has space' })
  assert.equal(accepted.status, 202, accepted.body.error)
  assert.equal((await credits.summary(normal.id)).balance, 60)
})

test('startup recovery closes crash gaps and leaves queued/other generation kinds reserved', async t => {
  const { credits, normal, metering, store } = await setup(t, { paused: true })
  await credits.grant(normal.id, { amount: 1000, sourceKey: randomUUID(), reason: 'Recovery testing' })
  const orphan = randomUUID()
  await credits.reserve(normal.id, orphan, 'asset') // crash before storing operation pointer
  const missing = randomUUID()
  await metering.reserve(normal.id, missing, 'asset') // crash before storing job
  const interrupted = store.createJob(input, { ownerUserId: normal.id })
  await metering.reserve(normal.id, interrupted.id, 'asset')
  metering.started(interrupted.id)
  store.updateJob(interrupted.id, { status: 'generating' })
  const complete = store.createJob(input, { ownerUserId: normal.id })
  await metering.reserve(normal.id, complete.id, 'asset')
  store.updateJob(complete.id, { status: 'completed' }) // crash before capture
  const waiting = store.createJob(input, { ownerUserId: normal.id })
  await metering.reserve(normal.id, waiting.id, 'asset')
  metering.started(waiting.id)
  store.updateJob(waiting.id, { status: 'needs_input' })
  const queued = store.createJob(input, { ownerUserId: normal.id })
  await metering.reserve(normal.id, queued.id, 'asset')
  const project = randomUUID()
  await credits.reserve(normal.id, project, 'project')
  store.recoverInterrupted()
  await metering.recover()
  await metering.recover()
  assert.equal((await credits.reservation(orphan))!.state, 'refunded')
  assert.equal((await credits.reservation(store.creditOperation(missing)!.operationId))!.state, 'refunded')
  assert.equal((await credits.reservation(store.creditOperation(interrupted.id)!.operationId))!.state, 'refunded')
  assert.equal((await credits.reservation(store.creditOperation(complete.id)!.operationId))!.state, 'committed')
  assert.equal((await credits.reservation(store.creditOperation(waiting.id)!.operationId))!.state, 'committed')
  assert.equal(await metering.authorized(queued.id), true)
  assert.equal((await credits.reservation(project))!.state, 'reserved')
  assert.equal((await credits.summary(normal.id)).balance, 990)
})


test('idempotent job submissions and answers charge once and reject conflicting key reuse', async t => {
  const { credits, normal, request, store } = await setup(t, { paused: true })
  const key = randomUUID()
  const results = await Promise.all([request('/api/jobs', input, key), request('/api/jobs', input, key)])
  assert.deepEqual(results.map(result => result.status), [202, 202])
  assert.equal(results[0].body.job.id, results[1].body.job.id)
  assert.equal((await credits.summary(normal.id)).balance, 80)
  assert.equal((await request('/api/jobs', { ...input, notes: 'A different product' }, key)).status, 409)
  assert.equal((await credits.summary(normal.id)).balance, 80)
  const jobId = results[0].body.job.id
  store.updateJob(jobId, { status: 'needs_input', questions: ['Width?'] })
  const answerKey = randomUUID(), answer = { notes: 'The width is one meter' }
  const answers = await Promise.all([request(`/api/jobs/${jobId}/answers`, answer, answerKey), request(`/api/jobs/${jobId}/answers`, answer, answerKey)])
  assert.deepEqual(answers.map(result => result.status), [202, 202])
  assert.equal((await credits.summary(normal.id)).balance, 80, 'no-inference first attempt refunded and answer charged only once')
  assert.equal(store.getJob(jobId)!.input.notes!.match(/The width is one meter/g)?.length, 1)
  assert.equal((await request(`/api/jobs/${jobId}/answers`, { notes: 'Another answer' }, answerKey)).status, 409)
  await request(`/api/jobs/${jobId}/cancel`)
  const retryKey = randomUUID()
  const retries = await Promise.all([request(`/api/jobs/${jobId}/retry`, {}, retryKey), request(`/api/jobs/${jobId}/retry`, {}, retryKey)])
  assert.deepEqual(retries.map(result => result.status), [202, 202])
  assert.equal((await credits.summary(normal.id)).balance, 80)
})
