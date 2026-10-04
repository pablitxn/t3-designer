import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import type { Asset } from '@t3-designer/asset-schema'
import { AssetStore } from '../src/store.ts'
import { AssetWorker } from '../src/worker.ts'

const input = { url: 'https://example.com/product', notes: '' }
const question = { status: 'needs_input' as const, label: 'Example', summary: 'Need dimensions', questions: ['Width?'], warnings: [], recipe: null }

async function settled(worker: AssetWorker, store: AssetStore) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (!store.nextJob() && !worker.activeJobId) return
    await delay(5)
  }
  throw new Error('Worker did not drain its queue')
}

test('restarted queued jobs must pass current authorization before any reference, planner or renderer work', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-worker-access-'))
  const databasePath = join(directory, 'library.sqlite')
  const initial = new AssetStore(databasePath)
  const unowned = initial.createJob(input)
  const revoked = initial.createJob(input, { ownerUserId: 'revoked-user' })
  const suspended = initial.createJob(input, { ownerUserId: 'suspended-user' })
  const permitted = initial.createJob(input, { ownerUserId: 'permitted-user' })
  initial.close()
  const store = new AssetStore(databasePath)
  const checks: string[] = []
  const referenceJobs: string[] = []
  let plans = 0, renders = 0
  const allowedOwners = new Set(['permitted-user'])
  const worker = new AssetWorker({ store, directory,
    canProcess: async job => {
      checks.push(job.id)
      const owner = store.owner('job', job.id)
      return owner !== null && allowedOwners.has(owner)
    },
    referenceLoader: async (_input, workingDirectory) => {
      referenceJobs.push(workingDirectory)
      return { images: [], references: [], warnings: [] }
    },
    planner: async () => { plans++; return question },
    renderer: async () => { renders++ },
  })
  t.after(async () => { await worker.close(); store.close(); await rm(directory, { recursive: true, force: true }) })
  worker.kick()
  await settled(worker, store)
  for (const job of [unowned, revoked, suspended]) {
    assert.equal(store.getJob(job.id)?.status, 'failed')
    assert.match(store.getJob(job.id)?.error ?? '', /permiso/)
    assert.equal(store.listEvents(job.id).filter(event => event.kind === 'error').length, 1)
    assert.equal(store.listEvents(job.id).filter(event => event.kind === 'analysis').length, 0)
  }
  assert.equal(store.getJob(permitted.id)?.status, 'needs_input')
  assert.equal(plans, 1)
  assert.equal(renders, 0)
  assert.equal(referenceJobs.length, 1)
  assert.match(referenceJobs[0], new RegExp(permitted.id))
  assert.deepEqual((await readdir(join(directory, 'jobs'))).sort(), [permitted.id])
  assert.equal(checks.length, 4)
  assert.equal(new Set(checks).size, 4)
  // Another wakeup cannot spin on the denied queue entries.
  worker.kick()
  await settled(worker, store)
  assert.equal(checks.length, 4)
})

test('authorization lookup failures fail closed with a bounded public message', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-worker-access-'))
  const store = new AssetStore(':memory:')
  const job = store.createJob(input, { ownerUserId: 'alice' })
  let externalWork = 0
  const worker = new AssetWorker({ store, directory,
    canProcess: async () => { throw new Error('postgres://secret-password@private-host/database') },
    referenceLoader: async () => { externalWork++; return { images: [], references: [], warnings: [] } },
    planner: async () => { externalWork++; return question }, renderer: async () => { externalWork++ },
  })
  t.after(async () => { await worker.close(); store.close(); await rm(directory, { recursive: true, force: true }) })
  worker.kick()
  await settled(worker, store)
  assert.equal(store.getJob(job.id)?.status, 'failed')
  assert.match(store.getJob(job.id)?.error ?? '', /verificar el permiso/)
  assert.ok(!JSON.stringify(store.getJob(job.id)).includes('secret-password'))
  assert.ok(!JSON.stringify(store.listEvents(job.id)).includes('private-host'))
  assert.equal(externalWork, 0)
  assert.deepEqual(await readdir(directory), [])
})

test('cancelling while an asynchronous authorization check runs cannot restart the cancelled job', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-worker-access-'))
  const store = new AssetStore(':memory:')
  const job = store.createJob(input, { ownerUserId: 'alice' })
  let entered = () => {}, release = () => {}, plans = 0
  const checking = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const worker = new AssetWorker({ store, directory,
    canProcess: async () => { entered(); await gate; return true },
    planner: async () => { plans++; return question }, renderer: async () => {},
  })
  t.after(async () => { release(); await worker.close(); store.close(); await rm(directory, { recursive: true, force: true }) })
  worker.kick()
  await checking
  store.updateJob(job.id, { status: 'cancelled' })
  worker.cancel(job.id)
  release()
  await settled(worker, store)
  assert.equal(store.getJob(job.id)?.status, 'cancelled')
  assert.equal(plans, 0)
  assert.deepEqual(await readdir(directory), [])
})

test('the optional guard preserves the existing standalone worker contract', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-worker-access-'))
  const store = new AssetStore(':memory:')
  const job = store.createJob(input)
  let plans = 0
  const worker = new AssetWorker({ store, directory, planner: async () => { plans++; return question }, renderer: async () => {} })
  t.after(async () => { await worker.close(); store.close(); await rm(directory, { recursive: true, force: true }) })
  worker.kick()
  await settled(worker, store)
  assert.equal(store.getJob(job.id)?.status, 'needs_input')
  assert.equal(plans, 1)
})

test('legacy migration claims references across the full library beyond the 200-row UI window', () => {
  const store = new AssetStore(':memory:')
  const referenceIds: string[] = []
  const jobIds: string[] = []
  const assetIds: string[] = []
  try {
    for (let index = 0; index < 201; index++) {
      const jobReferenceId = randomUUID(), assetReferenceId = randomUUID()
      referenceIds.push(jobReferenceId, assetReferenceId)
      const job = store.createJob({ ...input, referenceImageIds: [jobReferenceId] })
      const id = randomUUID()
      const asset: Asset = {
        id, jobId: job.id, label: `Legacy object ${index}`, kind: 'table', dimensions: [1, .75, .6],
        createdAt: new Date().toISOString(), fidelityStatus: 'draft', warnings: [],
        source: { description: 'Legacy reference', dimensionalStatus: 'estimated' },
        referenceImages: [{ id: assetReferenceId, name: 'Reference.png', url: `/api/references/${assetReferenceId}/image` }],
        files: { model: '', preview: '', blend: '', manifest: '', request: '' },
      }
      store.completeJob(job.id, asset, `/nonexistent-test-library/${id}`)
      jobIds.push(job.id)
      assetIds.push(asset.id)
    }
    const otherReference = randomUUID()
    const otherJob = store.createJob({ ...input, referenceImageIds: [otherReference] }, { ownerUserId: 'bob' })
    store.assignOwner('reference', otherReference, 'bob')
    assert.equal(store.referenceCount('alice'), 0)
    store.claimLegacyLibrary('alice')
    assert.equal(store.userJobs('alice').length, 200)
    assert.equal(store.userAssets('alice').length, 200)
    for (const id of referenceIds) assert.equal(store.owner('reference', id), 'alice', id)
    for (const id of jobIds) assert.equal(store.owner('job', id), 'alice', id)
    for (const id of assetIds) assert.equal(store.owner('asset', id), 'alice', id)
    assert.equal(store.referenceCount('alice'), 402)
    assert.equal(store.owner('job', otherJob.id), 'bob')
    assert.equal(store.owner('reference', otherReference), 'bob')
    store.claimLegacyLibrary('alice')
    assert.equal(store.referenceCount('alice'), 402)
    assert.equal(store.owner('reference', otherReference), 'bob')
  } finally { store.close() }
})
