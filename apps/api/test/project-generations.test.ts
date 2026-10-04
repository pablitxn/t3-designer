import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import pg from 'pg'
import { AccountError, createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase, type AppTables } from '../src/app-database.ts'
import { CreditError } from '../src/credits.ts'
import { buildGeneratedProjectScene, type ProjectGenerationInput } from '../src/project-generation-model.ts'
import { ProjectGenerations } from '../src/project-generations.ts'
import { createProjects } from '../src/projects.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { AssetWorker } from '../src/worker.ts'

const input: ProjectGenerationInput = { name: 'Concept', prompt: 'Un espacio abierto rectangular', kind: 'apartment', width: 8, depth: 6, storeyHeight: 2.8, floors: 1, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }
const scene = (id: string, value = input) => buildGeneratedProjectScene(id, value, { summary: 'Espacio conceptual', assumptions: [], rooms: [{ name: 'Ambiente', x: 0, z: 0, width: value.width, depth: value.depth }] }, new Date('2026-10-04T12:00:00Z'))
type Generator = NonNullable<ConstructorParameters<typeof ProjectGenerations>[0]['generate']>
function gate() {
  let release!: () => void, entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), pending = new Promise<void>(resolve => { release = resolve })
  return { release, ready, async wait(signal: AbortSignal) { entered(); await Promise.race([pending, new Promise<never>((_resolve, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }) })]) } }
}
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) { if (await check()) return; await delay(5) }
  throw new Error('Generation did not reach expected state')
}
async function fixture(t: TestContext, dialect: string, generate: Generator = async (id, value) => scene(id, value)) {
  let cleanup: (() => Promise<void>) | undefined, url: string | undefined
  if (dialect === 'postgres') {
    const parsed = new URL(process.env.TEST_DATABASE_URL!)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test PostgreSQL database.')
    const pool = new pg.Pool({ connectionString: parsed.toString() }), schema = `t3_generation_${randomUUID().replaceAll('-', '')}`
    await pool.query(`CREATE SCHEMA ${schema}`)
    parsed.searchParams.set('options', `-c search_path=${schema}`); url = parsed.toString()
    cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
  }
  const directory = await mkdtemp(join(tmpdir(), 't3-project-generation-')), path = join(directory, 'queue.sqlite')
  const database = openAppDatabase({ url })
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const credits = accounts.credits
  const addUser = async (): Promise<User> => {
    const id = randomUUID(), user: User = { id, email: `${id}@example.test`, name: 'User', role: 'user' }
    await database.db.insertInto('user').values({ ...user, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
    await credits.initialize(id, 'standard'); return user
  }
  const alice = await addUser(), bob = await addUser(), store = new AssetStore(':memory:'), projects = await createProjects({ database, accounts })
  const options = { path, database, credits, store, projects, enabled: true, limits: { dailyLimit: 100, globalDailyLimit: 100, pendingLimit: 10 }, generate }
  let generations = new ProjectGenerations(options)
  t.after(async () => { await generations.close(); store.close(); await database.close(); await cleanup?.(); await rm(directory, { recursive: true, force: true }) })
  return { database, credits, alice, bob, store, projects, directory, generations, async restart() { await generations.close(); generations = new ProjectGenerations(options); return generations } }
}

for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`project generation lifecycle and isolation (${dialect})`, async t => {
    await t.test('concurrent idempotent requests publish once and never expose another account project', async t => {
      const blocked = gate(); let calls = 0
      const f = await fixture(t, dialect, async (id, value, options) => { calls++; await blocked.wait(options.signal); return scene(id, value) })
      const key = randomUUID()
      const jobs = await Promise.all([f.generations.create(f.alice, input, key), f.generations.create(f.alice, input, key)])
      await blocked.ready
      assert.equal(jobs[0].id, jobs[1].id); assert.equal(calls, 1)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 50)
      await assert.rejects(f.generations.create(f.alice, { ...input, name: 'Different' }, key), error => error instanceof AccountError && error.status === 409)
      assert.throws(() => f.generations.get(f.bob.id, jobs[0].id), error => error instanceof AccountError && error.status === 404)
      assert.deepEqual(f.generations.list(f.bob.id), [])
      await assert.rejects(f.generations.cancel(f.bob.id, jobs[0].id), error => error instanceof AccountError && error.status === 404)
      blocked.release()
      await until(async () => (await f.credits.reservation(`architecture:${jobs[0].id}`))?.state === 'committed')
      assert.equal(f.generations.get(f.alice.id, jobs[0].id).projectId, jobs[0].id)
      assert.equal((await f.projects.get(f.alice, jobs[0].id)).scene.project.id, jobs[0].id)
      await assert.rejects(f.projects.get(f.bob, jobs[0].id), error => error instanceof AccountError && error.status === 404)
      assert.equal((await f.generations.create(f.alice, input, key)).id, jobs[0].id)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 50)
      assert.equal(calls, 1)
    })

    await t.test('concurrent spending, queued cancellation and new attempts cannot overspend or lose credits', async t => {
      const f = await fixture(t, dialect)
      t.mock.method(f.generations, 'kick', () => {})
      const attempts = await Promise.allSettled(Array.from({ length: 7 }, () => f.generations.create(f.alice, input, randomUUID())))
      const accepted = attempts.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      assert.equal(accepted.length, 2)
      for (const result of attempts) if (result.status === 'rejected') assert.ok(result.reason instanceof CreditError && result.reason.status === 402)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 0)
      await f.generations.cancel(f.alice.id, accepted[0].id)
      await assert.rejects(f.generations.cancel(f.alice.id, accepted[0].id), error => error instanceof AccountError && error.status === 409)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 50)
      await f.generations.create(f.alice, { ...input, kind: 'project' }, randomUUID())
      assert.equal((await f.credits.summary(f.alice.id)).balance, 0)
      assert.equal((await f.credits.summary(f.alice.id)).reserved, 100)
    })

    await t.test('cancelling active inference aborts publication and refunds exactly once', async t => {
      const blocked = gate()
      const f = await fixture(t, dialect, async (id, value, options) => { await blocked.wait(options.signal); return scene(id, value) })
      const job = await f.generations.create(f.alice, input, randomUUID())
      await blocked.ready
      await f.generations.cancel(f.alice.id, job.id)
      await until(async () => (await f.credits.reservation(`architecture:${job.id}`))?.state === 'refunded')
      assert.equal(f.generations.get(f.alice.id, job.id).status, 'cancelled')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 100)
      assert.deepEqual(await f.projects.list(f.alice), [])
      await f.generations.reconcile()
      assert.equal((await f.credits.summary(f.alice.id)).balance, 100)
    })

    await t.test('restart captures durable publication and refunds queued/orphan reservations idempotently', async t => {
      const f = await fixture(t, dialect)
      await f.credits.grant(f.alice.id, { amount: 500, sourceKey: randomUUID(), reason: 'Recovery test' })
      t.mock.method(f.generations, 'kick', () => {})
      const saved = await f.generations.create(f.alice, input, randomUUID()), queued = await f.generations.create(f.alice, input, randomUUID())
      await f.projects.createGenerated(f.alice, scene(saved.id))
      const orphan = `architecture:${randomUUID()}`
      await f.credits.reserve(f.alice.id, orphan, 'building')
      const asset = randomUUID(); await f.credits.reserve(f.alice.id, asset, 'asset')
      const restarted = await f.restart()
      await restarted.recover(); await restarted.recover()
      assert.equal(restarted.get(f.alice.id, saved.id).status, 'completed')
      assert.equal((await f.credits.reservation(`architecture:${saved.id}`))!.state, 'committed')
      assert.equal(restarted.get(f.alice.id, queued.id).status, 'failed')
      assert.equal((await f.credits.reservation(`architecture:${queued.id}`))!.state, 'refunded')
      assert.equal((await f.credits.reservation(orphan))!.state, 'refunded')
      assert.equal((await f.credits.reservation(asset))!.state, 'reserved')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 530)
    })

    await t.test('capture failure after publication keeps the project and reserved charge until reconciliation', async t => {
      const f = await fixture(t, dialect)
      const capture = t.mock.method(f.credits, 'commit', async () => { throw new Error('temporary DB failure') })
      const job = await f.generations.create(f.alice, input, randomUUID())
      await until(() => f.generations.get(f.alice.id, job.id).status === 'completed')
      await delay(30)
      assert.equal((await f.credits.reservation(`architecture:${job.id}`))!.state, 'reserved')
      assert.equal((await f.projects.get(f.alice, job.id)).id, job.id)
      capture.mock.restore()
      await f.generations.reconcile()
      assert.equal((await f.credits.reservation(`architecture:${job.id}`))!.state, 'committed')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 50)
    })

    await t.test('local terminal-write failure never refunds a published project', async t => {
      const f = await fixture(t, dialect)
      const internal = f.generations as unknown as { write: (row: { status: string }) => void }
      const original = internal.write.bind(internal)
      const failedWrite = t.mock.method(internal, 'write', (row: { status: string }) => { if (row.status === 'completed') throw new Error('temporary SQLite failure'); original(row) })
      const job = await f.generations.create(f.alice, input, randomUUID())
      await until(async () => (await f.projects.list(f.alice)).length === 1)
      await delay(30)
      assert.equal(f.generations.get(f.alice.id, job.id).status, 'running')
      assert.equal((await f.credits.reservation(`architecture:${job.id}`))!.state, 'reserved')
      failedWrite.mock.restore(); await f.generations.reconcile()
      assert.equal(f.generations.get(f.alice.id, job.id).status, 'completed')
      assert.equal((await f.credits.reservation(`architecture:${job.id}`))!.state, 'committed')
    })

    await t.test('refunded queued work and suspended users never reach inference', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (id, value) => { calls++; return scene(id, value) })
      const pause = t.mock.method(f.generations, 'kick', () => {})
      const revoked = await f.generations.create(f.alice, input, randomUUID()), suspended = await f.generations.create(f.bob, input, randomUUID())
      await f.credits.refund(`architecture:${revoked.id}`)
      await f.database.db.updateTable('user').set({ suspended: f.database.bool(true) }).where('id', '=', f.bob.id).execute()
      pause.mock.restore(); f.generations.kick()
      await until(() => f.generations.get(f.alice.id, revoked.id).status === 'failed' && f.generations.get(f.bob.id, suspended.id).status === 'failed')
      await until(async () => (await f.credits.reservation(`architecture:${suspended.id}`))!.state === 'refunded')
      assert.equal(calls, 0)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 100)
      assert.equal((await f.credits.summary(f.bob.id)).balance, 100)
    })

    await t.test('account database outage before inference defers once without a busy loop or credit loss', async t => {
      let calls = 0, blockedQueries = 0
      const f = await fixture(t, dialect, async (id, value) => { calls++; return scene(id, value) })
      const pause = t.mock.method(f.generations, 'kick', () => {})
      const job = await f.generations.create(f.alice, input, randomUUID())
      const select = f.database.db.selectFrom.bind(f.database.db)
      const outage = t.mock.method(f.database.db, 'selectFrom', (table: keyof AppTables) => {
        if (table === 'user' || table === 't3_project') { blockedQueries++; throw new Error('database unavailable') }
        return select(table)
      })
      pause.mock.restore(); f.generations.kick()
      await delay(40)
      assert.equal(blockedQueries, 2, 'one authorization attempt and one safe publication check; no retry loop')
      assert.equal(calls, 0)
      assert.equal(f.generations.get(f.alice.id, job.id).status, 'running')
      outage.mock.restore()
      assert.equal((await f.credits.reservation(`architecture:${job.id}`))!.state, 'reserved')
      await f.generations.reconcile()
      assert.equal(f.generations.get(f.alice.id, job.id).status, 'failed')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 100)
    })

    await t.test('wrong project identity is rejected and malformed or foreign HTTP requests cannot spend credits', async t => {
      const f = await fixture(t, dialect, async () => scene(randomUUID()))
      const worker = new AssetWorker({ store: f.store, directory: f.directory, planner: async () => { throw new Error('not used') }, renderer: async () => {} })
      const api = createApi({ store: f.store, worker, credits: f.credits, projectGenerations: f.generations, publicOrigin: 'http://localhost:5173', access: { authorize: async request => request.headers['x-test-user'] === 'bob' ? f.bob : f.alice }, health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'api-key' }, blender: { available: true } }) })
      await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve))
      const address = api.address(); assert.ok(address && typeof address === 'object')
      t.after(async () => { await new Promise<void>(resolve => api.close(() => resolve())); await worker.close() })
      const request = (path: string, method: string, body?: unknown, asBob = false) => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'X-Test-User': asBob ? 'bob' : 'alice' }, body: body === undefined ? undefined : JSON.stringify(body) })
      assert.equal((await request('/api/project-generations', 'POST', { ...input, width: -2 })).status, 400)
      const created = await request('/api/project-generations', 'POST', input)
      assert.equal(created.status, 202)
      const { job } = await created.json() as { job: { id: string } }
      assert.equal((await request(`/api/project-generations/${job.id}`, 'GET', undefined, true)).status, 404)
      assert.equal((await request(`/api/project-generations/${job.id}/cancel`, 'POST', {}, true)).status, 404)
      await until(async () => (await f.credits.reservation(`architecture:${job.id}`))!.state === 'refunded')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 100)
      assert.deepEqual(await f.projects.list(f.alice), [])
      const list = await (await request('/api/project-generations', 'GET', undefined, true)).json()
      assert.deepEqual(list, { jobs: [] })
    })
  })
}
