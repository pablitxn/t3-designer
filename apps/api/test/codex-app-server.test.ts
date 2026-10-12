import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import { CodexAppServer } from '../src/codex-app-server.ts'
import { codexConfig } from '../src/codex-config.ts'
import { getCodexHealth, runVisualTurn } from '../src/codex.ts'
import { closeCodexSession, initializeCodexSession } from '../src/codex-session.ts'
import { UsageStore, withUsage } from '../src/usage.ts'

type RecordValue = Record<string, unknown>
type Packet = { method?: string; params?: RecordValue; args?: string[]; environment?: RecordValue; pid?: number; id?: string | number; result?: unknown; error?: unknown }
const schema = { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', const: 'ok' } } }
const signal = () => new AbortController().signal
const asRecord = (value: unknown) => value as RecordValue
const safeFailure = (error: unknown) => {
  assert.ok(error instanceof Error)
  assert.doesNotMatch(error.message, /PRIVATE_|private-token|private\.example|\/private\/operator|attacker\.invalid/)
  return true
}
const failureCode = (expected: string) => (error: unknown) => {
  safeFailure(error)
  assert.equal(asRecord(error).code, expected)
  return true
}

async function fixture(t: TestContext, mode = 'normal') {
  const directory = await mkdtemp(join(tmpdir(), 't3-app-server-test-'))
  const command = join(directory, 'fake-codex'), capture = join(directory, 'requests.jsonl'), home = join(directory, 'home')
  await mkdir(home)
  const sentinel = '{"synthetic":"preserve-this-test-file"}\n'
  await writeFile(join(home, 'auth.json'), sentinel, { mode: 0o600 })
  const expectedConfig = {
    ...codexConfig, cli_auth_credentials_store: 'ephemeral', model: 'fixture-astra', approval_policy: 'never', sandbox_mode: 'read-only',
    web_search: 'disabled', analytics: { enabled: false }, history: { persistence: 'none' },
    features: { ...asRecord(codexConfig.features), daemon_auto_start: false },
  }
  await writeFile(command, `#!${process.execPath}
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
const mode = ${JSON.stringify(mode)}, config = ${JSON.stringify(expectedConfig)}
const record = message => appendFileSync(${JSON.stringify(capture)}, JSON.stringify(message) + '\\n')
record({ method: 'spawn', pid: process.pid, args: process.argv.slice(2), environment: {
  apiKey: !!process.env.OPENAI_API_KEY, codexKey: !!process.env.CODEX_API_KEY, database: !!process.env.DATABASE_URL,
  extraSecret: !!process.env.UNRELATED_SECRET, nodeOptions: !!process.env.NODE_OPTIONS, codexHome: process.env.CODEX_HOME } })
let authenticated = false, threads = 0, turns = 0, active = null
const send = value => process.stdout.write(JSON.stringify(value) + '\\n')
const notice = (method, params) => send({ method, params })
const complete = (threadId, turnId, status = 'completed', error = null) => notice('turn/completed', { threadId, turn: { id: turnId, status, items: [], error } })
const input = createInterface({ input: process.stdin })
input.on('close', () => process.exit(0))
input.on('line', line => {
  const message = JSON.parse(line); record(message)
  const reply = result => send({ id: message.id, result })
  if (mode === 'stall') return
  if (mode === 'malformed') return process.stdout.write('not-json PRIVATE_PROTOCOL\\n')
  if (message.method === 'initialize') return reply({ userAgent: 'fixture', codexHome: process.env.CODEX_HOME })
  if (message.method === 'initialized') return
  if (message.method === 'config/read') {
    if (mode === 'wrong-store') config.cli_auth_credentials_store = 'file'
    if (mode === 'unexpected-mcp') config.mcp_servers = { unsafe: { command: 'PRIVATE_COMMAND' } }
    if (mode === 'shell-enabled') config.features.shell_tool = true
    return reply({ config, origins: {}, layers: null })
  }
  if (message.method === 'account/read') return reply({ account: authenticated || mode === 'existing-account'
    ? { type: 'chatgpt', email: 'PRIVATE_ACCOUNT', planType: 'PRIVATE_PLAN' } : null, requiresOpenaiAuth: true })
  if (message.method === 'account/login/start') {
    const result = { type: 'chatgptDeviceCode', loginId: 'PRIVATE_LOGIN', verificationUrl: mode === 'bad-url'
      ? 'https://attacker.invalid/codex/device?token=private-token' : 'https://auth.openai.com/codex/device', userCode: 'TEST-CODE' }
    reply(result)
    if (mode === 'wait-login') return
    if (mode === 'login-error') return notice('account/login/completed', { loginId: 'PRIVATE_LOGIN', success: false, error: 'HTTP 401 PRIVATE_LOGIN_ERROR' })
    authenticated = true
    return notice('account/login/completed', { loginId: 'PRIVATE_LOGIN', success: true, error: null })
  }
  if (message.method === 'thread/start') {
    return reply({ thread: { id: 'thread-' + (++threads), ephemeral: true }, model: 'fixture-astra', modelProvider: 'openai', approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } })
  }
  if (message.method === 'thread/archive' || message.method === 'thread/unsubscribe') return reply({})
  if (message.method === 'turn/interrupt') {
    reply({})
    if (active) { complete(active.threadId, active.turnId, 'interrupted'); active = null }
    return
  }
  if (message.method === 'turn/start') {
    const threadId = message.params.threadId, turnId = 'turn-' + (++turns)
    const prompt = message.params.input.filter(value => value.type === 'text').map(value => value.text).join(' ')
    active = { threadId, turnId }
    reply({ turn: { id: turnId, status: 'inProgress', items: [] } })
    if (prompt.includes('[hold]')) return
    if (prompt.includes('[die]')) { process.stderr.write('PRIVATE_STDERR private-token'); return process.exit(17) }
    if (prompt.includes('[oversized-protocol]')) return process.stdout.write('x'.repeat(2 * 1024 * 1024))
    if (prompt.includes('[oversized-stderr]')) return process.stderr.write('PRIVATE_STDERR'.repeat(2000000))
    if (prompt.includes('[server-request]')) return send({ id: 'request-approval', method: 'item/commandExecution/requestApproval', params: { threadId, turnId, command: 'PRIVATE_COMMAND' } })
    if (prompt.includes('[tool]')) return notice('item/started', { threadId, turnId, item: { type: 'commandExecution', id: 'unsafe-tool', command: 'PRIVATE_COMMAND' } })
    if (prompt.includes('[web]')) {
      const item = { type: 'webSearch', id: 'search', action: { type: 'search', query: 'chair dimensions' } }
      notice('item/started', { threadId, turnId, item }); notice('item/completed', { threadId, turnId, item })
    }
    if (prompt.includes('[totals]')) {
      for (const [inputTokens, outputTokens] of [[10, 2], [30, 7], [30, 7]]) {
        notice('thread/tokenUsage/updated', { threadId, turnId, tokenUsage: {
          total: { totalTokens: inputTokens + outputTokens, inputTokens, cachedInputTokens: 4, outputTokens, reasoningOutputTokens: 3 },
          last: { totalTokens: 6, inputTokens: 5, cachedInputTokens: 1, outputTokens: 1, reasoningOutputTokens: 0 } } })
      }
    }
    if (prompt.includes('[fail]')) return complete(threadId, turnId, 'failed', { message: 'HTTP 401 token rejected: PRIVATE_TOKEN private-token' })
    if (prompt.includes('[error-then-success]')) notice('error', { threadId, turnId, error: { message: 'HTTP 401 PRIVATE_AUTH' } })
    const text = prompt.includes('[oversized-answer]') ? 'x'.repeat(200001) : '{"status":"ok"}'
    notice('item/completed', { threadId, turnId, item: { type: 'agentMessage', id: 'reply', text } })
    complete(threadId, turnId); active = null
    return
  }
  if (message.id !== undefined && !message.method) return
  if (message.id !== undefined) send({ id: message.id, error: { code: -32601, message: 'PRIVATE_UNEXPECTED_METHOD' } })
})
`)
  await chmod(command, 0o700)
  let server: CodexAppServer | undefined
  const records = async (): Promise<Packet[]> => {
    try { return (await readFile(capture, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Packet) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  t.after(async () => { await server?.close(); await rm(directory, { recursive: true, force: true }) })
  return {
    directory, home, command, records,
    async start() {
      server = await CodexAppServer.start({ command, model: 'fixture-astra', cwd: directory, requestTimeoutMs: 2000,
        env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), CODEX_HOME: home,
          OPENAI_API_KEY: 'PRIVATE_API', CODEX_API_KEY: 'PRIVATE_CODEX', DATABASE_URL: 'PRIVATE_DB', UNRELATED_SECRET: 'PRIVATE_OTHER', NODE_OPTIONS: '--require=PRIVATE_FILE' } })
      return server
    },
    async unchangedCredentials() {
      assert.equal(await readFile(join(home, 'auth.json'), 'utf8'), sentinel)
      assert.deepEqual(await readdir(home), ['auth.json'])
    },
  }
}

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5000
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('Fake app-server did not reach the expected state')
    await delay(10)
  }
}

test('ephemeral app-server verifies an empty account before explicit device login and preserves credential files', async t => {
  const f = await fixture(t), server = await f.start()
  let records = await f.records()
  assert.ok(!records.some(packet => packet.method === 'account/login/start' || packet.method === 'turn/start'))
  const startup = records.find(packet => packet.method === 'spawn')!
  for (const secret of ['apiKey', 'codexKey', 'database', 'extraSecret', 'nodeOptions']) assert.equal(startup.environment?.[secret], false)
  const args = startup.args!.join('\n')
  assert.match(args, /cli_auth_credentials_store="ephemeral"/)
  assert.match(args, /forced_login_method="chatgpt"/)
  assert.match(args, /approval_policy="never"/)
  assert.match(args, /sandbox_mode="read-only"/)
  assert.equal(startup.environment?.codexHome, process.env.CODEX_HOME, 'startup preserves the caller auth location while selecting ephemeral storage')
  await assert.rejects(server.run([{ type: 'text', text: 'Before login' }], schema, { signal: signal(), webSearch: false }), failureCode('authentication'))
  const codes: unknown[] = []
  await server.login(code => { codes.push(code) })
  assert.equal(codes.length, 1)
  assert.match(JSON.stringify(codes[0]), /https:\/\/auth\.openai\.com\/codex\/device/)
  assert.doesNotMatch(JSON.stringify(codes), /PRIVATE_|attacker/)
  await server.login(() => { throw new Error('A second login must reuse the in-memory session') })
  records = await f.records()
  assert.equal(records.filter(packet => packet.method === 'account/login/start').length, 1)
  await f.unchangedCredentials()
})

for (const [mode, code] of [['wrong-store', 'configuration'], ['unexpected-mcp', 'configuration'], ['shell-enabled', 'configuration'], ['existing-account', 'configuration'], ['malformed', 'invalid_response'], ['stall', 'connection']]) {
  test(`app-server ${mode} fails closed before device authorization`, async t => {
    const f = await fixture(t, mode)
    await assert.rejects(f.start(), failureCode(code))
    assert.ok(!(await f.records()).some(packet => packet.method === 'account/login/start' || packet.method === 'turn/start'))
    await f.unchangedCredentials()
  })
}

for (const [mode, code] of [['bad-url', 'invalid_response'], ['login-error', 'authentication']]) {
  test(`app-server ${mode} never exposes unexpected URLs or private login details`, async t => {
    const f = await fixture(t, mode), server = await f.start(), codes: unknown[] = []
    await assert.rejects(server.login(code => { codes.push(code) }), failureCode(code))
    assert.doesNotMatch(JSON.stringify(codes), /PRIVATE_|attacker|private-token/)
    assert.ok(!(await f.records()).some(packet => packet.method === 'turn/start'))
  })
}

test('cancelling pending device authorization closes the unauthenticated session', async t => {
  const f = await fixture(t, 'wait-login'), server = await f.start(), controller = new AbortController()
  await assert.rejects(server.login(() => { controller.abort() }, controller.signal), failureCode('cancelled'))
  assert.equal((await server.health()).authenticated, false)
  assert.ok(!(await f.records()).some(packet => packet.method === 'turn/start'))
})

test('two app-server generations share one authorized process while retaining schema, images and isolated threads', async t => {
  const f = await fixture(t), server = await f.start()
  await server.login(() => {})
  const imagePath = join(f.directory, 'reference.png')
  await writeFile(imagePath, 'synthetic-image-fixture')
  for (const text of ['first', 'second']) assert.equal(await server.run([{ type: 'text', text }, { type: 'local_image', path: imagePath }], schema,
    { signal: signal(), webSearch: false, reasoningEffort: 'high' }), '{"status":"ok"}')
  const records = await f.records(), starts = records.filter(packet => packet.method === 'thread/start'), turns = records.filter(packet => packet.method === 'turn/start')
  assert.equal(records.filter(packet => packet.method === 'spawn').length, 1)
  assert.equal(records.filter(packet => packet.method === 'account/login/start').length, 1)
  assert.equal(starts.length, 2); assert.equal(turns.length, 2)
  for (const request of starts) assert.equal(request.params?.ephemeral, true)
  for (const request of turns) {
    assert.deepEqual(request.params?.outputSchema, schema)
    const input = request.params?.input as RecordValue[]
    assert.deepEqual(input[1], { type: 'localImage', path: imagePath })
    assert.equal(request.params?.effort, 'high')
    assert.deepEqual(request.params?.sandboxPolicy, { type: 'readOnly', networkAccess: false })
  }
  await f.unchangedCredentials()
})

test('queued cancellation never starts inference and active cancellation interrupts before the session is reused', async t => {
  const f = await fixture(t), server = await f.start()
  await server.login(() => {})
  const active = new AbortController(), queued = new AbortController()
  const first = server.run([{ type: 'text', text: '[hold]' }], schema, { signal: active.signal, webSearch: false })
  const firstRejected = assert.rejects(first, failureCode('cancelled'))
  await until(async () => (await f.records()).some(packet => packet.method === 'turn/start'))
  const next = server.run([{ type: 'text', text: 'must-not-start' }], schema, { signal: queued.signal, webSearch: false })
  const nextRejected = assert.rejects(next, failureCode('cancelled'))
  queued.abort()
  await nextRejected
  assert.equal((await f.records()).filter(packet => packet.method === 'turn/start').length, 1)
  active.abort()
  await firstRejected
  await until(async () => (await f.records()).some(packet => packet.method === 'turn/interrupt'))
  assert.equal(await server.run([{ type: 'text', text: 'after-interrupt' }], schema, { signal: signal(), webSearch: false }), '{"status":"ok"}')
  assert.equal((await f.records()).filter(packet => packet.method === 'spawn').length, 1)
})

test('app-server death invalidates the session without replacement login or fallback', async t => {
  const f = await fixture(t), server = await f.start()
  await server.login(() => {})
  await assert.rejects(server.run([{ type: 'text', text: '[die]' }], schema, { signal: signal(), webSearch: false }), failureCode('connection'))
  await assert.rejects(server.run([{ type: 'text', text: 'after-death' }], schema, { signal: signal(), webSearch: false }), failureCode('connection'))
  assert.equal((await f.records()).filter(packet => packet.method === 'spawn').length, 1)
  assert.equal((await f.records()).filter(packet => packet.method === 'account/login/start').length, 1)
})

test('hosted web-search activity is permitted only for a turn explicitly requesting it', async t => {
  const f = await fixture(t), server = await f.start(), activity: unknown[] = []
  await server.login(() => {})
  assert.equal(await server.run([{ type: 'text', text: '[web]' }], schema, { signal: signal(), webSearch: true, onEvent: event => { activity.push(event) } }), '{"status":"ok"}')
  assert.ok(activity.length > 0)
  await assert.rejects(server.run([{ type: 'text', text: '[web]' }], schema, { signal: signal(), webSearch: false }), failureCode('configuration'))
  assert.deepEqual((await f.records()).filter(packet => packet.method === 'thread/start').map(packet => asRecord(packet.params?.config).web_search), ['live', 'disabled'])
})

for (const [prompt, code] of [['[tool]', 'configuration'], ['[server-request]', 'configuration'], ['[oversized-answer]', 'invalid_response'], ['[oversized-protocol]', 'invalid_response'], ['[oversized-stderr]', 'invalid_response'], ['[fail]', 'authentication'], ['[error-then-success]', 'authentication']]) {
  test(`app-server ${prompt} cannot publish output or leak private diagnostics`, async t => {
    const f = await fixture(t), server = await f.start()
    await server.login(() => {})
    await assert.rejects(server.run([{ type: 'text', text: prompt }], schema, { signal: AbortSignal.timeout(5000), webSearch: false }), failureCode(code))
    if (prompt === '[server-request]') assert.ok((await f.records()).some(packet => packet.id === 'request-approval' && (packet.error || packet.result)))
  })
}

test('app-server reports cumulative turn tokens once without summing repeated updates or last-request counters', async t => {
  const f = await fixture(t), server = await f.start(), usage: unknown[] = []
  await server.login(() => {})
  assert.equal(await server.run([{ type: 'text', text: '[totals]' }], schema, { signal: signal(), webSearch: false, onUsage: value => { usage.push(value) } }), '{"status":"ok"}')
  assert.equal(usage.length, 1)
  assert.equal(asRecord(usage[0]).input_tokens, 30)
  assert.equal(asRecord(usage[0]).output_tokens, 7)
  assert.equal(asRecord(usage[0]).cached_input_tokens, 4)
  assert.equal(asRecord(usage[0]).reasoning_output_tokens, 3)
  await assert.rejects(server.run([{ type: 'text', text: '[totals] [fail]' }], schema, { signal: signal(), webSearch: false, onUsage: value => { usage.push(value) } }), failureCode('authentication'))
  assert.equal(usage.length, 2, 'failed turns preserve observed usage without duplicate reporting')
  assert.deepEqual(usage[1], usage[0])
})

test('application dispatch and health reuse the authorized server and retain per-call usage without exec or API fallback', async t => {
  const f = await fixture(t), original = process.env, usage = new UsageStore(':memory:'), logs: unknown[] = []
  process.env = { ...original, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_TRANSPORT: 'app-server',
    T3_CODEX_MODEL: 'fixture-astra', T3_CODEX_BIN: f.command, CODEX_HOME: f.home, T3_API_HOST: '127.0.0.1', T3_PUBLIC_URL: 'http://127.0.0.1:5173',
    OPENAI_API_KEY: 'PRIVATE_API', CODEX_API_KEY: 'PRIVATE_CODEX' }
  t.after(async () => { await closeCodexSession(); usage.close(); process.env = original })
  t.mock.method(console, 'log', (...values: unknown[]) => { logs.push(...values) })
  let hostedCalls = 0
  const fetcher = (async () => { hostedCalls++; throw new Error('No API fallback is permitted') }) as typeof fetch
  const options = { signal: signal(), workingDirectory: f.directory, onProgress() {} }
  await initializeCodexSession()
  assert.deepEqual(await getCodexHealth(), { available: true, authenticated: true, authMode: 'chatgpt' })
  for (const id of ['operation-one', 'operation-two']) {
    usage.operation({ id, userId: 'owner', kind: 'asset', projectId: null, projectLabel: null, jobId: 'job', runId: null, assetId: null, parentId: null, attempt: 1 })
    assert.equal(await withUsage(usage, id, () => runVisualTurn([{ type: 'text', text: '[totals]' }], schema, options, false, fetcher)), '{"status":"ok"}')
    const calls = usage.calls(id)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].provider, 'codex-local'); assert.equal(calls[0].authMode, 'chatgpt')
    assert.equal(calls[0].status, 'succeeded'); assert.equal(calls[0].inputTokens, 30); assert.equal(calls[0].outputTokens, 7)
  }
  const records = await f.records()
  assert.equal(records.filter(packet => packet.method === 'spawn').length, 1)
  assert.equal(records.filter(packet => packet.method === 'account/login/start').length, 1)
  assert.equal(records.filter(packet => packet.method === 'turn/start').length, 2)
  assert.equal(hostedCalls, 0)
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_|private-token/)
  await closeCodexSession()
  assert.equal((await getCodexHealth()).authenticated, false)
  await f.unchangedCredentials()
})
