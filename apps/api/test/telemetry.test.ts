import assert from 'node:assert/strict'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import { SpanStatusCode } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { InMemorySpanExporter, type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace-base'
import { configureTelemetry, GenerationTelemetry, installTelemetry, isTelemetryEnabled, recordCreditTrace, recordOperationTrace, telemetryConfig, traceEvent, traceStep } from '../src/telemetry.ts'
import { beginUsageCall, invalidateUsageCall, UsageStore, withUsage, type UsageOperationMetadata } from '../src/usage.ts'

const privateText = 'private-prompt-address-file-and-token'
const metadata = (id: string): UsageOperationMetadata => ({ id, userId: privateText, kind: 'asset', projectId: 'project-fixture', projectLabel: privateText,
  jobId: id, runId: null, assetId: null, attempt: 1, parentId: null })
const reservation = (id: string, state: 'reserved' | 'committed' | 'refunded' = 'reserved') => ({ id, kind: 'asset', amount: 20, state,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })

function fixture(t: TestContext, sink?: SpanExporter) {
  const exporter = new InMemorySpanExporter(), runtime = new GenerationTelemetry({ exporter: sink ?? exporter, serviceName: 't3-unit', environment: 'test', version: 'fixture' })
  const restore = installTelemetry(runtime), usage = new UsageStore(':memory:')
  t.after(async () => { restore(); await runtime.shutdown(); usage.close() })
  return { runtime, exporter, usage,
    start(id: string) { recordCreditTrace(reservation(id)); usage.operation(metadata(id)) },
    settle(id: string, outcome: 'succeeded' | 'failed' = 'succeeded') {
      usage.settleOperation(id, outcome)
      recordCreditTrace(reservation(id, outcome === 'succeeded' ? 'committed' : 'refunded'), outcome === 'failed' ? 20 : undefined)
    },
  }
}
const llms = (spans: ReadableSpan[]) => spans.filter(span => span.attributes['openinference.span.kind'] === 'LLM')
const serialized = (spans: ReadableSpan[]) => JSON.stringify(spans.map(span => ({ name: span.name, attributes: span.attributes, events: span.events, status: span.status })))

test('tracing is opt-in and validates endpoints, service identity and resource allowlist', () => {
  assert.equal(telemetryConfig({}), null)
  assert.equal(telemetryConfig({ OTEL_SDK_DISABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'invalid' }), null)
  const configured = telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example/otel/', NODE_ENV: 'production',
    OTEL_SERVICE_NAME: 't3-fixture', OTEL_SERVICE_VERSION: 'v1.2.3', OTEL_RESOURCE_ATTRIBUTES: `cluster=fixture,k8s.namespace.name=t3,k8s.pod.name=t3-1,user.email=${privateText}` })!
  assert.equal(configured.endpoint, 'https://collector.example/otel/v1/traces')
  assert.equal(configured.serviceName, 't3-fixture'); assert.equal(configured.environment, 'prod'); assert.equal(configured.version, 'v1.2.3')
  assert.deepEqual(configured.resources, { cluster: 'fixture', 'k8s.namespace.name': 't3', 'k8s.pod.name': 't3-1' })
  for (const endpoint of ['http://collector.example/v1/traces', 'https://user:secret@collector.example/v1/traces', 'https://collector.example/?secret=1', 'https://collector.example/#secret', 'file:///tmp/traces']) {
    assert.throws(() => telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }))
  }
  assert.throws(() => telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example', OTEL_SERVICE_NAME: 'Private user name' }))
  for (const endpoint of ['http://localhost:4318', 'http://127.0.0.1:4318', 'http://[::1]:4318']) assert.ok(telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }))
})

test('trace-specific endpoint and encoded authentication headers override generic settings', () => {
  const config = telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://generic.example/base', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://traces.example/custom',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%20generic,X-Generic=1', OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'Authorization=Bearer%20fixture%3Dtoken,X-Trace=2', T3_TELEMETRY_ENVIRONMENT: 'qa' })!
  assert.equal(config.endpoint, 'https://traces.example/custom'); assert.equal(config.environment, 'qa')
  assert.deepEqual(config.headers, { Authorization: 'Bearer fixture=token', 'X-Trace': '2' })
  assert.deepEqual(telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=secret', OTEL_EXPORTER_OTLP_TRACES_HEADERS: '' })!.headers, {})
  assert.throws(() => telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example', OTEL_EXPORTER_OTLP_HEADERS: 'broken-header' }))
  assert.throws(() => telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=%not-encoded' }))
})

test('invalid configuration and disabled tracing leave application work untouched without leaking configuration', async t => {
  const restore = installTelemetry(); t.after(restore)
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: string) => { warnings.push(message) })
  assert.equal(isTelemetryEnabled(), false)
  assert.equal(configureTelemetry({ OTEL_EXPORTER_OTLP_ENDPOINT: `https://collector.example/?token=${privateText}` }), undefined)
  assert.equal(configureTelemetry({}), undefined)
  let calls = 0
  assert.equal(await traceStep('disabled.work', async () => ++calls), 1)
  assert.equal(calls, 1); assert.equal(isTelemetryEnabled(), false)
  assert.equal(warnings.length, 1); assert.ok(!warnings.join(' ').includes(privateText))
})

test('unknown and partial token usage stay unknown instead of becoming zero totals', async t => {
  const f = fixture(t); f.start('missing-usage')
  await withUsage(f.usage, 'missing-usage', async () => {
    beginUsageCall('openai', { usageStage: 'generation' }, 'gpt-fixture')!.finish('succeeded')
    const partial = beginUsageCall('openai', { usageStage: 'review' }, 'gpt-fixture')!
    partial.observe({ input_tokens: 30, input_tokens_details: { cached_tokens: 10 } }); partial.finish('succeeded')
  })
  f.settle('missing-usage'); await f.runtime.forceFlush()
  const [unknown, partial] = llms(f.exporter.getFinishedSpans())
  assert.equal(unknown.attributes['t3.measurement'], 'unknown')
  assert.ok(!Object.keys(unknown.attributes).some(key => key.startsWith('llm.token_count.')))
  assert.equal(partial.attributes['t3.measurement'], 'partial')
  assert.equal(partial.attributes['llm.token_count.prompt'], 30)
  assert.equal(partial.attributes['llm.token_count.prompt_details.cache_read'], 10)
  assert.equal(partial.attributes['llm.token_count.completion'], undefined)
  assert.equal(partial.attributes['llm.token_count.total'], undefined)
})

test('token breakdowns are subsets, repeated usage is deduplicated and local subscriptions stay distinct', async t => {
  const f = fixture(t); f.start('known-usage')
  await withUsage(f.usage, 'known-usage', async () => {
    const hosted = beginUsageCall('openai', {}, 'gpt-requested')!
    const observed = { input_tokens: 100, output_tokens: 40, input_tokens_details: { cached_tokens: 70, cache_write_tokens: 5 }, output_tokens_details: { reasoning_tokens: 25 }, private: privateText }
    hosted.observe(observed, 'gpt-effective'); hosted.observe(observed, 'gpt-effective'); hosted.finish('succeeded')
    const local = beginUsageCall('codex-local', {}, 'gpt-fixture')!
    local.observe({ input_tokens: 12, output_tokens: 3, cached_input_tokens: 7 }); local.finish('succeeded')
  })
  f.settle('known-usage'); await f.runtime.forceFlush()
  const [hosted, local] = llms(f.exporter.getFinishedSpans())
  assert.equal(hosted.attributes['llm.token_count.total'], 140)
  assert.equal(hosted.attributes['llm.token_count.prompt_details.cache_read'], 70)
  assert.equal(hosted.attributes['llm.token_count.prompt_details.cache_write'], 5)
  assert.equal(hosted.attributes['llm.token_count.completion_details.reasoning'], 25)
  assert.equal(hosted.attributes['llm.model_name'], 'gpt-effective')
  assert.equal(hosted.attributes['t3.billing.mode'], 'api'); assert.equal(local.attributes['t3.billing.mode'], 'subscription')
  assert.equal(local.attributes['llm.token_count.total'], 15)
  assert.equal(local.attributes['llm.provider'], undefined)
  assert.ok(!serialized(f.exporter.getFinishedSpans()).includes(privateText))
})

test('application validation can invalidate a completed provider call without losing its tokens or duration', async t => {
  const f = fixture(t); f.start('invalid-result')
  let providerEnd: string | null = null
  await withUsage(f.usage, 'invalid-result', async () => {
    await traceStep('model.turn', async () => {
      const call = beginUsageCall('openai', {}, 'gpt-fixture')!
      call.observe({ input_tokens: 10, output_tokens: 4 }); call.finish('succeeded')
      providerEnd = f.usage.calls('invalid-result')[0].endedAt
    })
    await delay(5); invalidateUsageCall()
  })
  f.settle('invalid-result', 'failed'); await f.runtime.forceFlush()
  const call = llms(f.exporter.getFinishedSpans())[0]
  assert.equal(call.attributes['t3.call.status'], 'invalid'); assert.equal(call.status.code, SpanStatusCode.ERROR)
  assert.equal(call.attributes['llm.token_count.total'], 14)
  assert.equal(f.usage.calls('invalid-result')[0].endedAt, providerEnd)
  assert.equal(Math.round(call.endTime[0] * 1000 + call.endTime[1] / 1e6), Date.parse(providerEnd!))
})

test('concurrent operations and nested usage scopes preserve their own stage parents', async t => {
  const f = fixture(t), ids = ['parallel-a', 'parallel-b']
  for (const id of ids) f.start(id)
  let entered = 0, release!: () => void
  const bothEntered = new Promise<void>(resolve => { release = resolve })
  await Promise.all(ids.map(id => withUsage(f.usage, id, () => traceStep(`${id}.stage`, async () => {
    entered++; if (entered === 2) release()
    await bothEntered
    await withUsage(f.usage, id, async () => {
      const call = beginUsageCall('openai', {}, 'gpt-fixture')!
      await delay(id === 'parallel-a' ? 3 : 1); call.observe({ input_tokens: 2, output_tokens: 1 }); call.finish('succeeded')
    })
    traceEvent('stage.complete', { 't3.iteration': 1, 'input.value': privateText })
  }))))
  for (const id of ids) f.settle(id)
  await f.runtime.forceFlush()
  const spans = f.exporter.getFinishedSpans(), roots = spans.filter(span => span.attributes['openinference.span.kind'] === 'AGENT')
  assert.equal(roots.length, 2); assert.notEqual(roots[0].spanContext().traceId, roots[1].spanContext().traceId)
  for (const id of ids) {
    const root = roots.find(span => span.attributes['t3.operation.id'] === id)!
    const stage = spans.find(span => span.name === `${id}.stage`)!
    const call = llms(spans).find(span => span.spanContext().traceId === root.spanContext().traceId)!
    assert.equal(stage.parentSpanContext!.spanId, root.spanContext().spanId)
    assert.equal(call.parentSpanContext!.spanId, stage.spanContext().spanId)
    assert.equal(stage.events[0].attributes?.['t3.iteration'], 1)
  }
  assert.ok(!serialized(spans).includes(privateText))
})

test('synchronous throws, rejected promises and tracer setup failures never execute work twice', async t => {
  const f = fixture(t); f.start('single-execution')
  let synchronous = 0, rejected = 0, fallback = 0
  const failure = new Error(privateText)
  await withUsage(f.usage, 'single-execution', async () => {
    await assert.rejects(traceStep('work.sync', () => { synchronous++; throw failure }), error => error === failure)
    await assert.rejects(traceStep('work.async', async () => { rejected++; throw failure }), error => error === failure)
    const broken = t.mock.method(f.runtime, 'step', () => { throw new Error('Tracer setup failed') })
    assert.equal(await traceStep('work.fallback', async () => ++fallback), 1)
    broken.mock.restore()
  })
  f.settle('single-execution', 'failed'); await f.runtime.forceFlush()
  assert.deepEqual([synchronous, rejected, fallback], [1, 1, 1])
  assert.ok(f.exporter.getFinishedSpans().filter(span => span.name.startsWith('work.')).every(span => span.status.code === SpanStatusCode.ERROR))
  assert.ok(!serialized(f.exporter.getFinishedSpans()).includes(privateText))
})

test('settled historical operations do not create new traces when metadata or links are revisited', async t => {
  const f = fixture(t); f.start('terminal-operation')
  f.usage.linkJob('terminal-operation', 'parent-operation'); f.usage.linkAsset('terminal-operation', 'asset-fixture')
  f.settle('terminal-operation'); await f.runtime.forceFlush()
  const root = f.exporter.getFinishedSpans()[0]
  assert.equal(root.attributes['t3.parent.id'], 'parent-operation')
  assert.equal(root.attributes['t3.asset.id'], 'asset-fixture')
  f.usage.traceOperation('terminal-operation')
  recordOperationTrace({ ...metadata('terminal-operation'), status: 'succeeded' }, true)
  f.usage.linkAsset('terminal-operation', 'asset-fixture')
  await withUsage(f.usage, 'terminal-operation', () => traceStep('historical.read', async () => 42))
  await f.runtime.forceFlush()
  assert.equal(f.exporter.getFinishedSpans().length, 1)
})

test('a failing exporter cannot fail application work or expose exporter secrets', async t => {
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: string) => { warnings.push(message) })
  let exports = 0, shutdowns = 0
  const f = fixture(t, { export(_spans, callback) { exports++; if (exports === 1) throw new Error(privateText); callback({ code: 1, error: new Error(privateText) }) },
    async shutdown() { shutdowns++ } })
  for (const id of ['export-failure-one', 'export-failure-two']) {
    f.start(id)
    assert.equal(await withUsage(f.usage, id, () => traceStep('application.work', async () => 42)), 42)
    f.settle(id); await f.runtime.forceFlush()
  }
  await f.runtime.shutdown()
  assert.equal(exports, 2); assert.equal(shutdowns, 1)
  assert.equal(warnings.length, 1); assert.ok(!warnings.join(' ').includes(privateText))
})

test('shutdown exports unfinished operations and model calls as interrupted exactly once', async t => {
  const spans: ReadableSpan[] = []; let shutdowns = 0
  const f = fixture(t, { export(batch, callback) { spans.push(...batch); callback({ code: 0 }) }, async shutdown() { shutdowns++ } })
  f.start('interrupted-operation')
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const work = withUsage(f.usage, 'interrupted-operation', () => traceStep('unfinished.stage', async () => {
    beginUsageCall('openai', {}, 'gpt-fixture')!.observe({ input_tokens: 7 })
    await pending
  }))
  await f.runtime.shutdown(); await f.runtime.shutdown()
  assert.equal(spans.length, 3); assert.equal(shutdowns, 1)
  for (const span of spans) {
    assert.equal(span.attributes['t3.operation.status'], 'interrupted')
    assert.equal(span.status.code, SpanStatusCode.ERROR)
  }
  assert.equal(llms(spans)[0].attributes['llm.token_count.prompt'], 7)
  assert.equal(llms(spans)[0].attributes['llm.token_count.total'], undefined)
  release(); await work
  assert.equal(spans.length, 3, 'late stage completion cannot emit a duplicate span')
  assert.equal(isTelemetryEnabled(), false)
})

test('an exporter that never shuts down cannot hold application shutdown beyond the deadline', async t => {
  const f = fixture(t, { export(_batch, callback) { callback({ code: 0 }) }, shutdown: () => new Promise<void>(() => {}) })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let completed = false
  const shutdown = f.runtime.shutdown().then(() => { completed = true })
  t.mock.timers.tick(4999); await Promise.resolve()
  assert.equal(completed, false)
  t.mock.timers.tick(1); await shutdown
  assert.equal(completed, true)
  assert.equal(isTelemetryEnabled(), false)
})

test('the delivery smoke trace is synthetic and carries no invented credits or token usage', async t => {
  const f = fixture(t), diagnostic = await f.runtime.smoke()
  await f.runtime.forceFlush()
  const spans = f.exporter.getFinishedSpans(), root = spans.find(span => span.attributes['t3.synthetic'] === true)!
  assert.equal(spans.length, 2); assert.ok(root)
  assert.equal(root.attributes['t3.operation.id'], diagnostic.operationId)
  assert.equal(root.spanContext().traceId, diagnostic.traceId)
  assert.equal(spans.find(span => span.name === 'telemetry.export.verify')!.parentSpanContext!.spanId, root.spanContext().spanId)
  for (const span of spans) assert.ok(!Object.keys(span.attributes).some(key => key.startsWith('t3.credits.') || key.startsWith('llm.token_count.')))
})

type OtlpAttribute = { key: string; value: { stringValue?: string; intValue?: string | number; boolValue?: boolean } }
type OtlpSpan = { name: string; traceId: string; spanId: string; parentSpanId?: string; attributes: OtlpAttribute[] }
const attributes = (values: OtlpAttribute[]) => Object.fromEntries(values.map(({ key, value }) => [key, value.stringValue ?? value.intValue ?? value.boolValue]))

test('the real OTLP HTTP exporter delivers a correlated token trace and configured authentication to a local receiver', async t => {
  const received: { path: string | undefined; headers: IncomingHttpHeaders; body: string }[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    received.push({ path: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const config = telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${address.port}`, OTEL_SERVICE_NAME: 't3-local-delivery',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%20generic', OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'Authorization=Bearer%20local-fixture' })!
  const runtime = new GenerationTelemetry({ ...config, exporter: new OTLPTraceExporter({ url: config.endpoint, headers: config.headers, timeoutMillis: 1000 }) })
  const restore = installTelemetry(runtime), usage = new UsageStore(':memory:')
  t.after(async () => { restore(); await runtime.shutdown(); usage.close(); await new Promise<void>(resolve => server.close(() => resolve())) })
  assert.equal(isTelemetryEnabled(), true)
  recordCreditTrace(reservation('http-delivery')); usage.operation(metadata('http-delivery'))
  await withUsage(usage, 'http-delivery', () => traceStep('otlp.fixture', async () => {
    const call = beginUsageCall('openai', {}, 'gpt-fixture')!
    call.observe({ input_tokens: 20, output_tokens: 5, private: privateText }); call.finish('succeeded')
  }))
  usage.settleOperation('http-delivery', 'succeeded'); recordCreditTrace(reservation('http-delivery', 'committed'))
  await runtime.forceFlush()
  assert.equal(received.length, 1); assert.equal(received[0].path, '/v1/traces')
  assert.equal(received[0].headers.authorization, 'Bearer local-fixture')
  assert.match(String(received[0].headers['content-type']), /application\/json/)
  assert.ok(!received[0].body.includes(privateText))
  assert.ok(!received[0].body.includes('local-fixture'))
  const body = JSON.parse(received[0].body) as { resourceSpans: { resource: { attributes: OtlpAttribute[] }; scopeSpans: { spans: OtlpSpan[] }[] }[] }
  const resource = body.resourceSpans[0], spans = resource.scopeSpans.flatMap(scope => scope.spans)
  assert.equal(attributes(resource.resource.attributes)['service.name'], 't3-local-delivery')
  assert.equal(attributes(resource.resource.attributes)['openinference.project.name'], 't3-local-delivery.dev')
  const root = spans.find(span => span.name === 'generation.asset')!, stage = spans.find(span => span.name === 'otlp.fixture')!, call = spans.find(span => span.name === 'llm.generation')!
  assert.equal(spans.length, 3); assert.ok(root && stage && call)
  assert.equal(stage.parentSpanId, root.spanId); assert.equal(call.parentSpanId, stage.spanId)
  assert.equal(call.traceId, root.traceId); assert.equal(stage.traceId, root.traceId)
  assert.equal(Number(attributes(call.attributes)['llm.token_count.total']), 25)
  assert.equal(Number(attributes(root.attributes)['t3.credits.consumed']), 20)
})
