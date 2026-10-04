import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

assert.equal(process.getuid(), 1000, 'The API image must run as UID 1000')
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Native TS/SQLite runtime requires Node 24+')
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 't3-api-image-smoke-'))
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const address = reservation.address()
assert.ok(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
reservation.close()
await once(reservation, 'close')

// Disposable SQLite proves the packaged native dependencies, workspace imports,
// migrations and bundled template. Production PostgreSQL is checked at rollout.
const api = spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], {
  env: {
    PATH: process.env.PATH, HOME: directory, TMPDIR: tmpdir(), NODE_ENV: 'development',
    T3_PUBLIC_URL: origin, T3_API_HOST: '127.0.0.1', T3_API_PORT: String(address.port),
    T3_ACCOUNT_DATA_DIR: join(directory, 'accounts'), T3_ASSET_DATA_DIR: join(directory, 'assets'),
    T3_AUTH_SECRET: randomBytes(48).toString('base64url'), T3_GENERATION_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
api.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-8000) })
api.stderr.on('data', chunk => { output = (output + String(chunk)).slice(-8000) })
const exited = once(api, 'exit')
try {
  let live
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null) throw new Error(`Packaged API stopped during startup: ${output}`)
    live = await fetch(`${origin}/api/live`, { signal: AbortSignal.timeout(1000) }).catch(() => null)
    if (live?.ok) break
    await delay(100)
  }
  assert.ok(live?.ok, `API readiness failed: ${output}`)
  assert.deepEqual(await live.json(), { status: 'ok' })
  for (const path of ['/api/jobs', '/api/assets', '/api/projects', '/api/me']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 401, path)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    await response.arrayBuffer()
  }
  assert.match(output, /generation: disabled/)
  console.log('API image smoke passed: UID 1000, native SQLite/TS, workspace imports, template, anonymous isolation, generation disabled.')
} finally {
  if (api.exitCode === null && api.signalCode === null) api.kill('SIGTERM')
  const forceStop = setTimeout(() => api.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(forceStop)
  await rm(directory, { recursive: true, force: true })
}

// Exercise all trusted recipe modules and Cycles CPU in the published image.
await import('./smoke-blender-runtime.mjs')
