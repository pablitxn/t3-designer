// Disposable local QA scenario. Uses the real auth, project and file handlers;
// inference/render functions deliberately throw and no worker is started.
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createServer } from '../../apps/web/node_modules/vite/dist/node/index.js'
import { openAppDatabase } from '../../apps/api/src/app-database.ts'
import { createAccounts } from '../../apps/api/src/accounts.ts'
import { createProjects } from '../../apps/api/src/projects.ts'
import { AssetStore } from '../../apps/api/src/store.ts'
import { AssetWorker } from '../../apps/api/src/worker.ts'
import { ReferenceLibrary } from '../../apps/api/src/references.ts'
import { FoundationAgent } from '../../apps/api/src/foundation-agent.ts'
import { ProjectGenerations } from '../../apps/api/src/project-generations.ts'
import { createApi } from '../../apps/api/src/server.ts'
import { UsageStore } from '../../apps/api/src/usage.ts'
import { BillingService, DEFAULT_BILLING_PRICES, migrateBilling } from '../../apps/api/src/billing.ts'
import { createProjectFoundations, ProjectSnapshotSchema, FoundationModelsSchema, FoundationVersionSchema } from '@t3-designer/scene-schema'
import { assembleFoundationScenes } from '../../apps/web/src/private/foundation-scenes.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
export const demoPassword = 'viewer-local-demo-2026'

export async function startViewerScenario({ webPort = 0 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 't3-viewer-qa-'))
  const database = openAppDatabase({ sqlitePath: join(directory, 'accounts.sqlite') })
  const store = new AssetStore(join(directory, 'library.sqlite'))
  const references = new ReferenceLibrary(directory)
  const neverGenerate = async () => { throw new Error('Inference and Blender are forbidden in this QA scenario') }
  const worker = new AssetWorker({ store, directory, planner: neverGenerate, renderer: neverGenerate })
  let origin
  // Vite's proxy target is assigned before the first browser request.
  const vite = await createServer({ mode: 'full', cacheDir: join(directory, 'vite-cache'), configFile: join(root, 'apps/web/vite.config.ts'), root: join(root, 'apps/web'),
    server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: {} } })
  await vite.listen()
  origin = vite.resolvedUrls.local[0].replace(/\/$/, '')
  const accounts = await createAccounts({ database, baseURL: origin, secret: randomBytes(48).toString('hex') })
  const usage = new UsageStore(join(directory, 'usage.sqlite'))
  await migrateBilling(database)
  const billing = new BillingService(database, accounts.credits, { mode: 'disabled', publicUrl: origin, ...DEFAULT_BILLING_PRICES })
  const projects = await createProjects({ database, accounts,
    validatePlanReference: async (_user, projectId, id) => store.hasProjectReference(projectId, id) && !!await references.file(id),
    clonePlanReferences: async (sourceId, targetId, _user, foundations) => {
      for (const level of foundations.dwelling.levels) for (const plan of level.planReferences) {
        if (!store.hasProjectReference(sourceId, plan.id) || !await references.file(plan.id)) throw new Error('Missing fixture plan')
        store.attachProjectReference(targetId, plan.id)
      }
    },
    validateAssetReference: async (_user, projectId, asset) => {
      const attachment = store.projectAssets(projectId).find(item => item.id === asset.id)
      return !!attachment && asset.url === attachment.url && asset.repoPath === `private/${attachment.id}/model.glb`
    },
    cloneAssetReferences: async (sourceId, targetId, _user, scene) => {
      const result = structuredClone(scene), ids = new Map()
      for (const asset of result.assets) {
        if (!asset.url.startsWith('/api/')) continue
        const previous = store.projectAssets(sourceId).find(item => item.id === asset.id)
        const source = previous && store.getAsset(previous.sourceAssetId)
        if (!source) throw new Error('Missing fixture model')
        const attached = store.attachAsset(targetId, source.asset)
        ids.set(asset.id, attached.id); asset.id = attached.id; asset.url = attached.url; asset.repoPath = `private/${attached.id}/model.glb`
      }
      for (const fixture of result.fixtures) fixture.assetId = ids.get(fixture.assetId) ?? fixture.assetId
      for (const architecture of result.editor?.architectures ?? []) for (const layout of architecture.layouts) for (const fixture of layout.fixtures) fixture.assetId = ids.get(fixture.assetId) ?? fixture.assetId
      return result
    },
  })
  const agentPath = join(directory, 'foundation-agent.sqlite')
  const foundationAgent = new FoundationAgent({ path: agentPath, database, store, projects, credits: accounts.credits,
    enabled: false, limits: { dailyLimit: 5, globalDailyLimit: 20, pendingLimit: 2 }, generate: neverGenerate })
  const projectGenerations = new ProjectGenerations({ path: join(directory, 'project-generations.sqlite'), database, store, projects, credits: accounts.credits, enabled: false, limits: { dailyLimit: 5, globalDailyLimit: 20, pendingLimit: 2 } })
  const api = createApi({ store, worker, references, access: accounts, projects, foundationAgent, projectGenerations, credits: accounts.credits, billing, usage: { report: (userId, query) => usage.report(database, userId, query) },
    publicOrigin: origin, generation: { enabled: false },
    health: async () => ({ status: 'ok', codex: { available: false, authenticated: false, authMode: 'unavailable' }, blender: { available: false } }) })
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
  const apiPort = api.address().port
  // Vite config resolved the default proxy. Recreate it with this isolated API.
  await vite.close()
  const web = await createServer({ mode: 'full', cacheDir: join(directory, 'vite-cache'), configFile: join(root, 'apps/web/vite.config.ts'), root: join(root, 'apps/web'),
    server: { host: '127.0.0.1', port: Number(new URL(origin).port), strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } })
  await web.listen()
  const users = {}
  for (const [key, name] of [['owner', 'Owner QA'], ['viewer', 'Viewer QA'], ['outsider', 'Other account QA']]) {
    const email = `${key}@example.test`
    const invite = key === 'owner' ? await accounts.createBootstrapInvitation(email) : await accounts.createInvitation(email, users.owner.id)
    users[key] = await accounts.acceptInvitation({ token: invite.token, email, name, password: demoPassword })
  }
  const ready = await projects.create(users.owner, { name: 'Casa compartida QA', notes: 'Datos ficticios. Bases revisadas sembradas sin IA; no usar como relevamiento.' })
  const empty = await projects.create(users.owner, { name: 'Proyecto vacío QA' })
  const foreign = await projects.create(users.outsider, { name: 'Proyecto de otra cuenta QA', notes: 'Aislamiento entre cuentas' })
  const bundled = ProjectSnapshotSchema.parse(JSON.parse(await readFile(join(root, 'assets/scenes/t3-project.json'), 'utf8')))
  const plan = await references.upload({ name: 'plano-ficticio.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' })
  store.assignOwner('reference', plan.id, users.owner.id); store.attachProjectReference(ready.id, plan.id)
  const foundations = createProjectFoundations()
  foundations.dwelling.status = 'ready'
  foundations.dwelling.levels = [
    { ...foundations.dwelling.levels[0], id: 'ground', name: 'Planta baja QA', width: 6.7, depth: 8.32, planReferences: [{ id: plan.id, name: plan.name }] },
    { ...foundations.dwelling.levels[0], id: 'upper', name: 'Planta alta QA', levelIndex: 1, elevation: 2.9, planReferences: [] },
  ]
  foundations.building = { ...foundations.building, status: 'ready', countryCode: 'AR', address: 'Dirección ficticia QA 100', sources: [] }
  const dwelling = { target: 'dwelling', summary: 'Vivienda ficticia QA de dos plantas.', assumptions: ['Fixture de revisión; sin inferencia.'], unknowns: ['Escalera sin geometría, no traversable.'], sources: [], connections: [],
    levels: foundations.dwelling.levels.map(level => ({ levelId: level.id, name: level.name, levelIndex: level.levelIndex, elevation: level.elevation ?? 0, ceilingHeight: 2.7, scaleEvidence: 'Medidas ficticias QA.', apartment: { ...structuredClone(bundled.apartment), id: level.id } })) }
  const site = structuredClone(bundled.site); delete site.datasetKind
  const building = { target: 'building', summary: 'Edificio ficticio QA.', assumptions: ['Datos ficticios QA.'], unknowns: [], sources: [], site,
    buildings: bundled.buildings.filter(item => item.isTarget).map(item => ({ ...item, source: 'estimated' })), roads: [], parcel: bundled.parcel }
  const versions = [dwelling, building].map(candidate => FoundationVersionSchema.parse({ id: randomUUID(), projectId: ready.id, target: candidate.target, runId: randomUUID(), parentVersionId: null, sourceRevision: 1, foundationsFingerprint: 'fixture-qa', createdAt: new Date().toISOString(), status: 'ready', candidate, summary: candidate.summary, questions: [], iterations: [{ index: 1, candidate, review: { passed: true, summary: 'Revisión ficticia QA.', issues: [] } }] }))
  const levels = assembleFoundationScenes(ready.id, ready.name, dwelling, building)
  const assetDirectory = join(directory, 'model'); await mkdir(assetDirectory)
  const publicAsset = bundled.assets.find(asset => asset.mobility === 'movable') ?? bundled.assets[0]
  await copyFile(join(root, 'apps/web/public', publicAsset.url), join(assetDirectory, 'model.glb'))
  const job = store.createJob({ url: 'https://example.test/fixture', notes: 'Fixture only' }, { ownerUserId: users.owner.id })
  const asset = { id: randomUUID(), jobId: job.id, label: 'Modelo ficticio QA', kind: 'procedural', dimensions: publicAsset.dimensions,
    createdAt: new Date().toISOString(), source: { description: 'Bundled fixture, no generation', dimensionalStatus: 'estimated' }, fidelityStatus: 'draft', warnings: [],
    files: { model: 'model.glb', preview: 'preview.png', blend: 'source.blend', manifest: 'manifest.json', request: 'request.json' } }
  store.completeJob(job.id, asset, assetDirectory)
  const attached = store.attachAsset(ready.id, asset)
  for (const level of levels) {
    level.scene.assets = [{ ...publicAsset, id: attached.id, label: asset.label, url: attached.url, repoPath: `private/${attached.id}/model.glb` }]
    level.scene.fixtures = [{ ...bundled.fixtures.find(item => item.assetId === publicAsset.id), assetId: attached.id, id: 'qa-chair', label: asset.label, position: [2, .015, 7] }]
    const original = { id: 'qa-layout', name: 'Distribución QA', fixtures: structuredClone(level.scene.fixtures), customization: structuredClone(level.scene.customization) }
    level.scene.editor = { schemaVersion: 1, activeArchitectureId: 'qa-original', architectures: [{ id: 'qa-original', name: 'Variante QA', apartment: structuredClone(level.scene.apartment), partitionWallIds: [], activeLayoutId: original.id, layouts: [original, { ...structuredClone(original), id: 'qa-alternate', name: 'Alternativa QA', fixtures: [] }] }] }
    level.scene = ProjectSnapshotSchema.parse(level.scene)
  }
  const models = FoundationModelsSchema.parse({ dwelling: { versionId: versions[0].id, candidate: dwelling }, building: { versionId: versions[1].id, candidate: building }, activeLevelId: 'ground', levels })
  await database.db.updateTable('t3_project').set({ foundations: JSON.stringify(foundations), foundationModels: JSON.stringify(models), scene: JSON.stringify(levels[0].scene) }).where('id', '=', ready.id).execute()
  const document = await projects.get(users.owner, ready.id)
  await database.db.insertInto('t3_project_checkpoint').values({ id: randomUUID(), projectId: ready.id, revision: 1, reason: 'building', document: JSON.stringify(document), createdAt: new Date().toISOString() }).execute()
  const agentDb = new DatabaseSync(agentPath)
  for (const version of versions) {
    agentDb.prepare('INSERT INTO foundation_agent_version VALUES(?,?,?)').run(version.id, ready.id, JSON.stringify(version))
    const run = { id: version.runId, projectId: ready.id, userId: users.owner.id, requestKey: `fixture-${version.id}`, requestFingerprint: 'fixture-qa', foundationsFingerprint: 'fixture-qa', project: document, inferenceStarted: false,
      target: version.target, status: 'completed', message: 'Revisión ficticia QA, sin IA.', parentVersionId: null, sourceRevision: 1, createdAt: version.createdAt, updatedAt: version.createdAt, error: null, versionId: version.id, iterations: version.iterations,
      events: [{ id: 1, kind: 'review', createdAt: version.createdAt, message: 'Revisión ficticia terminada.' }] }
    agentDb.prepare('INSERT INTO foundation_agent_run VALUES(?,?,?,?,?)').run(run.id, ready.id, users.owner.id, run.requestKey, JSON.stringify(run))
  }
  agentDb.close()
  for (const project of [ready, empty]) await database.db.insertInto('t3_project_member').values({ projectId: project.id, userId: users.viewer.id, role: 'viewer', createdAt: new Date().toISOString() }).execute()
  let closed = false
  return { origin, directory, users, ready: document, empty, foreign, plan, asset, attached, versions, projects, accounts, database, store,
    revoke: () => database.db.deleteFrom('t3_project_member').where('projectId', '=', ready.id).where('userId', '=', users.viewer.id).execute(),
    restoreAccess: () => database.db.insertInto('t3_project_member').values({ projectId: ready.id, userId: users.viewer.id, role: 'viewer', createdAt: new Date().toISOString() }).execute(),
    expire: () => database.db.deleteFrom('session').where('userId', '=', users.viewer.id).execute(),
    close: async () => { if (closed) return; closed = true; await web.close(); await new Promise(resolve => api.close(resolve)); await worker.close(); await foundationAgent.close(); await projectGenerations.close(); usage.close(); store.close(); await database.close(); await rm(directory, { recursive: true, force: true }) },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scenario = await startViewerScenario({ webPort: Number(process.env.T3_VIEWER_QA_PORT ?? 5193) })
  await writeFile(join(scenario.directory, 'scenario.json'), JSON.stringify({ origin: scenario.origin, ready: scenario.ready.id, empty: scenario.empty.id, foreign: scenario.foreign.id, emails: Object.values(scenario.users).map(user => user.email) }, null, 2))
  console.log(`Local QA only: ${scenario.origin}/login\nFictional viewer: viewer@example.test\nDemo password: ${demoPassword}\nDisposable data: ${scenario.directory}\nReady project: ${scenario.origin}/app/projects/${scenario.ready.id}\nCtrl-C removes this scenario.`)
  process.once('SIGINT', () => { void scenario.close() }); process.once('SIGTERM', () => { void scenario.close() })
}
