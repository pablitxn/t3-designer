import { fileURLToPath } from 'node:url'
import { CodexPlanningError, getCodexHealth, planningError, runVisualTurn } from './codex.ts'
import { closeCodexSession, initializeCodexSession } from './codex-session.ts'

// This opt-in check makes a real subscription request; never run it on health polls.
const started = performance.now()
const controller = new AbortController()
const interrupt = () => controller.abort(new DOMException('Check interrupted', 'AbortError'))
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
const report = {
  provider: 'codex-local',
  requestedModel: process.env.T3_CODEX_MODEL || null,
  storedChatGptLogin: false,
  inference: 'not-run' as 'not-run' | 'passed' | 'failed',
}

async function main() {
  if (process.env.T3_INFERENCE_PROVIDER !== 'codex-local' || process.env.NODE_ENV === 'production') {
    throw new CodexPlanningError('configuration', 'Esta prueba requiere T3_INFERENCE_PROVIDER=codex-local en un entorno de desarrollo privado.')
  }
  await initializeCodexSession(controller.signal)
  const health = await getCodexHealth()
  if (!health.available) throw new CodexPlanningError('configuration', 'No se encontró el ejecutable de Codex. Revisá T3_CODEX_BIN y PATH.')
  report.storedChatGptLogin = health.authenticated
  if (!health.authenticated) throw new CodexPlanningError('authentication', 'El CLI no reconoce una sesión de ChatGPT. Revisá la autenticación de Codex en este entorno.')
  report.inference = 'failed'
  const response = await runVisualTurn([{ type: 'text', text: 'Return {"status":"ok"} to verify this development connection. Do not use tools or inspect any files.' }], {
    type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', const: 'ok' } },
  }, {
    signal: controller.signal,
    workingDirectory: fileURLToPath(new URL('../../../', import.meta.url)),
    reasoningEffort: 'low', timeoutMs: 60_000, onProgress() {},
  }, false)
  let value: unknown
  try { value = JSON.parse(response) } catch { /* Only a validated response passes. */ }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
      || Object.keys(value).length !== 1 || !('status' in value) || value.status !== 'ok') {
    throw new CodexPlanningError('invalid_response', 'La prueba no recibió la respuesta estructurada esperada.')
  }
  report.inference = 'passed'
  console.log(JSON.stringify({ ...report, elapsedMs: Math.round(performance.now() - started) }, null, 2))
}

main().catch(error => {
  const failure = planningError(error)
  // Never print CLI stderr, credentials, provider responses or exception stacks.
  console.log(JSON.stringify({ ...report, elapsedMs: Math.round(performance.now() - started),
    error: { code: failure.code, message: failure.message } }, null, 2))
  process.exitCode = 1
}).finally(async () => {
  await closeCodexSession()
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
})
