import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import type { AssetRequest } from '@t3-designer/asset-schema'
import { AssetStore } from '../src/store.ts'
import { GenerationTelemetry, installTelemetry, recordCreditTrace } from '../src/telemetry.ts'
import { beginUsageCall, UsageStore } from '../src/usage.ts'
import { AssetWorker, type Renderer } from '../src/worker.ts'

const privateText = 'DO-NOT-EXPORT-private-customer-details'
const input = { url: `https://example.com/${privateText}`, notes: privateText }
const recipe: AssetRequest = {
  schemaVersion: 1, id: 'trace-table', label: privateText, kind: 'table', units: 'meters',
  dimensions: [1.2, .75, .7], parameters: { topThickness: .04, legWidth: .06, legInset: .06 },
  material: { baseColor: '#664422', roughness: .5 },
  source: { url: input.url, description: privateText, dimensionalStatus: 'user-supplied' },
}

const renderer: Renderer = async ({ inputPath, outputDirectory, onEvent }) => {
  const request = JSON.parse(await readFile(inputPath, 'utf8'))
  await mkdir(outputDirectory, { recursive: true })
  onEvent?.({ kind: 'render', message: privateText, detail: privateText })
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

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 't3-worker-tracing-'))
  const exporter = new InMemorySpanExporter()
  const telemetry = new GenerationTelemetry({ exporter, serviceName: 't3-designer-api', environment: 'test', version: 'test' })
  const restore = installTelemetry(telemetry)
  const store = new AssetStore(':memory:'), usage = new UsageStore(':memory:')
  const job = store.createJob(input, { ownerUserId: 'test-owner' })
  const operationId = randomUUID()
  store.setCreditOperation(job.id, operationId)
  usage.operation({ id: operationId, userId: 'test-owner', kind: 'asset', jobId: job.id, runId: null, projectId: null, projectLabel: null, assetId: null, attempt: 1, parentId: null })
  const onSettled = async () => {
    const status = store.getJob(job.id)!.status
    usage.settleOperation(operationId, status === 'completed' ? 'succeeded' : status === 'needs_input' ? 'needs_input' : 'failed')
    const refunded = status !== 'completed'
    const now = new Date().toISOString()
    recordCreditTrace({ id: operationId, kind: 'asset', amount: 20, state: refunded ? 'refunded' : 'committed', createdAt: now, updatedAt: now }, refunded ? 20 : 0)
  }
  let worker: AssetWorker | undefined
  t.after(async () => {
    await worker?.close()
    restore()
    await telemetry.shutdown()
    usage.close(); store.close()
    await rm(directory, { recursive: true, force: true })
  })
  return { store, usage, job, exporter, telemetry,
    worker: (options: Partial<ConstructorParameters<typeof AssetWorker>[0]> = {}) => {
      worker = new AssetWorker({ store, usage, directory, onSettled,
        planner: async (_input, callbacks) => {
          callbacks.onInference?.()
          callbacks.onEvent?.({ kind: 'analysis', message: privateText })
          const call = beginUsageCall('openai', { usageStage: 'analysis' }, 'gpt-test')
          call?.observe({ input_tokens: 12, output_tokens: 4 }, 'gpt-test')
          call?.finish('succeeded')
          return { status: 'ready', label: privateText, summary: privateText, questions: [], warnings: [], recipe: structuredClone(recipe) }
        },
        renderer,
        referenceLoader: async (_input, _directory, callbacks) => {
          callbacks.onEvent?.({ kind: 'source', message: privateText, url: input.url })
          return { images: [{ path: `/tmp/${privateText}.png`, label: privateText }], references: [], warnings: [] }
        },
        reviewer: async (request, options) => {
          const call = beginUsageCall('openai', { usageStage: 'review', usageIteration: options.iteration }, 'gpt-test')
          call?.observe({ input_tokens: 8, output_tokens: 2 }, 'gpt-test')
          call?.finish('succeeded')
          return options.iteration === 1
            ? { verdict: 'revise', summary: privateText, issues: [privateText], questions: [], recipe: { ...request, material: { ...request.material, roughness: .6 } } }
            : { verdict: 'accept', summary: privateText, issues: [], questions: [], recipe: null }
        },
        ...options,
      })
      return worker
    },
  }
}

async function drained(worker: AssetWorker, store: AssetStore) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (!worker.activeJobId && !store.nextJob()) return
    await delay(5)
  }
  throw new Error('Worker did not settle')
}

test('asset traces retain model and rendering iteration hierarchy without exporting customer content', async t => {
  const { store, job, exporter, telemetry, worker: createWorker } = await setup(t)
  const worker = createWorker()
  worker.kick()
  await drained(worker, store)
  assert.equal(store.getJob(job.id)?.status, 'completed')
  await telemetry.forceFlush()
  const spans = exporter.getFinishedSpans()
  const root = spans.find(span => !span.parentSpanContext)
  assert.ok(root)
  assert.ok(spans.every(span => span.spanContext().traceId === root.spanContext().traceId))
  const byName = (name: string) => spans.filter(span => span.name === name)
  assert.equal(byName('asset.references').length, 1)
  assert.equal(byName('asset.plan').length, 1)
  assert.equal(byName('asset.publish').length, 1)
  assert.deepEqual(byName('asset.render').map(span => span.attributes['t3.iteration']), [1, 2])
  assert.deepEqual(byName('asset.review').map(span => span.attributes['t3.iteration']), [1, 2])
  assert.equal(byName('asset.validate').length, 3)
  const publish = byName('asset.publish')[0]
  const finalValidation = byName('asset.validate').find(span => span.attributes['t3.artifact.published'] === true)
  assert.equal(finalValidation?.parentSpanContext?.spanId, publish.spanContext().spanId)
  for (const stage of [...byName('asset.plan'), ...byName('asset.review')]) {
    assert.equal(spans.filter(span => span.parentSpanContext?.spanId === stage.spanContext().spanId
      && span.attributes['openinference.span.kind'] === 'LLM').length, 1)
  }
  const exported = JSON.stringify(spans.map(span => ({ name: span.name, attributes: span.attributes, events: span.events, status: span.status })))
  assert.ok(!exported.includes(privateText))
  assert.ok(spans.some(span => span.events.some(event => event.name === 'agent.activity')))
})

test('reference failure still closes the operation and records the failed stage without exporting the error', async t => {
  const { store, job, exporter, telemetry, worker: createWorker } = await setup(t)
  const worker = createWorker({ referenceLoader: async () => { throw new Error(privateText) } })
  worker.kick()
  await drained(worker, store)
  assert.equal(store.getJob(job.id)?.status, 'needs_input')
  await telemetry.forceFlush()
  const spans = exporter.getFinishedSpans()
  const reference = spans.find(span => span.name === 'asset.references')
  assert.ok(reference)
  assert.equal(reference.status.code, 2)
  assert.ok(spans.some(span => !span.parentSpanContext))
  assert.equal(spans.filter(span => span.name === 'asset.plan').length, 0)
  assert.ok(!JSON.stringify(spans.map(span => ({ attributes: span.attributes, events: span.events, status: span.status }))).includes(privateText))
})
