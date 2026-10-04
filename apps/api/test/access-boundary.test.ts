import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import type { Asset, Job, ReferenceImage } from '@t3-designer/asset-schema'
import type { User } from '../src/accounts.ts'
import { ReferenceLibrary } from '../src/references.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { ensureLibraryCapacity } from '../src/storage-capacity.ts'
import type { AssetWorker } from '../src/worker.ts'

type ApiOptions = Parameters<typeof createApi>[0]
const input = { url: 'https://example.com/product', notes: 'Private product notes' }
const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='

/** Exercise real HTTP routing and persistence with a deterministic session verifier.
 * No Better Auth server, Codex session, Blender process or external request is used. */
async function fixture(t: TestContext, config: Pick<ApiOptions, 'generation' | 'production'> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 't3-access-boundary-'))
  const store = new AssetStore(':memory:')
  const references = new ReferenceLibrary(directory)
  const sessions = new Map<string, User>([
    ['alice', { id: 'alice', role: 'admin', email: 'alice@example.test', name: 'Alice' }],
    ['bob', { id: 'bob', role: 'user', email: 'bob@example.test', name: 'Bob' }],
    ['outsider', { id: 'outsider', role: 'admin', email: 'outsider@example.test', name: 'Outsider' }],
  ])
  const projectId = randomUUID()
  const roles = new Map([[`${projectId}:alice`, 'owner'], [`${projectId}:bob`, 'viewer']])
  const workerState = { activeJobId: null as string | null, kicks: 0, cancelled: [] as string[] }
  const worker = {
    get activeJobId() { return workerState.activeJobId },
    kick: () => { workerState.kicks++ },
    cancel: (id: string) => { workerState.cancelled.push(id) },
  } as unknown as AssetWorker
  const options: ApiOptions = {
    ...config, store, worker, references,
    health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }),
    access: { authorize: async request => {
      const token = /(?:^|;\s*)test_session=([^;]+)/.exec(request.headers.cookie ?? '')?.[1]
      return token ? sessions.get(token) ?? null : null
    } },
    projects: { handle: async () => false, access: async (user, id) => roles.get(`${id}:${user.id}`) ?? null },
  }
  const server = createApi(options)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    store.close()
    await rm(directory, { recursive: true, force: true })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  options.publicOrigin = base
  function send(path: string, user: string | null, request: RequestInit = {}) {
    const headers = new Headers(request.headers)
    if (user) headers.set('Cookie', `test_session=${user}`)
    if (config.production && !headers.has('Origin')) headers.set('Origin', base)
    return fetch(base + path, { ...request, headers, signal: request.signal ?? AbortSignal.timeout(5000) })
  }
  const post = (path: string, user: string | null, body: unknown) => send(path, user, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  async function seed(userId: string) {
    const reference = await references.upload({ name: `${userId} private photo.png`, dataUrl: imageData })
    store.assignOwner('reference', reference.id, userId)
    const job = store.createJob({ ...input, notes: `${userId} private prompt`, referenceImageIds: [reference.id] }, { ownerUserId: userId })
    const assetId = randomUUID()
    const assetDirectory = join(directory, 'assets', assetId)
    await mkdir(assetDirectory, { recursive: true })
    for (const name of ['model.glb', 'preview.png', 'source.blend', 'manifest.json', 'request.json', 'review.json']) {
      await writeFile(join(assetDirectory, name), `${userId} ${name} test bytes`)
    }
    const file = (name: string) => `/api/assets/${assetId}/files/${name}`
    const asset: Asset = {
      id: assetId, jobId: job.id, label: `${userId} table`, kind: 'table', dimensions: [1, .75, .6],
      createdAt: new Date().toISOString(), fidelityStatus: 'draft', warnings: [`${userId} private findings`],
      source: { url: input.url, description: `${userId} private source`, dimensionalStatus: 'user-supplied' },
      referenceImages: [reference],
      files: { model: file('model.glb'), preview: file('preview.png'), blend: file('source.blend'), manifest: file('manifest.json'), request: file('request.json') },
    }
    store.completeJob(job.id, asset, assetDirectory)
    return { job, asset, reference }
  }
  return { base, directory, store, references, sessions, projectId, roles, workerState, send, post, seed }
}

async function status(response: Response, expected: number) {
  const body = await response.text()
  assert.equal(response.status, expected, body)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  return body
}

test('anonymous requests cannot reach any private resource, including files, actions and SSE', async t => {
  const f = await fixture(t)
  const a = await f.seed('alice')
  const attachment = f.store.attachAsset(f.projectId, a.asset)
  const routes: [string, string, unknown?][] = [
    ['GET', '/api/health'], ['GET', '/api/jobs'], ['POST', '/api/jobs', input],
    ['GET', `/api/jobs/${a.job.id}`], ['GET', `/api/jobs/${a.job.id}/events`], ['GET', `/api/jobs/${a.job.id}/events/stream`],
    ...['cancel', 'retry', 'answers'].map(action => ['POST', `/api/jobs/${a.job.id}/${action}`, {}] as [string, string, unknown]),
    ['GET', '/api/assets'], ['GET', `/api/assets/${a.asset.id}`], ['POST', `/api/assets/${a.asset.id}/revisions`, { feedback: 'Change color' }],
    ['GET', a.asset.files.model], ['HEAD', a.asset.files.model], ['GET', a.asset.files.manifest],
    ['POST', '/api/references', { name: 'test.png', dataUrl: imageData }], ['GET', `/api/references/${a.reference.id}`], ['GET', a.reference.url], ['HEAD', a.reference.url],
    ['GET', `/api/projects/${f.projectId}/assets`], ['POST', `/api/projects/${f.projectId}/assets`, { assetId: a.asset.id }], ['GET', attachment.url],
  ]
  for (const [method, path, body] of routes) {
    const response = body === undefined ? await f.send(path, null, { method }) : await f.post(path, null, body)
    await status(response, 401)
  }
  const live = await f.send('/api/live', null)
  assert.deepEqual(JSON.parse(await status(live, 200)), { status: 'ok' })
  assert.equal(f.workerState.kicks, 0)
})

test('two accounts only list their own content and cannot access or act on foreign resources', async t => {
  const f = await fixture(t, { generation: { enabled: true, userIds: ['bob'], dailyLimit: 20, globalDailyLimit: 40, pendingLimit: 10 } })
  const a = await f.seed('alice'), b = await f.seed('bob')
  for (const [user, own, foreign] of [['alice', a, b], ['bob', b, a]] as const) {
    const jobs = JSON.parse(await status(await f.send('/api/jobs', user), 200)) as { jobs: Job[] }
    const assets = JSON.parse(await status(await f.send('/api/assets', user), 200)) as { assets: Asset[] }
    assert.deepEqual(jobs.jobs.map(job => job.id), [own.job.id])
    assert.deepEqual(assets.assets.map(asset => asset.id), [own.asset.id])
    for (const path of [`/api/jobs/${foreign.job.id}`, `/api/jobs/${foreign.job.id}/events`, `/api/jobs/${foreign.job.id}/events/stream`,
      `/api/assets/${foreign.asset.id}`, foreign.asset.files.model, foreign.asset.files.blend, foreign.asset.files.manifest, foreign.asset.files.request,
      `/api/references/${foreign.reference.id}`, foreign.reference.url]) {
      await status(await f.send(path, user), 404)
    }
    for (const action of ['cancel', 'retry', 'answers']) await status(await f.post(`/api/jobs/${foreign.job.id}/${action}`, user, { notes: 'Mine now' }), 404)
    await status(await f.post(`/api/assets/${foreign.asset.id}/revisions`, user, { feedback: 'Revise foreign object' }), 404)
    assert.equal(f.store.getJob(foreign.job.id)?.status, 'completed')
    await status(await f.send(own.asset.files.model, user), 200)
    await status(await f.send(own.asset.files.model, user, { method: 'HEAD' }), 200)
    await status(await f.send(own.reference.url, user), 200)
  }
  // Global administration is not a shortcut into another account's library.
  await status(await f.send(a.asset.files.model, 'outsider'), 404)
  assert.equal(f.store.listJobs().length, 2)
  assert.equal(f.workerState.kicks, 0)
  assert.deepEqual(f.workerState.cancelled, [])
})

test('uploads belong to the authenticated account and foreign references cannot enter any generation path', async t => {
  const f = await fixture(t, { generation: { enabled: true, userIds: ['bob'], dailyLimit: 20, globalDailyLimit: 40, pendingLimit: 10 } })
  const a = await f.seed('alice'), b = await f.seed('bob')
  const uploaded = JSON.parse(await status(await f.post('/api/references', 'bob', { name: 'Mine.png', dataUrl: imageData, userId: 'alice', ownerUserId: 'alice' }), 201)) as { reference: ReferenceImage }
  assert.equal(f.store.owner('reference', uploaded.reference.id), 'bob')
  await status(await f.send(uploaded.reference.url, 'alice'), 404)
  await status(await f.send(uploaded.reference.url, 'bob'), 200)
  await status(await f.post('/api/jobs', 'bob', { ...input, referenceImageIds: [a.reference.id] }), 400)
  await status(await f.post(`/api/assets/${b.asset.id}/revisions`, 'bob', { feedback: 'New shape', referenceImageIds: [a.reference.id] }), 400)
  const waiting = f.store.createJob(input, { ownerUserId: 'bob' })
  f.store.updateJob(waiting.id, { status: 'needs_input', questions: ['Show a photo'] })
  await status(await f.post(`/api/jobs/${waiting.id}/answers`, 'bob', { notes: 'A photo', referenceImageIds: [a.reference.id] }), 400)
  assert.equal(f.store.getJob(waiting.id)?.status, 'needs_input')
  assert.equal(f.workerState.kicks, 0)
})

test('concurrent uploads reserve reference quota before writing and release it after completion', async t => {
  const f = await fixture(t)
  for (let index = 0; index < 99; index++) f.store.assignOwner('reference', randomUUID(), 'alice')
  const upload = f.references.upload.bind(f.references)
  let release = () => {}
  let started = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  f.references.upload = async value => {
    if (value.name === 'blocked.png') { started(); await gate }
    return upload(value)
  }
  const first = f.post('/api/references', 'alice', { name: 'blocked.png', dataUrl: imageData })
  try {
    await Promise.race([entered, first.then(() => { throw new Error('Expected the first upload to wait at the write barrier') })])
    await status(await f.post('/api/references', 'alice', { name: 'too-many.png', dataUrl: imageData }), 429)
    await status(await f.post('/api/references', 'bob', { name: 'independent.png', dataUrl: imageData }), 201)
    assert.equal(f.store.referenceCount('alice'), 99)
    release()
    await status(await first, 201)
    assert.equal(f.store.referenceCount('alice'), 100)
    assert.equal(f.store.referenceCount('bob'), 1)
    await status(await f.post('/api/references', 'alice', { name: 'still-full.png', dataUrl: imageData }), 429)
  } finally { release(); await first }
})

test('storage capacity rejection returns 507 and releases the upload reservation', async t => {
  const f = await fixture(t)
  const upload = f.references.upload.bind(f.references)
  const limited = new ReferenceLibrary(f.directory, { beforeSave: bytes => ensureLibraryCapacity(f.directory, 1, bytes) })
  f.references.upload = limited.upload.bind(limited)
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = JSON.parse(await status(await f.post('/api/references', 'alice', { name: 'full.png', dataUrl: imageData }), 507)) as { error: string }
    assert.equal(body.error, 'El taller alcanzó su límite de almacenamiento. Intentá de nuevo más tarde.')
    assert.equal(f.store.referenceCount('alice'), 0)
  }
  f.references.upload = upload
  await status(await f.post('/api/references', 'alice', { name: 'recovered.png', dataUrl: imageData }), 201)
  assert.equal(f.store.referenceCount('alice'), 1)
})

test('project viewers receive an attached model without the source library, photos or private metadata', async t => {
  const f = await fixture(t)
  const a = await f.seed('alice'), b = await f.seed('bob')
  const attached = JSON.parse(await status(await f.post(`/api/projects/${f.projectId}/assets`, 'alice', { assetId: a.asset.id }), 201)) as { asset: { id: string; url: string } }
  const listing = JSON.parse(await status(await f.send(`/api/projects/${f.projectId}/assets`, 'bob'), 200)) as { assets: Record<string, unknown>[] }
  assert.equal(listing.assets.length, 1)
  assert.deepEqual(Object.keys(listing.assets[0]).sort(), ['dimensions', 'id', 'label', 'projectId', 'url'])
  assert.equal(listing.assets[0].id, attached.asset.id)
  assert.equal(await status(await f.send(attached.asset.url, 'bob'), 200), 'alice model.glb test bytes')
  await status(await f.send(attached.asset.url, 'bob', { method: 'HEAD' }), 200)
  for (const name of ['source.blend', 'manifest.json', 'request.json', 'review.json', 'preview.png']) {
    await status(await f.send(attached.asset.url.replace('model.glb', name), 'bob'), 404)
  }
  for (const path of [a.asset.files.model, a.asset.files.manifest, a.reference.url, `/api/jobs/${a.job.id}/events`]) await status(await f.send(path, 'bob'), 404)
  await status(await f.post(`/api/projects/${f.projectId}/assets`, 'bob', { assetId: b.asset.id }), 403)
  await status(await f.post(`/api/projects/${f.projectId}/assets`, 'alice', { assetId: b.asset.id }), 404)
  await status(await f.send(attached.asset.url, 'outsider'), 404)
  const otherProject = randomUUID()
  f.roles.set(`${otherProject}:bob`, 'owner')
  await status(await f.send(attached.asset.url.replace(f.projectId, otherProject), 'bob'), 404)
  f.roles.delete(`${f.projectId}:bob`)
  await status(await f.send(attached.asset.url, 'bob'), 404)
  assert.equal(f.store.projectAssets(f.projectId).length, 1)
})

test('generation is disabled by default for creation, retry, answers and asset revisions, including admins', async t => {
  const f = await fixture(t)
  const a = await f.seed('alice')
  const failed = f.store.createJob(input, { ownerUserId: 'alice' })
  f.store.updateJob(failed.id, { status: 'failed' })
  const waiting = f.store.createJob(input, { ownerUserId: 'alice' })
  f.store.updateJob(waiting.id, { status: 'needs_input', questions: ['Which color?'] })
  await status(await f.post('/api/jobs', 'alice', input), 403)
  await status(await f.post(`/api/jobs/${failed.id}/retry`, 'alice', {}), 403)
  await status(await f.post(`/api/jobs/${waiting.id}/answers`, 'alice', { notes: 'Blue' }), 403)
  await status(await f.post(`/api/assets/${a.asset.id}/revisions`, 'alice', { feedback: 'Blue legs' }), 403)
  const health = JSON.parse(await status(await f.send('/api/health', 'alice'), 200))
  assert.equal(health.generationEnabled, false)
  assert.equal(f.store.getJob(failed.id)?.status, 'failed')
  assert.equal(f.store.getJob(waiting.id)?.status, 'needs_input')
  assert.equal(f.store.listJobs().length, 3)
  assert.equal(f.workerState.kicks, 0)
})

test('every retry and answer reserves a daily attempt, and denial leaves the existing job untouched', async t => {
  const f = await fixture(t, { generation: { enabled: true, dailyLimit: 2, globalDailyLimit: 10, pendingLimit: 10 } })
  const first = JSON.parse(await status(await f.post('/api/jobs', 'alice', input), 202)) as { job: Job }
  f.store.updateJob(first.job.id, { status: 'failed' })
  await status(await f.post(`/api/jobs/${first.job.id}/retry`, 'alice', {}), 202)
  f.store.updateJob(first.job.id, { status: 'needs_input', questions: ['Which dimensions?'] })
  const before = f.store.getJob(first.job.id)
  await status(await f.post(`/api/jobs/${first.job.id}/answers`, 'alice', { notes: 'One meter' }), 429)
  assert.deepEqual(f.store.getJob(first.job.id), before)
  await status(await f.post('/api/jobs', 'alice', input), 429)
  assert.equal(f.store.listJobs().length, 1)
  assert.equal(f.workerState.kicks, 2)
})

test('pending and global quotas cannot be bypassed by creating jobs from different accounts', async t => {
  const f = await fixture(t, { generation: { enabled: true, userIds: ['bob'], dailyLimit: 10, globalDailyLimit: 2, pendingLimit: 1 } })
  const alice = JSON.parse(await status(await f.post('/api/jobs', 'alice', input), 202)) as { job: Job }
  await status(await f.post('/api/jobs', 'alice', input), 429)
  const bob = JSON.parse(await status(await f.post('/api/jobs', 'bob', input), 202)) as { job: Job }
  f.store.updateJob(alice.job.id, { status: 'failed' })
  f.store.updateJob(bob.job.id, { status: 'failed' })
  await status(await f.post(`/api/jobs/${alice.job.id}/retry`, 'alice', {}), 429)
  await status(await f.post('/api/jobs', 'bob', input), 429)
  assert.equal(f.store.listJobs().length, 2)
  assert.equal(f.workerState.kicks, 2)
})

test('generation requires explicit user eligibility and health never exposes another owner’s active job', async t => {
  const f = await fixture(t, { generation: { enabled: true } })
  const job = f.store.createJob(input, { ownerUserId: 'alice' })
  f.workerState.activeJobId = job.id
  await status(await f.post('/api/jobs', 'bob', input), 403)
  const bob = JSON.parse(await status(await f.send('/api/health', 'bob'), 200))
  const alice = JSON.parse(await status(await f.send('/api/health', 'alice'), 200))
  assert.equal(bob.activeJobId, null)
  assert.equal(bob.generationEnabled, false)
  assert.equal(alice.activeJobId, job.id)
  assert.equal(alice.generationEnabled, true)
})

test('cross-origin and forged-host requests fail before reaching authenticated mutations', async t => {
  const f = await fixture(t, { production: true, generation: { enabled: true } })
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { Origin: f.base, 'Sec-Fetch-Site': 'cross-site' }]) {
    await status(await f.send('/api/jobs', 'alice', { headers }), 403)
  }
  // Direct fetch intentionally omits the harness's trusted Origin header.
  await status(await fetch(f.base + '/api/jobs', { method: 'POST', headers: { Cookie: 'test_session=alice', 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), 403)
  await status(await f.send('/api/jobs', 'alice', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), 403)
  const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(f.base + '/api/jobs', { headers: { Host: 'evil.example', Cookie: 'test_session=alice', Origin: f.base } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)) })
    request.once('error', reject)
    request.end()
  })
  assert.equal(hostileHost, 403)
  assert.equal(f.workerState.kicks, 0)
  await status(await f.post('/api/jobs', 'alice', input), 202)
})

test('an open SSE stream rechecks the session and stops before delivering post-revocation activity', async t => {
  const f = await fixture(t)
  const job = f.store.createJob(input, { ownerUserId: 'alice' })
  f.store.appendEvent(job.id, { kind: 'analysis', message: 'before-revocation-marker' })
  const response = await f.send(`/api/jobs/${job.id}/events/stream`, 'alice', { signal: AbortSignal.timeout(4000) })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let transcript = ''
  while (!transcript.includes('before-revocation-marker')) {
    const chunk = await reader.read()
    assert.equal(chunk.done, false)
    transcript += decoder.decode(chunk.value, { stream: true })
  }
  f.sessions.delete('alice')
  f.store.appendEvent(job.id, { kind: 'analysis', message: 'private-post-revocation-marker' })
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    transcript += decoder.decode(chunk.value, { stream: true })
  }
  assert.ok(!transcript.includes('private-post-revocation-marker'))
  await status(await f.send(`/api/jobs/${job.id}`, 'alice'), 401)
})
