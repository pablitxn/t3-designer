import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CodexPlanningError, runVisualTurn } from '../src/codex.ts'

const outputSchema = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } }
const options = () => ({ signal: new AbortController().signal, workingDirectory: '.', onProgress() {} })
const code = (expected: string) => (error: unknown) => error instanceof CodexPlanningError && error.code === expected

test('foundation visual turns dispatch to the local subscription with high reasoning, scoped images and unchanged isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-foundation-')), original = process.env
  try {
    const command = join(directory, 'fake-codex'), capture = join(directory, 'captured.json')
    await writeFile(command, `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';\nlet prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),prompt,apiKeyPresent:!!process.env.OPENAI_API_KEY,codexKeyPresent:!!process.env.CODEX_API_KEY,otherSecretPresent:!!process.env.DATABASE_URL}));process.stdout.write(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'{"summary":"Plano analizado"}'}})+'\\n');});\n`)
    await chmod(command, 0o700)
    process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: command, T3_CODEX_MODEL: 'fixture-model', OPENAI_API_KEY: 'unused-test-secret', CODEX_API_KEY: 'unused-test-secret', DATABASE_URL: 'unused-test-secret' }
    let started = 0
    const imagePath = join(directory, 'private-plan.png')
    const answer = await runVisualTurn([{ type: 'text', text: 'Inspect this floor plan and return its summary.' }, { type: 'local_image', path: imagePath }], outputSchema,
      { ...options(), workingDirectory: directory, reasoningEffort: 'high', maxOutputTokens: 24000, timeoutMs: 30 * 60_000, onInference: () => started++ }, false,
      (async () => { throw new Error('Hosted API must not be called for subscription inference') }) as typeof fetch)
    assert.equal(answer, '{"summary":"Plano analizado"}'); assert.equal(started, 1)
    const captured = JSON.parse(await readFile(capture, 'utf8')) as { args: string[]; prompt: string; apiKeyPresent: boolean; codexKeyPresent: boolean; otherSecretPresent: boolean }
    assert.match(captured.prompt, /floor plan/)
    assert.equal(captured.apiKeyPresent, false); assert.equal(captured.codexKeyPresent, false); assert.equal(captured.otherSecretPresent, false)
    assert.ok(captured.args.includes('model_reasoning_effort="high"'))
    assert.ok(captured.args.includes('forced_login_method="chatgpt"'))
    assert.ok(captured.args.includes('web_search="disabled"'))
    assert.ok(captured.args.includes('features.shell_tool=false'))
    assert.ok(captured.args.includes('features.hooks=false'))
    assert.ok(captured.args.includes('read-only'))
    assert.ok(captured.args.includes('approval_policy="never"'))
    assert.ok(captured.args.includes('--ephemeral')); assert.ok(captured.args.includes('--ignore-user-config'))
    assert.ok(captured.args.includes(imagePath))
    assert.equal(captured.args.some(argument => /max_output_tokens/.test(argument)), false, 'the SDK has no supported token-budget option; do not invent a flag')
  } finally { process.env = original; await rm(directory, { recursive: true, force: true }) }
})

test('hosted foundation turns preserve their token budget and never fall back to a local session', async () => {
  const original = process.env
  try {
    process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only', T3_CODEX_BIN: '/no-codex-executable' }
    let calls = 0
    const fetcher = (async (_url, init) => {
      calls++
      const body = JSON.parse(String(init?.body))
      assert.equal(body.max_output_tokens, 24000); assert.deepEqual(body.reasoning, { effort: 'high' })
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"summary":"Hosted"}' }] }] }))
    }) as typeof fetch
    assert.equal(await runVisualTurn([], outputSchema, { ...options(), reasoningEffort: 'high', maxOutputTokens: 24000 }, false, fetcher), '{"summary":"Hosted"}')
    assert.equal(calls, 1)
    await assert.rejects(runVisualTurn([], outputSchema, options(), false, (async () => new Response('private provider error', { status: 401 })) as typeof fetch), code('authentication'))
  } finally { process.env = original }
})

test('local visual failures, cancellation and bounded timeouts do not return partial results or private CLI errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-failure-')), original = process.env
  try {
    const command = join(directory, 'fake-codex')
    process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: command }
    const setup = async (body: string) => { await writeFile(command, `#!${process.execPath}\n${body}\n`); await chmod(command, 0o700) }
    await setup(`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:'Authentication failed: private token'}})+'\\n'))`)
    await assert.rejects(runVisualTurn([], outputSchema, options(), false), error => code('authentication')(error) && !String(error).includes('private token'))
    await setup(`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'x'.repeat(200001)}})+'\\n'))`)
    await assert.rejects(runVisualTurn([], outputSchema, options(), false), code('codex_failed'))
    await setup('process.stdin.resume();setInterval(()=>{},1000)')
    await assert.rejects(runVisualTurn([], outputSchema, { ...options(), timeoutMs: 100 }, false), code('timeout'))
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 100)
    try { await assert.rejects(runVisualTurn([], outputSchema, { ...options(), signal: controller.signal }, false), code('cancelled')) } finally { clearTimeout(timer) }
    let started = false
    process.env.NODE_ENV = 'production'
    await assert.rejects(runVisualTurn([], outputSchema, { ...options(), onInference: () => { started = true } }, false), code('configuration'))
    assert.equal(started, false)
  } finally { process.env = original; await rm(directory, { recursive: true, force: true }) }
})
