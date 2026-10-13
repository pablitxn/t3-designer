import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { openAppDatabase } from '../src/app-database.ts'
import { createAccounts } from '../src/accounts.ts'
import { createProjects } from '../src/projects.ts'
import { AssetStore } from '../src/store.ts'
import { UsageStore } from '../src/usage.ts'
import { ReferenceLibrary } from '../src/references.ts'
import { AssetWorker } from '../src/worker.ts'
import { FoundationAgent } from '../src/foundation-agent.ts'
import { ProjectGenerations } from '../src/project-generations.ts'
import { BillingService, DEFAULT_BILLING_PRICES, migrateBilling } from '../src/billing.ts'
import { GenerationCredits } from '../src/generation-credits.ts'
import { createApi } from '../src/server.ts'
import { acquireLibraryLock } from '../src/lock.ts'
import { assetMock, artifactMock, demoScene, foundationMock } from './owner-qa-mocks.ts'

// Separate executable: there is no production environment switch to enable mocks.
export async function startOwnerQA() {
  const origin = process.env.T3_QA_ORIGIN ?? 'http://127.0.0.1:4189'
  const parsed = new URL(origin)
  const port = Number(process.env.T3_QA_API_PORT ?? 8798)
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const directory = resolve(root, process.env.T3_QA_DIRECTORY ?? 'artifacts/owner-qa/demo')
  if (process.env.NODE_ENV !== 'development' || process.env.T3_OWNER_QA !== 'isolated-fixtures'
      || parsed.hostname !== '127.0.0.1' || parsed.protocol !== 'http:' || parsed.origin !== origin
      || !directory.startsWith(resolve(root, 'artifacts/owner-qa') + '/')
      || process.env.T3_DATABASE_URL || process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY
      || process.env.OTEL_EXPORTER_OTLP_ENDPOINT) throw new Error('Owner QA requires explicit development, loopback, isolated artifacts/owner-qa directory and no external credentials/database/telemetry.')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const releaseLock = acquireLibraryLock(directory)
  const secretFile = resolve(directory, 'session-secret')
  let secret: string
  try { secret = await readFile(secretFile, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    secret = randomBytes(48).toString('hex')
    await writeFile(secretFile, secret, { flag: 'wx', mode: 0o600 })
  }
  const database = openAppDatabase({ sqlitePath: resolve(directory, 'accounts.sqlite') })
  const accounts = await createAccounts({ database, baseURL: origin, secret, creditConfig: { trialDays: 15, trialCredits: 100, premiumMonthlyCredits: 1000, costs: { asset: 20, revision: 10, project: 50, building: 100, apartment: 50 } } })
  const credits = accounts.credits
  await migrateBilling(database)
  const billing = new BillingService(database, credits, { mode: 'disabled', publicUrl: origin, ...DEFAULT_BILLING_PRICES })
  const store = new AssetStore(resolve(directory, 'library.sqlite'))
  store.recoverInterrupted()
  const usage = new UsageStore(resolve(directory, 'usage.sqlite'))
  usage.recoverInterrupted()
  const metering = new GenerationCredits(credits, store, usage)
  await metering.recover()
  const references = new ReferenceLibrary(directory)
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
  const limits = { dailyLimit: 1000, globalDailyLimit: 1000, pendingLimit: 10 }
  const foundationAgent = new FoundationAgent({ usage, path: resolve(directory, 'foundation.sqlite'), database, credits, store, projects, enabled: true, limits, generate: foundationMock })
  await foundationAgent.recover()
  const projectGenerations = new ProjectGenerations({ usage, path: resolve(directory, 'generations.sqlite'), database, credits, store, projects, enabled: true, limits,
    generate: async (id, input, options) => { options.onInference(); await delay(input.prompt.includes('[qa:slow]') ? 30000 : 500, undefined, { signal: options.signal }); if (input.prompt.includes('[qa:failed]')) throw new Error('Synthetic failure'); const scene = demoScene(id); scene.project.name = input.name; return scene } })
  await projectGenerations.recover()
  const worker = new AssetWorker({ usage, store, directory, planner: assetMock(), renderer: artifactMock(root),
    referenceLoader: async () => ({ images: [], references: [], warnings: [] }),
    onInference: id => metering.started(id), onSettled: id => metering.settle(id),
    canProcess: job => metering.authorized(job.id) })
  const server = createApi({ billing, store, worker, references, access: accounts, projects, publicOrigin: origin, generation: { enabled: true, ...limits }, credits, metering, projectGenerations, foundationAgent,
    usage: { report: (userId, query) => usage.report(database, userId, query) },
    health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'unavailable' }, blender: { available: true } }) })
  const password = 'Synthetic-QA-password-2026'
  const existing = await database.db.selectFrom('user').selectAll().execute()
  if (!existing.length) {
    const bootstrap = await accounts.createBootstrapInvitation('qa-admin@example.test')
    const admin = await accounts.acceptInvitation({ token: bootstrap.token, email: 'qa-admin@example.test', name: 'QA seed admin', password })
    const invitations: Record<string, string> = {}
    for (const tier of ['standard', 'premium'] as const) {
      const email = `owner-${tier}@example.test`
      const invite = await accounts.createInvitation(email, admin.id, false, tier)
      const user = await accounts.acceptInvitation({ token: invite.token, email, name: `Owner QA ${tier}`, password })
      await credits.grant(user.id, { amount: 8000, sourceKey: `qa:${tier}`, reason: 'Synthetic owner QA scenarios' })
      const activation = await accounts.createInvitation(`activation-${tier}@example.test`, admin.id, false, tier)
      invitations[tier] = `${origin}/invite#token=${activation.token}`
    }
    const invite = await accounts.createInvitation('viewer-qa@example.test', admin.id)
    await accounts.acceptInvitation({ token: invite.token, email: 'viewer-qa@example.test', name: 'QA isolated reader', password })
    // Distinct identities per case/viewport avoid history coupling and exercise
    // real login throttling without changing any authorization or rate-limit gate.
    for (const profile of ['360', '430', 'desktop']) for (let number = 1; number <= 18; number++) {
      const caseId = String(number).padStart(2, '0')
      for (const tier of ['standard', 'premium'] as const) {
        const email = `owner-${tier}-${caseId}-${profile}@example.test`
        const invite = await accounts.createInvitation(email, admin.id, false, tier)
        const user = await accounts.acceptInvitation({ token: invite.token, email, name: `QA ${tier} ${caseId} ${profile}`, password })
        await credits.grant(user.id, { amount: 8000, sourceKey: `qa:${email}`, reason: 'Synthetic isolated QA case' })
      }
      if ([7, 11, 14, 18].includes(number)) {
        const email = `viewer-qa-${caseId}-${profile}@example.test`
        const invite = await accounts.createInvitation(email, admin.id)
        await accounts.acceptInvitation({ token: invite.token, email, name: `Reader QA ${caseId} ${profile}`, password })
      }
    }
    await writeFile(resolve(directory, 'seed.json'), JSON.stringify({ password, invitations, origin, directory }), { mode: 0o600 })
  }
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    await Promise.all([new Promise<void>(done => server.close(() => done())), worker.close(), foundationAgent.close(), projectGenerations.close()])
    usage.close(); store.close(); await database.close(); releaseLock()
  }
  process.once('SIGINT', () => { void close() }); process.once('SIGTERM', () => { void close() })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done() }) })
  console.log(`Owner QA fixture backend ready on loopback ${port}; no providers or Blender. Seed: ${resolve(directory, 'seed.json')}`)
  return { server, close, directory }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startOwnerQA()
