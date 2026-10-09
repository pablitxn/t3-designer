import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inferenceProvider, openaiVisualTurn, OpenAIProviderError } from '../src/openai.ts'
import { UsageStore, withUsage } from '../src/usage.ts'

test('public provider only submits bounded structured hosted requests without inherited credentials or arbitrary tools', async t => {
  const before = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only'
  const directory = await mkdtemp(join(tmpdir(), 't3-openai-'))
  t.after(async () => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; await rm(directory, { recursive: true, force: true }) })
  const path = join(directory, 'photo.png')
  await writeFile(path, Buffer.from('test-image'))
  let calls = 0, started = 0
  const options = { signal: new AbortController().signal, workingDirectory: directory, onProgress() {}, onInference: () => started++ }
  const fetcher = (async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(init?.redirect, 'error')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.store, false)
    assert.equal(body.model, 'gpt-6-astra')
    assert.deepEqual(body.reasoning, { effort: 'max' })
    assert.equal(body.max_output_tokens, 128000)
    assert.deepEqual(body.tools, [{ type: 'web_search' }])
    assert.equal(body.max_tool_calls, 6)
    assert.equal(body.text.format.type, 'json_schema')
    assert.equal(body.text.format.strict, true)
    assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,/)
    return new Response(JSON.stringify({ status: 'completed', error: null, output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }))
  }) as typeof fetch
  assert.equal(await openaiVisualTurn([{ type: 'text', text: 'data' }, { type: 'local_image', path }], { type: 'object' }, options, true, fetcher), '{"ok":true}')
  assert.equal(started, 1); assert.equal(calls, 1)
  await openaiVisualTurn([], {}, { ...options, reasoningEffort: 'high', maxOutputTokens: 24000 }, false, (async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.reasoning, { effort: 'max' }, 'local effort hints cannot lower hosted reasoning')
    assert.equal(body.max_output_tokens, 24000)
    assert.equal(body.tools, undefined)
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] }))
  }) as typeof fetch)
  const errorFetch = (async () => new Response('private credential and prompt', { status: 401 })) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, options, false, errorFetch), error => error instanceof Error && error.message === 'OpenAI authentication failed')
  const incomplete = (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, options, false, incomplete), /incomplete/)
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(openaiVisualTurn([], {}, { ...options, signal: cancelled.signal }, false, fetcher))
  assert.equal(calls, 1)
})

test('inference identity is explicit and never falls back to local sessions when configured openai', () => {
  assert.equal(inferenceProvider({}), 'openai')
  assert.equal(inferenceProvider({ OPENAI_API_KEY: 'test' }), 'openai')
  assert.equal(inferenceProvider({ T3_INFERENCE_PROVIDER: 'openai' }), 'openai')
  assert.equal(inferenceProvider({ T3_INFERENCE_PROVIDER: 'codex-local' }), 'codex-local')
  assert.throws(() => inferenceProvider({ T3_INFERENCE_PROVIDER: 'anything' }))
})

test('a missing API key fails before inference without falling back to the local subscription', async t => {
  const before = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  t.after(() => { if (before !== undefined) process.env.OPENAI_API_KEY = before })
  let called = false
  await assert.rejects(openaiVisualTurn([], {}, { signal: new AbortController().signal, workingDirectory: '.', onProgress() {}, onInference() { called = true } }, false,
    (async () => { called = true; throw new Error('must not fetch') }) as typeof fetch), /authentication is not configured/)
  assert.equal(called, false)
})

test('HTTP and streamed provider errors distinguish billing, rate limits and authentication without exposing messages', async t => {
  const before = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only'
  t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before })
  const options = { signal: new AbortController().signal, workingDirectory: '.', onProgress() {} }
  const privateMessage = 'private-prompt private-api-key private-url insufficient_quota'
  for (const [code, expected] of [
    ['credit_balance_exhausted', 'billing'], ['insufficient_quota', 'billing'], ['organization_spend_limit_exceeded', 'billing'],
    ['project_spend_limit_exceeded', 'billing'], ['organization_usage_limit_exceeded', 'billing'],
    ['rate_limit_exceeded', 'rate_limit'], ['slow_down', 'rate_limit'], ['rate_limit_error', 'rate_limit'],
    ['invalid_api_key', 'authentication'], ['permission_denied', 'authentication'], ['unknown_provider_code', null],
  ] as const) {
    const error = { code, message: privateMessage }
    const failed = { status: 'failed', error, model: 'gpt-6-astra', usage: null }
    const variants = [
      () => new Response(JSON.stringify({ error }), { status: 429 }),
      () => new Response(`event: error\ndata: ${JSON.stringify({ type: 'error', ...error })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }),
      () => new Response(`data: ${JSON.stringify({ type: 'response.failed', response: failed })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }),
      () => new Response(JSON.stringify(failed)),
    ]
    for (const response of variants) await assert.rejects(openaiVisualTurn([], {}, options, false, (async () => response()) as typeof fetch), failure => {
      assert.ok(failure instanceof Error)
      assert.doesNotMatch(failure.message, /private-|unknown_provider_code/)
      if (expected) assert.ok(failure instanceof OpenAIProviderError && failure.code === expected)
      else assert.equal(failure instanceof OpenAIProviderError, false, 'free text must not be classified as a machine code')
      return true
    })
  }
  await assert.rejects(openaiVisualTurn([], {}, options, false, (async () => new Response(JSON.stringify({ error: { type: 'insufficient_quota', message: privateMessage } }), { status: 429 })) as typeof fetch), error => error instanceof OpenAIProviderError && error.code === 'billing')
  await assert.rejects(openaiVisualTurn([], {}, options, false, (async () => new Response(privateMessage, { status: 429 })) as typeof fetch), { message: 'OpenAI quota or rate limit reached' })
})

test('a preliminary stream error still records the following failed response usage and model', async t => {
  const before = process.env.OPENAI_API_KEY, usage = new UsageStore(':memory:')
  process.env.OPENAI_API_KEY = 'test-only'
  t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; usage.close() })
  for (const stream of [false, true]) for (const measured of [false, true]) {
    const id = `${stream}-${measured}`
    usage.operation({ id, userId: 'owner', kind: 'asset', projectId: null, projectLabel: null, jobId: 'job', runId: null, assetId: null, parentId: null, attempt: 1 })
    const failed = { status: 'failed', error: { code: 'credit_balance_exhausted', message: 'private-provider-detail' }, model: 'gpt-6-astra', usage: measured ? { input_tokens: 17, output_tokens: 9 } : null }
    const events = [{ type: 'error', code: 'credit_balance_exhausted', message: 'private-provider-detail' }, { type: 'response.failed', response: failed }]
    let nextEvent = 0
    const fetcher = (async () => stream ? new Response(new ReadableStream({ pull(controller) {
      if (nextEvent < events.length) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(events[nextEvent++])}\n\n`))
      else controller.close()
    } }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'text/event-stream' } }) : new Response(JSON.stringify(failed))) as typeof fetch
    await assert.rejects(withUsage(usage, id, () => openaiVisualTurn([], {}, { signal: new AbortController().signal, workingDirectory: '.', onProgress() {} }, false, fetcher)), error => error instanceof OpenAIProviderError && error.code === 'billing')
    const [call] = usage.calls(id)
    assert.equal(call.status, 'failed'); assert.equal(call.effectiveModel, 'gpt-6-astra')
    assert.equal(call.inputTokens, measured ? 17 : null); assert.equal(call.outputTokens, measured ? 9 : null)
    assert.equal(call.measurement, measured ? 'complete' : 'unknown')
    assert.doesNotMatch(JSON.stringify(call), /private-provider-detail/)
  }
})

test('streaming accepts only a completed structured response across split SSE and UTF-8 boundaries', async t => {
  const before = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only'
  t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before })
  const terminal = { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ciudad":"Córdoba"}' }] }] } }
  const bytes = new TextEncoder().encode(`event: response.output_text.delta\r\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'private unvalidated draft' })}\r\n\r\nevent: response.completed\r\ndata: ${JSON.stringify(terminal)}\r\n\r\n`)
  const fetcher = (async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, true)
    return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close() } }), { headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof fetch
  const progress: string[] = []
  const value = await openaiVisualTurn([], {}, { signal: new AbortController().signal, workingDirectory: '.', onProgress: value => progress.push(value) }, false, fetcher)
  assert.equal(value, '{"ciudad":"Córdoba"}')
  assert.deepEqual(progress, ['Analizando referencias con OpenAI…'])
})

test('stream failure, premature end and cancellation never return partial generated output', async t => {
  const before = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only'
  t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before })
  const options = { signal: new AbortController().signal, workingDirectory: '.', onProgress() {} }
  for (const [event, expected] of [
    [{ type: 'response.output_text.delta', delta: 'partial' }, /without a completed result/],
    [{ type: 'response.failed', response: { error: { message: 'private provider payload' } } }, /^OpenAI stream failed$/],
    [{ type: 'response.incomplete', response: { status: 'incomplete', output: [] } }, /incomplete/],
  ] as const) {
    const fetcher = (async () => new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })) as typeof fetch
    await assert.rejects(openaiVisualTurn([], {}, options, false, fetcher), error => error instanceof Error && expected.test(error.message))
  }
  const malformed = (async () => new Response('data: private provider payload\n\n', { headers: { 'Content-Type': 'text/event-stream' } })) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, options, false, malformed), error => error instanceof Error && error.message === 'OpenAI returned an invalid stream event')
  const controller = new AbortController()
  let cancelled = false
  const fetcher = (async () => new Response(new ReadableStream({ start() { setTimeout(() => controller.abort(), 5) }, cancel() { cancelled = true } }), { headers: { 'Content-Type': 'text/event-stream' } })) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, { ...options, signal: controller.signal }, false, fetcher), error => error instanceof Error && error.name === 'AbortError')
  assert.equal(cancelled, true)
})
