import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import type { AssetPlan, AssetRequest, Job, JobEvent, VisualReview } from '@t3-designer/asset-schema'
import { acquireLibraryLock } from '../src/lock.ts'
import { runProcess } from '../src/process.ts'
import { ReferenceLibrary } from '../src/references.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { AssetWorker, type Planner, type ReferenceLoader, type Renderer, validateArtifacts } from '../src/worker.ts'

const input = { url: 'https://example.com/product', notes: '' }
const recipe: AssetRequest = {
  schemaVersion: 1, id: 'test-table', label: 'Test table', kind: 'table', units: 'meters',
  dimensions: [1.2, .75, .7], parameters: { topThickness: .04, legWidth: .06, legInset: .06 },
  material: { baseColor: '#664422', roughness: .5 },
  source: { url: input.url, description: 'Test product', dimensionalStatus: 'user-supplied' },
}
const ready: AssetPlan = { status: 'ready', label: recipe.label, summary: 'Ready', questions: [], warnings: ['Visual approximation'], recipe }
const planner: Planner = async () => structuredClone(ready)

const renderer: Renderer = async ({ inputPath, outputDirectory }) => {
  const request = JSON.parse(await readFile(inputPath, 'utf8'))
  await mkdir(outputDirectory, { recursive: true })
  const artifacts: Record<string, unknown> = {}
  for (const filename of ['model.glb', 'source.blend', 'preview.png', 'front.png', 'side.png', 'request.json']) {
    const data = filename === 'request.json' ? JSON.stringify(request) : `Test artifact ${filename}`
    await writeFile(join(outputDirectory, filename), data)
    artifacts[filename] = { path: filename, bytes: Buffer.byteLength(data), sha256: createHash('sha256').update(data).digest('hex') }
  }
  await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify({
    status: 'validated', id: request.id, units: 'meters', upAxis: '+Y', frontAxis: '+Z', origin: 'floor-center',
    dimensions: request.dimensions, validation: { errors: [] }, artifacts,
  }))
}

async function waitFor(store: AssetStore, id: string, status: Job['status']): Promise<Job> {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const job = store.getJob(id)!
    if (job.status === status) return job
    await delay(10)
  }
  throw new Error(`Expected ${status}; received ${JSON.stringify(store.getJob(id))}`)
}

async function workspace() { return mkdtemp(join(tmpdir(), 't3-api-test-')) }

const accepted: VisualReview = { verdict: 'accept', summary: 'Silhouette and dimensions reviewed.', issues: [], recipe: null, questions: [] }
const referenceLoader: ReferenceLoader = async () => ({ images: [{ path: '/tmp/reference.png', label: 'Product' }], references: [], warnings: [] })
const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='

test('visual review revises actual recipes, preserves candidates and publishes only the accepted last draft', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const materials: string[] = []
  const worker = new AssetWorker({ store, directory, planner, renderer, referenceLoader, reviewer: async (request, options) => {
    materials.push(request.material.baseColor)
    assert.equal(options.renderPaths.length, 3)
    for (const path of options.renderPaths) assert.ok((await stat(path)).isFile())
    if (options.iteration === 1) return { verdict: 'revise', summary: 'The tabletop is too dark.', issues: ['Lighten the wood'], questions: [], recipe: { ...request, material: { ...request.material, baseColor: '#aa8866' } } }
    return accepted
  } })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  const completed = await waitFor(store, job.id, 'completed')
  const asset = store.getAsset(completed.assetId!)!
  assert.deepEqual(materials, ['#664422', '#aa8866'])
  assert.equal(asset.asset.visualReview?.iterations, 2)
  assert.equal(asset.asset.visualReview?.verdict, 'accept')
  assert.equal(asset.asset.fidelityStatus, 'draft')
  assert.equal(store.listAssets().length, 1)
  assert.equal(JSON.parse(await readFile(join(asset.directory, 'request.json'), 'utf8')).material.baseColor, '#aa8866')
  const candidate = store.getCandidate(job.id)!
  assert.equal(candidate.iteration, 2)
  assert.equal(candidate.review?.verdict, 'accept')
  assert.notEqual(candidate.directory, asset.directory)
  assert.ok((await stat(candidate.directory.replace('/round-2/', '/round-1/'))).isDirectory())
  assert.equal(store.listEvents(job.id).filter((event) => event.kind === 'revision').length, 1)
  await worker.close()
  store.close()
  await rm(directory, { recursive: true })
})

test('visual revisions stop after three rounds and retain explicit unresolved differences', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  let reviews = 0
  const worker = new AssetWorker({ store, directory, planner, renderer, referenceLoader, reviewer: async (request) => {
    reviews++
    return { verdict: 'revise', summary: 'Shape still differs.', issues: ['Rounded edge remains approximate'], questions: [], recipe: { ...request, material: { ...request.material, roughness: reviews / 4 } } }
  } })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  const completed = await waitFor(store, job.id, 'completed')
  const asset = store.getAsset(completed.assetId!)!.asset
  assert.equal(reviews, 3)
  assert.equal(asset.visualReview?.iterations, 3)
  assert.equal(asset.visualReview?.verdict, 'revise')
  assert.equal(asset.fidelityStatus, 'draft')
  assert.ok(asset.warnings.some((warning) => /tres comparaciones/.test(warning)))
  assert.ok(asset.warnings.includes('Rounded edge remains approximate'))
  assert.deepEqual(completed.warnings, asset.warnings)
  assert.deepEqual(asset.visualReview?.issues, ['Rounded edge remains approximate'])
  assert.deepEqual(JSON.parse(await readFile(join(store.getAsset(asset.id)!.directory, 'review.json'), 'utf8')).issues, asset.visualReview?.issues)
  await worker.close()
  store.close()
  await rm(directory, { recursive: true })
})

test('missing images pauses generation; visual questions resume from the persistent candidate', async () => {
  const directory = await workspace()
  const store = new AssetStore(join(directory, 'library.sqlite'))
  let hasImages = false
  let renders = 0
  let reviews = 0
  let resumedRecipe: AssetRequest | undefined
  let previousFeedback = ''
  const worker = new AssetWorker({ store, directory, referenceLoader: async (...args) => hasImages ? referenceLoader(...args) : { images: [], references: [], warnings: ['No photos'] },
    planner: async (value, options) => {
      if (options.previous) { resumedRecipe = options.previous.recipe; previousFeedback = options.previous.feedback }
      return planner(value, options)
    }, renderer: async (options) => { renders++; await renderer(options) }, reviewer: async () => {
      reviews++
      return reviews === 1 ? { verdict: 'needs_input', summary: 'The feet are hidden.', issues: ['Missing side photo'], questions: ['Can you add a side view?'], recipe: null } : accepted
    },
  })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  await waitFor(store, job.id, 'needs_input')
  assert.equal(renders, 0)
  hasImages = true
  store.updateJob(job.id, { status: 'queued', input: { ...input, notes: 'Here is a front photo' } })
  worker.kick()
  await waitFor(store, job.id, 'needs_input')
  const candidate = store.getCandidate(job.id)!
  assert.ok((await stat(join(candidate.directory, 'preview.png'))).isFile())
  assert.equal(store.listAssets().length, 0)
  store.updateJob(job.id, { status: 'queued', input: { ...input, notes: 'The feet are black metal' } })
  worker.kick()
  await waitFor(store, job.id, 'completed')
  assert.deepEqual(resumedRecipe, recipe)
  assert.match(previousFeedback, /Missing side photo/)
  assert.match(previousFeedback, /black metal/)
  await worker.close()
  store.close()
  const reopened = new AssetStore(join(directory, 'library.sqlite'))
  assert.equal(reopened.getCandidate(job.id)?.review?.verdict, 'accept')
  reopened.close()
  await rm(directory, { recursive: true })
})

test('cancelling during visual comparison preserves validated candidate without publishing it', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  let reviewing = false
  const worker = new AssetWorker({ store, directory, planner, renderer, referenceLoader, reviewer: async (_request, { signal }) => {
    reviewing = true
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }))
    return accepted
  } })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  while (!reviewing) await delay(5)
  store.updateJob(job.id, { status: 'cancelled' })
  worker.cancel(job.id)
  await worker.close()
  assert.equal(store.getJob(job.id)?.status, 'cancelled')
  assert.equal(store.listAssets().length, 0)
  assert.ok((await stat(store.getCandidate(job.id)!.directory)).isDirectory())
  store.close()
  await rm(directory, { recursive: true })
})

test('reference uploads and feedback revisions preserve immutable originals and reject duplicate active revisions', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const references = new ReferenceLibrary(directory)
  let releaseRevision = () => {}
  const revisionGate = new Promise<void>((resolve) => { releaseRevision = resolve })
  let previous: Parameters<Planner>[1]['previous']
  const worker = new AssetWorker({ store, directory, renderer, referenceLoader: references.prepare.bind(references), reviewer: async () => ({
    ...accepted, summary: 'The prior shape is recognizable but remains a draft.', issues: ['The wood grain is still approximate.'],
  }),
    planner: async (_input, options) => {
      if (options.previous) {
        previous = options.previous
        await revisionGate
        return { ...structuredClone(ready), recipe: { ...structuredClone(recipe), material: { ...recipe.material, baseColor: '#aa8866' } } }
      }
      return structuredClone(ready)
    },
  })
  const server = createApi({ access: { authorize: async () => ({ id: 'test-owner', role: 'admin', name: 'Test', email: 'test@example.com' }) }, generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 200, pendingLimit: 20 }, store, worker, references, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const post = (path: string, data: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  try {
    assert.equal((await post('/api/references', { name: 'bad.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400)
    const upload = await post('/api/references', { name: 'Product front.png', dataUrl: imageData })
    assert.equal(upload.status, 201)
    const { reference } = await upload.json() as { reference: { id: string; name: string; url: string } }
    assert.equal((await fetch(base + `/api/references/${reference.id}`)).status, 200)
    const image = await fetch(base + reference.url)
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal((await fetch(base + reference.url, { headers: { Origin: 'https://evil.example' } })).status, 403)
    const unavailableId = '11111111-1111-4111-8111-111111111111'
    assert.equal((await post('/api/jobs', { ...input, referenceImageIds: [unavailableId] })).status, 400)
    assert.equal((await post('/api/jobs', { ...input, notes: 'x'.repeat(70_000) })).status, 413)
    const creation = await post('/api/jobs', { ...input, referenceImageIds: [reference.id] })
    const { job } = await creation.json() as { job: Job }
    const completed = await waitFor(store, job.id, 'completed')
    const original = store.getAsset(completed.assetId!)!
    const originalDocument = structuredClone(original.asset)
    const originalRequest = await readFile(join(original.directory, 'request.json'), 'utf8')
    assert.equal((await post(`/api/assets/${original.asset.id}/revisions`, { feedback: 'Lighter wood', referenceImageIds: [unavailableId] })).status, 400)
    const revision = await post(`/api/assets/${original.asset.id}/revisions`, { feedback: 'Please use lighter wood' })
    assert.equal(revision.status, 202)
    const child = await revision.json() as { job: Job }
    assert.equal(child.job.parentAssetId, original.asset.id)
    assert.equal(child.job.feedback, 'Please use lighter wood')
    assert.deepEqual(child.job.input.referenceImageIds, [reference.id])
    while (!previous) await delay(5)
    assert.match(previous.feedback, /lighter wood/)
    assert.match(previous.feedback, /prior shape is recognizable/)
    assert.match(previous.feedback, /wood grain is still approximate/)
    assert.deepEqual(previous.recipe, recipe)
    assert.equal(previous.renderPaths.length, 3)
    assert.equal((await post(`/api/assets/${original.asset.id}/revisions`, { feedback: 'Another revision' })).status, 409)
    releaseRevision()
    const revised = await waitFor(store, child.job.id, 'completed')
    const asset = store.getAsset(revised.assetId!)!
    assert.notEqual(asset.asset.id, original.asset.id)
    assert.equal(asset.asset.revision, 2)
    assert.equal(asset.asset.parentAssetId, original.asset.id)
    assert.deepEqual(asset.asset.referenceImages, [reference])
    assert.equal(store.listAssets().length, 2)
    assert.deepEqual(store.getAsset(original.asset.id)!.asset, originalDocument)
    assert.equal(await readFile(join(original.directory, 'request.json'), 'utf8'), originalRequest)
    assert.equal(JSON.parse(await readFile(join(asset.directory, 'request.json'), 'utf8')).material.baseColor, '#aa8866')
    assert.ok(store.listEvents(child.job.id).some((event) => event.kind === 'revision'))
  } finally {
    releaseRevision()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.close()
    store.close()
    await rm(directory, { recursive: true })
  }
})

test('SQLite preserves jobs and assets; restart only fails work that was running', async () => {
  const directory = await workspace()
  const path = join(directory, 'library.sqlite')
  let store = new AssetStore(path)
  const queued = store.createJob(input)
  const interrupted = store.createJob(input)
  const initialEvents = store.listEvents(interrupted.id)
  store.updateJob(interrupted.id, { status: 'generating' })
  store.close()
  store = new AssetStore(path)
  store.recoverInterrupted()
  assert.equal(store.getJob(queued.id)?.status, 'queued')
  assert.equal(store.getJob(interrupted.id)?.status, 'failed')
  assert.match(store.getJob(interrupted.id)!.error!, /reintentar/)
  assert.deepEqual(store.listEvents(interrupted.id).slice(0, 1), initialEvents)
  assert.equal(store.listEvents(interrupted.id).at(-1)?.kind, 'error')
  store.close()
  await rm(directory, { recursive: true })
})

test('activity is durable, bounded, sanitized and records distinct retry attempts', () => {
  const store = new AssetStore(':memory:')
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  let notifications = 0
  const unsubscribe = store.subscribe(job.id, () => { notifications++ })
  const first = store.appendEvent(job.id, {
    kind: 'source', message: 'Source\u0000\u001b[31m',
    detail: 'Bearer secret12345 api_key=private-secret sk-abcdefghijklmnopqrstuvwxyz https://user:secret@example.com/product?token=secret#secret',
    url: 'https://example.com/product?access_token=secret#fragment',
  })
  assert.equal(first.message, 'Source')
  assert.doesNotMatch(first.detail!, /secret|private|abcdefghijklmnopqrstuvwxyz/)
  assert.equal(first.url, input.url)
  assert.equal(first.attempt, 1)
  const retry = store.appendEvent(job.id, { kind: 'retry', message: 'Retry' })
  assert.equal(retry.attempt, 2)
  const answered = store.appendEvent(job.id, { kind: 'answer', message: 'Answered' })
  assert.equal(answered.attempt, 3)
  assert.deepEqual(store.listEvents(job.id, retry.seq), [answered])
  assert.equal(notifications, 3)
  unsubscribe()
  for (let index = 0; index < 510; index++) store.appendEvent(job.id, { kind: 'analysis', message: `Step ${index}`, detail: 'a'.repeat(9000) })
  const retained = store.listEvents(job.id)
  assert.equal(retained.length, 500)
  assert.equal(retained[0].message, 'Step 10')
  assert.equal(retained.at(-1)?.message, 'Step 509')
  assert.ok(retained.every((event) => event.attempt === 3 && event.detail!.length <= 4000))
  assert.ok(retained[0].seq > answered.seq)
  assert.equal(notifications, 3)
  store.close()
})

test('worker handles questions, cancellation and the next queued job without publishing cancelled output', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const seen: string[] = []
  const worker = new AssetWorker({ store, directory, renderer, planner: async (value, { signal }) => {
    seen.push(value.notes)
    if (value.notes === 'cancel') {
      await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }))
    }
    if (value.notes === 'question') return { ...ready, status: 'needs_input', questions: ['What dimensions?'], recipe: null }
    return structuredClone(ready)
  } })
  const cancelled = store.createJob({ ...input, notes: 'cancel' })
  const questions = store.createJob({ ...input, notes: 'question' })
  const completed = store.createJob({ ...input, notes: 'complete' })
  worker.kick()
  await waitFor(store, cancelled.id, 'analyzing')
  while (seen.length === 0) await delay(5)
  store.updateJob(cancelled.id, { status: 'cancelled' })
  worker.cancel(cancelled.id)
  await waitFor(store, completed.id, 'completed')
  assert.equal(store.getJob(cancelled.id)?.status, 'cancelled')
  assert.equal(store.getJob(questions.id)?.status, 'needs_input')
  assert.deepEqual(seen, ['cancel', 'question', 'complete'])
  assert.equal(store.listAssets().length, 1)
  assert.deepEqual(store.listAssets()[0].warnings, ['Visual approximation'])
  assert.equal(store.listAssets()[0].fidelityStatus, 'draft')
  assert.equal(store.listEvents(questions.id).at(-1)?.kind, 'question')
  assert.deepEqual(store.listEvents(completed.id).map((event) => event.kind), ['queued', 'analysis', 'plan', 'source', 'modeling', 'validation', 'complete'])
  await worker.close()
  store.close()
  await rm(directory, { recursive: true })
})

test('worker rejects tampered artifacts and never publishes partial models', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const worker = new AssetWorker({ store, directory, planner, renderer: async (options) => {
    await renderer(options)
    await writeFile(join(options.outputDirectory, 'model.glb'), 'tampered')
  } })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  await waitFor(store, job.id, 'failed')
  assert.equal(store.listAssets().length, 0)
  assert.match(store.getJob(job.id)!.error!, /inválido|integridad/)
  await worker.close()
  store.close()
  await rm(directory, { recursive: true })
})

test('worker checks capacity for duplicate publication files and retains the validated candidate on denial', async t => {
  const directory = await workspace(), store = new AssetStore(':memory:')
  let copyBytes = 0, settlements = 0
  const worker = new AssetWorker({ store, directory, planner, renderer,
    beforePublish: async bytes => { copyBytes = bytes; throw new Error('El taller alcanzó su límite de almacenamiento.') },
    onSettled: async () => { settlements++ },
  })
  t.after(async () => { await worker.close(); store.close(); await rm(directory, { recursive: true, force: true }) })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  await waitFor(store, job.id, 'failed')
  assert.ok(copyBytes > 0)
  assert.equal(store.listAssets().length, 0)
  assert.equal(settlements, 1)
  assert.match(store.getJob(job.id)!.error!, /límite de almacenamiento/)
  const candidate = store.getCandidate(job.id)!
  assert.ok((await stat(join(candidate.directory, 'source.blend'))).isFile())
  await assert.rejects(stat(join(directory, 'assets')), { code: 'ENOENT' })
})

test('asset publication and its completion event commit atomically', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const append = store.appendEvent.bind(store)
  store.appendEvent = (id, event, options) => {
    if (event.kind === 'complete') throw new Error('Simulated completion event failure')
    return append(id, event, options)
  }
  const worker = new AssetWorker({ store, directory, planner, renderer })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  worker.kick()
  await waitFor(store, job.id, 'failed')
  assert.equal(store.listAssets().length, 0)
  assert.equal(store.getJob(job.id)?.assetId, null)
  assert.ok(!store.listEvents(job.id).some((event) => event.kind === 'complete'))
  await worker.close()
  store.close()
  await rm(directory, { recursive: true })
})

test('shutdown marks active work interrupted while retaining the queue', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  let started = false
  const worker = new AssetWorker({ store, directory, renderer, planner: async (_input, { signal }) => {
    started = true
    await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }))
    return ready
  } })
  const active = store.createJob(input)
  const queued = store.createJob(input)
  worker.kick()
  while (!started) await delay(5)
  await worker.close()
  assert.equal(store.getJob(active.id)?.status, 'failed')
  assert.equal(store.getJob(queued.id)?.status, 'queued')
  store.close()
  await rm(directory, { recursive: true })
})

test('library lock rejects another instance and is reusable after clean shutdown', async () => {
  const directory = await workspace()
  const release = acquireLibraryLock(directory)
  assert.throws(() => acquireLibraryLock(directory), /Otro backend/)
  release()
  acquireLibraryLock(directory)()
  await rm(directory, { recursive: true })
})

test('queue capacity includes pending jobs older than the visible history window', () => {
  const store = new AssetStore(':memory:')
  for (let index = 0; index < 20; index++) store.createJob(input)
  for (let index = 0; index < 201; index++) {
    const job = store.createJob(input, { ownerUserId: 'test-owner' })
    store.updateJob(job.id, { status: 'failed' })
  }
  assert.equal(store.pendingCount(), 20)
  store.close()
})

test('process timeout and cancellation stop subprocesses promptly', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 50 }), /timed out/)
  const controller = new AbortController()
  const pending = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /cancelled/)
})

test('process emits only complete bounded lines and never exposes child output in errors', async () => {
  const lines: string[] = []
  await runProcess(process.execPath, ['-e', `
    process.stdout.write('first par');
    setTimeout(() => {
      process.stdout.write('t\\n' + 'x'.repeat(17000) + '\\n');
      process.stdout.write('final line');
    }, 10);
  `], { onStdoutLine: (line) => lines.push(line) })
  assert.deepEqual(lines, ['first part', 'final line'])
  await assert.rejects(runProcess(process.execPath, ['-e', "process.stderr.write('secret-auth-value'); process.exit(1)"]), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.doesNotMatch(error.message, /secret-auth-value/)
    assert.match(error.message, /Process failed/)
    return true
  })
})

test('API validates origins and URLs, resumes questions, serves completed files and persists the result', async () => {
  const directory = await workspace()
  const store = new AssetStore(join(directory, 'library.sqlite'))
  const worker = new AssetWorker({ store, directory, renderer, planner: async (value) => value.dimensions
    ? structuredClone(ready) : { ...ready, status: 'needs_input', questions: ['What are the dimensions?'], recipe: null } })
  const server = createApi({ access: { authorize: async () => ({ id: 'test-owner', role: 'admin', name: 'Test', email: 'test@example.com' }) }, generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 200, pendingLimit: 20 }, store, worker, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const post = (path: string, data: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  try {
    assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } })).status, 403)
    assert.equal((await post('/api/jobs', { ...input, url: 'http://127.0.0.1/private' })).status, 400)
    assert.equal((await fetch(base + '/api/jobs', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415)
    assert.equal(await new Promise<number>((resolve, reject) => {
      const req = request(base + '/api/health', { headers: { Host: 'attacker.example' } }, (res) => { res.resume(); resolve(res.statusCode!) })
      req.once('error', reject)
      req.end()
    }), 403)
    const response = await post('/api/jobs', { ...input, notes: 'Initial notes' })
    assert.equal(response.status, 202)
    const created = await response.json() as { job: Job }
    await waitFor(store, created.job.id, 'needs_input')
    const answer = await post(`/api/jobs/${created.job.id}/answers`, { notes: 'Measured now', dimensions: recipe.dimensions })
    assert.equal(answer.status, 202)
    const completed = await waitFor(store, created.job.id, 'completed')
    assert.match(completed.input.notes, /Initial notes/)
    assert.match(completed.input.notes, /Preguntas de la revisión anterior:\nWhat are the dimensions\?/)
    assert.match(completed.input.notes, /Respuesta del usuario:\nMeasured now/)
    const historyResponse = await fetch(base + `/api/jobs/${completed.id}/events`)
    const history = await historyResponse.json() as { events: JobEvent[] }
    assert.equal(historyResponse.status, 200)
    assert.ok(history.events.some((event) => event.kind === 'question' && event.attempt === 1))
    assert.ok(history.events.some((event) => event.kind === 'answer' && event.attempt === 2))
    assert.equal(history.events.at(-1)?.kind, 'complete')
    assert.equal(history.events.at(-1)?.attempt, 2)
    const asset = store.getAsset(completed.assetId!)!
    assert.equal((await fetch(base + asset.asset.files.model)).status, 200)
    assert.equal((await fetch(base + `/api/assets/${asset.asset.id}/files/backend.lock`)).status, 404)
    assert.equal((await fetch(base + `/api/assets/${asset.asset.id}/files/%2e%2e%2fbackend.lock`)).status, 404)
    assert.equal((await post(`/api/jobs/${completed.id}/retry`, {})).status, 409)
    await validateArtifacts(asset.directory, recipe)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.close()
    store.close()
    const reopened = new AssetStore(join(directory, 'library.sqlite'))
    assert.equal(reopened.listAssets().length, 1)
    assert.equal(reopened.listJobs()[0].status, 'completed')
    reopened.close()
    await rm(directory, { recursive: true })
  }
})

test('activity SSE replays a persistent cursor, streams new events and closes during shutdown', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const worker = new AssetWorker({ store, directory, planner, renderer })
  const server = createApi({ access: { authorize: async () => ({ id: 'test-owner', role: 'admin', name: 'Test', email: 'test@example.com' }) }, generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 200, pendingLimit: 20 }, store, worker, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  const first = store.listEvents(job.id)[0]
  const second = store.appendEvent(job.id, { kind: 'analysis', message: 'Reviewing' })
  const third = store.appendEvent(job.id, { kind: 'search', message: 'Searching' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  let received = ''
  let ended = false
  const stream = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const req = request(`${base}/api/jobs/${job.id}/events/stream?after=${first.seq}`, {
      headers: { 'Last-Event-ID': String(second.seq) },
    }, (response) => {
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => { received += chunk })
      response.once('end', () => { ended = true })
      resolve(response)
    })
    req.once('error', reject)
    req.end()
  })
  try {
    assert.equal(stream.statusCode, 200)
    assert.match(stream.headers['content-type']!, /text\/event-stream/)
    assert.equal((await fetch(`${base}/api/jobs/${job.id}/events/stream`, { headers: { Origin: 'https://evil.example' } })).status, 403)
    assert.equal((await fetch(`${base}/api/jobs/${job.id}/events?after=-1`)).status, 400)
    const fourth = store.appendEvent(job.id, { kind: 'plan', message: 'Plan ready' })
    const deadline = Date.now() + 2000
    while (!received.includes(`id: ${fourth.seq}\n`) && Date.now() < deadline) await delay(5)
    const events = received.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)) as JobEvent)
    assert.deepEqual(events.map((event) => event.seq), [third.seq, fourth.seq])
    assert.match(received, /event: activity/)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    while (!ended && Date.now() < deadline) await delay(5)
    assert.equal(ended, true)
    assert.doesNotThrow(() => store.appendEvent(job.id, { kind: 'validation', message: 'After shutdown' }))
  } finally {
    stream.destroy()
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.close()
    store.close()
    await rm(directory, { recursive: true })
  }
})

test('cancellation and retry retain activity from each attempt', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const worker = new AssetWorker({ store, directory, planner, renderer })
  const server = createApi({ access: { authorize: async () => ({ id: 'test-owner', role: 'admin', name: 'Test', email: 'test@example.com' }) }, generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 200, pendingLimit: 20 }, store, worker, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  const post = (action: string) => fetch(`http://127.0.0.1:${address.port}/api/jobs/${job.id}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  try {
    assert.equal((await post('cancel')).status, 200)
    assert.equal(store.listEvents(job.id).at(-1)?.kind, 'cancelled')
    assert.equal((await post('retry')).status, 202)
    await waitFor(store, job.id, 'completed')
    const events = store.listEvents(job.id)
    assert.ok(events.some((event) => event.kind === 'cancelled' && event.attempt === 1))
    assert.ok(events.some((event) => event.kind === 'retry' && event.attempt === 2))
    assert.equal(events.at(-1)?.kind, 'complete')
    assert.equal(events.at(-1)?.attempt, 2)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.close()
    store.close()
    await rm(directory, { recursive: true })
  }
})

test('a delayed cancellation body cannot overwrite a job that finishes during the request', async () => {
  const directory = await workspace()
  const store = new AssetStore(':memory:')
  const worker = new AssetWorker({ store, directory, planner, renderer })
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  store.updateJob(job.id, { status: 'generating' })
  const server = createApi({ access: { authorize: async () => ({ id: 'test-owner', role: 'admin', name: 'Test', email: 'test@example.com' }) }, generation: { enabled: true, dailyLimit: 100, globalDailyLimit: 200, pendingLimit: 20 }, store, worker, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`http://127.0.0.1:${address.port}/api/jobs/${job.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
      }, (response) => { response.resume(); resolve(response.statusCode!) })
      req.on('error', reject)
      server.once('request', () => {
        store.updateJob(job.id, { status: 'completed' })
        req.end('{}')
      })
      req.flushHeaders()
    })
    assert.equal(status, 409)
    assert.equal(store.getJob(job.id)?.status, 'completed')
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.close()
    store.close()
    await rm(directory, { recursive: true })
  }
})
