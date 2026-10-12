import assert from 'node:assert/strict'
import test from 'node:test'
import { codexTransport, initializeCodexSession, closeCodexSession } from '../src/codex-session.ts'
import { getCodexHealth, runVisualTurn } from '../src/codex.ts'

test('app-server startup rejects public/hosted configurations before launching a login', async () => {
  const original = process.env
  try {
    for (const override of [
      { NODE_ENV: 'production' }, { T3_INFERENCE_PROVIDER: 'openai' },
      { T3_API_HOST: '0.0.0.0', T3_LOCAL_CONTAINER: 'true' },
      { T3_PUBLIC_URL: 'https://example.com' }, { T3_PUBLIC_URL: 'file:///tmp' },
      { T3_PUBLIC_URL: 'http://user:pass@localhost' }, { T3_PUBLIC_URL: 'invalid' },
    ]) {
      process.env = { NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_TRANSPORT: 'app-server',
        T3_CODEX_BIN: '/must-not-launch-codex', ...override }
      await assert.rejects(initializeCodexSession(), { code: 'configuration' })
    }
  } finally { process.env = original; await closeCodexSession() }
})

test('app-server inference and health never fall back to managed exec credentials', async () => {
  const original = process.env
  process.env = { NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'codex-local', T3_CODEX_TRANSPORT: 'app-server',
    T3_CODEX_BIN: '/must-not-launch-codex' }
  try {
    assert.deepEqual(await getCodexHealth(), { available: false, authenticated: false, authMode: 'unavailable' })
    await assert.rejects(runVisualTurn([{ type: 'text', text: 'do not run' }], {}, {
      signal: new AbortController().signal, workingDirectory: '/tmp', onProgress() {},
    }, false), { code: 'configuration' })
  } finally { process.env = original; await closeCodexSession() }
})

test('existing exec transport remains default and misspelled transport fails explicitly', async () => {
  const original = process.env
  try {
    process.env = { T3_CODEX_BIN: '/must-not-launch-codex' }
    assert.equal(codexTransport(), 'exec')
    await initializeCodexSession()
    process.env.T3_CODEX_TRANSPORT = 'appserver'
    assert.throws(codexTransport, { code: 'configuration' })
  } finally { process.env = original }
})
