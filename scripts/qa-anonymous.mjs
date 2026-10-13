import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Disposable local visitor scenario. Deliberately bypasses .env loading.
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 't3-anonymous-manual-'))
const webPort = Number(process.env.T3_ANONYMOUS_WEB_PORT ?? 4190)
const apiPort = Number(process.env.T3_ANONYMOUS_API_PORT ?? 8790)
for (const port of [webPort, apiPort]) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use valid local ports.')
const origin = `http://127.0.0.1:${webPort}`
const env = {
  ...process.env, NODE_ENV: 'development', T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_PUBLIC_URL: origin,
  T3_ACCOUNT_DATA_DIR: join(directory, 'accounts'), T3_ASSET_DATA_DIR: join(directory, 'assets'), T3_DATABASE_URL: '',
  T3_GENERATION_ENABLED: 'false', T3_BILLING_MODE: 'disabled', T3_INFERENCE_PROVIDER: 'openai', OPENAI_API_KEY: '',
  T3_AUTH_SECRET: '', OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
  T3_API_PROXY_URL: `http://127.0.0.1:${apiPort}`,
}
console.log(`Visitor fixtures: bundled public apartment, building, dossier and three objects.\nDisposable backend: ${directory}\nGeneration and payments disabled. No account or activation required.`)
const children = [
  spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--mode', 'full', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: join(root, 'apps/web'), env, stdio: 'inherit' }),
]
let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true; process.exitCode = code
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code ?? 1) })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
