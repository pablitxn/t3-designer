import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('QA executable fails closed before opening storage when exposed or configured for external services', async t => {
  const entry = fileURLToPath(new URL('./owner-qa-backend.ts', import.meta.url))
  const environment = { PATH: process.env.PATH, NODE_ENV: 'development', T3_OWNER_QA: 'isolated-fixtures' }
  for (const [name, changes] of Object.entries({
    production: { NODE_ENV: 'production' },
    missingOptIn: { T3_OWNER_QA: '' },
    remoteOrigin: { T3_QA_ORIGIN: 'http://example.test:4189' },
    existingLibrary: { T3_QA_DIRECTORY: 'artifacts/asset-library' },
    postgres: { T3_DATABASE_URL: 'postgres://synthetic.invalid/qa' },
    hostedKey: { OPENAI_API_KEY: 'synthetic-test-value' },
    codexKey: { CODEX_API_KEY: 'synthetic-test-value' },
    externalTelemetry: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://synthetic.invalid' },
  })) await t.test(name, async () => {
    await assert.rejects(promisify(execFile)(process.execPath, [entry], { env: { ...environment, ...changes }, timeout: 10_000 }),
      error => error instanceof Error && error.message.includes('Owner QA requires explicit development'))
  })
})
