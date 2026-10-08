import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runtimeConfig } from '../src/config.ts'

test('local container binding is explicit and limited to loopback browser origins', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-config-'))
  const original = process.env
  const config = async (env: Record<string, string>) => {
    process.env = { NODE_ENV: 'development', T3_AUTH_SECRET: 'x'.repeat(48), ...env }
    return runtimeConfig(directory)
  }
  try {
    await assert.rejects(config({ T3_API_HOST: '0.0.0.0' }), /loopback/)
    const local = await config({ T3_API_HOST: '0.0.0.0', T3_LOCAL_CONTAINER: 'true', T3_PUBLIC_URL: 'http://127.0.0.1:8080' })
    assert.equal(local.host, '0.0.0.0')
    assert.equal(local.generation.enabled, false)
    assert.equal(local.billing.mode, 'disabled')
    await assert.rejects(config({ T3_API_HOST: '0.0.0.0', T3_LOCAL_CONTAINER: 'true', T3_PUBLIC_URL: 'https://example.com' }), /T3_LOCAL_CONTAINER/)
    await assert.rejects(config({ NODE_ENV: 'production', T3_LOCAL_CONTAINER: 'true', T3_PUBLIC_URL: 'https://example.com', T3_DATABASE_URL: 'postgresql://db/example' }), /T3_LOCAL_CONTAINER/)
    await assert.rejects(config({ T3_LOCAL_CONTAINER: 'true', T3_API_HOST: '192.0.2.1' }), /loopback/)
  } finally {
    process.env = original
    await rm(directory, { recursive: true, force: true })
  }
})

test('subscription inference is limited to local loopback while hosted generation retains its production contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-config-')), original = process.env
  const config = async (env: Record<string, string>) => {
    process.env = { NODE_ENV: 'development', T3_AUTH_SECRET: 'x'.repeat(48), T3_GENERATION_ENABLED: 'true', T3_INFERENCE_PROVIDER: 'codex-local', ...env }
    return runtimeConfig(directory)
  }
  try {
    assert.equal((await config({})).generation.enabled, true)
    assert.equal((await config({ T3_API_HOST: '::1', T3_PUBLIC_URL: 'http://[::1]:5173' })).generation.enabled, true)
    await assert.rejects(config({ T3_PUBLIC_URL: 'https://remote.example' }), /loopback/)
    await assert.rejects(config({ T3_API_HOST: '0.0.0.0', T3_LOCAL_CONTAINER: 'true' }), /loopback/)
    await assert.rejects(config({ NODE_ENV: 'production', T3_PUBLIC_URL: 'https://remote.example', T3_DATABASE_URL: 'postgresql://db/example' }), /generación remota/)
    const hosted = await config({ NODE_ENV: 'production', T3_INFERENCE_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only', T3_PUBLIC_URL: 'https://remote.example', T3_DATABASE_URL: 'postgresql://db/example' })
    assert.equal(hosted.production, true); assert.equal(hosted.generation.enabled, true)
  } finally { process.env = original; await rm(directory, { recursive: true, force: true }) }
})

test('foundation workflow deadline is bounded, explicitly local and independent of the per-call deadline', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-foundation-timeout-config-')), original = process.env
  t.after(async () => { process.env = original; await rm(directory, { recursive: true, force: true }) })
  const config = async (env: Record<string, string> = {}) => {
    process.env = { NODE_ENV: 'development', T3_AUTH_SECRET: 'x'.repeat(48), ...env }
    return runtimeConfig(directory)
  }
  assert.equal((await config()).foundationTimeoutMs, 30 * 60_000)
  for (const value of [1, 60 * 60_000, 2 * 60 * 60_000]) {
    assert.equal((await config({ T3_FOUNDATION_TIMEOUT_MS: String(value) })).foundationTimeoutMs, value)
  }
  for (const value of ['', '0', '-1', '0.5', 'NaN', 'Infinity', '7200001', '9007199254740992']) {
    await assert.rejects(config({ T3_FOUNDATION_TIMEOUT_MS: value }), /T3_FOUNDATION_TIMEOUT_MS.*entero/)
  }
  await assert.rejects(config({ T3_FOUNDATION_TIMEOUT_MS: '3600000', T3_PUBLIC_URL: 'https://remote.example' }), /desarrollo local/)
  const production = { NODE_ENV: 'production', T3_PUBLIC_URL: 'https://remote.example', T3_DATABASE_URL: 'postgresql://db/example' }
  assert.equal((await config(production)).foundationTimeoutMs, 30 * 60_000)
  await assert.rejects(config({ ...production, T3_FOUNDATION_TIMEOUT_MS: '3600000' }), /desarrollo local/)
  // The existing Codex setting controls furniture calls, not this workflow.
  assert.equal((await config({ T3_CODEX_TIMEOUT_MS: '600000' })).foundationTimeoutMs, 30 * 60_000)
})
