import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  FoundationAgentEventInputSchema, FoundationAgentInputSchema, FoundationGenerationResultSchema, FoundationIterationSchema, FoundationVersionSchema, FoundationOfficialResearchSchema, foundationInputFingerprintValue,
  type FoundationAgentEventInput, type FoundationAgentInput, type FoundationAgentRun,
  type FoundationGenerationResult, type FoundationIteration, type FoundationTarget, type FoundationVersion, type FoundationOfficialResearch,
} from '@t3-designer/scene-schema'
import { AccountError, parseInput, type User } from './accounts.ts'
import type { AppDatabase } from './app-database.ts'
import type { CreditService } from './credits.ts'
import type { ProjectDocument, Projects } from './projects.ts'
import type { AssetStore } from './store.ts'

export type FoundationGenerator = (
  input: { project: ProjectDocument; target: FoundationTarget; message: string; parentVersion?: FoundationVersion; baselineVersion?: FoundationVersion;
    conversation?: { message: string; summary: string; questions: string[] }[] },
  options: {
    signal: AbortSignal; onInference: () => void; onEvent: (event: FoundationAgentEventInput) => void
    onIteration: (iteration: FoundationIteration) => Promise<void>
    onOfficialResearch?: (research: FoundationOfficialResearch) => Promise<void>
  },
) => Promise<FoundationGenerationResult>

type Row = FoundationAgentRun & {
  userId: string; requestKey: string; requestFingerprint: string; foundationsFingerprint: string
  project: ProjectDocument; inferenceStarted: boolean
}
const active = (run: FoundationAgentRun) => run.status === 'queued' || run.status === 'running'
const operationId = (id: string) => `foundation:${id}`
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** One durable attempt per chat turn. Intermediate reviews survive a restart;
 * only a terminal version can be accepted into the project by the user. */
export class FoundationAgent {
  private readonly db: DatabaseSync
  private readonly accounts: AppDatabase
  private readonly credits: CreditService
  private readonly store: AssetStore
  private readonly projects: Projects
  private readonly enabled: boolean
  private readonly limits: { dailyLimit: number; globalDailyLimit: number; pendingLimit: number }
  private readonly generate: FoundationGenerator
  private readonly timeoutMs: number
  private running: Promise<void> | null = null
  private current: { id: string; controller: AbortController } | null = null
  private stopped = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: {
    path: string; database: AppDatabase; credits: CreditService; store: AssetStore; projects: Projects
    enabled: boolean; limits: { dailyLimit: number; globalDailyLimit: number; pendingLimit: number }; generate: FoundationGenerator
    timeoutMs?: number
  }) {
    const timeoutMs = options.timeoutMs ?? 30 * 60_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000) throw new Error('El tiempo máximo del agente debe estar entre 1 ms y 30 minutos.')
    this.timeoutMs = timeoutMs
    this.db = new DatabaseSync(options.path)
    this.accounts = options.database; this.credits = options.credits; this.store = options.store
    this.projects = options.projects; this.enabled = options.enabled; this.limits = options.limits; this.generate = options.generate
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS foundation_agent_run(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,user_id TEXT NOT NULL,request_key TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(user_id,request_key));
      CREATE INDEX IF NOT EXISTS foundation_agent_project ON foundation_agent_run(project_id);
      CREATE TABLE IF NOT EXISTS foundation_agent_version(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS foundation_version_project ON foundation_agent_version(project_id);`)
  }
  get isEnabled(): boolean { return this.enabled }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action, action); this.queue = result.catch(() => undefined); return result
  }
  private rows(): Row[] { return this.db.prepare('SELECT document FROM foundation_agent_run').all().map(row => JSON.parse(String(row.document)) as Row) }
  private row(id: string): Row | null {
    const row = this.db.prepare('SELECT document FROM foundation_agent_run WHERE id=?').get(id)
    return row ? JSON.parse(String(row.document)) as Row : null
  }
  private version(id: string): FoundationVersion | null {
    const row = this.db.prepare('SELECT document FROM foundation_agent_version WHERE id=?').get(id)
    return row ? JSON.parse(String(row.document)) as FoundationVersion : null
  }
  private conversation(parent: FoundationVersion | undefined, projectId: string, target: FoundationTarget) {
    const turns: { message: string; summary: string; questions: string[] }[] = [], seen = new Set<string>()
    let version = parent
    while (version && turns.length < 12 && !seen.has(version.id)) {
      if (version.projectId !== projectId || version.target !== target) break
      const run = this.row(version.runId)
      if (!run || run.projectId !== projectId || run.target !== target || run.versionId !== version.id) break
      seen.add(version.id)
      turns.push({ message: run.message.slice(0, 4_000), summary: version.summary.slice(0, 2_000), questions: version.questions.slice(0, 20) })
      version = version.parentVersionId ? this.version(version.parentVersionId) ?? undefined : undefined
    }
    return turns.reverse()
  }
  private baseline(parent: FoundationVersion | undefined, projectId: string, target: FoundationTarget, foundationsFingerprint: string) {
    const seen = new Set<string>()
    let version = parent
    while (version && seen.size < 12 && !seen.has(version.id)) {
      if (version.projectId !== projectId || version.target !== target) break
      const run = this.row(version.runId)
      if (!run || run.projectId !== projectId || run.target !== target || run.versionId !== version.id) break
      seen.add(version.id)
      const last = version.iterations.at(-1)
      if (version.status === 'ready' && version.foundationsFingerprint === foundationsFingerprint && version.candidate?.target === target
        && last?.review.passed && fingerprint(last.candidate) === fingerprint(version.candidate)) return version
      version = version.parentVersionId ? this.version(version.parentVersionId) ?? undefined : undefined
    }
    return undefined
  }
  private write(row: Row): void { this.db.prepare('UPDATE foundation_agent_run SET document=? WHERE id=?').run(JSON.stringify(row), row.id) }
  private visible(row: Row): FoundationAgentRun {
    return {
      id: row.id, projectId: row.projectId, target: row.target, status: row.status, message: row.message,
      parentVersionId: row.parentVersionId, sourceRevision: row.sourceRevision, createdAt: row.createdAt,
      updatedAt: row.updatedAt, error: row.error, events: row.events, iterations: row.iterations, versionId: row.versionId,
      ...(row.officialResearch ? { officialResearch: row.officialResearch } : {}),
    }
  }
  private event(id: string, event: FoundationAgentEventInput): void {
    const row = this.row(id)
    if (!row || !active(row)) return
    const now = new Date().toISOString()
    // The bounded provider loop emits a small number of events. Keep storage
    // bounded even when an injected provider emits excessive progress updates.
    if (row.events.length >= 250) return
    const validated = FoundationAgentEventInputSchema.parse({ ...event, message: event.message.slice(0, 500),
      ...(event.detail ? { detail: event.detail.slice(0, 2_000) } : {}) })
    this.write({ ...row, updatedAt: now, events: [...row.events, { ...validated, id: row.events.length + 1, createdAt: now }] })
  }
  async list(user: User, projectId: string): Promise<{ runs: FoundationAgentRun[]; versions: FoundationVersion[] }> {
    await this.projects.requireAccess(user, projectId)
    const runs = this.rows().filter(row => row.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(row => this.visible(row))
    const versions = this.db.prepare('SELECT document FROM foundation_agent_version WHERE project_id=?').all(projectId)
      .map(row => JSON.parse(String(row.document)) as FoundationVersion).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
    return { runs, versions }
  }
  async get(user: User, projectId: string, id: string): Promise<FoundationAgentRun> {
    await this.projects.requireAccess(user, projectId)
    const row = this.row(id)
    if (!row || row.projectId !== projectId) throw new AccountError(404, 'Intento no encontrado.')
    return this.visible(row)
  }
  async getVersion(user: User, projectId: string, id: string): Promise<FoundationVersion> {
    await this.projects.requireAccess(user, projectId)
    const version = this.version(id)
    if (!version || version.projectId !== projectId) throw new AccountError(404, 'Versión no encontrada.')
    return version
  }
  private async authorizedUser(userId: string, projectId: string): Promise<User> {
    const account = await this.accounts.db.selectFrom('user').selectAll().where('id', '=', userId).executeTakeFirst()
    if (!account || account.suspended || !this.enabled) throw new AccountError(403, 'La cuenta ya no puede generar.')
    const user: User = { id: account.id, name: account.name, email: account.email, role: account.role === 'admin' ? 'admin' : 'user' }
    await this.projects.requireAccess(user, projectId, 'write')
    return user
  }
  async create(user: User, projectId: string, input: FoundationAgentInput, requestKey: string): Promise<FoundationAgentRun> {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) throw new AccountError(400, 'Se requiere una clave de reintento válida.')
    const validated = parseInput(FoundationAgentInputSchema, input)
    const job = await this.exclusive(async () => {
      if (this.stopped) throw new AccountError(503, 'El agente se está deteniendo. Reintentá en un momento.')
      await this.projects.requireAccess(user, projectId, 'write')
      const requestFingerprint = fingerprint({ projectId, ...validated })
      const previous = this.rows().find(row => row.userId === user.id && row.requestKey === requestKey)
      if (previous) {
        if (previous.requestFingerprint !== requestFingerprint) throw new AccountError(409, 'La clave pertenece a otro intento.')
        return this.visible(previous)
      }
      await this.authorizedUser(user.id, projectId)
      const project = await this.projects.get(user, projectId)
      if (project.revision !== validated.revision) throw new AccountError(409, 'El proyecto cambió. Recargalo antes de iniciar otro intento.')
      if (!project.foundations) throw new AccountError(400, 'Este proyecto no tiene bases en preparación.')
      if (validated.parentVersionId) {
        const parent = await this.getVersion(user, projectId, validated.parentVersionId)
        if (parent.target !== validated.target) throw new AccountError(400, 'La versión pertenece a otra parte del proyecto.')
      }
      const pending = this.rows().filter(active)
      if (pending.length >= 10 || pending.filter(row => row.userId === user.id).length >= this.limits.pendingLimit) throw new AccountError(429, 'Esperá a que termine el intento activo.')
      if (pending.some(row => row.projectId === projectId && row.target === validated.target)) throw new AccountError(409, 'Ya hay un agente trabajando en esta parte del proyecto.')
      const id = randomUUID(), now = new Date().toISOString()
      await this.credits.reserve(user.id, operationId(id), validated.target === 'dwelling' ? 'apartment' : 'building')
      try {
        if (!this.store.reserveGeneration(user.id, this.limits.dailyLimit, this.limits.globalDailyLimit, this.limits.pendingLimit)) throw new AccountError(429, 'Alcanzaste el límite diario de generación.')
        const row: Row = {
          id, projectId, userId: user.id, requestKey, requestFingerprint, project,
          foundationsFingerprint: createHash('sha256').update(foundationInputFingerprintValue(project.foundations)).digest('hex'), inferenceStarted: false,
          target: validated.target, message: validated.message, parentVersionId: validated.parentVersionId ?? null,
          sourceRevision: project.revision, status: 'queued', createdAt: now, updatedAt: now, error: null,
          events: [], iterations: [], versionId: null,
        }
        this.db.prepare('INSERT INTO foundation_agent_run(id,project_id,user_id,request_key,document) VALUES(?,?,?,?,?)').run(id, projectId, user.id, requestKey, JSON.stringify(row))
        return this.visible(row)
      } catch (error) { await this.credits.refund(operationId(id)); throw error }
    })
    this.kick(); return job
  }
  async cancel(user: User, projectId: string, id: string): Promise<FoundationAgentRun> {
    return this.exclusive(async () => {
      await this.projects.requireAccess(user, projectId, 'write')
      await this.get(user, projectId, id)
      const row = this.row(id)!
      if (!active(row)) throw new AccountError(409, 'El intento ya terminó.')
      this.event(id, { kind: 'complete', message: 'Intento cancelado. Las versiones anteriores siguen disponibles.' })
      const cancelled = { ...this.row(id)!, status: 'cancelled' as const, updatedAt: new Date().toISOString() }
      this.write(cancelled)
      if (this.current?.id === id) this.current.controller.abort()
      else await this.settle(cancelled)
      return this.visible(cancelled)
    })
  }
  private async settle(row: Row): Promise<void> {
    const reservation = await this.credits.reservation(operationId(row.id))
    if (reservation?.state !== 'reserved') return
    if (row.status === 'completed' || (row.status === 'needs_input' && row.inferenceStarted)) await this.credits.commit(reservation.id)
    else if (!active(row)) await this.credits.refund(reservation.id)
  }
  async recover(): Promise<void> {
    await this.exclusive(async () => {
      for (const row of this.rows()) {
        if (active(row)) {
          const recovered = { ...row, status: 'failed' as const, updatedAt: new Date().toISOString(), error: 'El servidor se reinició. Se devolvieron los créditos; las versiones anteriores siguen disponibles.' }
          this.write(recovered); await this.settle(recovered)
        } else await this.settle(row)
      }
      // Covers a crash after reserving credits but before writing the queue row.
      for (const reservation of await this.credits.listReservations()) {
        if (reservation.id.startsWith('foundation:') && !this.row(reservation.id.slice('foundation:'.length))) await this.credits.refund(reservation.id)
      }
    })
  }
  async reconcile(): Promise<void> {
    await this.exclusive(async () => {
      for (const row of this.rows()) {
        if (row.id === this.current?.id || row.status === 'queued') continue
        if (row.status === 'running') {
          const interrupted = { ...row, status: 'failed' as const, error: 'El intento se interrumpió. Se devolvieron los créditos; podés reintentar.', updatedAt: new Date().toISOString() }
          this.write(interrupted); await this.settle(interrupted)
        } else await this.settle(row)
      }
    })
    this.kick()
  }
  kick(): void {
    if (this.running || this.stopped) return
    let unavailable = false
    this.running = this.drain().catch(() => {
      unavailable = true
      console.error('Foundation queue or credit settlement unavailable; retry deferred until reconciliation')
    }).finally(() => {
      this.running = null
      if (this.stopped || unavailable) return
      try { if (this.rows().some(row => row.status === 'queued')) this.kick() }
      catch { console.error('Foundation queue unavailable; retry deferred until reconciliation') }
    })
  }
  private async drain(): Promise<void> {
    while (!this.stopped) {
      const row = this.rows().filter(item => item.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (!row) return
      const controller = new AbortController(); this.current = { id: row.id, controller }
      const deadline = AbortSignal.timeout(this.timeoutMs)
      const signal = AbortSignal.any([controller.signal, deadline])
      try {
        this.write({ ...row, status: 'running', updatedAt: new Date().toISOString() })
        await this.authorizedUser(row.userId, row.projectId)
        signal.throwIfAborted()
        const reservation = await this.credits.reservation(operationId(row.id))
        if (reservation?.state !== 'reserved' || reservation.userId !== row.userId || reservation.kind !== (row.target === 'dwelling' ? 'apartment' : 'building')) throw new Error('La reserva de créditos ya no está disponible.')
        const parentVersion = row.parentVersionId ? this.version(row.parentVersionId) ?? undefined : undefined
        const baselineVersion = this.baseline(parentVersion, row.projectId, row.target, row.foundationsFingerprint)
        const result = FoundationGenerationResultSchema.parse(await this.generate({ project: row.project, target: row.target, message: row.message, parentVersion, baselineVersion,
          conversation: this.conversation(parentVersion, row.projectId, row.target) }, {
          signal,
          onInference: () => { signal.throwIfAborted(); const current = this.row(row.id)!; if (active(current)) this.write({ ...current, inferenceStarted: true }) },
          onEvent: event => { signal.throwIfAborted(); this.event(row.id, event) },
          onOfficialResearch: async research => {
            signal.throwIfAborted()
            const current = this.row(row.id)!
            if (current.status !== 'running') return
            const validated = FoundationOfficialResearchSchema.parse(research)
            if (row.target !== 'building' || validated.countryCode !== row.project.foundations?.building.countryCode) throw new Error('La investigación oficial no corresponde a la ubicación del proyecto.')
            this.write({ ...current, updatedAt: new Date().toISOString(), officialResearch: validated })
          },
          onIteration: async iteration => {
            signal.throwIfAborted()
            const current = this.row(row.id)!
            if (current.status !== 'running') return
            const validated = FoundationIterationSchema.parse(iteration)
            if (validated.candidate && validated.candidate.target !== row.target) throw new Error('La iteración pertenece a otra parte del proyecto.')
            this.write({ ...current, updatedAt: new Date().toISOString(), iterations: [...current.iterations.filter(item => item.index !== validated.index), validated] })
          },
        }))
        signal.throwIfAborted()
        const acquiredResearch = result.officialResearch ?? this.row(row.id)?.officialResearch
        if (acquiredResearch) {
          if (row.target !== 'building' || acquiredResearch.countryCode !== row.project.foundations?.building.countryCode) throw new Error('La investigación oficial no corresponde a la ubicación del proyecto.')
          result.officialResearch = acquiredResearch
        }
        await this.exclusive(async () => {
          // Collaborator removal, suspension and cancellation take effect even
          // when the model was already in flight. No result is published first.
          await this.authorizedUser(row.userId, row.projectId)
          signal.throwIfAborted()
          const current = this.row(row.id)!
          if (current.status !== 'running') throw new Error('Intento cancelado.')
          const version = FoundationVersionSchema.parse({
            ...result,
            id: row.id, runId: row.id, projectId: row.projectId, target: row.target, parentVersionId: row.parentVersionId,
            sourceRevision: row.sourceRevision, foundationsFingerprint: row.foundationsFingerprint, createdAt: new Date().toISOString(),
          })
          if (version.candidate && version.candidate.target !== row.target) throw new Error('El agente respondió para otra parte del proyecto.')
          if (version.iterations.some(iteration => iteration.candidate && iteration.candidate.target !== row.target)) throw new Error('La revisión corresponde a otra parte del proyecto.')
          if (new Set(version.iterations.map(iteration => iteration.index)).size !== version.iterations.length) throw new Error('El agente repitió una iteración.')
          const finalIteration = version.iterations.at(-1)
          if (version.status === 'ready' && (!version.candidate || !finalIteration?.review.passed
            || fingerprint(finalIteration.candidate) !== fingerprint(version.candidate))) throw new Error('La versión no tiene una revisión aprobada para este modelo.')
          this.event(row.id, { kind: version.status === 'ready' ? 'complete' : 'question', message: version.summary })
          const terminal: Row = { ...this.row(row.id)!, status: version.status === 'ready' ? 'completed' : 'needs_input',
            updatedAt: version.createdAt, versionId: version.id, iterations: version.iterations, error: null,
            ...(version.officialResearch ? { officialResearch: version.officialResearch } : {}) }
          this.db.exec('BEGIN IMMEDIATE')
          try {
            this.db.prepare('INSERT INTO foundation_agent_version(id,project_id,document) VALUES(?,?,?)').run(version.id, version.projectId, JSON.stringify(version))
            this.write(terminal)
            this.db.exec('COMMIT')
          } catch (error) { this.db.exec('ROLLBACK'); throw error }
          await this.settle(terminal)
        })
      } catch {
        await this.exclusive(async () => {
          const current = this.row(row.id)!
          // A committed SQLite version and terminal run are atomic. A credit DB
          // outage after publication must not turn a valid result into a failure.
          if (current.status === 'completed' || current.status === 'needs_input') { await this.settle(current); return }
          const last = current.iterations.at(-1), now = new Date().toISOString()
          const draft = current.iterations.slice().reverse().find(iteration => iteration.candidate !== null)
          let preserve = current.status !== 'cancelled' && (!!draft?.candidate || !!current.officialResearch)
          // Retaining a draft must not bypass the publication access check.
          if (preserve) { try { await this.authorizedUser(row.userId, row.projectId) } catch { preserve = false } }
          const message = deadline.aborted ? 'El intento alcanzó el límite de tiempo.' : 'No se pudo completar el intento.'
          const error = preserve
            ? `${message} Se conservó el borrador para continuar desde el chat. Se devolvieron los créditos; todavía no se puede aceptar esta versión.`
            : 'No se pudo completar el intento. Se devolvieron los créditos; las versiones anteriores siguen disponibles.'
          const version = preserve ? FoundationVersionSchema.parse({
            id: row.id, runId: row.id, projectId: row.projectId, target: row.target, parentVersionId: row.parentVersionId,
            sourceRevision: row.sourceRevision, foundationsFingerprint: row.foundationsFingerprint, createdAt: now,
            status: 'needs_input', candidate: draft?.candidate ?? null, iterations: current.iterations,
            ...(current.officialResearch ? { officialResearch: current.officialResearch } : {}),
            summary: `${error}${last ? ` Última revisión: ${last.review.summary}` : ' Se conservaron la consulta oficial y sus fuentes.'}`.slice(0, 8_000),
            questions: last?.review.issues.length ? last.review.issues : ['Reintentá desde este borrador para completar la información y revisión pendientes.'],
          }) : null
          if (version) this.event(row.id, { kind: 'error', message: error })
          const failed: Row = { ...this.row(row.id)!, status: current.status === 'cancelled' ? 'cancelled' : 'failed', updatedAt: now,
            versionId: version?.id ?? current.versionId, error: current.status === 'cancelled' ? null : error }
          this.db.exec('BEGIN IMMEDIATE')
          try {
            if (version) this.db.prepare('INSERT INTO foundation_agent_version(id,project_id,document) VALUES(?,?,?)').run(version.id, version.projectId, JSON.stringify(version))
            this.write(failed)
            this.db.exec('COMMIT')
          } catch (error) { this.db.exec('ROLLBACK'); throw error }
          await this.settle(failed)
        })
      } finally { this.current = null }
    }
  }
  async close(): Promise<void> {
    this.stopped = true; this.current?.controller.abort(); await this.queue; await this.running; this.db.close()
  }
}
