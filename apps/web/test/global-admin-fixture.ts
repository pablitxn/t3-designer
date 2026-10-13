import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, type Page } from '@playwright/test'
import { openAppDatabase } from '../../api/src/app-database.ts'
import { createAccounts, type User } from '../../api/src/accounts.ts'
import { UsageStore } from '../../api/src/usage.ts'

// Real API, auth, credits, usage and SQLite. Never loads .env or enables inference.
export async function globalAdminFixture(mode: 'disabled' | 'mock' = 'mock') {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), 't3-global-admin-'))
  const socket = netServer().listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const address = socket.address()
  if (!address || typeof address === 'string') throw new Error('No local port')
  const apiPort = address.port
  socket.close(); await once(socket, 'close')
  const vite = await createServer({ mode: 'full', cacheDir: join(directory, 'vite-cache'), root: join(root, 'apps/web'), configFile: join(root, 'apps/web/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } })
  await vite.listen()
  const origin = vite.resolvedUrls!.local[0].replace(/\/$/, '')
  const password = randomBytes(24).toString('base64url')
  const secret = randomBytes(48).toString('base64url')
  const database = openAppDatabase({ sqlitePath: join(directory, 'accounts/accounts.sqlite') })
  const accounts = await createAccounts({ database, baseURL: origin, secret })
  const bootstrap = await accounts.createBootstrapInvitation('admin@example.test')
  const admin = await accounts.acceptInvitation({ token: bootstrap.token, email: 'admin@example.test', name: 'Admin QA', password })
  async function member(email: string, name: string, tier: 'standard' | 'premium') {
    const invite = await accounts.createInvitation(email, admin.id, false, tier)
    return accounts.acceptInvitation({ token: invite.token, email, name, password })
  }
  const standard = await member('standard@example.test', 'Standard QA', 'standard')
  const premium = await member('premium@example.test', 'Premium QA', 'premium')
  const secondAdmin = await member('admin2@example.test', 'Second admin QA', 'premium')
  await database.db.updateTable('user').set({ role: 'admin' }).where('id', '=', secondAdmin.id).execute()
  secondAdmin.role = 'admin'
  const usage = new UsageStore(join(directory, 'assets/usage.sqlite'))
  let api: ReturnType<typeof spawn> | undefined
  let logs = ''
  const close = async () => {
    if (api && api.exitCode === null) { const done = once(api, 'exit'); api.kill('SIGTERM'); await done }
    usage.close(); await database.close(); await vite.close(); await rm(directory, { recursive: true, force: true })
  }
  try {
    // Allowlist inherited runtime variables; no API/payment credentials, tracing or CLI login.
    const env: NodeJS.ProcessEnv = Object.fromEntries(['PATH', 'LANG', 'TZ', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
    Object.assign(env, { NODE_ENV: 'development', T3_INFERENCE_PROVIDER: 'openai', T3_GENERATION_ENABLED: 'false',
      T3_DATABASE_URL: '', T3_AUTH_SECRET: secret, T3_BILLING_MODE: mode, T3_PUBLIC_URL: origin,
      T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_ACCOUNT_DATA_DIR: join(directory, 'accounts'), T3_ASSET_DATA_DIR: join(directory, 'assets') })
    api = spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    api.stdout!.on('data', chunk => { logs += String(chunk) }); api.stderr!.on('data', chunk => { logs += String(chunk) })
    await expect.poll(async () => {
      if (api!.exitCode !== null) throw new Error(`Local API stopped: ${logs}`)
      return fetch(`http://127.0.0.1:${apiPort}/api/live`).then(response => response.status, () => 0)
    }, { timeout: 20_000 }).toBe(200)
    return { origin, directory, password, admin, standard, premium, secondAdmin, database, accounts, usage, close }
  } catch (error) { await close(); throw error }
}
export type AdminFixture = Awaited<ReturnType<typeof globalAdminFixture>>
export async function login(page: Page, f: AdminFixture, user: User = f.admin) {
  await page.goto(`${f.origin}/login`)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel(/^Contraseña/).fill(f.password)
  await page.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await expect(page).toHaveURL(`${f.origin}/app`)
}
export async function seedUsage(f: AdminFixture, user: User, count = 1) {
  for (let i = 0; i < count; i++) {
    const id = `qa-usage-${user.id}-${i}`
    await f.accounts.credits.reserve(user.id, id, 'asset')
    f.usage.operation({ id, userId: user.id, kind: 'asset', projectId: null, projectLabel: `Fixture ${user.name}`, jobId: null, runId: null, assetId: null, attempt: i + 1, parentId: null })
    const call = f.usage.begin(id, i % 2 ? 'openai' : 'codex-local', 'analysis', 1, 'fixture-model')
    if (i % 3 !== 2) f.usage.observe(call.id, { input_tokens: 100, ...(i % 3 === 0 ? { output_tokens: 20 } : {}) }, i % 2 ? 'openai.responses' : 'codex.turn.completed')
    f.usage.finish(call.id, i % 2 ? 'failed' : 'succeeded')
    f.usage.settleOperation(id, i % 2 ? 'failed' : 'succeeded')
    if (i % 2) await f.accounts.credits.refund(id)
    else await f.accounts.credits.commit(id)
  }
}
