import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { createAccounts } from '../../api/src/accounts.ts'
import { openAppDatabase } from '../../api/src/app-database.ts'
import { createProjects } from '../../api/src/projects.ts'

// Real accounts/project services and production API; no generation worker mocks.
export async function startSharedEditorScenario() {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), 't3-shared-editor-'))
  const available = createNetServer()
  available.listen(0, '127.0.0.1'); await once(available, 'listening')
  const address = available.address()
  if (!address || typeof address === 'string') throw new Error('No local API port')
  const apiPort = address.port
  available.close(); await once(available, 'close')
  const vite = await createServer({ mode: 'full', cacheDir: join(directory, 'vite-cache'), configFile: join(root, 'apps/web/vite.config.ts'), root: join(root, 'apps/web'),
    server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } })
  await vite.listen()
  const origin = vite.resolvedUrls!.local[0].replace(/\/$/, '')
  const secret = randomBytes(48).toString('hex')
  const database = openAppDatabase({ sqlitePath: join(directory, 'accounts/accounts.sqlite') })
  const accounts = await createAccounts({ database, baseURL: origin, secret })
  const projects = await createProjects({ database, accounts })
  const password = 'Disposable-fixture-only-2026'
  const first = await accounts.createBootstrapInvitation('admin@example.test')
  const admin = await accounts.acceptInvitation({ token: first.token, email: 'admin@example.test', name: 'QA admin', password })
  const env = { ...process.env, NODE_ENV: 'development', T3_DATABASE_URL: '', T3_AUTH_SECRET: secret,
    T3_BILLING_MODE: 'disabled', T3_INFERENCE_PROVIDER: 'openai', T3_GENERATION_ENABLED: 'false',
    // Health may probe --version; keep even that probe away from the real Blender binary.
    BLENDER_BIN: join(directory, 'disabled-blender'),
    OPENAI_API_KEY: '', CODEX_API_KEY: '', OTEL_SDK_DISABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
    T3_PUBLIC_URL: origin, T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_TRUSTED_PROXY_IPS: '',
    T3_ACCOUNT_DATA_DIR: join(directory, 'accounts'), T3_ASSET_DATA_DIR: join(directory, 'assets') }
  const api = spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  api.stdout.on('data', chunk => { logs += String(chunk) }); api.stderr.on('data', chunk => { logs += String(chunk) })
  const close = async () => {
    await vite.close()
    if (api.exitCode === null) { const exited = once(api, 'exit'); api.kill('SIGTERM'); await exited }
    await database.close()
    await rm(directory, { recursive: true, force: true })
  }
  try {
    const deadline = Date.now() + 20_000
    while (true) {
      if (api.exitCode !== null || Date.now() > deadline) throw new Error(`API unavailable: ${logs}`)
      if (await fetch(`http://127.0.0.1:${apiPort}/api/live`).then(r => r.status === 200, () => false)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } catch (error) { await close(); throw error }
  return {
    origin, directory, database, accounts, projects, admin, password, close,
    async seed() {
      const suffix = randomUUID().slice(0, 8)
      async function member(label: string) {
        const email = `${label}-${suffix}@example.test`
        const invitation = await accounts.createInvitation(email, admin.id)
        return accounts.acceptInvitation({ token: invitation.token, email, name: `QA ${label}`, password })
      }
      const owner = await member('owner'), editor = await member('editor'), stranger = await member('stranger'), empty = await member('empty')
      const scene = ProjectSnapshotSchema.parse(JSON.parse(await readFile(join(root, 'assets/scenes/t3-project.json'), 'utf8')))
      scene.project = { id: randomUUID(), name: `Shared editor ${suffix}` }
      scene.fixtures = [{ ...scene.fixtures[0], position: [2, .015, 7] }]
      const project = await projects.createGenerated(owner, scene)
      await database.db.updateTable('t3_project').set({ notes: 'Fictional shared project' }).where('id', '=', project.id).execute()
      await database.db.insertInto('t3_project_member').values({ projectId: project.id, userId: editor.id, role: 'editor', createdAt: new Date().toISOString() }).execute()
      const own = await projects.create(editor, { name: `Own editor ${suffix}` })
      const foreign = await projects.create(stranger, { name: `Private stranger ${suffix}` })
      return { owner, editor, stranger, empty, project, own, foreign }
    },
  }
}
export type SharedEditorScenario = Awaited<ReturnType<typeof startSharedEditorScenario>>
