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
