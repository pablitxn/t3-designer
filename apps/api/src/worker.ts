import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AssetRequestSchema, VisualReviewSchema, type Asset, type AssetRequest, type Job, type JobEventInput, type VisualReview } from '@t3-designer/asset-schema'
import type { planAsset, reviewAsset } from './codex.ts'
import type { ReferenceLibrary } from './references.ts'
import { runProcess } from './process.ts'
import { activityText, AssetStore } from './store.ts'

export type Planner = typeof planAsset
export type Reviewer = typeof reviewAsset
export type ReferenceLoader = ReferenceLibrary['prepare']
export type Renderer = (options: {
  inputPath: string; outputDirectory: string; signal: AbortSignal; onEvent?: (event: JobEventInput) => void
}) => Promise<void>
export const artifactFiles = ['model.glb', 'preview.png', 'source.blend', 'manifest.json', 'request.json', 'front.png', 'side.png', 'review.json'] as const

export function blenderBinary(): string {
  const mac = '/Applications/Blender.app/Contents/MacOS/Blender'
  return process.env.BLENDER_BIN || (process.platform === 'darwin' && existsSync(mac) ? mac : 'blender')
}

export function createRenderer(root: string, binary = blenderBinary()): Renderer {
  return async ({ inputPath, outputDirectory, signal, onEvent }) => {
    await runProcess(binary, [
      '--background', '--factory-startup', '--disable-autoexec', '--threads', '2', '--python-exit-code', '1',
      '--python', join(root, 'scripts/blender/generate_asset.py'), '--',
      '--input', inputPath, '--output-dir', outputDirectory, '--resolution', '512', '--samples', '24',
    ], {
      cwd: root, signal, timeoutMs: 10 * 60_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG },
      onStdoutLine: (line) => {
        const prefix = 'T3_ASSET_EVENT '
        if (!line.startsWith(prefix) || signal.aborted) return
        try {
          const event = JSON.parse(line.slice(prefix.length)) as Record<string, unknown>
          if (!['modeling', 'render', 'validation'].includes(String(event.kind)) || typeof event.message !== 'string') return
          onEvent?.({
            kind: event.kind as 'modeling' | 'render' | 'validation', message: event.message,
            ...(typeof event.detail === 'string' ? { detail: event.detail } : {}),
          })
        } catch { /* Ignore malformed telemetry; normal process validation still determines success. */ }
      },
    })
  }
}

/** Publish only complete artifacts whose content matches the trusted generator manifest. */
export async function validateArtifacts(directory: string, request: AssetRequest, requireReviewRenders = false): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  if (manifest.status !== 'validated' || manifest.id !== request.id || manifest.units !== 'meters'
      || manifest.upAxis !== '+Y' || manifest.frontAxis !== '+Z' || manifest.origin !== 'floor-center'
      || !Array.isArray(manifest.validation?.errors) || manifest.validation.errors.length !== 0) {
    throw new Error('Blender no produjo un manifiesto validado')
  }
  if (!Array.isArray(manifest.dimensions) || manifest.dimensions.length !== 3
      || manifest.dimensions.some((value: unknown, index: number) => typeof value !== 'number'
        || !Number.isFinite(value) || Math.abs(value - request.dimensions[index]) > .002)) {
    throw new Error('Las medidas exportadas no coinciden con las solicitadas')
  }
  const actualDirectory = await realpath(directory)
  for (const filename of ['model.glb', 'preview.png', 'source.blend', 'request.json', ...(requireReviewRenders ? ['front.png', 'side.png'] : [])]) {
    const artifact = manifest.artifacts?.[filename]
    const path = join(directory, filename)
    const info = await stat(path)
    if (!info.isFile() || info.size === 0 || info.size > 256 * 1024 * 1024
        || await realpath(path) !== join(actualDirectory, filename)
        || artifact?.path !== filename || artifact.bytes !== info.size) {
      throw new Error(`Archivo generado inválido: ${filename}`)
    }
    const digest = createHash('sha256').update(await readFile(path)).digest('hex')
    if (digest !== artifact.sha256) throw new Error(`La integridad del archivo no coincide: ${filename}`)
  }
}

export class AssetWorker {
  private current: { id: string; controller: AbortController } | null = null
  private running: Promise<void> | null = null
  private stopped = false
  private store: AssetStore
  private directory: string
  private planner: Planner
  private renderer: Renderer
  private reviewer?: Reviewer
  private referenceLoader?: ReferenceLoader
  private beforeRender?: () => Promise<void>
  private beforePublish?: (additionalBytes: number) => Promise<void>
  private onInference?: (jobId: string) => void
  private onSettled?: (jobId: string) => Promise<void>
  private canProcess?: (job: Job) => Promise<boolean>

  constructor(options: { store: AssetStore; directory: string; planner: Planner; renderer: Renderer; reviewer?: Reviewer; referenceLoader?: ReferenceLoader; canProcess?: (job: Job) => Promise<boolean>; onInference?: (jobId: string) => void; onSettled?: (jobId: string) => Promise<void>; beforeRender?: () => Promise<void>; beforePublish?: (additionalBytes: number) => Promise<void> }) {
    this.store = options.store
    this.directory = options.directory
    this.planner = options.planner
    this.renderer = options.renderer
    this.reviewer = options.reviewer
    this.referenceLoader = options.referenceLoader
    this.canProcess = options.canProcess
    this.beforeRender = options.beforeRender
    this.beforePublish = options.beforePublish
    this.onInference = options.onInference
    this.onSettled = options.onSettled
  }

  get activeJobId(): string | null { return this.current?.id ?? null }

  kick(): void {
    if (this.stopped || this.running) return
    this.running = this.drain().finally(() => {
      this.running = null
      if (!this.stopped && this.store.nextJob()) this.kick()
    })
  }

  cancel(id: string): void {
    if (this.current?.id === id) this.current.controller.abort()
  }

  async close(): Promise<void> {
    this.stopped = true
    this.current?.controller.abort()
    await this.running
  }

  private async drain(): Promise<void> {
    while (!this.stopped) {
      const job = this.store.nextJob()
      if (!job) return
      const controller = new AbortController()
      this.current = { id: job.id, controller }
      let outputDirectory: string | null = null
      let outputValidated = false
      let publishedDirectory: string | null = null
      try {
        // Persisted work may outlive its owner's account or generation grant.
        // Check immediately before any network/model/file-generation activity.
        if (this.canProcess) {
          let allowed: boolean
          try { allowed = await this.canProcess(job) }
          catch { throw new Error('No se pudo verificar el permiso de generación. Podés reintentar cuando se restablezca el servicio.') }
          if (!allowed) throw new Error('La cuenta responsable ya no tiene permiso para generar este objeto.')
        }
        controller.signal.throwIfAborted()
        this.store.updateJob(job.id, { status: 'analyzing', stage: 'Consultando el producto con Codex', questions: [], error: null })
        this.store.appendEvent(job.id, { kind: 'analysis', message: 'Revisando el producto con Codex', detail: 'Buscando referencias y medidas para preparar el modelo.' })
        const workingDirectory = join(this.directory, 'jobs', job.id, randomUUID())
        await mkdir(workingDirectory, { recursive: true })
        const callbacks = {
          onInference: () => this.onInference?.(job.id),
          signal: controller.signal,
          onProgress: (stage: string) => {
            if (!controller.signal.aborted) this.store.updateJob(job.id, { stage: activityText(stage, 240) })
          },
          onEvent: (event: JobEventInput) => {
            if (!controller.signal.aborted) this.store.appendEvent(job.id, event)
          },
        }
        let references: Awaited<ReturnType<ReferenceLoader>>
        try {
          references = this.referenceLoader
            ? await this.referenceLoader(job.input, workingDirectory, callbacks)
            : { images: [], references: [], warnings: [] }
          const owner = this.store.owner('job', job.id)
          if (owner) for (const reference of references.references) this.store.assignOwner('reference', reference.id, owner)
        } catch {
          controller.signal.throwIfAborted()
          const questions = ['No pude preparar las imágenes de referencia. Volvé a adjuntar una foto clara del producto para continuar.']
          this.store.updateJob(job.id, { status: 'needs_input', stage: 'Necesito fotos del producto', questions })
          this.store.appendEvent(job.id, { kind: 'question', message: 'La referencia visual no está disponible', detail: questions[0] })
          continue
        }
        controller.signal.throwIfAborted()
        const input = references.references.length
          ? { ...job.input, referenceImageIds: references.references.map((reference) => reference.id) } : job.input
        if (references.references.length) this.store.updateJob(job.id, { input })
        if (this.reviewer && !references.images.length) {
          const questions = ['Adjuntá al menos una foto clara del producto. No pude obtener imágenes suficientes para compararlo visualmente.']
          this.store.updateJob(job.id, { status: 'needs_input', stage: 'Necesito fotos del producto', questions, warnings: references.warnings })
          this.store.appendEvent(job.id, { kind: 'question', message: 'Necesito una referencia visual', detail: questions[0] })
          continue
        }
        const candidate = this.store.getCandidate(job.id)
        const parent = job.parentAssetId ? this.store.getAsset(job.parentAssetId) : null
        if (job.parentAssetId && !parent) throw new Error('El objeto original de esta revisión ya no está disponible.')
        const previousDirectory = candidate?.directory ?? parent?.directory
        const previousReview = candidate?.review ?? parent?.asset.visualReview
        const previous = previousDirectory ? {
          recipe: AssetRequestSchema.parse(candidate?.request ?? JSON.parse(await readFile(join(previousDirectory, 'request.json'), 'utf8'))),
          feedback: [job.feedback, input.notes, previousReview?.summary, ...(previousReview?.issues ?? [])].filter(Boolean).join('\n\n'),
          renderPaths: ['preview.png', 'front.png', 'side.png'].map((file) => join(previousDirectory, file)).filter(existsSync),
        } : undefined
        const plan = await this.planner(input, { ...callbacks, workingDirectory, referenceImages: references.images, previous })
        if (controller.signal.aborted) throw new Error('Operation cancelled')
        if (plan.status === 'needs_input') {
          this.store.updateJob(job.id, {
            status: 'needs_input', stage: plan.summary || 'Necesito algunos detalles para continuar',
            questions: plan.questions, warnings: [...references.warnings, ...plan.warnings],
          })
          this.store.appendEvent(job.id, { kind: 'question', message: 'Necesito algunos detalles', detail: plan.questions.join('\n\n') })
          continue
        }
        let request = AssetRequestSchema.parse(plan.recipe)
        // The submitted URL is provenance, never an agent-controlled file or redirect target.
        request.source.url = input.url
        if (input.dimensions && request.dimensions.some((value, index) => Math.abs(value - input.dimensions![index]) > .00001)) {
          throw new Error('Codex no respetó las medidas indicadas. Reintentá aclarando las dimensiones.')
        }
        this.store.appendEvent(job.id, {
          kind: 'plan', message: 'Plan de modelado preparado',
          detail: [plan.summary, `${request.label}\n${request.dimensions.map((value) => `${Math.round(value * 1000) / 10} cm`).join(' × ')} (ancho × alto × fondo)`,
            request.kind === 'procedural' ? `${request.parameters.parts.length} piezas: ${request.parameters.parts.map((part) => part.name).join(', ')}` : `Receta: ${request.kind}`,
          ].filter(Boolean).join('\n\n'),
        })
        for (const url of [...new Set([request.source.url, ...(request.source.references ?? [])])].filter((url): url is string => Boolean(url)).slice(0, 20)) {
          this.store.appendEvent(job.id, { kind: 'source', message: 'Referencia del producto', url })
        }
        await writeFile(join(workingDirectory, 'analysis.json'), JSON.stringify({ summary: plan.summary, warnings: plan.warnings }, null, 2) + '\n')
        const warnings = [...references.warnings, ...plan.warnings]
        let visualReview: VisualReview | undefined
        let iterations = 0
        for (let iteration = 1; iteration <= 3; iteration++) {
          iterations = iteration
          const roundDirectory = join(workingDirectory, `round-${iteration}`)
          await mkdir(roundDirectory)
          const inputPath = join(roundDirectory, 'request.json')
          await writeFile(inputPath, JSON.stringify(request, null, 2) + '\n')
          controller.signal.throwIfAborted()
          outputDirectory = join(roundDirectory, 'candidate')
          outputValidated = false
          await this.beforeRender?.()
          this.store.updateJob(job.id, { status: 'generating', stage: `Modelando en Blender · versión ${iteration}`, warnings })
          this.store.appendEvent(job.id, { kind: 'modeling', message: `Iniciando Blender · versión ${iteration}`, detail: 'Construyendo la geometría y los materiales en tu máquina.' })
          await this.renderer({ inputPath, outputDirectory, signal: controller.signal, onEvent: (event) => {
            if (!controller.signal.aborted) {
              this.store.appendEvent(job.id, event)
              this.store.updateJob(job.id, { stage: activityText(event.message, 240) })
            }
          } })
          controller.signal.throwIfAborted()
          this.store.updateJob(job.id, { stage: 'Verificando medidas y archivos' })
          this.store.appendEvent(job.id, { kind: 'validation', message: 'Verificando medidas y archivos', detail: 'Comprobando dimensiones, integridad y archivos antes de revisar el objeto.' })
          await validateArtifacts(outputDirectory, request, Boolean(this.reviewer))
          controller.signal.throwIfAborted()
          outputValidated = true
          this.store.setCandidate(job.id, { directory: outputDirectory, request, iteration })
          if (!this.reviewer) break
          this.store.updateJob(job.id, { stage: `Comparando fotos y renders · versión ${iteration}` })
          this.store.appendEvent(job.id, { kind: 'review', message: `Revisión visual · versión ${iteration}`, detail: 'Comparando la vista general, frontal y lateral del modelo con las fotos del producto.' })
          visualReview = VisualReviewSchema.parse(await this.reviewer(request, {
            ...callbacks, workingDirectory: roundDirectory, referenceImages: references.images,
            renderPaths: ['preview.png', 'front.png', 'side.png'].map((file) => join(outputDirectory!, file)), iteration,
          }))
          controller.signal.throwIfAborted()
          await writeFile(join(outputDirectory, 'review.json'), JSON.stringify(visualReview, null, 2) + '\n')
          controller.signal.throwIfAborted()
          this.store.setCandidate(job.id, { directory: outputDirectory, request, iteration, review: visualReview })
          this.store.appendEvent(job.id, { kind: 'review', message: visualReview.verdict === 'accept' ? 'Comparación visual completada' : 'Diferencias visuales detectadas', detail: [visualReview.summary, ...visualReview.issues].join('\n\n') })
          if (visualReview.verdict === 'needs_input') {
            this.store.updateJob(job.id, { status: 'needs_input', stage: 'Necesito una aclaración para mejorar el modelo', questions: visualReview.questions, warnings: [...warnings, ...visualReview.issues] })
            this.store.appendEvent(job.id, { kind: 'question', message: 'Necesito una aclaración visual', detail: visualReview.questions.join('\n\n') })
            break
          }
          if (visualReview.verdict === 'accept') break
          if (iteration === 3) {
            warnings.push('Se alcanzó el límite de tres comparaciones automáticas. Este borrador conserva diferencias visuales pendientes.', ...visualReview.issues)
            break
          }
          const revised = AssetRequestSchema.parse(visualReview.recipe)
          if (revised.dimensions.some((value, index) => Math.abs(value - request.dimensions[index]) > .00001)) {
            throw new Error('La revisión visual intentó modificar las medidas verificadas del producto.')
          }
          revised.source = request.source
          revised.id = request.id
          request = revised
          this.store.appendEvent(job.id, { kind: 'revision', message: `Ajustando la versión ${iteration + 1}`, detail: visualReview.issues.join('\n\n') || visualReview.summary })
        }
        if (visualReview?.verdict === 'needs_input') continue
        if (!outputDirectory || !outputValidated) throw new Error('No se obtuvo un modelo validado para publicar.')
        controller.signal.throwIfAborted()
        if (this.beforePublish) {
          let additionalBytes = 0
          for (const filename of artifactFiles) {
            const source = join(outputDirectory, filename)
            if (existsSync(source)) additionalBytes += (await stat(source)).size
          }
          await this.beforePublish(additionalBytes)
          controller.signal.throwIfAborted()
        }
        const assetId = randomUUID()
        publishedDirectory = join(this.directory, 'assets', assetId)
        await mkdir(publishedDirectory, { recursive: true })
        for (const filename of artifactFiles) {
          const source = join(outputDirectory, filename)
          if (existsSync(source)) await copyFile(source, join(publishedDirectory, filename))
        }
        controller.signal.throwIfAborted()
        await validateArtifacts(publishedDirectory, request, Boolean(this.reviewer))
        const file = (filename: string) => `/api/assets/${assetId}/files/${filename}`
        const asset: Asset = {
          id: assetId, jobId: job.id, label: request.label, kind: request.kind,
          dimensions: request.dimensions, createdAt: new Date().toISOString(), source: request.source,
          fidelityStatus: 'draft', warnings, revision: (parent?.asset.revision ?? (parent ? 1 : 0)) + 1,
          ...(job.parentAssetId ? { parentAssetId: job.parentAssetId } : {}),
          ...(references.references.length ? { referenceImages: references.references } : {}),
          ...(visualReview ? { visualReview: { verdict: visualReview.verdict, summary: visualReview.summary, issues: visualReview.issues, iterations } } : {}),
          files: { model: file('model.glb'), preview: file('preview.png'), blend: file('source.blend'), manifest: file('manifest.json'), request: file('request.json') },
        }
        controller.signal.throwIfAborted()
        this.store.completeJob(job.id, asset, publishedDirectory)
        publishedDirectory = null
      } catch (error) {
        if (outputDirectory && !outputValidated) await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined)
        if (publishedDirectory) await rm(publishedDirectory, { recursive: true, force: true }).catch(() => undefined)
        const current = this.store.getJob(job.id)
        if (current?.status !== 'cancelled') {
          const message = controller.signal.aborted
            ? 'La ejecución se interrumpió. Podés reintentar este trabajo.'
            : activityText(error instanceof Error ? error.message : 'Error inesperado', 2_000)
          this.store.updateJob(job.id, {
            status: 'failed', stage: this.stopped ? 'Backend detenido' : 'No se pudo completar el modelo', error: message,
          })
          this.store.appendEvent(job.id, { kind: 'error', message: 'No se pudo completar el objeto', detail: message })
        }
      } finally {
        try { await this.onSettled?.(job.id) } catch { console.error('Credit settlement deferred until recovery') }
        this.current = null
      }
    }
  }
}
