import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AccountError } from './accounts.ts'
import type { AppDatabase } from './app-database.ts'
import type { CreditKind } from './credits.ts'
import { isTelemetryEnabled, recordCallTrace, recordOperationOutcome, recordOperationTrace, withOperationTrace } from './telemetry.ts'

export type UsageStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted' | 'invalid' | 'unknown'
export type UsageOperationStatus = UsageStatus | 'needs_input'
export type UsageStage = 'analysis' | 'generation' | 'review' | 'correction'
type Measurement = 'complete' | 'partial' | 'unknown'
type Provider = 'codex-local' | 'openai'
const metrics = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'reasoningOutputTokens'] as const
type Tokens = Record<typeof metrics[number], number | null>
export type UsageCall = Tokens & {
  id: string; operationId: string; stage: UsageStage; iteration: number; provider: Provider
  authMode: 'chatgpt' | 'api-key'; requestedModel: string | null; effectiveModel: string | null
  startedAt: string; endedAt: string | null; durationMs: number | null; status: UsageStatus
  measurement: Measurement; source: 'codex.turn.completed' | 'openai.responses' | null
}
export type UsageOperationMetadata = {
  id: string; userId: string; kind: CreditKind; projectId: string | null; projectLabel: string | null
  jobId: string | null; runId: string | null; assetId: string | null; attempt: number | null; parentId: string | null
  status?: UsageOperationStatus
}
const emptyTokens = (): Tokens => ({ inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null })
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
function measured(tokens: Tokens): Measurement {
  return tokens.inputTokens !== null && tokens.outputTokens !== null ? 'complete' : metrics.some(metric => tokens[metric] !== null) ? 'partial' : 'unknown'
}
export function codexUsage(raw: unknown): Tokens {
  const usage = object(raw)
  return { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens), cachedInputTokens: count(usage.cached_input_tokens), cacheWriteInputTokens: count(usage.cache_write_input_tokens), reasoningOutputTokens: count(usage.reasoning_output_tokens) }
}
export function responsesUsage(raw: unknown): Tokens {
  const usage = object(raw), input = object(usage.input_tokens_details), output = object(usage.output_tokens_details)
  return { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens), cachedInputTokens: count(input.cached_tokens), cacheWriteInputTokens: count(input.cache_write_tokens), reasoningOutputTokens: count(output.reasoning_tokens) }
}

/** Only explicit metadata and numeric usage enter this DB: never provider payloads. */
export class UsageStore {
  private db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS model_usage_operation(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_operation_user ON model_usage_operation(user_id);
      CREATE TABLE IF NOT EXISTS model_usage_call(id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_call_operation ON model_usage_call(operation_id);`)
  }
  operation(input: UsageOperationMetadata): void {
    // Whitelist every field; callers may carry entire jobs or private prompts.
    const { id, userId, kind, projectId, projectLabel, jobId, runId, assetId, attempt, parentId } = input
    const value = { id, userId, kind, projectId, projectLabel, jobId, runId, assetId, attempt, parentId, status: 'running' }
    const inserted = this.db.prepare('INSERT INTO model_usage_operation(id,user_id,document) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').run(id, userId, JSON.stringify(value))
    if (inserted.changes) recordOperationTrace(input)
  }
  settleOperation(operationId: string, status: Exclude<UsageOperationStatus, 'running' | 'unknown'>): void {
    const row = this.db.prepare('SELECT document FROM model_usage_operation WHERE id=?').get(operationId)
    if (!row) return
    const value = JSON.parse(String(row.document)) as UsageOperationMetadata
    // Older instrumentation grouped needs-input attempts with succeeded. Refine
    // that one state only when the owning worker supplies its durable outcome.
    if (value.status && value.status !== 'running' && !(value.status === 'succeeded' && status === 'needs_input')) return
    this.db.prepare('UPDATE model_usage_operation SET document=? WHERE id=?').run(JSON.stringify({ ...value, status }), operationId)
    recordOperationOutcome(operationId, status)
  }
  linkJob(operationId: string, parentId: string | null): void {
    const row = this.db.prepare('SELECT document FROM model_usage_operation WHERE id=?').get(operationId)
    if (!row) return
    const value = JSON.parse(String(row.document)) as UsageOperationMetadata
    if (!value.parentId && parentId) {
      const updated = { ...value, parentId }
      this.db.prepare('UPDATE model_usage_operation SET document=? WHERE id=?').run(JSON.stringify(updated), operationId)
      recordOperationTrace(updated)
    }
  }
  linkAsset(operationId: string, assetId: string): void {
    const row = this.db.prepare('SELECT document FROM model_usage_operation WHERE id=?').get(operationId)
    if (!row) return
    const value = JSON.parse(String(row.document)) as UsageOperationMetadata
    const updated = { ...value, assetId }
    this.db.prepare('UPDATE model_usage_operation SET document=? WHERE id=?').run(JSON.stringify(updated), operationId)
    recordOperationTrace(updated)
  }
  begin(operationId: string, provider: Provider, stage: UsageStage, iteration: number, requestedModel: string | null): UsageCall {
    if (!this.db.prepare('SELECT id FROM model_usage_operation WHERE id=?').get(operationId)) throw new Error('Usage operation must be persisted before model inference')
    const call: UsageCall = { id: randomUUID(), operationId, stage, iteration, provider, authMode: provider === 'codex-local' ? 'chatgpt' : 'api-key', requestedModel, effectiveModel: null, startedAt: new Date().toISOString(), endedAt: null, durationMs: null, status: 'running', source: null, measurement: 'unknown', ...emptyTokens() }
    this.db.prepare('INSERT INTO model_usage_call(id,operation_id,document) VALUES(?,?,?)').run(call.id, operationId, JSON.stringify(call))
    recordCallTrace(call)
    return call
  }
  call(id: string): UsageCall | null {
    const row = this.db.prepare('SELECT document FROM model_usage_call WHERE id=?').get(id)
    return row ? JSON.parse(String(row.document)) as UsageCall : null
  }
  private write(call: UsageCall): void {
    this.db.prepare('UPDATE model_usage_call SET document=? WHERE id=?').run(JSON.stringify(call), call.id)
    recordCallTrace(call)
  }
  traceOperation(operationId: string): void {
    if (!isTelemetryEnabled()) return
    // Telemetry recovery is optional and must not add a database failure path.
    try {
      const row = this.db.prepare('SELECT document FROM model_usage_operation WHERE id=?').get(operationId)
      if (row) recordOperationTrace(JSON.parse(String(row.document)) as UsageOperationMetadata, true)
    } catch { /* Existing durable usage writes still enforce their own errors. */ }
  }
  observe(id: string, raw: unknown, source: NonNullable<UsageCall['source']>, effectiveModel?: unknown): void {
    const call = this.call(id)
    if (!call) throw new Error('Usage call not found')
    const observed = source === 'codex.turn.completed' ? codexUsage(raw) : responsesUsage(raw)
    // One terminal usage report per invocation. Repeated events never add tokens.
    // Reconciliation may fill absent fields, but never overwrite observed values.
    const tokens = Object.fromEntries(metrics.map(metric => [metric, call[metric] ?? observed[metric]])) as Tokens
    this.write({ ...call, ...tokens, source, measurement: measured(tokens), effectiveModel: call.effectiveModel ?? (typeof effectiveModel === 'string' && effectiveModel.length <= 200 ? effectiveModel : null) })
  }
  finish(id: string, status: Exclude<UsageStatus, 'running' | 'unknown'>): void {
    const call = this.call(id)
    if (!call) throw new Error('Usage call not found')
    if (call.status !== 'running' && status !== 'invalid') return
    const endedAt = call.endedAt ?? new Date().toISOString()
    this.write({ ...call, status, endedAt, durationMs: call.durationMs ?? Math.max(0, Date.parse(endedAt) - Date.parse(call.startedAt)) })
  }
  recoverInterrupted(): void {
    for (const row of this.db.prepare('SELECT document FROM model_usage_call').all()) {
      const call = JSON.parse(String(row.document)) as UsageCall
      // Process disappearance provides no exact end time or elapsed duration.
      if (call.status === 'running') this.write({ ...call, status: 'interrupted' })
    }
  }
  calls(operationId: string): UsageCall[] {
    return this.db.prepare('SELECT document FROM model_usage_call WHERE operation_id=? ORDER BY rowid').all(operationId).map(row => JSON.parse(String(row.document)) as UsageCall)
  }
  async report(database: AppDatabase, userId: string, query: URLSearchParams) {
    const from = query.get('from'), to = query.get('to')
    for (const value of [from, to]) if (value && !Number.isFinite(Date.parse(value))) throw new AccountError(400, 'Período de consumo inválido.')
    if (from && to && Date.parse(from) >= Date.parse(to)) throw new AccountError(400, 'El fin del período debe ser posterior al inicio.')
    const limit = Number(query.get('limit') ?? 20), offset = Number(query.get('offset') ?? 0)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new AccountError(400, 'Paginación de consumo inválida.')
    const metadata = new Map(this.db.prepare('SELECT id,document FROM model_usage_operation WHERE user_id=?').all(userId).map(row => [String(row.id), JSON.parse(String(row.document)) as UsageOperationMetadata]))
    // Read all owner reservations/ledger entries, never Credits.summary's latest 100.
    // A shared project does not confer any access to another account's ledger.
    // One SQL snapshot prevents a concurrent commit/refund appearing as both
    // consumed and reserved between separate reservation and ledger reads.
    const rows = await database.db.selectFrom('t3_credit_reservation as reservation')
      .leftJoin('t3_credit_ledger as ledger', join => join.onRef('ledger.operationId', '=', 'reservation.id').onRef('ledger.userId', '=', 'reservation.userId'))
      .select(['reservation.id', 'reservation.kind', 'reservation.state', 'reservation.amount', 'reservation.createdAt', 'ledger.type as eventType', 'ledger.amount as eventAmount'])
      .where('reservation.userId', '=', userId).execute()
    const reservations = [...new Map(rows.map(row => [row.id, row])).values()]
    const ledgerByOperation = new Map<string, { type: string; amount: number }[]>()
    for (const row of rows) {
      if (row.eventType === null || row.eventAmount === null) continue
      const events = ledgerByOperation.get(row.id) ?? []
      events.push({ type: row.eventType, amount: row.eventAmount }); ledgerByOperation.set(row.id, events)
    }
    const projectMap = new Map<string, string>()
    for (const operation of metadata.values()) if (operation.projectId) projectMap.set(operation.projectId, operation.projectLabel ?? operation.projectId)
    const operations = reservations.map(reservation => {
      const known = metadata.get(reservation.id)
      const calls = known ? this.calls(reservation.id) : []
      const events = ledgerByOperation.get(reservation.id) ?? []
      const status: UsageOperationStatus = known?.status ?? 'unknown'
      return { id: reservation.id, userId, kind: reservation.kind,
        projectId: known?.projectId ?? null, projectLabel: known?.projectLabel ?? null, jobId: known?.jobId ?? null, runId: known?.runId ?? null,
        assetId: known?.assetId ?? null, attempt: known?.attempt ?? null, parentId: known?.parentId ?? null, createdAt: reservation.createdAt, status, calls,
        credits: { state: reservation.state, consumed: events.some(event => event.type === 'commit') ? reservation.amount : 0,
          reserved: reservation.state === 'reserved' ? reservation.amount : 0,
          refunded: events.filter(event => event.type === 'refund').reduce((sum, event) => sum + event.amount, 0) } }
    }).filter(operation => (!from || Date.parse(operation.createdAt) >= Date.parse(from)) && (!to || Date.parse(operation.createdAt) < Date.parse(to))
      && (!query.get('projectId') || operation.projectId === query.get('projectId'))
      && (!query.get('operationType') || operation.kind === query.get('operationType'))
      && (!query.get('provider') || operation.calls.some(call => call.provider === query.get('provider')))
      && (!query.get('status') || operation.status === query.get('status')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const calls = operations.flatMap(operation => operation.calls)
    const sumMetric = (metric: typeof metrics[number]) => calls.some(call => call[metric] !== null) ? calls.reduce((sum, call) => sum + (call[metric] ?? 0), 0) : null
    const measuredCalls = calls.filter(call => call.measurement === 'complete').length
    const partialCalls = calls.filter(call => call.measurement === 'partial').length
    const unknownCalls = calls.filter(call => call.measurement === 'unknown').length
    const measurement: Measurement = !calls.length || measuredCalls + partialCalls === 0 ? 'unknown'
      : unknownCalls || partialCalls || operations.some(operation => !operation.calls.length) ? 'partial' : 'complete'
    return {
      totals: { creditsConsumed: operations.reduce((sum, operation) => sum + operation.credits.consumed, 0), creditsReserved: operations.reduce((sum, operation) => sum + operation.credits.reserved, 0), creditsRefunded: operations.reduce((sum, operation) => sum + operation.credits.refunded, 0),
        ...(Object.fromEntries(metrics.map(metric => [metric, sumMetric(metric)])) as Tokens), calls: calls.length, attempts: operations.length,
        durationMs: calls.some(call => call.durationMs !== null) ? calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0) : null,
        measuredCalls, partialCalls, unknownCalls, measurement },
      operations: operations.slice(offset, offset + limit), projects: [...projectMap].map(([id, label]) => ({ id, label })), pagination: { limit, offset, total: operations.length },
    }
  }
  close(): void { this.db.close() }
}

type UsageContext = { store: UsageStore; operationId: string; lastCallId?: string }
const context = new AsyncLocalStorage<UsageContext>()
export function withUsage<T>(store: UsageStore | undefined, operationId: string, work: () => Promise<T>): Promise<T> {
  if (!store) return work()
  store.traceOperation(operationId)
  return context.run({ store, operationId }, () => withOperationTrace(operationId, work))
}
export function beginUsageCall(provider: Provider, options: { usageStage?: UsageStage; usageIteration?: number }, requestedModel: string | null) {
  const current = context.getStore()
  if (!current) return undefined
  const call = current.store.begin(current.operationId, provider, options.usageStage ?? 'generation', options.usageIteration ?? 1, requestedModel)
  current.lastCallId = call.id
  return { observe: (raw: unknown, effectiveModel?: unknown) => current.store.observe(call.id, raw, provider === 'codex-local' ? 'codex.turn.completed' : 'openai.responses', effectiveModel),
    finish: (status: Exclude<UsageStatus, 'running' | 'unknown'>) => current.store.finish(call.id, status) }
}
export function invalidateUsageCall(): void {
  const current = context.getStore()
  if (current?.lastCallId) current.store.finish(current.lastCallId, 'invalid')
}
