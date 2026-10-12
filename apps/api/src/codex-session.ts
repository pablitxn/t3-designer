import { CodexAppServer } from './codex-app-server.ts'
import { inferenceProvider } from './openai.ts'

export class CodexSessionError extends Error {
  readonly code = 'configuration'
}

export function codexTransport(): 'exec' | 'app-server' {
  const transport = process.env.T3_CODEX_TRANSPORT || 'exec'
  if (transport !== 'exec' && transport !== 'app-server') throw new CodexSessionError('T3_CODEX_TRANSPORT debe ser exec o app-server.')
  return transport
}

function assertPrivateSession(): void {
  let origin: URL
  try { origin = new URL(process.env.T3_PUBLIC_URL || 'http://127.0.0.1:5173') }
  catch { throw new CodexSessionError('La sesión de Codex requiere un origen web loopback válido.') }
  if (process.env.NODE_ENV === 'production' || inferenceProvider() !== 'codex-local'
      || !['127.0.0.1', 'localhost', '::1'].includes(process.env.T3_API_HOST || '127.0.0.1')
      || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      || !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new CodexSessionError('El login por dispositivo requiere codex-local en desarrollo privado con servidor y origen web loopback.')
  }
}

let session: CodexAppServer | undefined
let starting: Promise<void> | undefined

/** No implicit login or fallback from a model call. Startup owns authorization. */
export function getCodexSession(): CodexAppServer | undefined {
  if (codexTransport() !== 'app-server') return undefined
  assertPrivateSession()
  return session
}

export async function initializeCodexSession(signal?: AbortSignal): Promise<void> {
  if (codexTransport() !== 'app-server') return
  assertPrivateSession()
  if (session) return
  if (starting) return starting
  starting = (async () => {
    const candidate = await CodexAppServer.start({ model: process.env.T3_CODEX_MODEL || 'gpt-6-astra' })
    try {
      await candidate.login(({ verificationUrl, userCode }) => {
        console.log(JSON.stringify({ event: 'codex_device_authorization', verificationUrl, userCode }))
      }, signal)
      signal?.throwIfAborted()
      session = candidate
      console.log(JSON.stringify({ event: 'codex_session_ready', authStore: 'ephemeral', transport: 'app-server' }))
    } catch (error) {
      await candidate.close()
      throw error
    }
  })()
  try { await starting } finally { starting = undefined }
}

export async function closeCodexSession(): Promise<void> {
  const current = session
  session = undefined
  await current?.close()
}
