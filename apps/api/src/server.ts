import { createReadStream } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { AnswersInputSchema, CreateJobInputSchema, RevisionInputSchema, type Health, type JobEvent } from '@t3-designer/asset-schema'
import type { ReferenceLibrary } from './references.ts'
import { AssetStore } from './store.ts'
import { artifactFiles, AssetWorker } from './worker.ts'
import { AccountError, type User } from './accounts.ts'
import { CreditError, type CreditService, type CreditKind } from './credits.ts'
import { BillingError, CheckoutInputSchema, validWebhookSignature, type BillingService } from './billing.ts'
import type { GenerationCredits } from './generation-credits.ts'
import type { ProjectGenerations } from './project-generations.ts'
import { ProjectGenerationInputSchema } from './project-generation-model.ts'
import { StorageCapacityError } from './storage-capacity.ts'

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function localHostname(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname.toLowerCase())
}

function checkLocalRequest(request: IncomingMessage, publicOrigin?: string, production = false, serverCallback = false): void {
  try {
    const configured = publicOrigin ? new URL(publicOrigin) : null
    if (!request.headers.host || (production ? request.headers.host !== configured?.host : !localHostname(new URL(`http://${request.headers.host}`).hostname))) throw new Error()
    const origin = request.headers.origin
    if (origin) {
      const parsed = new URL(origin)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error()
      if (configured ? parsed.origin !== configured.origin : !localHostname(parsed.hostname)) throw new Error()
    }
    if (production && !serverCallback && !['GET', 'HEAD'].includes(request.method ?? 'GET') && origin !== configured?.origin) throw new Error()
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new Error()
  } catch {
    throw new HttpError(403, 'Origen de solicitud no permitido.')
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Se requiere Content-Type: application/json.')
  }
  if (Number(request.headers['content-length']) > limit) throw new HttpError(413, 'La solicitud es demasiado grande.')
  return new Promise((resolve, reject) => {
    let bytes = 0
    let exceeded = false
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > limit) {
        if (!exceeded) reject(new HttpError(413, 'La solicitud es demasiado grande.'))
        exceeded = true
        chunks.length = 0
      } else if (!exceeded) chunks.push(chunk)
    })
    request.on('end', () => {
      if (exceeded) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new HttpError(400, 'JSON inválido.')) }
    })
    request.once('error', reject)
    request.once('aborted', () => reject(new HttpError(400, 'Solicitud interrumpida.')))
  })
}

const idPattern = /^[a-f0-9-]{36}$/
const mime: Record<string, string> = {
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.blend': 'application/octet-stream', '.json': 'application/json; charset=utf-8',
}

export function createApi(options: {
  store: AssetStore
  worker: AssetWorker
  health: () => Promise<Omit<Health, 'activeJobId'>>
  references?: Pick<ReferenceLibrary, 'upload' | 'get' | 'file'>
  access?: {
    authorize: (request: IncomingMessage) => Promise<User | null>
    handle?: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>
  }
  projects?: {
    handle: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>
    access: (user: User, projectId: string) => Promise<string | null>
  }
  publicOrigin?: string
  production?: boolean
  projectGenerations?: ProjectGenerations
  credits?: CreditService
  metering?: GenerationCredits
  billing?: BillingService
  billingWebhookSecret?: string
  generation?: { enabled: boolean; userIds?: string[]; dailyLimit?: number; globalDailyLimit?: number; pendingLimit?: number }
}) {
  const { store, worker } = options
  const activityStreams = new Set<ServerResponse>()
  const referenceUploads = new Map<string, number>()
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (response.headersSent) { response.destroy(); return }
      if (error instanceof HttpError || error instanceof CreditError || error instanceof BillingError || error instanceof AccountError || error instanceof StorageCapacityError) sendJson(response, error.status, { error: error.message })
      else {
        console.error('Asset API request failed:', error instanceof Error ? error.message : 'Unknown error')
        sendJson(response, 500, { error: 'No se pudo completar la solicitud.' })
      }
    })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  // Long-lived event streams must not prevent HTTP shutdown from finishing.
  const close = server.close.bind(server)
  server.close = (callback) => {
    for (const response of activityStreams) response.end()
    return close(callback)
  }

  function requireQueueSpace(user: { id: string; role: string }): void {
    if (!generationAllowed(user)) throw new HttpError(403, 'La generación no está habilitada para esta cuenta.')
    if (store.pendingCount() >= 20) {
      throw new HttpError(429, 'La cola está llena. Esperá a que termine algún trabajo.')
    }
    const limits = options.generation!
    if (!store.reserveGeneration(user.id, limits.dailyLimit ?? 5, limits.globalDailyLimit ?? 20, limits.pendingLimit ?? 2)) {
      throw new HttpError(429, 'Alcanzaste el límite de generación. Esperá a que termine el trabajo activo o al próximo día UTC.')
    }
  }

  function generationAllowed(user: { id: string; role: string }): boolean {
    return options.generation?.enabled === true && (!!options.credits || user.role === 'admin' || options.generation.userIds?.includes(user.id) === true)
  }

  function requireOwner(kind: 'job' | 'asset' | 'reference', id: string, userId: string): void {
    if (store.owner(kind, id) !== userId) throw new HttpError(404, 'Recurso no encontrado.')
  }

  async function validateReferences(ids: string[] | undefined, userId: string): Promise<void> {
    for (const id of ids ?? []) {
      if (store.owner('reference', id) !== userId || !options.references || !await options.references.get(id) || !await options.references.file(id)) throw new HttpError(400, 'Una imagen de referencia ya no está disponible. Volvé a adjuntarla.')
    }
  }

  async function enqueue<T>(request: IncomingMessage, payload: unknown, user: User, jobId: string, kind: CreditKind, action: () => T, validate = () => {}): Promise<T> {
    const key = request.headers['idempotency-key']
    if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))) throw new HttpError(400, 'Clave de reintento inválida.')
    const fingerprint = createHash('sha256').update(JSON.stringify([request.url, payload])).digest('hex')
    const work = async () => {
      const previous = typeof key === 'string' ? store.generationRequest(user.id, key) : null
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new HttpError(409, 'La clave de reintento corresponde a otra solicitud.')
        const job = store.getJob(previous.jobId)
        if (!job) throw new HttpError(409, 'El trabajo anterior ya no está disponible.')
        return job as T
      }
      validate()
      if (!generationAllowed(user)) throw new HttpError(403, 'La generación no está habilitada para esta cuenta.')
      const reservation = await options.metering?.reserve(user.id, jobId, kind)
      try { requireQueueSpace(user); return store.queueMutation(action, typeof key === 'string' ? { userId: user.id, key, fingerprint, jobId } : undefined) }
      catch (error) { if (reservation) await options.credits!.refund(reservation); throw error }
    }
    return options.metering ? options.metering.exclusive(work) : work()
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const method = request.method ?? 'GET'
    const webhook = url.pathname === '/api/billing/webhook' && method === 'POST'
    checkLocalRequest(request, options.publicOrigin, options.production, webhook)
    if (webhook) {
      const id = url.searchParams.get('data.id') ?? ''
      const signature = request.headers['x-signature']
      const requestId = request.headers['x-request-id']
      if (!options.billing || typeof signature !== 'string' || typeof requestId !== 'string' || !validWebhookSignature(options.billingWebhookSecret ?? '', signature, requestId, id)) throw new HttpError(401, 'Notificación no válida.')
      const body = await readJson(request) as { type?: unknown; data?: { id?: unknown } }
      if (!body || String(body.data?.id ?? '') !== id || typeof body.type !== 'string') throw new HttpError(400, 'Notificación inconsistente.')
      await options.billing.webhook(body.type, id)
      sendJson(response, 200, { ok: true }); return
    }
    if (url.pathname === '/api/live' && method === 'GET') { sendJson(response, 200, { status: 'ok' }); return }
    if (await options.access?.handle?.(request, response)) return
    const user = await options.access?.authorize(request)
    if (!user) throw new HttpError(401, 'Iniciá sesión para acceder a tu espacio privado.')
    if (url.pathname.startsWith('/api/project-generations') && options.projectGenerations) {
      if (url.pathname === '/api/project-generations' && method === 'GET') { sendJson(response, 200, { jobs: options.projectGenerations.list(user.id) }); return }
      if (url.pathname === '/api/project-generations' && method === 'POST') {
        const input = ProjectGenerationInputSchema.safeParse(await readJson(request))
        if (!input.success) throw new HttpError(400, 'Revisá las dimensiones, ubicación y descripción del proyecto.')
        const key = request.headers['idempotency-key']
        if (typeof key !== 'string') throw new HttpError(400, 'Se requiere una clave de reintento.')
        sendJson(response, 202, { job: await options.projectGenerations.create(user, input.data, key) }); return
      }
      const match = /^\/api\/project-generations\/([a-f0-9-]{36})(\/cancel)?$/.exec(url.pathname)
      if (match && !match[2] && method === 'GET') { sendJson(response, 200, { job: options.projectGenerations.get(user.id, match[1]) }); return }
      if (match?.[2] && method === 'POST') { await readJson(request); sendJson(response, 200, { job: await options.projectGenerations.cancel(user.id, match[1]) }); return }
      throw new HttpError(404, 'Generación no encontrada.')
    }
    if (url.pathname === '/api/credits' && method === 'GET' && options.credits) { sendJson(response, 200, await options.credits.summary(user.id)); return }
    if (options.billing && url.pathname.startsWith('/api/billing')) {
      if (url.pathname === '/api/billing' && method === 'GET') { sendJson(response, 200, await options.billing.status(user.id)); return }
      if (method === 'POST') {
        const body = await readJson(request)
        if (url.pathname === '/api/billing/checkout') {
          const parsed = CheckoutInputSchema.safeParse(body)
          if (!parsed.success) throw new HttpError(400, 'Elegí un plan o paquete válido.')
          sendJson(response, 200, await options.billing.checkout(user.id, parsed.data.product)); return
        }
        if (url.pathname === '/api/billing/refresh') { sendJson(response, 200, await options.billing.refresh(user.id)); return }
        if (url.pathname === '/api/billing/cancel') { sendJson(response, 200, await options.billing.cancel(user.id)); return }
        const mock = /^\/api\/billing\/mock\/([a-f0-9-]{36})\/approve$/.exec(url.pathname)
        if (mock) { sendJson(response, 200, await options.billing.simulate(user.id, mock[1])); return }
      }
      throw new HttpError(404, 'Ruta no encontrada.')
    }
    const projectAssetsMatch = /^\/api\/projects\/([a-f0-9-]{36})\/assets(?:\/([a-f0-9-]{36})\/files\/(model\.glb))?$/.exec(url.pathname)
    if (projectAssetsMatch && options.projects) {
      const projectId = projectAssetsMatch[1]
      const role = await options.projects.access(user, projectId)
      if (!role) throw new HttpError(404, 'Proyecto no encontrado.')
      if (projectAssetsMatch[2] && ['GET', 'HEAD'].includes(method)) {
        const attachment = store.projectAssets(projectId).find(asset => asset.id === projectAssetsMatch[2])
        const stored = attachment && store.getAsset(attachment.sourceAssetId)
        if (!stored) throw new HttpError(404, 'Modelo no encontrado.')
        await serveAssetFile(stored.directory, 'model.glb', request, response)
        return
      }
      if (!projectAssetsMatch[2] && method === 'GET') {
        sendJson(response, 200, { assets: store.projectAssets(projectId).map(({ id, projectId, label, dimensions, url }) => ({ id, projectId, label, dimensions, url })) }); return
      }
      if (!projectAssetsMatch[2] && method === 'POST') {
        if (!['owner', 'editor'].includes(role)) throw new HttpError(403, 'Solo los editores pueden agregar modelos.')
        const body = await readJson(request)
        if (!body || typeof body !== 'object' || !('assetId' in body) || typeof body.assetId !== 'string') throw new HttpError(400, 'Elegí un objeto de tu biblioteca.')
        requireOwner('asset', body.assetId, user.id)
        const stored = store.getAsset(body.assetId)
        if (!stored) throw new HttpError(404, 'Modelo no encontrado.')
        const { id, label, dimensions, url } = store.attachAsset(projectId, stored.asset)
        const asset = { id, projectId, label, dimensions, url }
        sendJson(response, 201, { asset }); return
      }
    }
    if (await options.projects?.handle(request, response)) return
    if (url.pathname === '/api/health' && method === 'GET') {
      sendJson(response, 200, { ...await options.health(), generationEnabled: generationAllowed(user), projectGenerationEnabled: options.projectGenerations?.isEnabled ?? false, activeJobId: worker.activeJobId && store.owner('job', worker.activeJobId) === user.id ? worker.activeJobId : null })
      return
    }
    if (url.pathname === '/api/references' && method === 'POST') {
      if (!options.references) throw new HttpError(503, 'El almacenamiento de referencias no está disponible.')
      const inFlight = referenceUploads.get(user.id) ?? 0
      const allInFlight = [...referenceUploads.values()].reduce((sum, count) => sum + count, 0)
      if (inFlight >= 2 || allInFlight >= 4 || store.referenceCount(user.id) + inFlight >= 100 || store.referenceCount() + allInFlight >= 1000) throw new HttpError(429, 'Se alcanzó el límite de referencias almacenadas o cargas simultáneas.')
      referenceUploads.set(user.id, inFlight + 1)
      try {
        const body = await readJson(request, 7 * 1024 * 1024)
        if (!body || typeof body !== 'object' || !('name' in body) || !('dataUrl' in body)
            || typeof body.name !== 'string' || typeof body.dataUrl !== 'string') throw new HttpError(400, 'Adjuntá una imagen con nombre y contenido.')
        const reference = await options.references.upload({ name: body.name, dataUrl: body.dataUrl }).catch((error: unknown) => {
          if (error instanceof StorageCapacityError) throw error
          throw new HttpError(400, 'La imagen no es válida. Usá PNG, JPEG o WebP de hasta 5 MB.')
        })
        store.assignOwner('reference', reference.id, user.id)
        sendJson(response, 201, { reference })
      }
      finally {
        const remaining = (referenceUploads.get(user.id) ?? 1) - 1
        if (remaining) referenceUploads.set(user.id, remaining)
        else referenceUploads.delete(user.id)
      }
      return
    }
    const referenceMatch = /^\/api\/references\/([^/]+)(\/image)?$/.exec(url.pathname)
    if (referenceMatch && idPattern.test(referenceMatch[1]) && ['GET', 'HEAD'].includes(method)) {
      requireOwner('reference', referenceMatch[1], user.id)
      const reference = await options.references?.get(referenceMatch[1])
      if (!reference) throw new HttpError(404, 'Referencia no encontrada.')
      if (!referenceMatch[2]) { sendJson(response, 200, { reference }); return }
      const file = await options.references?.file(reference.id)
      if (!file) throw new HttpError(404, 'Imagen no encontrada.')
      const info = await stat(file.path)
      response.writeHead(200, {
        'Content-Type': file.mime, 'Content-Length': info.size, 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
      })
      if (method === 'HEAD') response.end()
      else await pipeline(createReadStream(file.path), response)
      return
    }
    if (url.pathname === '/api/jobs' && method === 'GET') {
      sendJson(response, 200, { jobs: store.userJobs(user.id) })
      return
    }
    if (url.pathname === '/api/jobs' && method === 'POST') {
      const input = CreateJobInputSchema.safeParse(await readJson(request))
      if (!input.success) throw new HttpError(400, input.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
      await validateReferences(input.data.referenceImageIds, user.id)
      const jobId = randomUUID()
      const job = await enqueue(request, input.data, user, jobId, 'asset', () => store.createJob(input.data, { id: jobId, ownerUserId: user.id }))
      sendJson(response, 202, { job })
      worker.kick()
      return
    }
    const eventsMatch = /^\/api\/jobs\/([^/]+)\/events(\/stream)?$/.exec(url.pathname)
    if (eventsMatch && idPattern.test(eventsMatch[1]) && method === 'GET') {
      const jobId = eventsMatch[1]
      requireOwner('job', jobId, user.id)
      if (!store.getJob(jobId)) throw new HttpError(404, 'Trabajo no encontrado.')
      const cursor = (value: string | undefined | null) => {
        if (value == null || value === '') return 0
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new HttpError(400, 'Cursor de actividad inválido.')
        return Number(value)
      }
      const lastEventId = request.headers['last-event-id']
      const after = Math.max(cursor(url.searchParams.get('after')), eventsMatch[2] ? cursor(Array.isArray(lastEventId) ? lastEventId[0] : lastEventId) : 0)
      const events = store.listEvents(jobId, after)
      if (!eventsMatch[2]) { sendJson(response, 200, { events }); return }
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no', Connection: 'keep-alive',
      })
      response.flushHeaders()
      activityStreams.add(response)
      let delivery = Promise.resolve()
      const send = (event: JobEvent) => {
        delivery = delivery.then(async () => {
          const current = await options.access?.authorize(request)
          if (!current || current.id !== user.id) { response.end(); return }
          if (response.destroyed || response.writableEnded) return
          // Slow clients reconnect from their last event instead of accumulating an unbounded buffer.
          if (response.writableLength > 1024 * 1024) { response.end(); return }
          response.write(`id: ${event.seq}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`)
        }).catch(() => { response.end() })
      }
      const unsubscribe = store.subscribe(jobId, send)
      const heartbeat = setInterval(() => {
        void options.access?.authorize(request).then(current => {
          if (!current || current.id !== user.id) { response.end(); return }
          if (!response.destroyed && !response.writableEnded) response.write(': heartbeat\n\n')
        }).catch(() => response.end())
      }, 15_000)
      heartbeat.unref()
      response.once('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
        activityStreams.delete(response)
      })
      response.write('retry: 2000\n\n')
      for (const event of events) send(event)
      return
    }
    const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(cancel|retry|answers))?$/.exec(url.pathname)
    if (jobMatch && idPattern.test(jobMatch[1])) {
      requireOwner('job', jobMatch[1], user.id)
      let job = store.getJob(jobMatch[1])
      if (!job) throw new HttpError(404, 'Trabajo no encontrado.')
      const action = jobMatch[2]
      if (!action && method === 'GET') { sendJson(response, 200, { job }); return }
      if (action && method === 'POST') {
        if (action === 'cancel') {
          // A JSON body is required even for an empty action, preventing form-based CSRF.
          await readJson(request)
          const currentId = job.id
          const cancel = async () => {
            const current = store.getJob(currentId)!
            if (!['queued', 'analyzing', 'generating', 'needs_input'].includes(current.status)) throw new HttpError(409, 'Este trabajo ya terminó.')
            if (current.status === 'needs_input') await options.metering?.settle(currentId)
            const updated = store.updateJob(currentId, { status: 'cancelled', stage: 'Cancelado', questions: [], error: null })
            store.appendEvent(currentId, { kind: 'cancelled', message: 'Generación cancelada', detail: 'La cancelación fue solicitada desde el taller.' })
            worker.cancel(currentId)
            if (worker.activeJobId !== currentId) await options.metering?.settle(currentId)
            return updated
          }
          const updated = options.metering ? await options.metering.exclusive(cancel) : await cancel()
          sendJson(response, 200, { job: updated })
          return
        }
        if (action === 'retry') {
          await readJson(request)
          job = store.getJob(job.id)!
          const currentId = job.id
          const updated = await enqueue(request, {}, user, currentId, job.parentAssetId ? 'revision' : 'asset', () => {
            const updated = store.updateJob(currentId, { status: 'queued', stage: 'Esperando turno', error: null, questions: [] })
            store.appendEvent(currentId, { kind: 'retry', message: 'Nuevo intento en cola', detail: 'El historial del intento anterior se conserva.' })
            return updated
          }, () => {
            if (!['failed', 'cancelled'].includes(store.getJob(currentId)?.status ?? '') || worker.activeJobId === currentId) throw new HttpError(409, 'El trabajo ya se está procesando.')
          })
          sendJson(response, 202, { job: updated })
          worker.kick()
          return
        }
        const answers = AnswersInputSchema.safeParse(await readJson(request))
        if (!answers.success) throw new HttpError(400, 'Añadí una respuesta y medidas válidas en metros, si corresponde.')
        await validateReferences(answers.data.referenceImageIds, user.id)
        job = store.getJob(job.id)!
        const input = CreateJobInputSchema.safeParse({
          ...job.input,
          notes: [job.input.notes,
            `Preguntas de la revisión anterior:\n${job.questions.join('\n')}`,
            `Respuesta del usuario:\n${answers.data.notes}`,
          ].filter(Boolean).join('\n\n'),
          ...(answers.data.dimensions ? { dimensions: answers.data.dimensions } : {}),
          ...(answers.data.referenceImageIds ? { referenceImageIds: answers.data.referenceImageIds } : {}),
        })
        if (!input.success) throw new HttpError(400, 'La conversación supera 12.000 caracteres. Creá otro trabajo con un resumen.')
        const currentId = job.id
        const updated = await enqueue(request, answers.data, user, currentId, job.parentAssetId ? 'revision' : 'asset', () => {
          const updated = store.updateJob(currentId, { input: input.data, status: 'queued', stage: 'Esperando turno', questions: [], error: null })
          store.appendEvent(currentId, { kind: 'answer', message: 'Respuesta recibida', detail: 'Retomando el análisis con los detalles que añadiste.' })
          return updated
        }, () => {
          if (store.getJob(currentId)?.status !== 'needs_input') throw new HttpError(409, 'El trabajo ya se está procesando.')
        })
        sendJson(response, 202, { job: updated })
        worker.kick()
        return
      }
    }
    if (url.pathname === '/api/assets' && method === 'GET') {
      sendJson(response, 200, { assets: store.userAssets(user.id) })
      return
    }
    const revisionMatch = /^\/api\/assets\/([^/]+)\/revisions$/.exec(url.pathname)
    if (revisionMatch && idPattern.test(revisionMatch[1]) && method === 'POST') {
      requireOwner('asset', revisionMatch[1], user.id)
      const stored = store.getAsset(revisionMatch[1])
      if (!stored) throw new HttpError(404, 'Modelo no encontrado.')
      const revision = RevisionInputSchema.safeParse(await readJson(request))
      if (!revision.success) throw new HttpError(400, 'Describí qué querés corregir del objeto.')
      const originalJob = store.getJob(stored.asset.jobId)
      if (!originalJob) throw new HttpError(409, 'No se encontró el trabajo original del objeto.')
      const referenceImageIds = revision.data.referenceImageIds
        ?? stored.asset.referenceImages?.map((reference) => reference.id) ?? originalJob.input.referenceImageIds
      await validateReferences(referenceImageIds, user.id)
      const jobId = randomUUID()
      const job = await enqueue(request, revision.data, user, jobId, 'revision', () => {
        const created = store.createJob({ ...originalJob.input, dimensions: stored.asset.dimensions, ...(referenceImageIds ? { referenceImageIds } : {}) }, {
        id: jobId, parentAssetId: stored.asset.id, feedback: revision.data.feedback, ownerUserId: user.id,
      })
        store.appendEvent(created.id, { kind: 'revision', message: 'Revisión creada', detail: revision.data.feedback })
        return created
      }, () => { if (store.hasActiveRevision(stored.asset.id)) throw new HttpError(409, 'Ya hay una revisión en curso.') })
      sendJson(response, 202, { job })
      worker.kick()
      return
    }
    const assetMatch = /^\/api\/assets\/([^/]+)(?:\/files\/([^/]+))?$/.exec(url.pathname)
    if (assetMatch && idPattern.test(assetMatch[1]) && ['GET', 'HEAD'].includes(method)) {
      requireOwner('asset', assetMatch[1], user.id)
      const stored = store.getAsset(assetMatch[1])
      if (!stored) throw new HttpError(404, 'Modelo no encontrado.')
      if (!assetMatch[2]) { sendJson(response, 200, { asset: stored.asset }); return }
      const filename = assetMatch[2]
      if (!(artifactFiles as readonly string[]).includes(filename)) throw new HttpError(404, 'Archivo no encontrado.')
      await serveAssetFile(stored.directory, filename, request, response)
      return
    }
    throw new HttpError(404, 'Ruta no encontrada.')
  }

  async function serveAssetFile(assetDirectory: string, filename: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
      const path = join(assetDirectory, filename)
      let info
      try {
        const directory = await realpath(assetDirectory)
        if (await realpath(path) !== join(directory, filename)) throw new Error('Invalid artifact path')
        info = await stat(path)
        if (!info.isFile()) throw new Error('Not a file')
      } catch { throw new HttpError(404, 'Archivo no encontrado.') }
      const extension = filename.slice(filename.lastIndexOf('.'))
      response.writeHead(200, {
        'Content-Type': mime[extension] ?? 'application/octet-stream', 'Content-Length': info.size,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Disposition': `${extension === '.blend' || extension === '.json' ? 'attachment' : 'inline'}; filename="${filename}"`,
      })
      if (request.method === 'HEAD') response.end()
      else await pipeline(createReadStream(path), response)
  }
  return server
}
