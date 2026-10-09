import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { ROOT_CONTEXT, SpanStatusCode, trace, type Span } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider, BatchSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { UsageCall, UsageOperationMetadata, UsageOperationStatus } from './usage.ts'

type Attributes = Record<string, string | number | boolean>
type CreditTrace = { id: string; kind: string; amount: number; state: string; createdAt: string; updatedAt: string }
type Operation = { span: Span; calls: Map<string, { span: Span; call: UsageCall }>; status?: UsageOperationStatus; settled: boolean; metadata: boolean; started: number; steps: number; openSteps: Set<Span> }
type Active = { runtime: GenerationTelemetry; operationId: string; span: Span }
const active = new AsyncLocalStorage<Active>()
let installed: GenerationTelemetry | undefined
const maxOperations = 512
const maxCalls = 128
const maxSteps = 512
const safeValue = (value: string) => /^[a-zA-Z0-9_.:/+-]{1,200}$/.test(value)
const safeKeys = new Set(['t3.operation.id', 't3.operation.kind', 't3.operation.status', 't3.operation.recovered', 't3.job.id', 't3.run.id', 't3.project.id', 't3.asset.id', 't3.parent.id', 't3.attempt', 't3.iteration', 't3.stage', 't3.event.kind', 't3.reference.count', 't3.artifact.published', 't3.foundation.target', 't3.search.enabled', 't3.source.count', 't3.reference.unavailable_count', 't3.geodata.status', 't3.context.reused', 't3.parcel.count', 't3.building.count', 't3.road.count', 't3.validation.issue_count', 't3.validation.passed', 't3.review.passed', 't3.question.count', 't3.generation.status', 't3.iteration.count', 't3.room.count', 't3.floor.count'])

/** Deliberately exclude free text, inputs/outputs, URLs and exception messages. */
export function traceAttributes(input: Attributes = {}): Attributes {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => safeKeys.has(key)
    && (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) && value >= 0
      || typeof value === 'string' && safeValue(value))))
}
function safely<T>(work: () => T): T | undefined { try { return work() } catch { return undefined } }
async function bounded(work: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { await Promise.race([work.catch(() => undefined), new Promise<void>(done => { timer = setTimeout(done, 5000) })]) }
  finally { clearTimeout(timer) }
}
function status(span: Span, value: string) {
  span.setAttribute('t3.operation.status', value)
  span.setStatus({ code: ['failed', 'invalid', 'interrupted'].includes(value) ? SpanStatusCode.ERROR : value === 'running' ? SpanStatusCode.UNSET : SpanStatusCode.OK })
}
function callAttributes(call: UsageCall): Attributes {
  const attributes: Attributes = {
    'openinference.span.kind': 'LLM', 'llm.system': 'openai',
    't3.call.id': call.id, 't3.provider': call.provider, 't3.auth.mode': call.authMode,
    't3.stage': call.stage, 't3.iteration': call.iteration, 't3.measurement': call.measurement,
  }
  if (call.source) attributes['t3.usage.source'] = call.source
  if (call.requestedModel && safeValue(call.requestedModel)) attributes['llm.request.model_name'] = call.requestedModel
  if (call.effectiveModel && safeValue(call.effectiveModel)) attributes['llm.response.model_name'] = call.effectiveModel
  const model = call.effectiveModel ?? call.requestedModel
  if (model && safeValue(model)) attributes['llm.model_name'] = model
  if (call.provider === 'openai') attributes['llm.provider'] = 'openai'
  // Subscription tokens remain observable, but are not API-billed token costs.
  attributes['t3.billing.mode'] = call.provider === 'openai' ? 'api' : 'subscription'
  for (const [key, value] of [
    ['llm.token_count.prompt', call.inputTokens], ['llm.token_count.completion', call.outputTokens],
    ['llm.token_count.prompt_details.cache_read', call.cachedInputTokens], ['llm.token_count.prompt_details.cache_write', call.cacheWriteInputTokens],
    ['llm.token_count.completion_details.reasoning', call.reasoningOutputTokens],
  ] as const) if (value !== null) attributes[key] = value
  if (call.inputTokens !== null && call.outputTokens !== null) attributes['llm.token_count.total'] = call.inputTokens + call.outputTokens
  return attributes
}

/** One private provider, explicit parents, bounded memory. No global HTTP hooks. */
export class GenerationTelemetry {
  private provider: BasicTracerProvider
  private operations = new Map<string, Operation>()
  private closing = false
  private timer: ReturnType<typeof setInterval>
  constructor(options: { exporter: SpanExporter; serviceName: string; environment: string; version: string; resources?: Attributes }) {
    let warned = false
    const exporter: SpanExporter = {
      export: (spans, callback) => {
        const done: Parameters<SpanExporter['export']>[1] = result => {
          if (result.code !== 0 && !warned) { warned = true; console.warn('Trace export unavailable; generation continues.') }
          callback(result)
        }
        try { options.exporter.export(spans, done) } catch { done({ code: 1 }) }
      },
      shutdown: () => options.exporter.shutdown(),
    }
    this.provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ ...options.resources,
        'service.name': options.serviceName, 'service.version': options.version,
        'deployment.environment': options.environment, 'deployment.environment.name': options.environment,
        'openinference.project.name': `${options.serviceName}.${options.environment}`,
      }),
      spanProcessors: [new BatchSpanProcessor(exporter, { maxQueueSize: 2048, maxExportBatchSize: 128, scheduledDelayMillis: 1000, exportTimeoutMillis: 4000 })],
      spanLimits: { attributeCountLimit: 64, attributeValueLengthLimit: 256, eventCountLimit: 128 },
    })
    this.timer = setInterval(() => {
      for (const [id, operation] of this.operations) if (Date.now() - operation.started > 2 * 60 * 60_000) this.end(id, 'interrupted')
    }, 60_000)
    this.timer.unref()
  }
  private begin(id: string, kind: string): Operation | undefined {
    if (this.closing || !safeValue(id) || !safeValue(kind)) return
    const existing = this.operations.get(id)
    if (existing) return existing
    if (this.operations.size >= maxOperations) return
    const span = this.provider.getTracer('t3.generations').startSpan(`generation.${kind}`, { attributes: {
      'openinference.span.kind': 'AGENT', 't3.operation.id': id, 't3.operation.kind': kind,
      't3.operation.status': 'running', 'session.id': id,
    } }, ROOT_CONTEXT)
    const operation: Operation = { span, calls: new Map(), settled: false, metadata: false, started: Date.now(), steps: 0, openSteps: new Set() }
    this.operations.set(id, operation)
    return operation
  }
  operation(metadata: UsageOperationMetadata, recovered = false) {
    if (metadata.status && metadata.status !== 'running' && !this.operations.has(metadata.id)) return
    const operation = this.begin(metadata.id, metadata.kind)
    if (!operation) return
    const firstMetadata = !operation.metadata
    operation.metadata = true
    const attrs: Attributes = firstMetadata ? { 't3.operation.recovered': recovered } : {}
    for (const [key, value] of [['t3.project.id', metadata.projectId], ['t3.job.id', metadata.jobId], ['t3.run.id', metadata.runId], ['t3.asset.id', metadata.assetId], ['t3.parent.id', metadata.parentId], ['t3.attempt', metadata.attempt]] as const) if (value !== null) attrs[key] = value
    operation.span.setAttributes(traceAttributes(attrs))
    if (metadata.projectId && safeValue(metadata.projectId)) operation.span.setAttribute('session.id', metadata.projectId)
  }
  credit(reservation: CreditTrace, actualRefunded?: number) {
    const operation = reservation.state === 'reserved' ? this.begin(reservation.id, reservation.kind) : this.operations.get(reservation.id)
    if (!operation) return // Never replay historical ledger transitions as new traces.
    operation.span.setAttributes({ 't3.credits.state': reservation.state, 't3.credits.reserved': reservation.state === 'reserved' ? reservation.amount : 0,
      't3.credits.consumed': reservation.state === 'committed' ? reservation.amount : 0 })
    if (actualRefunded !== undefined) operation.span.setAttribute('t3.credits.refunded', actualRefunded)
    operation.span.addEvent(`credits.${reservation.state}`)
    operation.settled = reservation.state !== 'reserved'
    if (!operation.metadata && operation.settled) operation.status = 'failed'
    this.complete(reservation.id)
  }
  outcome(id: string, outcome: UsageOperationStatus) {
    const operation = this.operations.get(id)
    if (!operation) return
    operation.status = outcome
    operation.span.setAttribute('t3.operation.status', outcome)
    this.complete(id)
  }
  private complete(id: string) {
    const operation = this.operations.get(id)
    if (operation?.settled && operation.openSteps.size === 0 && operation.status && operation.status !== 'running') this.end(id, operation.status)
  }
  run<T>(id: string, work: () => Promise<T>): Promise<T> {
    const operation = this.operations.get(id), current = active.getStore()
    if (!operation) return work()
    if (current?.runtime === this && current.operationId === id) return work()
    return active.run({ runtime: this, operationId: id, span: operation.span }, work)
  }
  call(call: UsageCall) {
    const operation = this.operations.get(call.operationId)
    if (!operation) return
    let tracked = operation.calls.get(call.id)
    if (!tracked) {
      if (operation.calls.size >= maxCalls) { operation.span.setAttribute('t3.trace.truncated', true); return }
      const parent = active.getStore()
      const span = this.provider.getTracer('t3.generations').startSpan(`llm.${call.stage}`, { startTime: new Date(call.startedAt), attributes: callAttributes(call) },
        trace.setSpan(ROOT_CONTEXT, parent?.runtime === this && parent.operationId === call.operationId ? parent.span : operation.span))
      tracked = { span, call }; operation.calls.set(call.id, tracked)
    }
    tracked.call = call
    tracked.span.setAttributes(callAttributes(call))
    tracked.span.setAttribute('t3.call.status', call.status)
    // End after application validation: a successful response may be invalid JSON.
    // Its recorded provider end time is retained; no validation latency is added.
  }
  step<T>(name: string, work: () => Promise<T>, attributes: Attributes, kind: string): Promise<T> {
    const current = active.getStore(), operation = current && this.operations.get(current.operationId)
    if (!current || !operation || !/^[a-z][a-z0-9_.-]{0,79}$/.test(name)) return work()
    if (operation.steps++ >= maxSteps) { operation.span.setAttribute('t3.trace.truncated', true); return work() }
    const span = this.provider.getTracer('t3.generations').startSpan(name, { attributes: { ...traceAttributes(attributes), 'openinference.span.kind': kind, ...(kind === 'TOOL' ? { 'tool.name': name } : {}) } }, trace.setSpan(ROOT_CONTEXT, current.span))
    operation.openSteps.add(span)
    return active.run({ ...current, span }, async () => {
      try { const result = await work(); safely(() => span.setStatus({ code: SpanStatusCode.OK })); return result }
      catch (error) { safely(() => span.setStatus({ code: SpanStatusCode.ERROR })); throw error }
      finally { if (operation.openSteps.delete(span)) safely(() => span.end()); safely(() => this.complete(current.operationId)) }
    })
  }
  private end(id: string, outcome: string) {
    const operation = this.operations.get(id)
    if (!operation) return
    for (const { span, call } of operation.calls.values()) {
      status(span, call.status === 'running' ? 'interrupted' : call.status)
      span.end(call.endedAt ? new Date(call.endedAt) : undefined)
    }
    for (const span of [...operation.openSteps].reverse()) { status(span, 'interrupted'); span.end() }
    operation.openSteps.clear()
    status(operation.span, outcome)
    operation.span.end()
    this.operations.delete(id)
  }
  /** A delivery diagnostic with no inference, usage records or ledger events. */
  async smoke() {
    const operationId = `smoke:${randomUUID()}`, operation = this.begin(operationId, 'telemetry_smoke')
    if (!operation) throw new Error('Tracing diagnostic unavailable.')
    operation.span.setAttribute('t3.synthetic', true)
    const traceId = operation.span.spanContext().traceId
    await this.run(operationId, () => this.step('telemetry.export.verify', async () => undefined, {}, 'TOOL'))
    this.end(operationId, 'succeeded')
    return { operationId, traceId }
  }
  async forceFlush() { await bounded(this.provider.forceFlush()) }
  async shutdown() {
    if (this.closing) return
    this.closing = true; clearInterval(this.timer)
    if (installed === this) installed = undefined
    for (const id of this.operations.keys()) safely(() => this.end(id, 'interrupted'))
    await bounded(this.provider.shutdown())
  }
}

export function installTelemetry(runtime?: GenerationTelemetry) {
  const previous = installed
  installed = runtime
  return () => { if (installed === runtime) installed = previous }
}
export function isTelemetryEnabled() { return installed !== undefined }
export function recordOperationTrace(metadata: UsageOperationMetadata, recovered = false) { safely(() => installed?.operation(metadata, recovered)) }
export function recordOperationOutcome(id: string, outcome: UsageOperationStatus) { safely(() => installed?.outcome(id, outcome)) }
export function recordCreditTrace(reservation: CreditTrace, actualRefunded?: number) { safely(() => installed?.credit(reservation, actualRefunded)) }
export function recordCallTrace(call: UsageCall) { safely(() => installed?.call(call)) }
export function withOperationTrace<T>(id: string, work: () => Promise<T>): Promise<T> { return installed ? installed.run(id, work) : work() }
export function traceStep<T>(name: string, work: () => Promise<T>, attributes: Attributes = {}, kind: 'CHAIN' | 'TOOL' | 'RETRIEVER' = 'CHAIN'): Promise<T> {
  const current = active.getStore()
  // Catch setup errors only. Never re-run work after an application rejection.
  if (!current) return work()
  let started = false
  try { return current.runtime.step(name, () => { started = true; return work() }, attributes, kind) }
  catch (error) { if (started) throw error; return work() }
}
export function traceEvent(name: string, attributes: Attributes = {}) {
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(name)) return
  safely(() => active.getStore()?.span.addEvent(name, traceAttributes(attributes)))
}

export function telemetryConfig(env: NodeJS.ProcessEnv) {
  if (env.OTEL_SDK_DISABLED === 'true') return null
  const endpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) return null
  const url = new URL(endpoint)
  if (url.username || url.password || url.hash || url.search || !['https:', 'http:'].includes(url.protocol)
    || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tracing requires HTTPS or a loopback test collector.')
  if (!env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/traces`
  const serviceName = env.OTEL_SERVICE_NAME || 't3-designer-api'
  const environment = env.T3_TELEMETRY_ENVIRONMENT || (env.NODE_ENV === 'production' ? 'prod' : 'dev')
  const version = env.OTEL_SERVICE_VERSION || '0.0.0'
  if (![serviceName, environment, version].every(safeValue)) throw new Error('Invalid tracing service identity.')
  const resources: Attributes = {}
  for (const item of (env.OTEL_RESOURCE_ATTRIBUTES ?? '').split(',')) {
    const [key, value] = item.split('=')
    if (['cluster', 'k8s.namespace.name', 'k8s.pod.name'].includes(key) && value && safeValue(value)) resources[key] = value
  }
  const headers: Record<string, string> = {}
  for (const entry of (env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',').filter(Boolean)) {
    const index = entry.indexOf('=')
    if (index < 1) throw new Error('Invalid trace exporter headers.')
    headers[entry.slice(0, index).trim()] = decodeURIComponent(entry.slice(index + 1).trim())
  }
  return { endpoint: url.href, serviceName, environment, version, resources, headers }
}
export function configureTelemetry(env: NodeJS.ProcessEnv = process.env): GenerationTelemetry | undefined {
  try {
    const config = telemetryConfig(env)
    if (!config) return
    const runtime = new GenerationTelemetry({ ...config, exporter: new OTLPTraceExporter({ url: config.endpoint, headers: config.headers, timeoutMillis: 3000 }) })
    installTelemetry(runtime)
    return runtime
  } catch { console.warn('Tracing configuration unavailable; generation continues.'); return }
}
