import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import pg from 'pg'
import type { FoundationCandidate, FoundationGenerationResult, FoundationOfficialResearch } from '@t3-designer/scene-schema'
import { AccountError, createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { FoundationAgent, type FoundationGenerator } from '../src/foundation-agent.ts'
import { buildGeneratedProjectScene } from '../src/project-generation-model.ts'
import { createProjects } from '../src/projects.ts'
import { createApi } from '../src/server.ts'
import { AssetStore } from '../src/store.ts'
import { AssetWorker } from '../src/worker.ts'

function candidate(projectId: string, target: 'dwelling' | 'building' = 'dwelling'): FoundationCandidate {
  const scene = buildGeneratedProjectScene(projectId, {
    name: 'Plano de prueba', prompt: 'Un ambiente rectangular de ocho por seis metros', kind: 'apartment',
    width: 8, depth: 6, storeyHeight: 2.8, floors: 1, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires',
  }, { summary: 'Plano de prueba', assumptions: [], rooms: [{ name: 'Ambiente', x: 0, z: 0, width: 8, depth: 6 }] })
  const common = { summary: 'Modelo estimado según datos de prueba', assumptions: ['Medidas aportadas'], unknowns: [], sources: [] }
  return target === 'dwelling'
    ? { ...common, target, levels: [{ levelId: 'ground-floor', name: 'Planta baja', levelIndex: 0, elevation: 0, ceilingHeight: 2.8, scaleEvidence: 'Medidas aportadas: 8 × 6 metros', apartment: scene.apartment }], connections: [] }
    : { ...common, target, site: scene.site, buildings: scene.buildings, roads: scene.roads, parcel: scene.parcel }
}
function result(projectId: string, target: 'dwelling' | 'building' = 'dwelling'): FoundationGenerationResult {
  const value = candidate(projectId, target)
  return { status: 'ready', candidate: value, summary: 'Versión revisada lista para corregir.', questions: [],
    iterations: [{ index: 1, candidate: value, review: { passed: true, summary: 'Geometría consistente.', issues: [] } }] }
}
const defaultGenerator: FoundationGenerator = async ({ project, target }, options) => {
  options.onInference(); options.onEvent({ kind: 'generation', message: 'Construyendo el modelo.' })
  const generated = result(project.id, target)
  await options.onIteration(generated.iterations[0])
  return generated
}
function gate() {
  let release!: () => void, entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), pending = new Promise<void>(resolve => { release = resolve })
  return { release, ready, async wait(signal: AbortSignal) {
    entered()
    await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })])
  } }
}
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) { if (await check()) return; await delay(5) }
  throw new Error('Foundation attempt did not reach expected state')
}
async function fixture(t: TestContext, dialect: string, generate: FoundationGenerator = defaultGenerator, timeoutMs?: number) {
  let cleanup: (() => Promise<void>) | undefined, url: string | undefined
  if (dialect === 'postgres') {
    const parsed = new URL(process.env.TEST_DATABASE_URL!)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test PostgreSQL database.')
    const pool = new pg.Pool({ connectionString: parsed.toString() }), schema = `t3_foundation_${randomUUID().replaceAll('-', '')}`
    await pool.query(`CREATE SCHEMA ${schema}`)
    parsed.searchParams.set('options', `-c search_path=${schema}`); url = parsed.toString()
    cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
  }
  const directory = await mkdtemp(join(tmpdir(), 't3-foundation-agent-')), path = join(directory, 'queue.sqlite')
  const database = openAppDatabase({ url })
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const credits = accounts.credits
  const addUser = async (): Promise<User> => {
    const id = randomUUID(), user: User = { id, email: `${id}@example.test`, name: 'User', role: 'user' }
    await database.db.insertInto('user').values({ ...user, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
    await credits.initialize(id, 'standard')
    await credits.grant(id, { amount: 900, sourceKey: `test:${id}`, reason: 'Test credit allocation' })
    return user
  }
  const alice = await addUser(), bob = await addUser(), store = new AssetStore(':memory:'), projects = await createProjects({ database, accounts })
  const project = await projects.create(alice, { name: 'Casa' })
  const options = { path, database, credits, store, projects, enabled: true, limits: { dailyLimit: 100, globalDailyLimit: 100, pendingLimit: 10 }, generate, timeoutMs }
  let agent = new FoundationAgent(options)
  t.after(async () => { await agent.close(); store.close(); await database.close(); await cleanup?.(); await rm(directory, { recursive: true, force: true }) })
  return { database, accounts, credits, alice, bob, store, projects, project, directory, path, agent, async restart() {
    await agent.close(); agent = new FoundationAgent(options); await agent.recover(); return agent
  } }
}
const badStatus = (status: number) => (error: unknown) => error instanceof AccountError && error.status === status
const input = (revision = 1) => ({ target: 'dwelling' as const, revision, message: 'Reconstruí el plano con las medidas aportadas.' })
const reserved = (id: string) => `foundation:${id}`
function parcelResearch(): FoundationOfficialResearch {
  return { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Parcela oficial consultada; falta el edificio.',
    sources: [{ title: 'Catastro sintético', url: 'https://catastro.example.gov/parcel', kind: 'official', claims: ['Parcela, no huella construida.'], retrievedAt: '2026-10-08' }],
    unknowns: ['Falta confirmar la parcela y reconstruir el edificio.'], geocode: { label: 'Dirección sintética', longitude: -64.18, latitude: -31.42, provider: 'Georef', precision: 'approximate', recordId: 'address' },
    parcels: [{ id: '123', label: 'Parcela 123', area: 80, areaBasis: 'calculated', footprint: [[0, 0], [8, 0], [8, 10], [0, 10]], sourceUrl: 'https://catastro.example.gov/parcel', provider: 'Catastro', sourceDate: null, attribution: 'Datos de prueba.' }], selectedParcelId: null, selectionEvidence: null }
}

for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`foundation agent persists chat, revisions and permissions (${dialect})`, async t => {
    await t.test('partial parcel evidence is visible live, persists across restart and remains an unready chat parent without charging inference', async t => {
      const blocked = gate(), research = parcelResearch(); let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        calls++
        if (calls > 1) {
          assert.deepEqual(value.parentVersion?.officialResearch, research)
          assert.equal(value.parentVersion?.candidate, null)
          assert.deepEqual(value.conversation?.[0].questions, ['Confirmá la referencia catastral.'])
        }
        await options.onOfficialResearch?.(research)
        if (calls === 1) await blocked.wait(options.signal)
        // Checkpointed evidence is retained even if a generator omits it from its final result.
        return { status: 'needs_input', candidate: null, summary: research.summary, questions: ['Confirmá la referencia catastral.'], iterations: [] }
      })
      const foundations = structuredClone(f.project.foundations!)
      Object.assign(foundations.building, { countryCode: 'AR', region: 'Córdoba', address: 'Dirección sintética' })
      const project = await f.projects.save(f.alice, f.project.id, { revision: 1, foundations })
      const request = { ...input(project.revision), target: 'building' as const }
      const run = await f.agent.create(f.alice, project.id, request, randomUUID())
      await blocked.ready
      const live = await f.agent.get(f.alice, project.id, run.id)
      assert.equal(live.status, 'running'); assert.deepEqual(live.officialResearch, research)
      await assert.rejects(f.agent.get(f.bob, project.id, run.id), badStatus(404))
      blocked.release()
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      const version = await f.agent.getVersion(f.alice, project.id, run.id)
      assert.equal(version.status, 'needs_input'); assert.equal(version.candidate, null); assert.deepEqual(version.iterations, [])
      assert.deepEqual(version.officialResearch, research)
      assert.equal((await f.projects.get(f.alice, project.id)).foundationModels, null)
      assert.equal((await f.projects.get(f.alice, project.id)).foundations?.building.status, 'draft')
      await assert.rejects(f.projects.applyFoundationVersion(f.alice, project.id, version, project.revision), badStatus(400))
      const restarted = await f.restart()
      assert.deepEqual(await restarted.getVersion(f.alice, project.id, run.id), version)
      assert.deepEqual((await restarted.get(f.alice, project.id, run.id)).officialResearch, research)
      const followup = await restarted.create(f.alice, project.id, { ...request, parentVersionId: version.id, message: 'Continuá desde esta consulta.' }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(followup.id)))?.state === 'refunded')
      assert.equal((await restarted.getVersion(f.alice, project.id, followup.id)).parentVersionId, version.id)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
    })

    await t.test('a failure after official acquisition preserves the parcel without a model as a refundable chat draft', async t => {
      const research = parcelResearch(); let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        if (++calls === 1) { await options.onOfficialResearch?.(research); throw new Error('Provider unavailable after cadastral acquisition') }
        assert.deepEqual(value.parentVersion?.officialResearch, research)
        assert.equal(value.parentVersion?.candidate, null)
        return { status: 'needs_input', candidate: null, summary: research.summary, questions: ['Confirmá la referencia catastral.'], iterations: [], officialResearch: research }
      })
      const foundations = structuredClone(f.project.foundations!)
      Object.assign(foundations.building, { countryCode: 'AR', region: 'Córdoba', address: 'Dirección sintética' })
      const project = await f.projects.save(f.alice, f.project.id, { revision: 1, foundations })
      const request = { ...input(project.revision), target: 'building' as const }
      const run = await f.agent.create(f.alice, project.id, request, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      const failed = await f.agent.get(f.alice, project.id, run.id), version = await f.agent.getVersion(f.alice, project.id, run.id)
      assert.equal(failed.status, 'failed'); assert.equal(failed.versionId, version.id)
      assert.equal(version.status, 'needs_input'); assert.equal(version.candidate, null); assert.deepEqual(version.iterations, [])
      assert.deepEqual(version.officialResearch, research); assert.match(version.summary, /consulta oficial y sus fuentes/)
      await assert.rejects(f.projects.applyFoundationVersion(f.alice, project.id, version, project.revision), badStatus(400))
      const next = await f.agent.create(f.alice, project.id, { ...request, parentVersionId: version.id }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(next.id)))?.state === 'refunded')
      assert.deepEqual((await f.agent.getVersion(f.alice, project.id, next.id)).officialResearch, research)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
    })

    await t.test('idempotent requests generate once, expose project collaborators only and preserve live iteration progress', async t => {
      const blocked = gate(); let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        calls++; options.onInference()
        const generated = result(value.project.id)
        await options.onIteration(generated.iterations[0])
        options.onEvent({ kind: 'review', message: 'Revisión geométrica aprobada.' })
        await blocked.wait(options.signal)
        return generated
      })
      const key = randomUUID()
      const [first, retry] = await Promise.all([f.agent.create(f.alice, f.project.id, input(), key), f.agent.create(f.alice, f.project.id, input(), key)])
      await blocked.ready
      assert.equal(first.id, retry.id); assert.equal(calls, 1)
      const live = await f.agent.get(f.alice, f.project.id, first.id)
      assert.equal(live.status, 'running'); assert.equal(live.iterations.length, 1)
      assert.equal(live.events[0].kind, 'review')
      await assert.rejects(f.agent.create(f.alice, f.project.id, { ...input(), message: 'Otro mensaje' }, key), badStatus(409))
      await assert.rejects(f.agent.list(f.bob, f.project.id), badStatus(404))
      await assert.rejects(f.agent.cancel(f.bob, f.project.id, first.id), badStatus(404))
      await f.database.db.insertInto('t3_project_member').values({ projectId: f.project.id, userId: f.bob.id, role: 'viewer', createdAt: new Date().toISOString() }).execute()
      assert.equal((await f.agent.list(f.bob, f.project.id)).runs.length, 1)
      await assert.rejects(f.agent.create(f.bob, f.project.id, input(), randomUUID()), badStatus(403))
      await assert.rejects(f.agent.cancel(f.bob, f.project.id, first.id), badStatus(403))
      blocked.release()
      await until(async () => (await f.credits.reservation(reserved(first.id)))?.state === 'committed')
      const version = await f.agent.getVersion(f.alice, f.project.id, first.id)
      assert.equal(version.status, 'ready'); assert.equal(version.sourceRevision, 1)
      assert.equal((await f.agent.getVersion(f.bob, f.project.id, first.id)).id, version.id)
      assert.equal((await f.projects.get(f.alice, f.project.id)).scene, null, 'a generated proposal never silently changes the project')
      assert.equal((await f.agent.create(f.alice, f.project.id, input(), key)).id, first.id)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950)
    })

    await t.test('chat corrections branch from an immutable version; a later failure preserves both earlier results', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        calls++
        if (calls === 2) {
          assert.ok(value.parentVersion); assert.equal(value.message, 'Mové la abertura al otro lado.')
          assert.deepEqual(value.conversation, [{ message: input().message, summary: 'Versión revisada lista para corregir.', questions: [] }])
        }
        if (calls === 3) throw new Error('Provider unavailable')
        return defaultGenerator(value, options)
      })
      const first = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(first.id)))?.state === 'committed')
      const original = await f.agent.getVersion(f.alice, f.project.id, first.id)
      const corrected = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: first.id, message: 'Mové la abertura al otro lado.' }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(corrected.id)))?.state === 'committed')
      assert.equal((await f.agent.getVersion(f.alice, f.project.id, corrected.id)).parentVersionId, first.id)
      const failed = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: corrected.id }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(failed.id)))?.state === 'refunded')
      assert.equal((await f.agent.get(f.alice, f.project.id, failed.id)).status, 'failed')
      assert.deepEqual(await f.agent.getVersion(f.alice, f.project.id, first.id), original)
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 2)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 900)
      await assert.rejects(f.agent.create(f.alice, f.project.id, { ...input(), target: 'building', parentVersionId: first.id }, randomUUID()), badStatus(400))
      const other = await f.projects.create(f.alice, { name: 'Otro proyecto' })
      await assert.rejects(f.agent.create(f.alice, other.id, { ...input(), parentVersionId: first.id }, randomUUID()), badStatus(404))
    })

    await t.test('building attempts retain the automatic review loop and spend the building credit cost once', async t => {
      const f = await fixture(t, dialect, async ({ project, target }, options) => {
        assert.equal(target, 'building')
        options.onInference()
        const first = candidate(project.id, 'building'), improved = structuredClone(first)
        first.unknowns = ['Altura de la envolvente por revisar.']
        improved.summary = 'Envolvente corregida y revisada.'
        const iterations: FoundationGenerationResult['iterations'] = [
          { index: 1, candidate: first, review: { passed: false, summary: 'Revisar altura.', issues: ['La altura no coincide con la cantidad de pisos.'] } },
          { index: 2, candidate: improved, review: { passed: true, summary: 'Altura consistente.', issues: [] } },
        ]
        for (const iteration of iterations) {
          await options.onIteration(iteration)
          options.onEvent({ kind: iteration.review.passed ? 'review' : 'revision', message: iteration.review.summary })
        }
        return { status: 'ready', candidate: improved, summary: improved.summary, questions: [], iterations }
      })
      const run = await f.agent.create(f.alice, f.project.id, { ...input(), target: 'building' }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'committed')
      const version = await f.agent.getVersion(f.alice, f.project.id, run.id)
      assert.equal(version.target, 'building')
      assert.equal(version.iterations.length, 2)
      assert.equal(version.iterations[0].review.passed, false)
      assert.equal(version.iterations[1].review.passed, true)
      assert.equal(version.candidate?.summary, 'Envolvente corregida y revisada.')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 900)
      assert.equal((await f.projects.get(f.alice, f.project.id)).foundations?.building.status, 'draft')
    })

    await t.test('failed repair preserves every iteration as an unready chat parent and refunds the attempt', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        if (++calls > 1) {
          assert.equal(value.parentVersion?.status, 'needs_input')
          assert.equal(value.parentVersion?.iterations.length, 2)
          assert.equal(value.parentVersion?.candidate?.summary, 'Segundo borrador sin aprobar.')
          assert.deepEqual(value.parentVersion?.questions, ['Confirmá el ancho de la abertura.'])
          assert.equal(value.conversation?.[0].message, input().message)
          return defaultGenerator(value, options)
        }
        options.onInference()
        const first = candidate(value.project.id), second = { ...first, summary: 'Segundo borrador sin aprobar.' }
        await options.onIteration({ index: 1, candidate: first, review: { passed: false, summary: 'Falta una abertura.', issues: ['Revisá la posición de la abertura.'] } })
        await options.onIteration({ index: 2, candidate: second, review: { passed: false, summary: 'Falta una medida.', issues: ['Confirmá el ancho de la abertura.'] } })
        throw new Error('Provider failed while preparing another repair')
      })
      const run = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      const failed = await f.agent.get(f.alice, f.project.id, run.id), version = await f.agent.getVersion(f.alice, f.project.id, run.id)
      assert.equal(failed.status, 'failed'); assert.equal(failed.versionId, version.id)
      assert.match(failed.error!, /Se conservó el borrador/)
      assert.equal(version.status, 'needs_input'); assert.equal(version.iterations.length, 2)
      assert.deepEqual(version.iterations, failed.iterations)
      assert.deepEqual(version.candidate, failed.iterations[1].candidate)
      assert.deepEqual(version.questions, ['Confirmá el ancho de la abertura.'])
      assert.match(version.summary, /Última revisión: Falta una medida/)
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 1)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
      await assert.rejects(f.projects.applyFoundationVersion(f.alice, f.project.id, version, 1), badStatus(400))
      assert.equal((await f.projects.get(f.alice, f.project.id)).scene, null)
      const continued = await f.agent.create(f.alice, f.project.id, { ...input(), message: 'La abertura mide 0,9 metros.', parentVersionId: version.id }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(continued.id)))?.state === 'committed')
      assert.equal((await f.agent.getVersion(f.alice, f.project.id, continued.id)).parentVersionId, version.id)
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 2)
    })

    await t.test('a malformed repair retains the preceding draft and the complete iteration history after failure', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        if (++calls > 1) {
          assert.equal(value.parentVersion?.status, 'needs_input')
          assert.equal(value.parentVersion?.candidate?.summary, 'Primer borrador recuperable.')
          assert.equal(value.parentVersion?.iterations.length, 2)
          assert.equal(value.parentVersion?.iterations[1].candidate, null)
          assert.deepEqual(value.parentVersion?.questions, ['La reparación debe devolver un modelo válido.'])
          return defaultGenerator(value, options)
        }
        options.onInference()
        const first = { ...candidate(value.project.id), summary: 'Primer borrador recuperable.' }
        await options.onIteration({ index: 1, candidate: first, review: { passed: false, summary: 'Revisar una abertura.', issues: ['Confirmá la ubicación de la puerta.'] } })
        await options.onIteration({ index: 2, candidate: null, review: { passed: false, summary: 'Formato inválido en la reparación.', issues: ['La reparación debe devolver un modelo válido.'] } })
        throw new Error('Provider unavailable before the next repair')
      })
      const run = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      const failed = await f.agent.get(f.alice, f.project.id, run.id), version = await f.agent.getVersion(f.alice, f.project.id, run.id)
      assert.equal(failed.status, 'failed'); assert.equal(failed.versionId, version.id)
      assert.match(failed.error!, /Se conservó el borrador/)
      assert.equal(version.status, 'needs_input'); assert.equal(version.iterations.length, 2)
      assert.deepEqual(version.iterations, failed.iterations)
      assert.deepEqual(version.candidate, failed.iterations[0].candidate)
      assert.equal(version.iterations[1].candidate, null)
      assert.deepEqual(version.questions, ['La reparación debe devolver un modelo válido.'])
      assert.match(version.summary, /Última revisión: Formato inválido/)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
      await assert.rejects(f.projects.applyFoundationVersion(f.alice, f.project.id, version, 1), badStatus(400))
      assert.equal((await f.projects.get(f.alice, f.project.id)).scene, null)
      const continued = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: version.id, message: 'La puerta está junto a la escalera.' }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(continued.id)))?.state === 'committed')
      assert.equal((await f.agent.getVersion(f.alice, f.project.id, continued.id)).parentVersionId, version.id)
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 2)
    })

    await t.test('bounded timeout aborts inference and preserves the last reviewed draft without approving it', async t => {
      const blocked = gate(); let aborted = false
      const f = await fixture(t, dialect, async ({ project }, options) => {
        options.onInference()
        await options.onIteration({ index: 1, candidate: candidate(project.id), review: { passed: false, summary: 'Revisar el techo.', issues: ['Confirmá la altura libre del techo.'] } })
        try { await blocked.wait(options.signal) } finally { aborted = options.signal.aborted }
        throw new Error('Timeout must abort the blocked provider')
      }, 100)
      const run = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await blocked.ready
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      assert.equal(aborted, true)
      const failed = await f.agent.get(f.alice, f.project.id, run.id), version = await f.agent.getVersion(f.alice, f.project.id, run.id)
      assert.equal(failed.status, 'failed'); assert.equal(failed.versionId, version.id)
      assert.match(failed.error!, /límite de tiempo/); assert.match(failed.error!, /Se conservó el borrador/)
      assert.equal(version.status, 'needs_input'); assert.equal(version.iterations.length, 1)
      assert.deepEqual(version.questions, ['Confirmá la altura libre del techo.'])
      await assert.rejects(f.projects.applyFoundationVersion(f.alice, f.project.id, version, 1), badStatus(400))
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
    })

    await t.test('an unaccepted reviewed ancestor remains the baseline across an unsuccessful correction, but not changed inputs', async t => {
      const f = await fixture(t, dialect, async (value, options) => {
        options.onInference()
        const generated = result(value.project.id, 'building')
        if (generated.candidate?.target !== 'building') throw new Error('Expected building')
        generated.candidate.buildings[0].height = 18
        if (value.message === 'Necesita revisión') {
          assert.equal(value.parentVersion?.status, 'ready')
          assert.equal(value.baselineVersion?.id, value.parentVersion?.id)
          generated.status = 'needs_input'; generated.summary = 'El cambio todavía no está aprobado.'
          generated.candidate.buildings[0].height = 99
          generated.iterations[0].review = { passed: false, summary: 'Revisar la medida.', issues: ['Confirmá la altura del cuerpo.'] }
          generated.questions = ['Confirmá la altura del cuerpo.']
        } else if (value.message === 'Continúa desde el borrador') {
          assert.equal(value.parentVersion?.status, 'needs_input')
          assert.equal(value.parentVersion?.candidate?.target === 'building' && value.parentVersion.candidate.buildings[0].height, 99)
          assert.equal(value.baselineVersion?.status, 'ready')
          assert.equal(value.baselineVersion?.candidate?.target === 'building' && value.baselineVersion.candidate.buildings[0].height, 18)
          assert.equal(value.conversation?.length, 2)
          assert.deepEqual(value.parentVersion.questions, ['Confirmá la altura del cuerpo.'])
        } else if (value.message === 'Dirección actualizada') assert.equal(value.baselineVersion, undefined)
        await options.onIteration(generated.iterations[0])
        return generated
      })
      const start = async (message: string, parentVersionId?: string, revision = 1) => {
        const run = await f.agent.create(f.alice, f.project.id, { ...input(revision), target: 'building', message, parentVersionId }, randomUUID())
        await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'committed')
        return run
      }
      const first = await start('Base revisada'), second = await start('Necesita revisión', first.id)
      const third = await start('Continúa desde el borrador', second.id)
      assert.equal((await f.projects.get(f.alice, f.project.id)).foundationModels, null, 'the reviewed baseline was never accepted into the project')
      const foundations = structuredClone(f.project.foundations!)
      foundations.building.address = 'Otra dirección de proyecto'
      const changed = await f.projects.save(f.alice, f.project.id, { revision: 1, foundations })
      await start('Dirección actualizada', third.id, changed.revision)
    })

    await t.test('baseline ancestry stops at a cycle and never borrows a ready version from another project', async t => {
      const f = await fixture(t, dialect, async (value, options) => {
        options.onInference()
        if (value.message.startsWith('Check')) assert.equal(value.baselineVersion, undefined)
        const generated = result(value.project.id)
        if (value.message === 'Sin aprobar') {
          generated.status = 'needs_input'
          generated.iterations[0].review = { passed: false, summary: 'Todavía no aprobada.', issues: ['Falta una medida.'] }
        }
        await options.onIteration(generated.iterations[0]); return generated
      })
      const create = async (projectId: string, message: string, parentVersionId?: string) => {
        const run = await f.agent.create(f.alice, projectId, { ...input(), message, parentVersionId }, randomUUID())
        await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'committed')
        return run
      }
      const other = await f.projects.create(f.alice, { name: 'Other property' })
      const foreign = await create(other.id, 'Base de otro proyecto')
      const draft = await create(f.project.id, 'Sin aprobar')
      const queue = new DatabaseSync(f.path)
      const setParent = (parentVersionId: string) => {
        const stored = queue.prepare('SELECT document FROM foundation_agent_version WHERE id=?').get(draft.id)!
        const version = JSON.parse(String(stored.document))
        queue.prepare('UPDATE foundation_agent_version SET document=? WHERE id=?').run(JSON.stringify({ ...version, parentVersionId }), draft.id)
      }
      try {
        setParent(foreign.id)
        await create(f.project.id, 'Check foreign ancestry', draft.id)
        setParent(draft.id)
        await create(f.project.id, 'Check cycle', draft.id)
      } finally { queue.close() }
    })

    await t.test('stale revisions and duplicate active targets do not spend credits; cancellation releases the reservation', async t => {
      const f = await fixture(t, dialect)
      const pause = t.mock.method(f.agent, 'kick', () => {})
      await assert.rejects(f.agent.create(f.alice, f.project.id, input(2), randomUUID()), badStatus(409))
      const queued = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await assert.rejects(f.agent.create(f.alice, f.project.id, input(), randomUUID()), badStatus(409))
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950)
      await f.agent.cancel(f.alice, f.project.id, queued.id)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 1000)
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 0)
      pause.mock.restore()
    })

    await t.test('membership and suspension are rechecked before inference and again before saving a result', async t => {
      const blocked = gate(); let calls = 0
      const f = await fixture(t, dialect, async (value, options) => { calls++; await blocked.wait(options.signal); return defaultGenerator(value, options) })
      await f.database.db.insertInto('t3_project_member').values({ projectId: f.project.id, userId: f.bob.id, role: 'editor', createdAt: new Date().toISOString() }).execute()
      const pause = t.mock.method(f.agent, 'kick', () => {})
      const queued = await f.agent.create(f.bob, f.project.id, input(), randomUUID())
      await f.database.db.deleteFrom('t3_project_member').where('projectId', '=', f.project.id).where('userId', '=', f.bob.id).execute()
      pause.mock.restore(); f.agent.kick()
      await until(async () => (await f.credits.reservation(reserved(queued.id)))?.state === 'refunded')
      assert.equal(calls, 0)
      const running = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await blocked.ready
      await f.database.db.updateTable('user').set({ suspended: f.database.bool(true) }).where('id', '=', f.alice.id).execute()
      blocked.release()
      await until(async () => (await f.credits.reservation(reserved(running.id)))?.state === 'refunded')
      assert.equal((await f.agent.get(f.alice, f.project.id, running.id)).status, 'failed')
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 0)
    })

    await t.test('running cancellation stops callbacks and keeps the reviewed version available', async t => {
      const blocked = gate(); let calls = 0
      const f = await fixture(t, dialect, async (value, options) => { calls++; if (calls > 1) await blocked.wait(options.signal); return defaultGenerator(value, options) })
      const initial = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(initial.id)))?.state === 'committed')
      const correction = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: initial.id }, randomUUID())
      await blocked.ready
      await f.agent.cancel(f.alice, f.project.id, correction.id)
      await until(async () => (await f.credits.reservation(reserved(correction.id)))?.state === 'refunded')
      assert.equal((await f.agent.get(f.alice, f.project.id, correction.id)).status, 'cancelled')
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 1)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950)
    })

    await t.test('needs-input responses persist as chat versions and only charge when inference started', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (value, options) => {
        if (++calls > 1) {
          options.onInference()
          assert.deepEqual(value.conversation, [{ message: input().message, summary: 'Falta una medida de referencia.', questions: ['¿Cuánto mide esta pared?'] }])
        }
        return { status: 'needs_input', candidate: null, summary: 'Falta una medida de referencia.', questions: ['¿Cuánto mide esta pared?'], iterations: [] }
      })
      const first = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(first.id)))?.state === 'refunded')
      assert.equal((await f.agent.get(f.alice, f.project.id, first.id)).status, 'needs_input')
      assert.deepEqual((await f.agent.getVersion(f.alice, f.project.id, first.id)).questions, ['¿Cuánto mide esta pared?'])
      const second = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: first.id }, randomUUID())
      await until(async () => (await f.credits.reservation(reserved(second.id)))?.state === 'committed')
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950)
    })

    await t.test('restart recovery refunds abandoned work and retains completed versions and conversation', async t => {
      const f = await fixture(t, dialect)
      const complete = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(complete.id)))?.state === 'committed')
      t.mock.method(f.agent, 'kick', () => {})
      const abandoned = await f.agent.create(f.alice, f.project.id, { ...input(), parentVersionId: complete.id, message: 'Segunda corrección.' }, randomUUID())
      const orphanId = randomUUID()
      await f.credits.reserve(f.alice.id, reserved(orphanId), 'apartment')
      // Model a process crash after claiming the durable queue row.
      const queue = new DatabaseSync(f.path)
      const stored = queue.prepare('SELECT document FROM foundation_agent_run WHERE id=?').get(abandoned.id)!
      const row = JSON.parse(String(stored.document))
      queue.prepare('UPDATE foundation_agent_run SET document=? WHERE id=?').run(JSON.stringify({ ...row, status: 'running' }), abandoned.id)
      queue.close()
      const restarted = await f.restart()
      assert.equal((await restarted.get(f.alice, f.project.id, abandoned.id)).status, 'failed')
      assert.equal((await f.credits.reservation(reserved(abandoned.id)))?.state, 'refunded')
      assert.equal((await f.credits.reservation(reserved(orphanId)))?.state, 'refunded')
      assert.equal((await restarted.getVersion(f.alice, f.project.id, complete.id)).status, 'ready')
      assert.equal((await restarted.list(f.alice, f.project.id)).runs.length, 2)
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950)
      await restarted.recover()
      assert.equal((await f.credits.summary(f.alice.id)).balance, 950, 'recovery cannot refund a completed model twice')
    })

    await t.test('credit settlement outage keeps the completed version and reconciles without generating again', async t => {
      let calls = 0
      const f = await fixture(t, dialect, async (value, options) => { calls++; return defaultGenerator(value, options) })
      const commit = t.mock.method(f.credits, 'commit', async () => { throw new Error('Database temporarily unavailable') })
      t.mock.method(console, 'error', () => {})
      const run = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.agent.get(f.alice, f.project.id, run.id)).status === 'completed')
      await delay(10)
      assert.equal((await f.credits.reservation(reserved(run.id)))?.state, 'reserved')
      assert.equal((await f.agent.getVersion(f.alice, f.project.id, run.id)).status, 'ready')
      commit.mock.restore()
      await f.agent.reconcile()
      assert.equal((await f.credits.reservation(reserved(run.id)))?.state, 'committed')
      assert.equal(calls, 1)
    })

    await t.test('unreviewed results cannot become a ready version', async t => {
      const f = await fixture(t, dialect, async ({ project }) => ({ ...result(project.id), iterations: [] }))
      const run = await f.agent.create(f.alice, f.project.id, input(), randomUUID())
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'refunded')
      assert.equal((await f.agent.get(f.alice, f.project.id, run.id)).status, 'failed')
      assert.equal((await f.agent.list(f.alice, f.project.id)).versions.length, 0)
    })

    await t.test('HTTP routes validate requests, preserve project access and apply reviewed versions only on explicit acceptance', async t => {
      const f = await fixture(t, dialect)
      t.mock.method(f.accounts, 'requireUser', async (request: IncomingMessage) => request.headers['x-test-user'] === 'bob' ? f.bob : f.alice)
      const worker = new AssetWorker({ store: f.store, directory: f.directory, planner: async () => { throw new Error('not used') }, renderer: async () => {} })
      const api = createApi({
        store: f.store, worker, foundationAgent: f.agent, projects: f.projects, credits: f.credits, publicOrigin: 'http://localhost:5173',
        access: { authorize: async request => request.headers['x-test-user'] === 'anonymous' ? null : request.headers['x-test-user'] === 'bob' ? f.bob : f.alice },
        health: async () => ({ status: 'ok', codex: { available: true, authenticated: true, authMode: 'api-key' }, blender: { available: true } }),
      })
      await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve))
      const address = api.address(); assert.ok(address && typeof address === 'object')
      t.after(async () => { await new Promise<void>(resolve => api.close(() => resolve())); await worker.close() })
      const base = `/api/projects/${f.project.id}/foundation-agent`
      const request = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => fetch(`http://127.0.0.1:${address.port}${path}`, {
        method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.equal((await (await request('/api/health')).json() as { foundationAgentEnabled: boolean }).foundationAgentEnabled, true)
      assert.deepEqual(await (await request(base)).json(), { runs: [], versions: [] })
      assert.equal((await request(base, 'GET', undefined, { 'X-Test-User': 'anonymous' })).status, 401)
      assert.equal((await request(base, 'GET', undefined, { 'X-Test-User': 'bob' })).status, 404)
      assert.equal((await request(base, 'POST', input(), { Origin: 'https://other.example' })).status, 403)
      assert.equal((await request(base, 'POST', { ...input(), revision: 0 })).status, 400)
      assert.equal((await request(base, 'POST', { ...input(), candidate: candidate(f.project.id) })).status, 400)
      assert.equal((await request(base, 'POST', input(), { 'Idempotency-Key': '' })).status, 400)
      const creation = await request(base, 'POST', input())
      assert.equal(creation.status, 202)
      const { run } = await creation.json() as { run: { id: string } }
      await until(async () => (await f.credits.reservation(reserved(run.id)))?.state === 'committed')
      assert.equal((await f.projects.get(f.alice, f.project.id)).revision, 1)
      await f.database.db.insertInto('t3_project_member').values({ projectId: f.project.id, userId: f.bob.id, role: 'viewer', createdAt: new Date().toISOString() }).execute()
      assert.equal((await request(base, 'GET', undefined, { 'X-Test-User': 'bob' })).status, 200)
      const accept = `${base}/versions/${run.id}/accept`
      assert.equal((await request(accept, 'POST', { revision: 1 }, { 'X-Test-User': 'bob' })).status, 403)
      assert.equal((await request(accept, 'POST', { revision: 1, candidate: candidate(f.project.id) })).status, 400)
      assert.equal((await request(accept, 'POST', { revision: 2 })).status, 409)
      const accepted = await request(accept, 'POST', { revision: 1 })
      assert.equal(accepted.status, 200)
      const { project: dwellingAccepted } = await accepted.json() as { project: { revision: number; scene: unknown; foundations: { dwelling: { status: string } } } }
      assert.equal(dwellingAccepted.revision, 2)
      assert.equal(dwellingAccepted.foundations.dwelling.status, 'ready')
      assert.equal(dwellingAccepted.scene, null, 'both accepted bases are required')
      const building = await request(base, 'POST', { ...input(2), target: 'building' })
      assert.equal(building.status, 202)
      const { run: buildingRun } = await building.json() as { run: { id: string } }
      await until(async () => (await f.credits.reservation(reserved(buildingRun.id)))?.state === 'committed')
      const buildingAccepted = await request(`${base}/versions/${buildingRun.id}/accept`, 'POST', { revision: 2 })
      assert.equal(buildingAccepted.status, 200)
      const { project: ready } = await buildingAccepted.json() as { project: { revision: number; scene: unknown; stage: string } }
      assert.equal(ready.revision, 3); assert.equal(ready.stage, 'ready'); assert.ok(ready.scene)

      const checkpointPath = `/api/projects/${f.project.id}/checkpoints`
      assert.deepEqual(await (await request(checkpointPath)).json(), { checkpoints: [] })
      const replacement = await request(base, 'POST', { ...input(3), parentVersionId: run.id, message: 'Revisá de nuevo la distribución.' })
      const { run: replacementRun } = await replacement.json() as { run: { id: string } }
      await until(async () => (await f.credits.reservation(reserved(replacementRun.id)))?.state === 'committed')
      assert.equal((await request(`${base}/versions/${replacementRun.id}/accept`, 'POST', { revision: 3 })).status, 200)
      const { checkpoints } = await (await request(checkpointPath)).json() as { checkpoints: { id: string; revision: number }[] }
      assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].revision, 3)
      assert.equal((await request(checkpointPath, 'GET', undefined, { 'X-Test-User': 'anonymous' })).status, 401)
      assert.equal((await request(checkpointPath, 'GET', undefined, { 'X-Test-User': 'bob' })).status, 200)
      const restorePath = `${checkpointPath}/${checkpoints[0].id}/restore`
      assert.equal((await request(restorePath, 'POST', { revision: 4, document: {} })).status, 400)
      assert.equal((await request(restorePath, 'POST', { revision: 4 }, { 'X-Test-User': 'bob' })).status, 403)
      assert.equal((await request(restorePath, 'POST', { revision: 3 })).status, 409)
      const restored = await request(restorePath, 'POST', { revision: 4 })
      assert.equal(restored.status, 200)
      const { project: restoredProject } = await restored.json() as { project: { revision: number; scene: unknown } }
      assert.equal(restoredProject.revision, 5); assert.deepEqual(restoredProject.scene, ready.scene)
      assert.equal((await (await request(checkpointPath)).json() as { checkpoints: unknown[] }).checkpoints.length, 2)
      t.mock.method(f.agent, 'kick', () => {})
      const correction = await request(base, 'POST', { ...input(5), parentVersionId: run.id })
      const { run: correctionRun } = await correction.json() as { run: { id: string } }
      assert.equal((await request(`${base}/runs/${correctionRun.id}/cancel`, 'POST', {})).status, 200)
      assert.equal((await f.credits.reservation(reserved(correctionRun.id)))?.state, 'refunded')
      assert.equal((await f.projects.get(f.alice, f.project.id)).revision, 5)
    })
  })
}
