import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inferenceProvider, openaiVisualTurn } from '../src/openai.ts'

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
    assert.equal(body.max_output_tokens, 12000)
    assert.deepEqual(body.tools, [{ type: 'web_search' }])
    assert.equal(body.max_tool_calls, 6)
    assert.equal(body.text.format.type, 'json_schema')
    assert.equal(body.text.format.strict, true)
    assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,/)
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }))
  }) as typeof fetch
  assert.equal(await openaiVisualTurn([{ type: 'text', text: 'data' }, { type: 'local_image', path }], { type: 'object' }, options, true, fetcher), '{"ok":true}')
  assert.equal(started, 1); assert.equal(calls, 1)
  const errorFetch = (async () => new Response('private credential and prompt', { status: 401 })) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, options, false, errorFetch), error => error instanceof Error && error.message === 'OpenAI authentication failed')
  const incomplete = (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))) as typeof fetch
  await assert.rejects(openaiVisualTurn([], {}, options, false, incomplete), /incomplete/)
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(openaiVisualTurn([], {}, { ...options, signal: cancelled.signal }, false, fetcher))
  assert.equal(calls, 1)
})

test('inference identity is explicit and never falls back to local sessions when configured openai', () => {
  assert.equal(inferenceProvider({}), 'codex-local')
  assert.equal(inferenceProvider({ OPENAI_API_KEY: 'test' }), 'openai')
  assert.equal(inferenceProvider({ T3_INFERENCE_PROVIDER: 'openai' }), 'openai')
  assert.throws(() => inferenceProvider({ T3_INFERENCE_PROVIDER: 'anything' }))
})
