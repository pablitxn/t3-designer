import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import { AccountError, type User } from './accounts.ts'
import type { AppDatabase } from './app-database.ts'
import type { CreditService } from './credits.ts'
import type { AssetStore } from './store.ts'
import type { Projects } from './projects.ts'
import { generateProjectScene, ProjectGenerationInputSchema, type ProjectGenerationInput } from './project-generation-model.ts'

export interface ProjectGenerationJob {
  id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; projectId: string | null
  input: ProjectGenerationInput; createdAt: string; updatedAt: string; error: string | null
}
type Row = ProjectGenerationJob & { userId: string; requestKey: string; fingerprint: string }
type Generator = (id: string, input: ProjectGenerationInput, options: { signal: AbortSignal; onInference: () => void }) => Promise<ProjectSnapshot>
export class ProjectGenerations {
  private db: DatabaseSync
  private accounts: AppDatabase
  private credits: CreditService
  private store: AssetStore
  private projects: Projects
  private enabled: boolean
  private limits: { dailyLimit: number; globalDailyLimit: number; pendingLimit: number }
  private generate: Generator
  private running: Promise<void> | null = null
  private current: { id: string; controller: AbortController } | null = null
  private stopped = false
  private queue: Promise<unknown> = Promise.resolve()
  constructor(options: { path: string; database: AppDatabase; credits: CreditService; store: AssetStore; projects: Projects; enabled: boolean; limits: { dailyLimit: number; globalDailyLimit: number; pendingLimit: number }; generate?: Generator }) {
    this.db = new DatabaseSync(options.path)
    this.accounts = options.database; this.credits = options.credits; this.store = options.store; this.projects = options.projects
    this.enabled = options.enabled; this.limits = options.limits; this.generate = options.generate ?? generateProjectScene
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS project_generation(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_key TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(user_id,request_key));`)
  }
  get isEnabled(): boolean { return this.enabled }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action, action); this.queue = result.catch(() => undefined); return result
  }
  private rows(): Row[] { return this.db.prepare('SELECT document FROM project_generation').all().map(row => JSON.parse(String(row.document)) as Row) }
  private row(id: string): Row | null { const row = this.db.prepare('SELECT document FROM project_generation WHERE id=?').get(id); return row ? JSON.parse(String(row.document)) as Row : null }
  private write(row: Row): void { this.db.prepare('UPDATE project_generation SET document=? WHERE id=?').run(JSON.stringify(row), row.id) }
  private visible(row: Row): ProjectGenerationJob { return { id: row.id, status: row.status, input: row.input, projectId: row.projectId, createdAt: row.createdAt, updatedAt: row.updatedAt, error: row.error } }
  list(userId: string): ProjectGenerationJob[] { return this.rows().filter(row => row.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(row => this.visible(row)) }
  get(userId: string, id: string): ProjectGenerationJob { const row = this.row(id); if (!row || row.userId !== userId) throw new AccountError(404, 'Generación no encontrada.'); return this.visible(row) }
  async create(user: User, input: ProjectGenerationInput, requestKey: string): Promise<ProjectGenerationJob> {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) throw new AccountError(400, 'Se requiere una clave de reintento válida.')
    const validatedInput = ProjectGenerationInputSchema.parse(input)
    const job = await this.exclusive(async () => {
      if (this.stopped) throw new AccountError(503, 'El generador se está deteniendo. Reintentá en un momento.')
      input = validatedInput
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      const previous = this.rows().find(row => row.userId === user.id && row.requestKey === requestKey)
      if (previous) { if (previous.fingerprint !== fingerprint) throw new AccountError(409, 'La clave pertenece a otra generación.'); return this.visible(previous) }
      if (!this.enabled) throw new AccountError(403, 'La generación no está habilitada.')
      const pending = this.rows().filter(row => ['queued', 'running'].includes(row.status))
      if (pending.length >= 10 || pending.filter(row => row.userId === user.id).length >= this.limits.pendingLimit) throw new AccountError(429, 'Esperá a que termine la generación activa.')
      const id = randomUUID(), operationId = `architecture:${id}`, now = new Date().toISOString()
      await this.credits.reserve(user.id, operationId, input.kind)
      try {
        if (!this.store.reserveGeneration(user.id, this.limits.dailyLimit, this.limits.globalDailyLimit, this.limits.pendingLimit)) throw new AccountError(429, 'Alcanzaste el límite diario de generación.')
        const row: Row = { id, userId: user.id, requestKey, fingerprint, input, status: 'queued', projectId: null, createdAt: now, updatedAt: now, error: null }
        this.db.prepare('INSERT INTO project_generation(id,user_id,request_key,document) VALUES(?,?,?,?)').run(id, user.id, requestKey, JSON.stringify(row))
        return this.visible(row)
      } catch (error) { await this.credits.refund(operationId); throw error }
    })
    this.kick(); return job
  }
  async cancel(userId: string, id: string): Promise<ProjectGenerationJob> {
    return this.exclusive(async () => {
      this.get(userId, id)
      const row = this.row(id)!
      if (!['queued', 'running'].includes(row.status)) throw new AccountError(409, 'La generación ya terminó.')
      this.write({ ...row, status: 'cancelled', updatedAt: new Date().toISOString() })
      if (this.current?.id === id) this.current.controller.abort()
      else await this.credits.refund(`architecture:${id}`)
      return this.get(userId, id)
    })
  }
  async recover(): Promise<void> {
    for (const reservation of await this.credits.listReservations()) {
      if (!reservation.id.startsWith('architecture:')) continue
      const id = reservation.id.slice('architecture:'.length), row = this.row(id)
      const project = await this.accounts.db.selectFrom('t3_project').select('id').where('id', '=', id).where('ownerId', '=', reservation.userId).executeTakeFirst()
      if (project) {
        if (row) this.write({ ...row, status: 'completed', projectId: id, updatedAt: new Date().toISOString() })
        await this.credits.commit(reservation.id)
      } else {
        if (row && ['queued', 'running'].includes(row.status)) this.write({ ...row, status: 'failed', error: 'El servidor se reinició. Se devolvieron los créditos; podés crear otro intento.', updatedAt: new Date().toISOString() })
        await this.credits.refund(reservation.id)
      }
    }
  }
  async reconcile(): Promise<void> {
    for (const row of this.rows()) {
      if (!['completed', 'failed', 'cancelled', 'running'].includes(row.status) || this.current?.id === row.id) continue
      const reservation = await this.credits.reservation(`architecture:${row.id}`)
      if (reservation?.state !== 'reserved') continue
      // PostgreSQL publication can succeed before the local terminal row is
      // saved. Reconcile the durable project before deciding whether to refund.
      const saved = await this.accounts.db.selectFrom('t3_project').select('id').where('id', '=', row.id).where('ownerId', '=', row.userId).executeTakeFirst()
      if (saved) {
        this.write({ ...row, status: 'completed', projectId: row.id, error: null, updatedAt: new Date().toISOString() })
        await this.credits.commit(reservation.id)
      } else {
        if (row.status === 'running') this.write({ ...row, status: 'failed', error: 'Se interrumpió la generación. Se devolvieron los créditos; podés crear otro intento.', updatedAt: new Date().toISOString() })
        await this.credits.refund(reservation.id)
      }
    }
    this.kick()
  }
  kick(): void {
    if (this.running || this.stopped) return
    let unavailable = false
    this.running = this.drain().catch(() => {
      unavailable = true
      console.error('Project queue or settlement unavailable; retry deferred until reconciliation')
    }).finally(() => {
      this.running = null
      if (this.stopped || unavailable) return
      try { if (this.rows().some(row => row.status === 'queued')) this.kick() }
      catch { console.error('Project queue unavailable; retry deferred until reconciliation') }
    })
  }
  private async drain(): Promise<void> {
    while (!this.stopped) {
      const row = this.rows().filter(row => row.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (!row) return
      const controller = new AbortController(); this.current = { id: row.id, controller }
      try {
        // Persist ownership of this attempt before an asynchronous DB lookup.
        // A disconnected account DB must not spin forever on the same queued row.
        this.write({ ...row, status: 'running', updatedAt: new Date().toISOString() })
        const owner = await this.accounts.db.selectFrom('user').selectAll().where('id', '=', row.userId).executeTakeFirst()
        controller.signal.throwIfAborted()
        if (!owner || owner.suspended || !this.enabled) throw new Error('La cuenta ya no puede generar.')
        const reservation = await this.credits.reservation(`architecture:${row.id}`)
        if (reservation?.state !== 'reserved' || reservation.userId !== row.userId || reservation.kind !== row.input.kind) throw new Error('La reserva de créditos ya no está disponible.')
        controller.signal.throwIfAborted()
        const scene = await this.generate(row.id, row.input, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]), onInference() {} })
        controller.signal.throwIfAborted()
        if (scene.project.id !== row.id) throw new Error('La identidad de la propuesta no coincide con el trabajo.')
        // Publication and cancellation serialize; completed projects survive a crash
        // between PostgreSQL publication and credit capture via their stable id.
        await this.exclusive(async () => {
          controller.signal.throwIfAborted()
          if (this.row(row.id)?.status === 'cancelled') throw new Error('cancelled')
          await this.projects.createGenerated({ id: owner.id, name: owner.name, email: owner.email, role: owner.role === 'admin' ? 'admin' : 'user' }, scene)
          this.write({ ...row, status: 'completed', projectId: row.id, updatedAt: new Date().toISOString() })
          await this.credits.commit(`architecture:${row.id}`)
        })
      } catch {
        try {
          const current = this.row(row.id)!
          // A temporary database failure leaves the reservation intact. Never
          // interpret an unavailable publication check as an absent project.
          const saved = await this.accounts.db.selectFrom('t3_project').select('id').where('id', '=', row.id).where('ownerId', '=', row.userId).executeTakeFirst()
          if (saved) {
            this.write({ ...current, status: 'completed', projectId: row.id, error: null, updatedAt: new Date().toISOString() })
            await this.credits.commit(`architecture:${row.id}`)
          } else {
            this.write({ ...current, status: current.status === 'cancelled' ? 'cancelled' : 'failed', error: current.status === 'cancelled' ? null : 'No se pudo generar un proyecto válido. Se devolvieron los créditos; probá con una descripción más clara.', updatedAt: new Date().toISOString() })
            const reservation = await this.credits.reservation(`architecture:${row.id}`)
            if (reservation?.state === 'reserved') await this.credits.refund(reservation.id)
          }
        } catch { throw new Error('Project credit settlement deferred until reconciliation') }
      } finally { this.current = null }
    }
  }
  async close(): Promise<void> { this.stopped = true; this.current?.controller.abort(); await this.queue; await this.running; this.db.close() }
}
