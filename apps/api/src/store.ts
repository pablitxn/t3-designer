import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ProductUrlSchema, type Asset, type AssetRequest, type CreateJobInput, type Job, type JobEvent, type JobEventInput, type VisualReview } from '@t3-designer/asset-schema'

export interface JobCandidate {
  directory: string
  request: AssetRequest
  iteration: number
  review?: VisualReview
}

/** Activity is user-facing metadata, never a transcript of model reasoning or process output. */
export function activityText(value: string, limit: number): string {
  return value
    // eslint-disable-next-line no-control-regex -- Strip ANSI terminal escape sequences from public activity.
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex -- Remove non-printable controls while retaining tabs and newlines.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/https?:\/\/[^\s<>"')]+/gi, (value) => {
      try {
        const url = new URL(value)
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString()
      } catch { return '[enlace omitido]' }
    })
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\b(Bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, limit)
}

export class AssetStore {
  private db: DatabaseSync
  private listeners = new Map<string, Set<(event: JobEvent) => void>>()

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS generation_request (
        user_id TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, job_id TEXT NOT NULL,
        PRIMARY KEY(user_id,request_key)
      );
      CREATE TABLE IF NOT EXISTS job_credit_operation (
        job_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, inference_started INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        directory TEXT NOT NULL,
        document TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        document TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS job_events_job_sequence ON job_events(job_id, seq);
      CREATE TABLE IF NOT EXISTS job_candidates (
        job_id TEXT PRIMARY KEY,
        document TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_owners (
        kind TEXT NOT NULL, resource_id TEXT NOT NULL, user_id TEXT NOT NULL,
        PRIMARY KEY (kind, resource_id)
      );
      CREATE INDEX IF NOT EXISTS resource_owner_user ON resource_owners(user_id, kind);
      CREATE TABLE IF NOT EXISTS generation_usage (
        user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY (user_id, day)
      );
      CREATE TABLE IF NOT EXISTS project_assets (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        label TEXT NOT NULL, dimensions TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(project_id, asset_id)
      );
    `)
  }

  generationRequest(userId: string, key: string): { fingerprint: string; jobId: string } | null {
    const row = this.db.prepare('SELECT fingerprint,job_id FROM generation_request WHERE user_id=? AND request_key=?').get(userId, key)
    return row ? { fingerprint: String(row.fingerprint), jobId: String(row.job_id) } : null
  }
  queueMutation<T>(action: () => T, receipt?: { userId: string; key: string; fingerprint: string; jobId: string }): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      if (receipt) this.db.prepare('INSERT INTO generation_request(user_id,request_key,fingerprint,job_id) VALUES(?,?,?,?)').run(receipt.userId, receipt.key, receipt.fingerprint, receipt.jobId)
      this.db.exec('COMMIT')
      return result
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  setCreditOperation(jobId: string, operationId: string): void {
    this.db.prepare('INSERT INTO job_credit_operation (job_id,operation_id,inference_started) VALUES (?,?,0) ON CONFLICT(job_id) DO UPDATE SET operation_id=excluded.operation_id,inference_started=0').run(jobId, operationId)
  }
  markCreditInference(jobId: string): void { this.db.prepare('UPDATE job_credit_operation SET inference_started=1 WHERE job_id=?').run(jobId) }
  creditOperation(jobId: string): { operationId: string; inferenceStarted: boolean } | null {
    const row = this.db.prepare('SELECT operation_id,inference_started FROM job_credit_operation WHERE job_id=?').get(jobId)
    return row ? { operationId: String(row.operation_id), inferenceStarted: Boolean(row.inference_started) } : null
  }
  creditJob(operationId: string): string | null {
    const row = this.db.prepare('SELECT job_id FROM job_credit_operation WHERE operation_id=?').get(operationId)
    return row ? String(row.job_id) : null
  }
  createJob(input: CreateJobInput, options: { id?: string; parentAssetId?: string; feedback?: string; ownerUserId?: string } = {}): Job {
    const now = new Date().toISOString()
    const job: Job = {
      id: options.id ?? randomUUID(), status: 'queued', input, createdAt: now, updatedAt: now,
      stage: 'Esperando turno', questions: [], error: null, assetId: null, warnings: [],
      ...(options.parentAssetId ? { parentAssetId: options.parentAssetId } : {}),
      ...(options.feedback ? { feedback: options.feedback } : {}),
    }
    this.db.prepare('INSERT INTO jobs (id,status,created_at,document) VALUES (?,?,?,?)')
      .run(job.id, job.status, job.createdAt, JSON.stringify(job))
    if (options.ownerUserId) this.assignOwner('job', job.id, options.ownerUserId)
    this.appendEvent(job.id, { kind: 'queued', message: 'Objeto en cola', detail: 'El taller lo procesará cuando termine el trabajo anterior.' })
    return job
  }

  appendEvent(jobId: string, input: JobEventInput, options: { notify?: boolean } = {}): JobEvent {
    if (!this.getJob(jobId)) throw new Error('Job not found')
    const previous = this.db.prepare('SELECT attempt FROM job_events WHERE job_id = ? ORDER BY seq DESC LIMIT 1').get(jobId)
    const attempt = previous ? Number(previous.attempt) + (['retry', 'answer'].includes(input.kind) ? 1 : 0) : 1
    let url: string | undefined
    if (input.url && ProductUrlSchema.safeParse(input.url).success) {
      const parsed = new URL(input.url)
      parsed.search = ''
      parsed.hash = ''
      url = parsed.toString()
    }
    const document = {
      jobId, attempt, at: new Date().toISOString(), kind: input.kind,
      message: activityText(input.message, 240),
      ...(input.detail ? { detail: activityText(input.detail, 4000) } : {}),
      ...(url ? { url } : {}),
    }
    const result = this.db.prepare('INSERT INTO job_events (job_id,attempt,document) VALUES (?,?,?)')
      .run(jobId, attempt, JSON.stringify(document))
    const event: JobEvent = { ...document, seq: Number(result.lastInsertRowid) }
    this.db.prepare('DELETE FROM job_events WHERE job_id = ? AND seq NOT IN (SELECT seq FROM job_events WHERE job_id = ? ORDER BY seq DESC LIMIT 500)')
      .run(jobId, jobId)
    if (options.notify !== false) this.publishEvent(event)
    return event
  }

  private publishEvent(event: JobEvent): void {
    for (const listener of this.listeners.get(event.jobId) ?? []) {
      try { listener(event) } catch { /* A disconnected viewer cannot interrupt generation. */ }
    }
  }

  listEvents(jobId: string, after = 0): JobEvent[] {
    return this.db.prepare('SELECT seq,document FROM job_events WHERE job_id = ? AND seq > ? ORDER BY seq ASC').all(jobId, after)
      .map((row) => ({ ...JSON.parse(String(row.document)), seq: Number(row.seq) }) as JobEvent)
  }

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    const listeners = this.listeners.get(jobId) ?? new Set<(event: JobEvent) => void>()
    listeners.add(listener)
    this.listeners.set(jobId, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(jobId)
    }
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare('SELECT document FROM jobs WHERE id = ?').get(id)
    return row ? JSON.parse(String(row.document)) as Job : null
  }

  hasActiveRevision(assetId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM jobs WHERE status IN ('queued','analyzing','generating','needs_input') AND json_extract(document, '$.parentAssetId') = ? LIMIT 1").get(assetId))
  }

  setCandidate(jobId: string, candidate: JobCandidate): void {
    if (!this.getJob(jobId)) throw new Error('Job not found')
    this.db.prepare('INSERT INTO job_candidates (job_id,document) VALUES (?,?) ON CONFLICT(job_id) DO UPDATE SET document=excluded.document')
      .run(jobId, JSON.stringify(candidate))
  }

  getCandidate(jobId: string): JobCandidate | null {
    const row = this.db.prepare('SELECT document FROM job_candidates WHERE job_id = ?').get(jobId)
    return row ? JSON.parse(String(row.document)) as JobCandidate : null
  }

  listJobs(): Job[] {
    return this.db.prepare('SELECT document FROM jobs ORDER BY created_at DESC LIMIT 200').all()
      .map((row) => JSON.parse(String(row.document)) as Job)
  }

  nextJob(): Job | null {
    const row = this.db.prepare("SELECT document FROM jobs WHERE status = 'queued' ORDER BY created_at ASC, rowid ASC LIMIT 1").get()
    return row ? JSON.parse(String(row.document)) as Job : null
  }

  pendingCount(): number {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('queued','analyzing','generating')").get()!.count)
  }

  updateJob(id: string, patch: Partial<Omit<Job, 'id' | 'createdAt'>>): Job {
    const previous = this.getJob(id)
    if (!previous) throw new Error('Job not found')
    const job = { ...previous, ...patch, updatedAt: new Date().toISOString() }
    this.db.prepare('UPDATE jobs SET status = ?, document = ? WHERE id = ?')
      .run(job.status, JSON.stringify(job), id)
    return job
  }

  recoverInterrupted(): void {
    for (const row of this.db.prepare("SELECT id FROM jobs WHERE status IN ('analyzing','generating')").all()) {
      this.updateJob(String(row.id), {
        status: 'failed', stage: 'Interrumpido al reiniciar el backend',
        error: 'El backend se detuvo antes de terminar. Podés reintentar este trabajo.',
      })
      this.appendEvent(String(row.id), { kind: 'error', message: 'Generación interrumpida', detail: 'El backend se reinició antes de terminar. Podés reintentar este trabajo.' })
    }
  }

  completeJob(id: string, asset: Asset, directory: string): void {
    let completion: JobEvent
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO assets (id,created_at,directory,document) VALUES (?,?,?,?)')
        .run(asset.id, asset.createdAt, directory, JSON.stringify(asset))
      const owner = this.owner('job', id)
      if (owner) {
        this.assignOwner('asset', asset.id, owner)
        for (const reference of asset.referenceImages ?? []) this.assignOwner('reference', reference.id, owner)
      }
      this.updateJob(id, { status: 'completed', stage: 'Modelo listo para revisar', assetId: asset.id, error: null, warnings: asset.warnings })
      completion = this.appendEvent(id, { kind: 'complete', message: 'Objeto listo para revisar', detail: 'Modelo, vista previa y archivos guardados en la biblioteca local.' }, { notify: false })
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.publishEvent(completion)
  }

  listAssets(): Asset[] {
    return this.db.prepare('SELECT document FROM assets ORDER BY created_at DESC LIMIT 200').all()
      .map((row) => JSON.parse(String(row.document)) as Asset)
  }

  getAsset(id: string): { asset: Asset; directory: string } | null {
    const row = this.db.prepare('SELECT document, directory FROM assets WHERE id = ?').get(id)
    return row ? { asset: JSON.parse(String(row.document)) as Asset, directory: String(row.directory) } : null
  }

  /** Resource ownership is never inferred from a client-supplied user id. */
  assignOwner(kind: 'job' | 'asset' | 'reference', id: string, userId: string): void {
    this.db.prepare('INSERT INTO resource_owners(kind,resource_id,user_id) VALUES (?,?,?) ON CONFLICT(kind,resource_id) DO NOTHING').run(kind, id, userId)
    if (this.owner(kind, id) !== userId) throw new Error('Resource already belongs to another account')
  }

  owner(kind: 'job' | 'asset' | 'reference', id: string): string | null {
    const row = this.db.prepare('SELECT user_id FROM resource_owners WHERE kind=? AND resource_id=?').get(kind, id)
    return row ? String(row.user_id) : null
  }

  referenceCount(userId?: string): number {
    return Number(userId
      ? this.db.prepare("SELECT COUNT(*) AS count FROM resource_owners WHERE kind='reference' AND user_id=?").get(userId)!.count
      : this.db.prepare("SELECT COUNT(*) AS count FROM resource_owners WHERE kind='reference'").get()!.count)
  }

  userJobs(userId: string): Job[] {
    return this.db.prepare("SELECT j.document FROM jobs j JOIN resource_owners o ON o.kind='job' AND o.resource_id=j.id WHERE o.user_id=? ORDER BY j.created_at DESC LIMIT 200").all(userId)
      .map(row => JSON.parse(String(row.document)) as Job)
  }

  userAssets(userId: string): Asset[] {
    return this.db.prepare("SELECT a.document FROM assets a JOIN resource_owners o ON o.kind='asset' AND o.resource_id=a.id WHERE o.user_id=? ORDER BY a.created_at DESC LIMIT 200").all(userId)
      .map(row => JSON.parse(String(row.document)) as Asset)
  }

  /** Reserve attempts before starting any billable work, including retries. */
  reserveGeneration(userId: string, dailyLimit: number, globalLimit: number, pendingLimit: number): boolean {
    const day = new Date().toISOString().slice(0, 10)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const personal = Number(this.db.prepare('SELECT count FROM generation_usage WHERE user_id=? AND day=?').get(userId, day)?.count ?? 0)
      const total = Number(this.db.prepare('SELECT COALESCE(SUM(count),0) AS count FROM generation_usage WHERE day=?').get(day)!.count)
      const pending = Number(this.db.prepare("SELECT COUNT(*) AS count FROM jobs j JOIN resource_owners o ON o.kind='job' AND o.resource_id=j.id WHERE o.user_id=? AND j.status IN ('queued','analyzing','generating')").get(userId)!.count)
      if (personal >= dailyLimit || total >= globalLimit || pending >= pendingLimit) { this.db.exec('ROLLBACK'); return false }
      this.db.prepare('INSERT INTO generation_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1').run(userId, day)
      this.db.exec('COMMIT')
      return true
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  projectAssets(projectId: string): ProjectAsset[] {
    return this.db.prepare('SELECT * FROM project_assets WHERE project_id=? ORDER BY created_at').all(projectId).map(row => ({
      id: String(row.id), projectId: String(row.project_id), sourceAssetId: String(row.asset_id), label: String(row.label),
      dimensions: JSON.parse(String(row.dimensions)) as [number, number, number],
      url: `/api/projects/${projectId}/assets/${String(row.id)}/files/model.glb`,
    }))
  }

  attachAsset(projectId: string, asset: Asset): ProjectAsset {
    this.db.prepare('INSERT INTO project_assets(id,project_id,asset_id,label,dimensions,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,asset_id) DO NOTHING')
      .run(randomUUID(), projectId, asset.id, asset.label, JSON.stringify(asset.dimensions), new Date().toISOString())
    return this.projectAssets(projectId).find(item => item.sourceAssetId === asset.id)!
  }

  /** Explicit operator migration only. Existing unowned local content stays invisible until claimed. */
  claimLegacyLibrary(userId: string): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const [kind, table] of [['job', 'jobs'], ['asset', 'assets']] as const) {
        for (const row of this.db.prepare(`SELECT id FROM ${table}`).all()) {
          if (!this.owner(kind, String(row.id))) this.assignOwner(kind, String(row.id), userId)
        }
      }
      // Migration must visit the whole library, not the UI's most recent 200 rows.
      for (const row of this.db.prepare("SELECT j.document FROM jobs j JOIN resource_owners o ON o.kind='job' AND o.resource_id=j.id WHERE o.user_id=?").all(userId)) {
        const job = JSON.parse(String(row.document)) as Job
        for (const id of job.input.referenceImageIds ?? []) {
          if (!this.owner('reference', id)) this.assignOwner('reference', id, userId)
        }
      }
      for (const row of this.db.prepare("SELECT a.document FROM assets a JOIN resource_owners o ON o.kind='asset' AND o.resource_id=a.id WHERE o.user_id=?").all(userId)) {
        const asset = JSON.parse(String(row.document)) as Asset
        for (const reference of asset.referenceImages ?? []) {
          if (!this.owner('reference', reference.id)) this.assignOwner('reference', reference.id, userId)
        }
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  close(): void {
    this.listeners.clear()
    this.db.close()
  }
}

export interface ProjectAsset {
  id: string
  projectId: string
  sourceAssetId: string
  label: string
  dimensions: [number, number, number]
  url: string
}
