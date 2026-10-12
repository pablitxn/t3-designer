import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createAccounts } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { parsePlanResponse, runVisualTurn } from '../src/codex.ts'
import { CreditService } from '../src/credits.ts'
import { GenerationCredits } from '../src/generation-credits.ts'
import { openaiVisualTurn } from '../src/openai.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { beginUsageCall, UsageStore, withUsage } from '../src/usage.ts'
import { AssetWorker } from '../src/worker.ts'

const metadata = (id: string, userId = 'owner') => ({ id, userId, kind: 'asset' as const, projectId: null, projectLabel: null, jobId: 'job', runId: null, assetId: null, parentId: null, attempt: 1 })
const turnOptions = () => ({ signal: new AbortController().signal, workingDirectory: '.', onProgress() {} })

test('usage storage failure stops both providers before inference starts', async t => {
  const original = process.env, usage = new UsageStore(':memory:')
  process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: '/not-a-provider', OPENAI_API_KEY: 'controlled-test-only' }
  t.after(() => { process.env = original; usage.close() })
  usage.operation(metadata('blocked'))
  t.mock.method(usage, 'begin', () => { throw new Error('Usage storage unavailable') })
  let started = 0, requests = 0
  const options = { ...turnOptions(), onInference: () => { started++ } }
  const forbidden = (async () => { requests++; throw new Error('Provider must remain unreachable') }) as typeof fetch
  await assert.rejects(withUsage(usage, 'blocked', () => runVisualTurn([], {}, options, false, forbidden)))
  await assert.rejects(withUsage(usage, 'blocked', () => openaiVisualTurn([], {}, options, false, forbidden)), /Usage storage unavailable/)
  assert.equal(started, 0); assert.equal(requests, 0); assert.equal(usage.calls('blocked').length, 0)
})

test('controlled Codex stream persists start before inference, captures terminal usage before invalid parsing, deduplicates events and excludes private payloads', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-usage-codex-')), original = process.env
  const path = join(directory, 'usage.sqlite'), usage = new UsageStore(path), command = join(directory, 'fixture-codex')
  t.after(async () => { process.env = original; usage.close(); await rm(directory, { recursive: true, force: true }) })
  usage.operation(metadata('op'))
  const events = [
    { type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: 'invalid JSON private-result' } },
    { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 25, cache_write_input_tokens: 10, output_tokens: 40, reasoning_output_tokens: 12, prompt: 'private prompt' } },
    { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 25, cache_write_input_tokens: 10, output_tokens: 40, reasoning_output_tokens: 12 } },
  ]
  await writeFile(command, `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>{for(const event of ${JSON.stringify(events)})process.stdout.write(JSON.stringify(event)+'\\n')});\n`)
  await chmod(command, 0o700)
  process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: command, T3_CODEX_MODEL: 'requested-fixture' }
  const apiForbidden = (async () => { throw new Error('No hosted requests permitted') }) as typeof fetch
  await assert.rejects(withUsage(usage, 'op', async () => {
    const raw = await runVisualTurn([{ type: 'text', text: 'private prompt' }], {}, { ...turnOptions(), usageStage: 'analysis', onInference: () => {
      const [started] = usage.calls('op'); assert.equal(started.status, 'running'); assert.equal(started.inputTokens, null)
    } }, false, apiForbidden)
    assert.equal(usage.calls('op')[0].inputTokens, 100, 'usage is durable before response schema validation')
    return parsePlanResponse(raw, { url: 'https://example.com/product', notes: '' })
  }), /no cumple/)
  const calls = usage.calls('op')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].status, 'invalid'); assert.equal(calls[0].inputTokens, 100); assert.equal(calls[0].outputTokens, 40)
  assert.equal(calls[0].cachedInputTokens, 25); assert.equal(calls[0].cacheWriteInputTokens, 10); assert.equal(calls[0].reasoningOutputTokens, 12)
  assert.equal(calls[0].authMode, 'chatgpt'); assert.equal(calls[0].requestedModel, 'requested-fixture'); assert.equal(calls[0].effectiveModel, null)
  assert.equal(calls[0].measurement, 'complete'); assert.equal(calls[0].source, 'codex.turn.completed')
  assert.doesNotMatch(JSON.stringify(calls), /private|prompt|agent_message/)
  assert.doesNotMatch((await readFile(path)).toString(), /private prompt|private-result/)
})

test('app-server terminal usage retains its source and token totals once across duplicate observations and database restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-usage-app-server-'))
  const path = join(directory, 'usage.sqlite')
  let usage = new UsageStore(path)
  t.after(async () => { usage.close(); await rm(directory, { recursive: true, force: true }) })
  usage.operation(metadata('app-server'))
  const total = { input_tokens: 100, output_tokens: 40, cached_input_tokens: 25, cache_write_input_tokens: 10, reasoning_output_tokens: 12 }
  await withUsage(usage, 'app-server', async () => {
    const call = beginUsageCall('codex-local', { usageStage: 'analysis' }, 'requested-model', 'codex.app-server')
    assert.ok(call)
    assert.equal(usage.calls('app-server')[0].measurement, 'unknown')
    call.observe(total, 'effective-model')
    call.observe(total, 'effective-model')
    call.finish('succeeded')
  })
  usage.close(); usage = new UsageStore(path)
  const calls = usage.calls('app-server')
  assert.equal(calls.length, 1)
  const [call] = calls
  assert.equal(call.source, 'codex.app-server'); assert.equal(call.measurement, 'complete'); assert.equal(call.status, 'succeeded')
  assert.equal(call.inputTokens, 100); assert.equal(call.outputTokens, 40)
  assert.equal(call.cachedInputTokens, 25); assert.equal(call.cacheWriteInputTokens, 10); assert.equal(call.reasoningOutputTokens, 12)
  assert.equal(call.provider, 'codex-local'); assert.equal(call.authMode, 'chatgpt'); assert.equal(call.stage, 'analysis')
  assert.equal(call.requestedModel, 'requested-model'); assert.equal(call.effectiveModel, 'effective-model')
})

test('controlled Responses completion, incomplete and failure preserve observed usage without real API traffic', async t => {
  const original = process.env, usage = new UsageStore(':memory:')
  process.env = { ...original, OPENAI_API_KEY: 'controlled-test-only' }
  t.after(() => { process.env = original; usage.close() })
  usage.operation(metadata('response'))
  const response = { status: 'completed', model: 'reported-model', usage: { input_tokens: 120, output_tokens: 60, input_tokens_details: { cached_tokens: 22 }, output_tokens_details: { reasoning_tokens: 35 } }, output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] }
  let requests = 0
  const stub = (value: unknown, stream = false) => (async () => {
    requests++; assert.equal(usage.calls('response').at(-1)?.status, 'running')
    return new Response(stream ? `data: ${JSON.stringify(value)}\n\n` : JSON.stringify(value), { headers: { 'Content-Type': stream ? 'text/event-stream' : 'application/json' } })
  }) as typeof fetch
  assert.equal(await withUsage(usage, 'response', () => openaiVisualTurn([], {}, turnOptions(), false, stub(response))), '{}')
  await assert.rejects(withUsage(usage, 'response', () => openaiVisualTurn([], {}, turnOptions(), false, stub({ type: 'response.incomplete', response: { ...response, status: 'incomplete' } }, true))), /incomplete/)
  await assert.rejects(withUsage(usage, 'response', () => openaiVisualTurn([], {}, turnOptions(), false, stub({ type: 'response.failed', response: { ...response, status: 'failed' } }, true))), /stream failed/)
  assert.equal(requests, 3)
  for (const call of usage.calls('response')) {
    assert.equal(call.inputTokens, 120); assert.equal(call.outputTokens, 60); assert.equal(call.cacheWriteInputTokens, null)
    assert.equal(call.cachedInputTokens, 22); assert.equal(call.reasoningOutputTokens, 35); assert.equal(call.effectiveModel, 'reported-model')
    assert.equal(call.authMode, 'api-key'); assert.equal(call.source, 'openai.responses')
  }
  assert.deepEqual(usage.calls('response').map(call => call.status), ['succeeded', 'failed', 'failed'])
})

test('cancellation and timeout without terminal usage remain unknown; restart preserves partial observations', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-usage-interrupted-')), original = process.env
  const path = join(directory, 'usage.sqlite'), command = join(directory, 'fixture-codex')
  let usage = new UsageStore(path)
  t.after(async () => { process.env = original; usage.close(); await rm(directory, { recursive: true, force: true }) })
  await writeFile(command, `#!${process.execPath}\nprocess.stdin.resume();setInterval(()=>{},1000)\n`); await chmod(command, 0o700)
  process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: command }
  usage.operation(metadata('interrupted'))
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 100)
  try { await assert.rejects(withUsage(usage, 'interrupted', () => runVisualTurn([], {}, { ...turnOptions(), signal: controller.signal }, false)), /canceló/) } finally { clearTimeout(timer) }
  await assert.rejects(withUsage(usage, 'interrupted', () => runVisualTurn([], {}, { ...turnOptions(), timeoutMs: 100 }, false)), /demasiado/)
  await assert.rejects(withUsage(usage, 'interrupted', () => runVisualTurn([], {}, { ...turnOptions(), signal: AbortSignal.timeout(100) }, false)), /demasiado/)
  const unfinished = usage.begin('interrupted', 'codex-local', 'correction', 2, null)
  usage.observe(unfinished.id, { input_tokens: 9 }, 'codex.turn.completed')
  usage.close(); usage = new UsageStore(path); usage.recoverInterrupted(); usage.recoverInterrupted()
  const calls = usage.calls('interrupted')
  assert.deepEqual(calls.map(call => call.status), ['cancelled', 'interrupted', 'interrupted', 'interrupted'])
  for (const call of calls.slice(0, 3)) { assert.equal(call.inputTokens, null); assert.equal(call.outputTokens, null); assert.equal(call.measurement, 'unknown') }
  assert.equal(calls[3].inputTokens, 9); assert.equal(calls[3].outputTokens, null); assert.equal(calls[3].measurement, 'partial')
  assert.equal(calls[3].endedAt, null); assert.equal(calls[3].durationMs, null)
})

test('Responses terminal usage survives simultaneous cancellation or timeout while the result is discarded', async t => {
  const original = process.env, usage = new UsageStore(':memory:')
  process.env = { ...original, OPENAI_API_KEY: 'controlled-test-only' }
  t.after(() => { process.env = original; usage.close() })
  const response = { status: 'completed', usage: { input_tokens: 11, output_tokens: 7 }, output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] }
  for (const stream of [true, false]) for (const reason of ['AbortError', 'TimeoutError']) {
    const id = `${stream ? 'stream' : 'json'}-${reason}`, controller = new AbortController()
    usage.operation(metadata(id))
    const abort = () => controller.abort(new DOMException('Controlled abort after receiving terminal bytes', reason))
    const fakeResponse = stream ? new Response(new ReadableStream({
      pull(source) {
        source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`))
        abort()
      },
    }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'text/event-stream' } }) : new Response(JSON.stringify(response))
    if (!stream) t.mock.method(fakeResponse, 'json', async () => { abort(); return response })
    const fetcher = (async () => fakeResponse) as typeof fetch
    await assert.rejects(withUsage(usage, id, () => openaiVisualTurn([], {}, { ...turnOptions(), signal: controller.signal }, false, fetcher)), { name: reason })
    const [call] = usage.calls(id)
    assert.equal(call.status, reason === 'TimeoutError' ? 'interrupted' : 'cancelled')
    assert.equal(call.inputTokens, 11); assert.equal(call.outputTokens, 7)
    assert.equal(call.cachedInputTokens, null); assert.equal(call.measurement, 'complete'); assert.equal(call.source, 'openai.responses')
  }
})

test('whole-period ledger totals, actual refunds, user isolation, filters and pagination survive restart and immutable retry linkage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-usage-ledger-'))
  const database = openAppDatabase({ sqlitePath: join(directory, 'accounts.sqlite') })
  await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const path = join(directory, 'usage.sqlite'), assetPath = join(directory, 'library.sqlite')
  let usage = new UsageStore(path), assets = new AssetStore(assetPath)
  t.after(async () => { usage.close(); assets.close(); await database.close(); await rm(directory, { recursive: true, force: true }) })
  const addUser = async () => {
    const id = randomUUID()
    await database.db.insertInto('user').values({ id, email: `${id}@example.test`, name: 'Test', role: 'user', suspended: database.bool(false), emailVerified: database.bool(true), image: null, createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
    return id
  }
  const first = await addUser(), second = await addUser()
  let now = new Date('2026-10-08T10:00:00Z')
  const credits = new CreditService(database, { trialCredits: 1000, costs: { asset: 1 } }, () => now)
  await credits.initialize(first, 'standard'); await credits.initialize(second, 'standard')
  for (let index = 0; index < 55; index++) {
    const id = `successful-${index}`
    await credits.reserve(first, id, 'asset')
    usage.operation({ ...metadata(id, first), projectId: 'shared', projectLabel: 'Shared', attempt: index + 1 })
    const call = usage.begin(id, 'codex-local', 'generation', 1, null)
    usage.observe(call.id, { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, reasoning_output_tokens: 1 }, 'codex.turn.completed')
    usage.observe(call.id, { input_tokens: 10, output_tokens: 2 }, 'codex.turn.completed')
    usage.finish(call.id, 'succeeded'); usage.settleOperation(id, 'succeeded'); await credits.commit(id)
  }
  await credits.reserve(first, 'returned', 'asset'); usage.operation(metadata('returned', first))
  const returned = usage.begin('returned', 'openai', 'review', 2, 'fixture')
  usage.observe(returned.id, { input_tokens: 5, output_tokens: 3 }, 'openai.responses'); usage.finish(returned.id, 'invalid'); usage.settleOperation('returned', 'failed')
  await credits.refund('returned'); await credits.refund('returned')
  await credits.reserve(first, 'reserved', 'asset') // historical absence is explicit
  await credits.reserve(second, 'other-account', 'asset')
  usage.operation({ ...metadata('other-account', second), projectId: 'shared', projectLabel: 'Shared' })
  const other = usage.begin('other-account', 'codex-local', 'analysis', 1, null)
  usage.observe(other.id, { input_tokens: 999999, output_tokens: 999999 }, 'codex.turn.completed'); usage.finish(other.id, 'succeeded'); usage.settleOperation('other-account', 'succeeded'); await credits.commit('other-account')
  const report = await usage.report(database, first, new URLSearchParams('limit=2&offset=2'))
  assert.equal(report.operations.length, 2); assert.equal(report.pagination.total, 57)
  assert.equal(report.totals.creditsConsumed, 55); assert.equal(report.totals.creditsRefunded, 1); assert.equal(report.totals.creditsReserved, 1)
  assert.equal(report.totals.inputTokens, 555); assert.equal(report.totals.outputTokens, 113); assert.equal(report.totals.cachedInputTokens, 220)
  assert.equal(report.totals.calls, 56); assert.equal(report.totals.attempts, 57); assert.equal(report.totals.measurement, 'partial')
  const filtered = await usage.report(database, first, new URLSearchParams('projectId=shared&provider=codex-local&status=succeeded&limit=1'))
  assert.equal(filtered.totals.inputTokens, 550); assert.equal(filtered.pagination.total, 55)
  assert.equal((await usage.report(database, second, new URLSearchParams('projectId=shared'))).totals.inputTokens, 999999)
  assert.equal((await usage.report(database, first, new URLSearchParams('from=2026-10-09&to=2026-10-10'))).pagination.total, 0)
  assert.equal((await usage.report(database, first, new URLSearchParams('status=unknown'))).operations[0].attempt, null)
  // Expired grant allocations are not actually returned to the balance.
  await credits.reserve(first, 'expired-refund', 'asset'); now = new Date('2026-11-08T10:00:00Z'); await credits.refund('expired-refund')
  assert.equal((await usage.report(database, first, new URLSearchParams())).totals.creditsRefunded, 1)
  // Retry has a new credit operation; its old call and credit link stay immutable.
  now = new Date('2026-10-08T10:01:00Z')
  const metering = new GenerationCredits(credits, assets, usage), jobId = randomUUID()
  const initial = await metering.reserve(first, jobId, 'asset')
  assets.createJob({ url: 'https://example.com/product', notes: '' }, { id: jobId, ownerUserId: first })
  assets.updateJob(jobId, { status: 'failed' }); await metering.settle(jobId)
  const retried = await metering.reserve(first, jobId, 'asset')
  assert.notEqual(initial, retried); assert.equal(assets.creditJob(initial), jobId); assert.equal(assets.creditJob(retried), jobId)
  assert.equal(assets.creditAttempt(initial), 1); assert.equal(assets.creditAttempt(retried), 2)
  // Registration occurs before revision job creation; enrichment must preserve
  // its immutable parent, including while the attempt is still queued.
  const revisionJobId = randomUUID(), parentAssetId = randomUUID()
  const revisionOperation = await metering.reserve(first, revisionJobId, 'revision')
  assets.createJob({ url: 'https://example.com/product', notes: '' }, { id: revisionJobId, ownerUserId: first, parentAssetId })
  metering.queued(revisionJobId)
  const revisionReport = await usage.report(database, first, new URLSearchParams('operationType=revision'))
  assert.equal(revisionReport.operations[0].id, revisionOperation); assert.equal(revisionReport.operations[0].parentId, parentAssetId)
  // A model response can succeed while rendering fails; terminal operation
  // outcome must remain distinct from the observed model call outcome.
  const renderCall = usage.begin(revisionOperation, 'codex-local', 'analysis', 1, null)
  usage.observe(renderCall.id, { input_tokens: 7, output_tokens: 4 }, 'codex.turn.completed'); usage.finish(renderCall.id, 'succeeded')
  assets.updateJob(revisionJobId, { status: 'failed' }); await metering.settle(revisionJobId)
  assert.equal((await usage.report(database, first, new URLSearchParams('operationType=revision'))).operations[0].status, 'failed')
  // A later valid correction succeeds without erasing the earlier invalid call.
  const corrected = usage.begin(retried, 'codex-local', 'generation', 1, null)
  usage.observe(corrected.id, { input_tokens: 3, output_tokens: 1 }, 'codex.turn.completed'); usage.finish(corrected.id, 'invalid')
  const correction = usage.begin(retried, 'codex-local', 'correction', 2, null)
  usage.observe(correction.id, { input_tokens: 4, output_tokens: 2 }, 'codex.turn.completed'); usage.finish(correction.id, 'succeeded')
  assets.markCreditInference(jobId); assets.updateJob(jobId, { status: 'needs_input' }); await metering.settle(jobId)
  const correctionReport = await usage.report(database, first, new URLSearchParams('status=needs_input&limit=100'))
  assert.equal(correctionReport.operations.find(operation => operation.id === retried)?.status, 'needs_input')
  assert.deepEqual(usage.calls(retried).map(call => call.status), ['invalid', 'succeeded'])
  // If a process disappears immediately after an orphan refund is committed,
  // its usage outcome must already be durable: it is no longer reserved and
  // therefore will not appear in the next reserved-credit reconciliation.
  await credits.reserve(first, 'orphan-refund', 'asset'); usage.operation(metadata('orphan-refund', first))
  const refund = credits.refund.bind(credits)
  const crash = t.mock.method(credits, 'refund', async (id: string) => {
    const result = await refund(id)
    if (id === 'orphan-refund') throw new Error('Controlled exit immediately after refund')
    return result
  })
  await assert.rejects(metering.recover(), /Controlled exit/)
  crash.mock.restore()
  assert.equal((await credits.reservation('orphan-refund'))?.state, 'refunded')
  assert.equal((await usage.report(database, first, new URLSearchParams('status=failed&limit=100'))).operations.find(operation => operation.id === 'orphan-refund')?.status, 'failed')
  usage.close(); usage = new UsageStore(path); assets.close(); assets = new AssetStore(assetPath)
  assert.equal(assets.creditJob(initial), jobId); assert.equal(assets.creditJob(retried), jobId)
  assert.equal((await usage.report(database, first, new URLSearchParams('provider=codex-local'))).totals.inputTokens, 564)
})

test('private usage endpoint scopes access to the session owner, even with a shared project or forged user filter', async t => {
  const store = new AssetStore(':memory:')
  const worker = new AssetWorker({ store, directory: '.', planner: async () => { throw new Error('No generations in this test') }, renderer: async () => {} })
  const authorizedIds: string[] = []
  const server = createApi({ store, worker, access: { authorize: async request => request.headers.authorization === 'fixture' ? { id: 'actual-user', email: 'test@example.test', name: 'Test', role: 'user' } : null },
    usage: { report: async userId => { authorizedIds.push(userId); return { totals: { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, creditsConsumed: 0, creditsReserved: 0, creditsRefunded: 0, calls: 0, attempts: 0, durationMs: null, measuredCalls: 0, partialCalls: 0, unknownCalls: 0, measurement: 'unknown' as const }, operations: [], projects: [], pagination: { limit: 20, offset: 0, total: 0 } } } },
    health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true } }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object')
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await worker.close(); store.close() })
  const url = `http://127.0.0.1:${address.port}/api/usage?userId=other-user&projectId=shared`
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(url, { headers: { Authorization: 'fixture' } })).status, 200)
  assert.deepEqual(authorizedIds, ['actual-user'])
})
