import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { closeCodexSession, CodexSessionError, codexTransport, initializeCodexSession } from './codex-session.ts'
import { planningError } from './codex.ts'

// Runs an explicitly selected project script in the SAME authenticated process.
// The script must await its work at module scope; credentials end with this command.
const controller = new AbortController()
const interrupt = () => controller.abort(new DOMException('Session interrupted', 'AbortError'))
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
try {
  const args = process.argv.slice(2).filter(argument => argument !== '--')
  if (args.length !== 1 || codexTransport() !== 'app-server') throw new CodexSessionError('T3_CODEX_TRANSPORT=app-server y un único script son obligatorios.')
  const scriptPath = resolve(args[0])
  if (!await stat(scriptPath).then(value => value.isFile(), () => false)) throw new CodexSessionError('El script solicitado no existe o no es un archivo.')
  await initializeCodexSession(controller.signal)
  const onAbort = () => { void closeCodexSession() }
  controller.signal.addEventListener('abort', onAbort, { once: true })
  try {
    controller.signal.throwIfAborted()
    await import(pathToFileURL(scriptPath).href)
  } finally { controller.signal.removeEventListener('abort', onAbort) }
} catch (error) {
  const failure = planningError(error)
  console.error(JSON.stringify({ event: 'codex_session_failed', code: failure.code, message: failure.message }))
  process.exitCode = 1
} finally {
  await closeCodexSession()
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
}
