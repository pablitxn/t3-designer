import { UsageStore } from './usage.ts'
import { configureTelemetry } from './telemetry.ts'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Health } from '@t3-designer/asset-schema'
import { getCodexHealth, planAsset, reviewAsset } from './codex.ts'
import { acquireLibraryLock } from './lock.ts'
import { runProcess } from './process.ts'
import { ReferenceLibrary } from './references.ts'
import { createApi } from './server.ts'
import { AssetStore } from './store.ts'
import { AssetWorker, blenderBinary, createRenderer } from './worker.ts'
import { runtimeConfig } from './config.ts'
import { openAppDatabase } from './app-database.ts'
import { createAccounts } from './accounts.ts'
import { createProjects } from './projects.ts'
import { BillingService, migrateBilling } from './billing.ts'
import { GenerationCredits } from './generation-credits.ts'
import { ProjectGenerations } from './project-generations.ts'
import { FoundationAgent } from './foundation-agent.ts'
import { createFoundationGenerator } from './foundation-agent-model.ts'
import { inferenceProvider } from './openai.ts'
import { initializeCodexSession, closeCodexSession } from './codex-session.ts'
import { ensureLibraryCapacity } from './storage-capacity.ts'

async function main() {
  process.umask(0o077)
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const config = await runtimeConfig(root)
  const loginController = new AbortController()
  const cancelLogin = () => loginController.abort()
  process.once('SIGINT', cancelLogin)
  process.once('SIGTERM', cancelLogin)
  try { await initializeCodexSession(loginController.signal) }
  finally {
    process.removeListener('SIGINT', cancelLogin)
    process.removeListener('SIGTERM', cancelLogin)
  }
  const { directory, port } = config
  const database = openAppDatabase({ url: config.databaseURL, sqlitePath: resolve(config.accountDirectory, 'accounts.sqlite') })
  const accounts = await createAccounts({ database, baseURL: config.publicURL, secret: config.secret, production: config.production, trustedProxyIPs: config.trustedProxyIPs, creditConfig: config.creditConfig })
  const releaseLock = acquireLibraryLock(directory)
  const telemetry = configureTelemetry()
  const store = new AssetStore(resolve(directory, 'library.sqlite'))
  store.recoverInterrupted()
  const usage = new UsageStore(resolve(directory, 'usage.sqlite'))
  usage.recoverInterrupted()
  const credits = accounts.credits
  await migrateBilling(database)
  const billing = new BillingService(database, credits, config.billing)
  const metering = new GenerationCredits(credits, store, usage)
  await metering.recover()
  const capacityReserve = 256 * 1024 * 1024
  const references = new ReferenceLibrary(directory, { beforeSave: bytes => ensureLibraryCapacity(directory, config.libraryMaxBytes, capacityReserve + bytes) })
  const projects = await createProjects({
    database, accounts, bundledScenePath: resolve(root, 'assets/scenes/t3-project.json'),
    validatePlanReference: async (_user, projectId, referenceId) => store.hasProjectReference(projectId, referenceId)
      && !!await references.get(referenceId) && !!await references.file(referenceId),
    clonePlanReferences: async (sourceId, targetId, _user, foundations) => {
      for (const level of foundations.dwelling.levels) for (const reference of level.planReferences) {
        if (!store.hasProjectReference(sourceId, reference.id) || !await references.file(reference.id)) throw new Error('El plano original ya no está disponible.')
        store.attachProjectReference(targetId, reference.id)
      }
    },
    validateAssetReference: async (_user, projectId, asset) => {
      const attachment = store.projectAssets(projectId).find(item => item.id === asset.id)
      return !!attachment && asset.url === attachment.url && asset.repoPath === `private/${attachment.id}/model.glb`
    },
    cloneAssetReferences: async (sourceId, targetId, _user, scene) => {
      const result = structuredClone(scene)
      const replacementIds = new Map<string, string>()
      for (const asset of result.assets) {
        if (!asset.url.startsWith('/api/')) continue
        const previous = store.projectAssets(sourceId).find(item => item.id === asset.id)
        const source = previous && store.getAsset(previous.sourceAssetId)
        if (!source) throw new Error('El modelo original ya no está disponible.')
        const attachment = store.attachAsset(targetId, source.asset)
        replacementIds.set(asset.id, attachment.id)
        asset.id = attachment.id
        asset.url = attachment.url
        asset.repoPath = `private/${attachment.id}/model.glb`
      }
      for (const fixture of result.fixtures) fixture.assetId = replacementIds.get(fixture.assetId) ?? fixture.assetId
      for (const architecture of result.editor?.architectures ?? []) for (const layout of architecture.layouts) {
        for (const fixture of layout.fixtures) fixture.assetId = replacementIds.get(fixture.assetId) ?? fixture.assetId
      }
      result.project.id = targetId
      return result
    },
  })
  const projectGenerations = new ProjectGenerations({ usage, path: resolve(directory, 'project-generations.sqlite'), database, credits, store, projects, enabled: config.generation.enabled && inferenceProvider() === 'openai', limits: config.generation })
  await projectGenerations.recover()
  const foundationAgent = new FoundationAgent({ usage,
    path: resolve(directory, 'foundation-agent.sqlite'), database, credits, store, projects,
    timeoutMs: config.foundationTimeoutMs,
    // runtimeConfig restricts subscription sessions to a loopback development
    // host and web origin; production still requires the hosted API provider.
    enabled: config.generation.enabled, limits: config.generation,
    generate: createFoundationGenerator({ references }),
  })
  await foundationAgent.recover()
  const worker = new AssetWorker({ usage,
    store, directory, planner: planAsset, renderer: createRenderer(root), reviewer: reviewAsset, referenceLoader: references.prepare.bind(references),
    beforeRender: () => ensureLibraryCapacity(directory, config.libraryMaxBytes),
    beforePublish: bytes => ensureLibraryCapacity(directory, config.libraryMaxBytes, capacityReserve + bytes),
    onInference: jobId => metering.started(jobId), onSettled: jobId => metering.settle(jobId),
    canProcess: async job => {
      if (!config.generation.enabled) return false
      await ensureLibraryCapacity(directory, config.libraryMaxBytes)
      const ownerId = store.owner('job', job.id)
      if (!ownerId) return false
      const owner = await database.db.selectFrom('user').select(['role', 'suspended']).where('id', '=', ownerId).executeTakeFirst()
      return !!owner && !owner.suspended && await metering.authorized(job.id)
    },
  })
  let healthCache: { checkedAt: number; result: Omit<Health, 'activeJobId'> } | null = null
  let healthPending: Promise<Omit<Health, 'activeJobId'>> | null = null
  const health = async (): Promise<Omit<Health, 'activeJobId'>> => {
    if (healthCache && Date.now() - healthCache.checkedAt < 30_000) return healthCache.result
    if (healthPending) return healthPending
    healthPending = (async () => {
      const [codex, blender] = await Promise.all([
        getCodexHealth().catch(() => ({ available: false, authenticated: false, authMode: 'unavailable' as const })),
        runProcess(blenderBinary(), ['--version'], { timeoutMs: 10_000 }).then(() => ({ available: true }), () => ({ available: false })),
      ])
      const result: Omit<Health, 'activeJobId'> = { status: 'ok', codex, blender }
      healthCache = { checkedAt: Date.now(), result }
      return result
    })().finally(() => { healthPending = null })
    return healthPending
  }
  const server = createApi({ usage: { report: (userId, query) => usage.report(database, userId, query) }, store, worker, health, references, access: accounts, projects, publicOrigin: config.publicURL, production: config.production, generation: config.generation, credits, metering, projectGenerations, foundationAgent, billing, billingWebhookSecret: config.billing.webhookSecret })
  const reconciliation = setInterval(() => {
    void metering.exclusive(async () => { await metering.recover(); await projectGenerations.reconcile(); await foundationAgent.reconcile() }).catch(() => console.error('Credit reconciliation temporarily unavailable'))
  }, 30000)
  reconciliation.unref()
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    clearInterval(reconciliation)
    await Promise.all([
      new Promise<void>((done) => server.close(() => done())),
      worker.close(), projectGenerations.close(), foundationAgent.close(),
    ])
    await closeCodexSession()
    usage.close()
    await telemetry?.shutdown()
    store.close()
    await database.close()
    releaseLock()
  }
  process.once('SIGINT', () => { void close() })
  process.once('SIGTERM', () => { void close() })
  try {
    await new Promise<void>((done, reject) => {
      server.once('error', reject)
      server.listen(port, config.host, () => { server.off('error', reject); done() })
    })
  } catch (error) {
    await close()
    throw error
  }
  console.log(`T3 private backend: http://${config.host}:${port}`)
  console.log(`Web origin: ${config.publicURL}; generation: ${config.generation.enabled ? 'enabled with quotas' : 'disabled'}`)
  if (config.generation.enabled) worker.kick()
}

void main().catch(async (error: unknown) => {
  await closeCodexSession()
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el backend')
  process.exitCode = 1
})
