import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { UserInput } from '@openai/codex-sdk'
import { ProductUrlSchema, type JobEventInput } from '@t3-designer/asset-schema'
import { codexConfig, codexEnvironment } from './codex-config.ts'

type ObjectValue = Record<string, unknown>
type ErrorCode = 'authentication' | 'connection' | 'permission' | 'usage_limit' | 'configuration' | 'cancelled' | 'invalid_response' | 'codex_failed'
type Notice = { method: string; params: ObjectValue }
export type CodexAppServerUsage = { input_tokens: number; cached_input_tokens: number; output_tokens: number; cache_write_input_tokens?: number; reasoning_output_tokens?: number }
export type CodexAppServerRunOptions = {
  signal: AbortSignal; webSearch: boolean; reasoningEffort?: 'low' | 'medium' | 'high'
  onUsage?: (usage: CodexAppServerUsage) => void
  onProgress?: (stage: string) => void
  onEvent?: (event: JobEventInput) => void
}
export type CodexAppServerStartOptions = { command?: string; env?: Record<string, string>; model?: string; cwd?: string; requestTimeoutMs?: number }
const MAX_LINE_BYTES = 2_000_000
const MAX_PHASE_BYTES = 20_000_000
const MAX_STDERR_BYTES = 1_000_000
const MAX_RESPONSE_CHARS = 200_000
const INTERRUPT_TIMEOUT_MS = 3_000
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Only these fixed messages/codes may leave the transport. Never retain raw
 * authentication, account, provider error or stderr text in an Error. */
export class CodexAppServerError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {
    const messages: Record<ErrorCode, string> = {
      authentication: 'Codex necesita una sesión de ChatGPT válida. Volvé a iniciar la sesión local.',
      connection: 'No se pudo mantener la conexión con Codex. Revisá la conexión y reiniciá la sesión local.',
      permission: 'El servicio rechazó el acceso de Codex. Revisá los permisos de la cuenta y del modelo.',
      usage_limit: 'La sesión de Codex alcanzó un límite de uso. Reintentá cuando se restablezca tu suscripción.',
      configuration: 'No se pudo verificar el aislamiento de la sesión local de Codex.',
      cancelled: 'La generación se canceló.', invalid_response: 'Codex devolvió una respuesta inválida.',
      codex_failed: 'No se pudo completar la generación con Codex.',
    }
    super(messages[code]); this.name = 'CodexAppServerError'; this.code = code
  }
}

function failure(value: unknown): CodexAppServerError {
  if (value instanceof CodexAppServerError) return value
  let text = ''
  try { text = typeof value === 'string' ? value : JSON.stringify(value) } catch { /* No raw diagnostics escape. */ }
  text = (text ?? '').slice(0, MAX_LINE_BYTES)
  const status = text.match(/(?:HTTP(?:\/\d(?:\.\d)?)?\s+|(?:unexpected\s+)?status(?:\s+code)?\s*[:=]?\s*|"(?:httpStatusCode|http_status|status_code)"\s*:\s*)(401|403|429|5\d\d)\b/i)?.[1]
  if (/\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EROFS)\b|\bCONNECT\b.{0,120}\b(?:403|407)\b|read-only file system|failed to (?:establish|connect)/i.test(text)) return new CodexAppServerError('connection')
  if (status === '401' || /could not parse your authentication token|invalid authentication|signing in again|token.*expired/i.test(text)) return new CodexAppServerError('authentication')
  if (status === '429' || /usage limit|quota exceeded|rate limit exceeded/i.test(text)) return new CodexAppServerError('usage_limit')
  if (status === '403') return new CodexAppServerError('permission')
  return new CodexAppServerError('codex_failed')
}

function toml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`
  throw new CodexAppServerError('configuration')
}

function sessionConfig(model: string, webSearch = false): ObjectValue {
  return { ...codexConfig, cli_auth_credentials_store: 'ephemeral', forced_login_method: 'chatgpt', model_provider: 'openai',
    model, approval_policy: 'never', sandbox_mode: 'read-only', web_search: webSearch ? 'live' : 'disabled',
    analytics: { enabled: false }, history: { persistence: 'none' },
    features: { ...object(codexConfig.features), daemon_auto_start: false } }
}

function verifyConfig(actual: ObjectValue, expected: ObjectValue): void {
  for (const key of ['cli_auth_credentials_store', 'forced_login_method', 'model_provider', 'model', 'approval_policy', 'sandbox_mode', 'web_search', 'project_doc_max_bytes']) {
    if (actual[key] !== expected[key]) throw new CodexAppServerError('configuration')
  }
  for (const [key, value] of Object.entries(object(expected.features))) {
    if (object(actual.features)[key] !== value) throw new CodexAppServerError('configuration')
  }
  if (object(actual.shell_environment_policy).inherit !== 'none' || !actual.mcp_servers
    || typeof actual.mcp_servers !== 'object' || Array.isArray(actual.mcp_servers) || Object.keys(actual.mcp_servers).length) throw new CodexAppServerError('configuration')
  // v0.159.2 ToolsV2 omits legacy tools.view_image. features.view_image=false
  // above is the effective switch; never accept a missing/true feature value.
}

class RpcClient {
  readonly child: ChildProcessWithoutNullStreams
  readonly requestMs: number
  onNotice: ((notice: Notice) => void) | undefined
  error: CodexAppServerError | undefined
  private nextId = 1
  private pending = new Map<number, { resolve: (value: ObjectValue) => void; reject: (error: CodexAppServerError) => void; timer: NodeJS.Timeout }>()
  private notifications: Notice[] = []
  private waiters = new Set<() => void>()
  private buffer = ''
  private phaseBytes = 0
  private stderrBytes = 0
  private stderrError: CodexAppServerError | undefined
  private stopping = false
  private closed: Promise<void>
  private closing: Promise<void> | undefined

  constructor(child: ChildProcessWithoutNullStreams, requestMs: number) {
    this.child = child; this.requestMs = requestMs
    this.closed = new Promise(resolve => child.once('close', () => resolve()))
    child.on('error', () => this.fail(new CodexAppServerError('connection')))
    child.on('close', () => { if (!this.stopping) this.fail(this.stderrError ?? new CodexAppServerError('connection')) })
    child.stdin.on('error', () => this.fail(new CodexAppServerError('connection')))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { try { this.consume(chunk) } catch (error) { this.fail(failure(error)) } })
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBytes += chunk.length
      const classified = failure(chunk.toString())
      if (classified.code !== 'codex_failed') this.stderrError = classified
      if (this.stderrBytes > MAX_STDERR_BYTES) this.fail(new CodexAppServerError('invalid_response'))
    })
  }

  resetPhase(): void { this.phaseBytes = 0; this.stderrBytes = 0; this.stderrError = undefined; this.notifications = [] }
  fail(error: CodexAppServerError): void {
    if (this.error) return
    this.error = error
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
    for (const wake of this.waiters) wake()
    // A protocol/tool violation must stop the child, not merely hide its output.
    if (!this.stopping) void this.close()
  }
  private consume(chunk: string): void {
    if (this.error || this.stopping) return
    this.phaseBytes += Buffer.byteLength(chunk)
    if (this.phaseBytes > MAX_PHASE_BYTES) throw new CodexAppServerError('invalid_response')
    this.buffer += chunk
    for (;;) {
      const boundary = this.buffer.indexOf('\n')
      if (boundary === -1) break
      const line = this.buffer.slice(0, boundary); this.buffer = this.buffer.slice(boundary + 1)
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new CodexAppServerError('invalid_response')
      if (!line.trim()) continue
      let message: ObjectValue
      try { message = object(JSON.parse(line)) } catch { throw new CodexAppServerError('invalid_response') }
      if (message.id !== undefined && typeof message.method === 'string') {
        this.write({ id: message.id, error: { code: -32601, message: 'Tools and approvals are not available.' } })
        throw new CodexAppServerError('configuration')
      }
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending) continue
        clearTimeout(pending.timer); this.pending.delete(message.id)
        if (message.error) pending.reject(failure(message.error)); else pending.resolve(object(message.result))
      } else if (typeof message.method === 'string') {
        const notice = { method: message.method, params: object(message.params) }
        this.onNotice?.(notice)
        if (['account/login/completed', 'turn/completed'].includes(notice.method)) {
          this.notifications.push(notice)
          if (this.notifications.length > 32) throw new CodexAppServerError('invalid_response')
          for (const wake of this.waiters) wake()
        }
      } else throw new CodexAppServerError('invalid_response')
      if (this.error || this.stopping) return
    }
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) throw new CodexAppServerError('invalid_response')
  }
  write(message: ObjectValue): void {
    if (this.error) throw this.error
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  request(method: string, params: ObjectValue, timeoutMs = this.requestMs): Promise<ObjectValue> {
    if (this.error) return Promise.reject(this.error)
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new CodexAppServerError('connection')), timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.write({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(failure(error)) }
    })
  }
  async waitFor(method: string, predicate: (params: ObjectValue) => boolean, timeoutMs: number, signal?: AbortSignal): Promise<ObjectValue> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (this.error) throw this.error
      if (signal?.aborted) throw new CodexAppServerError('cancelled')
      const index = this.notifications.findIndex(notice => notice.method === method && predicate(notice.params))
      if (index !== -1) return this.notifications.splice(index, 1)[0].params
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new CodexAppServerError('connection')
      await new Promise<void>(resolve => {
        const wake = () => { clearTimeout(timer); this.waiters.delete(wake); signal?.removeEventListener('abort', wake); resolve() }
        const timer = setTimeout(wake, remaining)
        this.waiters.add(wake); signal?.addEventListener('abort', wake, { once: true })
      })
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.stopping = true
    this.fail(this.error ?? new CodexAppServerError('connection'))
    this.child.stdin.end()
    this.closing = (async () => {
      const signal = (name: NodeJS.Signals) => {
        if (!this.child.pid) return
        try { process.kill(-this.child.pid, name) } catch { try { this.child.kill(name) } catch { /* Already exited. */ } }
      }
      const terminate = setTimeout(() => signal('SIGTERM'), 100)
      const kill = setTimeout(() => signal('SIGKILL'), 1_000)
      let deadline: NodeJS.Timeout | undefined
      try { await Promise.race([this.closed, new Promise<void>(resolve => { deadline = setTimeout(resolve, 2_000) })]) }
      finally { clearTimeout(terminate); clearTimeout(kill); clearTimeout(deadline) }
    })()
    return this.closing
  }
}

type QueueEntry = { work: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: unknown) => void; signal?: AbortSignal; abort: () => void }

/** One authenticated process, serialized turns, fresh ephemeral threads. The
 * device login never touches persistent auth or becomes an HTTP endpoint. */
export class CodexAppServer {
  readonly model: string
  private rpc: RpcClient
  private directory: string
  private config: ObjectValue
  private authenticated = false
  private stopped = false
  private closing: Promise<void> | undefined
  private queue: QueueEntry[] = []
  private busy = false

  private constructor(rpc: RpcClient, directory: string, model: string, config: ObjectValue) {
    this.rpc = rpc; this.directory = directory; this.model = model; this.config = config
  }

  static async start(options: CodexAppServerStartOptions = {}): Promise<CodexAppServer> {
    const model = options.model ?? 'gpt-6-astra'
    const requestMs = options.requestTimeoutMs ?? 30_000
    if (!model || model.length > 200 || !Number.isSafeInteger(requestMs) || requestMs < 1 || requestMs > 60_000) throw new CodexAppServerError('configuration')
    let directory: string
    try { directory = await mkdtemp(join(options.cwd ?? tmpdir(), 't3-codex-session-')) }
    catch { throw new CodexAppServerError('configuration') }
    const config = sessionConfig(model)
    const env = codexEnvironment({ ...(options.env ?? process.env), HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME })
    let session: CodexAppServer | undefined
    try {
      const child = spawn(options.command ?? env.T3_CODEX_BIN ?? 'codex', ['app-server', '--listen', 'stdio://',
        ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`])], { cwd: directory, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
      session = new CodexAppServer(new RpcClient(child, requestMs), directory, model, config)
      await session.rpc.request('initialize', { clientInfo: { name: 't3_local_session', version: '1.0.0' }, capabilities: { experimentalApi: false } })
      session.rpc.write({ method: 'initialized' })
      await session.verifyIsolation()
      const account = await session.rpc.request('account/read', { refreshToken: false })
      if (account.account !== null) throw new CodexAppServerError('configuration')
      return session
    } catch (error) {
      if (session) await session.close(); else await rm(directory, { recursive: true, force: true })
      throw failure(error)
    }
  }

  private async verifyIsolation(): Promise<void> {
    const effective = await this.rpc.request('config/read', { includeLayers: false, cwd: this.directory })
    verifyConfig(object(effective.config), this.config)
  }
  private enqueue<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new CodexAppServerError('cancelled'))
    if (this.stopped || this.rpc.error) return Promise.reject(this.rpc.error ?? new CodexAppServerError('connection'))
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = { work, resolve: value => resolve(value as T), reject, signal,
        abort: () => { const index = this.queue.indexOf(entry); if (index !== -1) { this.queue.splice(index, 1); reject(new CodexAppServerError('cancelled')) } } }
      signal?.addEventListener('abort', entry.abort, { once: true })
      this.queue.push(entry); void this.pump()
    })
  }
  private async pump(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      let entry: QueueEntry | undefined
      while ((entry = this.queue.shift())) {
        entry.signal?.removeEventListener('abort', entry.abort)
        try {
          if (entry.signal?.aborted) throw new CodexAppServerError('cancelled')
          if (this.stopped || this.rpc.error) throw this.rpc.error ?? new CodexAppServerError('connection')
          entry.resolve(await entry.work())
        } catch (error) { entry.reject(failure(error)) }
      }
    } finally { this.busy = false }
  }

  login(onCode: (code: { verificationUrl: string; userCode: string }) => void, signal?: AbortSignal): Promise<void> {
    return this.enqueue(async () => {
      if (this.authenticated) return
      this.rpc.resetPhase()
      const abort = () => { void this.close() }
      signal?.addEventListener('abort', abort, { once: true })
      try {
        await this.verifyIsolation()
        const before = await this.rpc.request('account/read', { refreshToken: false })
        if (before.account !== null) throw new CodexAppServerError('configuration')
        const response = await this.rpc.request('account/login/start', { type: 'chatgptDeviceCode' })
        let url: URL
        try { url = new URL(String(response.verificationUrl)) } catch { throw new CodexAppServerError('invalid_response') }
        if (response.type !== 'chatgptDeviceCode' || url.protocol !== 'https:' || url.hostname !== 'auth.openai.com'
          || url.pathname !== '/codex/device' || url.username || url.password || url.search || url.hash
          || typeof response.loginId !== 'string' || !response.loginId || typeof response.userCode !== 'string'
          || !/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(response.userCode)) throw new CodexAppServerError('invalid_response')
        onCode({ verificationUrl: url.href, userCode: response.userCode })
        const result = await this.rpc.waitFor('account/login/completed', params => params.loginId === response.loginId, 15 * 60_000, signal)
        if (result.success !== true) throw failure(result.error)
        const account = await this.rpc.request('account/read', { refreshToken: false })
        if (object(account.account).type !== 'chatgpt') throw new CodexAppServerError('authentication')
        this.authenticated = true
      } catch (error) {
        await this.close()
        if (signal?.aborted) throw new CodexAppServerError('cancelled')
        throw failure(error)
      } finally { signal?.removeEventListener('abort', abort) }
    }, signal)
  }

  async health(): Promise<{ available: boolean; authenticated: boolean; authMode: 'chatgpt' | 'unavailable' }> {
    if (this.stopped || this.rpc.error) return { available: false, authenticated: false, authMode: 'unavailable' }
    try {
      const response = await this.rpc.request('account/read', { refreshToken: false })
      const authenticated = this.authenticated && object(response.account).type === 'chatgpt'
      if (!authenticated) this.authenticated = false
      return { available: true, authenticated, authMode: authenticated ? 'chatgpt' : 'unavailable' }
    } catch { return { available: false, authenticated: false, authMode: 'unavailable' } }
  }

  run(input: UserInput[], schema: unknown, options: CodexAppServerRunOptions): Promise<string> {
    return this.enqueue(() => this.runTurn(input, schema, options), options.signal)
  }

  private async runTurn(input: UserInput[], schema: unknown, options: CodexAppServerRunOptions): Promise<string> {
    if (!this.authenticated) throw new CodexAppServerError('authentication')
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new CodexAppServerError('configuration')
    const mapped = input.map(item => {
      if (item.type === 'text' && typeof item.text === 'string') return { type: 'text', text: item.text, text_elements: [] }
      if (item.type === 'local_image' && isAbsolute(item.path)) return { type: 'localImage', path: item.path }
      throw new CodexAppServerError('configuration')
    })
    if (Buffer.byteLength(JSON.stringify({ input: mapped, outputSchema: schema })) > MAX_PHASE_BYTES) throw new CodexAppServerError('configuration')
    this.rpc.resetPhase()
    let threadId: string | undefined, turnId: string | undefined, seenTurnId: string | undefined
    let latestUsage: CodexAppServerUsage | undefined, finalResponse = '', streamError: CodexAppServerError | undefined
    let interrupted: Promise<void> | undefined, completed = false
    const interrupt = () => {
      if (completed || interrupted) return
      if (!threadId || !turnId) { interrupted = this.close(); return }
      const id = threadId, activeTurn = turnId
      interrupted = (async () => {
        try {
          await this.rpc.request('turn/interrupt', { threadId: id, turnId: activeTurn }, INTERRUPT_TIMEOUT_MS)
          await this.rpc.waitFor('turn/completed', params => params.threadId === id && object(params.turn).id === activeTurn, INTERRUPT_TIMEOUT_MS)
          completed = true
        } catch { await this.close() }
      })()
    }
    const inspectItem = (item: ObjectValue, finished: boolean) => {
      if (!['userMessage', 'agentMessage', 'reasoning', ...(options.webSearch ? ['webSearch'] : [])].includes(String(item.type))) throw new CodexAppServerError('configuration')
      if (item.type === 'agentMessage' && finished) {
        if (typeof item.text !== 'string' || item.text.length > MAX_RESPONSE_CHARS) throw new CodexAppServerError('invalid_response')
        finalResponse = item.text
      }
      if (item.type === 'webSearch') {
        if (!finished) options.onProgress?.('Revisando las referencias y medidas…')
        else {
          const action = object(item.action)
          const query = typeof item.query === 'string' ? item.query : typeof action.query === 'string' ? action.query : typeof action.url === 'string' ? action.url : ''
          const parsed = ProductUrlSchema.safeParse(query.slice(0, 1500))
          if (parsed.success) {
            const url = new URL(parsed.data); url.search = ''; url.hash = ''
            options.onEvent?.({ kind: 'source', message: 'Página consultada', url: url.href, detail: url.hostname })
          } else options.onEvent?.({ kind: 'search', message: 'Consulta web completada', ...(query ? { detail: query.slice(0, 1500) } : {}) })
        }
      }
    }
    this.rpc.onNotice = notice => {
      const params = notice.params
      if (!threadId || params.threadId !== threadId) return
      if (typeof params.turnId === 'string') {
        if (seenTurnId && seenTurnId !== params.turnId || turnId && turnId !== params.turnId) throw new CodexAppServerError('invalid_response')
        seenTurnId = params.turnId
      }
      if (notice.method === 'error') streamError = failure(params.error)
      if (notice.method === 'item/started' || notice.method === 'item/completed') inspectItem(object(params.item), notice.method === 'item/completed')
      if (notice.method === 'thread/tokenUsage/updated') {
        const total = object(object(params.tokenUsage).total)
        if (tokenCount(total.inputTokens) && tokenCount(total.cachedInputTokens) && tokenCount(total.outputTokens)) {
          latestUsage = { input_tokens: total.inputTokens, cached_input_tokens: total.cachedInputTokens, output_tokens: total.outputTokens,
            ...(tokenCount(total.cacheWriteInputTokens) ? { cache_write_input_tokens: total.cacheWriteInputTokens } : {}),
            ...(tokenCount(total.reasoningOutputTokens) ? { reasoning_output_tokens: total.reasoningOutputTokens } : {}) }
        }
      }
    }
    options.signal.addEventListener('abort', interrupt, { once: true })
    try {
      if (options.signal.aborted) throw new CodexAppServerError('cancelled')
      await this.verifyIsolation()
      const config = sessionConfig(this.model, options.webSearch)
      const thread = await this.rpc.request('thread/start', { model: this.model, modelProvider: 'openai', cwd: this.directory,
        approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, config, developerInstructions: config.developer_instructions })
      const details = object(thread.thread), sandbox = object(thread.sandbox)
      if (thread.model !== this.model || thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never'
        || sandbox.type !== 'readOnly' || sandbox.networkAccess !== false || details.ephemeral !== true || typeof details.id !== 'string') throw new CodexAppServerError('configuration')
      threadId = details.id
      if (options.signal.aborted) throw new CodexAppServerError('cancelled')
      const start = await this.rpc.request('turn/start', { threadId, model: this.model, effort: options.reasoningEffort ?? 'medium',
        approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false }, input: mapped, outputSchema: schema })
      const id = object(start.turn).id
      if (typeof id !== 'string' || seenTurnId && seenTurnId !== id) throw new CodexAppServerError('invalid_response')
      turnId = id
      if (options.signal.aborted) { interrupt(); throw new CodexAppServerError('cancelled') }
      const result = await this.rpc.waitFor('turn/completed', params => params.threadId === threadId && object(params.turn).id === turnId, 30 * 60_000, options.signal)
      completed = true
      const turn = object(result.turn)
      if (turn.status !== 'completed') throw turn.error ? failure(turn.error) : streamError ?? new CodexAppServerError(turn.status === 'interrupted' ? 'cancelled' : 'codex_failed')
      if (streamError) throw streamError
      if (Array.isArray(turn.items)) for (const item of turn.items) inspectItem(object(item), true)
      if (!finalResponse.trim() || finalResponse.length > MAX_RESPONSE_CHARS) throw new CodexAppServerError('invalid_response')
      try { JSON.parse(finalResponse) } catch { throw new CodexAppServerError('invalid_response') }
      return finalResponse
    } catch (error) {
      if (!completed) { interrupt(); if (interrupted) await interrupted }
      if (options.signal.aborted) throw new CodexAppServerError('cancelled')
      const safe = failure(error)
      if (safe.code === 'authentication') this.authenticated = false
      throw safe
    } finally {
      options.signal.removeEventListener('abort', interrupt)
      this.rpc.onNotice = undefined
      // One fresh single-turn thread makes its latest cumulative total the
      // invocation total. Preserve observed use even after interruption/failure.
      try { if (latestUsage) options.onUsage?.(latestUsage) }
      finally {
        if (threadId && !this.rpc.error && !this.stopped) await this.rpc.request('thread/unsubscribe', { threadId }).catch(() => undefined)
      }
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.stopped = true; this.authenticated = false
    for (const entry of this.queue.splice(0)) {
      entry.signal?.removeEventListener('abort', entry.abort); entry.reject(new CodexAppServerError('connection'))
    }
    this.closing = (async () => { await this.rpc.close(); await rm(this.directory, { recursive: true, force: true }) })()
    return this.closing
  }
}
