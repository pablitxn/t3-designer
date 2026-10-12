import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const smoke = fileURLToPath(new URL('../src/codex-smoke.ts', import.meta.url))

test('Codex smoke requires a real model response and preserves subscription isolation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-smoke-'))
  const command = join(directory, 'fake-codex'), capture = join(directory, 'captured.json')
  const env = { ...process.env, NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_BIN: command,
    T3_CODEX_MODEL: 'test-requested-model', OPENAI_API_KEY: 'must-not-inherit', CODEX_API_KEY: 'must-not-inherit', DATABASE_URL: 'must-not-inherit' }
  const setup = async (event: object | object[], stderr = '', exitCode = 0) => {
    await writeFile(command, `#!${process.execPath}
import { writeFileSync } from 'node:fs'
if (process.argv[2] === 'login') { process.stderr.write('Logged in using ChatGPT'); process.exit(0) }
writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args: process.argv.slice(2),
  secrets: [process.env.OPENAI_API_KEY, process.env.CODEX_API_KEY, process.env.DATABASE_URL].some(Boolean) }))
process.stdin.resume()
process.stdin.on('end', () => {
  for (const event of ${JSON.stringify(Array.isArray(event) ? event : [event])}) process.stdout.write(JSON.stringify(event) + '\\n')
  process.stderr.write(${JSON.stringify(stderr)})
  process.exitCode = ${exitCode}
})
`)
    await chmod(command, 0o700)
  }
  const run = (overrides: NodeJS.ProcessEnv = {}) => new Promise<{ exitCode: number; stdout: string; stderr: string }>(resolve => {
    execFile(process.execPath, [smoke], { env: { ...env, ...overrides }, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? Number(error.code) : 0, stdout, stderr })
    })
  })
  try {
    await t.test('stored login does not turn a rejected token into success', async () => {
      await setup({ type: 'turn.failed', error: { message: '401 Unauthorized: Could not parse your authentication token: private-token-value at /private/path' } })
      const result = await run(), report = JSON.parse(result.stdout)
      assert.equal(result.exitCode, 1)
      assert.equal(report.storedChatGptLogin, true)
      assert.equal(report.inference, 'failed')
      assert.equal(report.error.code, 'authentication')
      assert.doesNotMatch(result.stdout + result.stderr, /private-token-value|private\/path|must-not-inherit/)
    })
    await t.test('a validated response passes through the actual SDK and isolated wrapper', async () => {
      await setup({ type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: '{"status":"ok"}' } })
      const result = await run(), report = JSON.parse(result.stdout)
      assert.equal(result.exitCode, 0)
      assert.equal(report.inference, 'passed')
      assert.equal(report.requestedModel, env.T3_CODEX_MODEL)
      const invocation = JSON.parse(await readFile(capture, 'utf8')) as { args: string[]; secrets: boolean }
      assert.equal(invocation.secrets, false)
      for (const arg of ['--ignore-user-config', '--ignore-rules', '--ephemeral', 'read-only', 'forced_login_method="chatgpt"', 'web_search="disabled"', env.T3_CODEX_MODEL]) {
        assert.ok(invocation.args.includes(arg), arg)
      }
    })
    await t.test('generic stream failures retain the actionable CLI exit diagnostic', async () => {
      await setup({ type: 'turn.failed', error: { message: 'stream disconnected before completion' } },
        'HTTP 401 Unauthorized: Could not parse your authentication token: private-stderr-token', 1)
      const result = await run()
      assert.equal(result.exitCode, 1)
      assert.equal(JSON.parse(result.stdout).error.code, 'authentication')
      assert.doesNotMatch(result.stdout + result.stderr, /private-stderr-token/)
    })
    await t.test('a reply after a failure cannot turn a failed stream into success', async () => {
      await setup([
        { type: 'error', message: '401 Unauthorized: private-stream-token' },
        { type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: '{"status":"ok"}' } },
      ])
      const result = await run()
      assert.equal(result.exitCode, 1)
      assert.equal(JSON.parse(result.stdout).inference, 'failed')
      assert.equal(JSON.parse(result.stdout).error.code, 'authentication')
      assert.doesNotMatch(result.stdout + result.stderr, /private-stream-token/)
    })
    await t.test('malformed or extra response data cannot produce a false positive', async () => {
      for (const text of ['not-json: private-response', '{"status":"ok","unexpected":"private-response"}']) {
        await setup({ type: 'item.completed', item: { id: 'reply', type: 'agent_message', text } })
        const result = await run()
        assert.equal(result.exitCode, 1)
        assert.equal(JSON.parse(result.stdout).error.code, 'invalid_response')
        assert.doesNotMatch(result.stdout + result.stderr, /private-response/)
      }
    })
    await t.test('hosted and production configurations never start a subscription request', async () => {
      await rm(capture)
      for (const overrides of [{ T3_INFERENCE_PROVIDER: 'openai' }, { NODE_ENV: 'production' }]) {
        const result = await run(overrides)
        assert.equal(result.exitCode, 1)
        assert.equal(JSON.parse(result.stdout).inference, 'not-run')
        assert.equal(JSON.parse(result.stdout).error.code, 'configuration')
      }
      await assert.rejects(readFile(capture), { code: 'ENOENT' })
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
