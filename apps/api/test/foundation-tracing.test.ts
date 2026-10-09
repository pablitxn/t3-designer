import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { createProjectFoundations, type FoundationCandidate, type FoundationOfficialResearch } from '@t3-designer/scene-schema'
import { createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { createFoundationGenerator } from '../src/foundation-agent-model.ts'
import { FoundationAgent, type FoundationGenerator } from '../src/foundation-agent.ts'
import { buildGeneratedProjectScene, generateProjectScene, type ProjectGenerationInput } from '../src/project-generation-model.ts'
import { ProjectGenerations } from '../src/project-generations.ts'
import { createProjects } from '../src/projects.ts'
import { AssetStore } from '../src/store.ts'
import { GenerationTelemetry, installTelemetry } from '../src/telemetry.ts'
import { beginUsageCall, UsageStore } from '../src/usage.ts'

const secret = 'private-evidence-never-export'
const input: ProjectGenerationInput = { name: secret, prompt: `Synthetic layout ${secret}`, kind: 'apartment', width: 8, depth: 6,
  storeyHeight: 2.8, floors: 1, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }
const plan = { summary: secret, assumptions: [secret], rooms: [{ name: secret, x: 0, z: 0, width: 8, depth: 6 }] }
const limits = { dailyLimit: 100, globalDailyLimit: 100, pendingLimit: 10 }

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) { if (await check()) return; await delay(5) }
  throw new Error('Tracing fixture did not settle')
}

async function fixture(t: TestContext) {
  const exporter = new InMemorySpanExporter()
  const runtime = new GenerationTelemetry({ exporter, serviceName: 't3-tracing-test', environment: 'test', version: 'fixture' })
  const restore = installTelemetry(runtime)
  const database = openAppDatabase({})
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const user: User = { id: randomUUID(), name: secret, email: `${secret}@example.test`, role: 'user' }
  await database.db.insertInto('user').values({ ...user, image: null, emailVerified: database.bool(false), suspended: database.bool(false),
    createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
  await accounts.credits.initialize(user.id, 'standard')
  const projects = await createProjects({ database, accounts }), project = await projects.create(user, { name: secret })
  const foundations = createProjectFoundations()
  Object.assign(foundations.dwelling.levels[0], { width: 8, depth: 6, ceilingHeight: 2.8, elevation: 0,
    planReferences: [{ id: randomUUID(), name: secret }] })
  Object.assign(foundations.building, { countryCode: 'AR', address: secret, region: secret })
  // The reference is a synthetic fixture; the injected source loader never reads a file.
  await database.db.updateTable('t3_project').set({ foundations: JSON.stringify(foundations) }).where('id', '=', project.id).execute()
  const store = new AssetStore(':memory:'), usage = new UsageStore(':memory:')
  const workers: { close(): Promise<void> }[] = []
  t.after(async () => {
    for (const worker of workers) await worker.close()
    restore(); await runtime.shutdown(); usage.close(); store.close(); await database.close()
  })
  return { exporter, runtime, database, user, projects, project, store, usage, credits: accounts.credits,
    agent(generate: FoundationGenerator) {
      const worker = new FoundationAgent({ path: ':memory:', database, projects, store, usage, credits: accounts.credits, enabled: true, limits, generate })
      workers.push(worker); return worker
    },
    conceptual() {
      const worker = new ProjectGenerations({ path: ':memory:', database, projects, store, usage, credits: accounts.credits, enabled: true, limits,
        generate: (id, specification, options) => generateProjectScene(id, specification, options, async (_request, _schema, settings) => {
          const call = beginUsageCall('openai', settings, 'gpt-fixture')
          settings.onInference?.(); settings.onProgress?.(secret)
          call?.observe({ input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } }, 'gpt-fixture')
          call?.finish('succeeded'); return JSON.stringify(plan)
        }) })
      workers.push(worker); return worker
    },
  }
}

function assertTrace(spans: ReadableSpan[], operationId: string, expected: string[]) {
  const root = spans.find(span => span.attributes['t3.operation.id'] === operationId)
  assert.ok(root, 'the real credit reservation and usage operation create one agent root')
  assert.equal(root.attributes['openinference.span.kind'], 'AGENT')
  assert.equal(spans.filter(span => !span.parentSpanContext).length, 1)
  const ids = new Set(spans.map(span => span.spanContext().spanId))
  for (const span of spans) {
    assert.equal(span.spanContext().traceId, root.spanContext().traceId)
    if (span !== root) assert.ok(ids.has(span.parentSpanContext!.spanId), `${span.name} has an exported parent`)
  }
  for (const name of expected) assert.ok(spans.some(span => span.name === name), `missing stage ${name}`)
  const serialized = JSON.stringify(spans.map(span => ({ name: span.name, attributes: span.attributes, events: span.events, status: span.status })))
  assert.ok(!serialized.includes(secret), 'private prompts, labels, source paths, addresses, outputs and callbacks never enter spans')
  assert.ok(!serialized.includes('input.value') && !serialized.includes('output.value'))
  return root
}

test('foundation retries, review and publication share the credit trace without exporting private evidence', async t => {
  const f = await fixture(t)
  const scene = buildGeneratedProjectScene(f.project.id, input, plan)
  const candidate: FoundationCandidate = { target: 'dwelling', summary: secret, assumptions: [secret], unknowns: [], sources: [], connections: [],
    levels: [{ levelId: 'ground-floor', name: secret, levelIndex: 0, elevation: 0, ceilingHeight: 2.8, scaleEvidence: secret, apartment: scene.apartment }] }
  const outputs = [secret, JSON.stringify({ status: 'ready', summary: secret, questions: [], measurementCorrections: [], candidateJson: JSON.stringify(candidate) }),
    JSON.stringify({ verdict: 'accept', summary: secret, issues: [], questions: [] })]
  const agent = f.agent(createFoundationGenerator({ references: { file: async () => ({ path: `/synthetic/${secret}.png`, mime: 'image/png' }) },
    turn: async (_request, _schema, settings) => {
      const call = beginUsageCall('openai', settings, 'gpt-fixture')
      settings.onInference?.(); settings.onProgress?.(secret)
      settings.onEvent?.({ kind: 'analysis', message: secret, detail: secret })
      call?.observe({ input_tokens: 120, output_tokens: 25 }, 'gpt-fixture'); call?.finish('succeeded')
      return outputs.shift()!
    } }))
  const run = await agent.create(f.user, f.project.id, { target: 'dwelling', revision: 1, message: secret }, randomUUID())
  const operationId = `foundation:${run.id}`
  await until(async () => (await f.credits.reservation(operationId))?.state === 'committed')
  await f.runtime.forceFlush()
  const spans = f.exporter.getFinishedSpans()
  const root = assertTrace(spans, operationId, ['foundation.sources.acquire', 'foundation.model.generation', 'foundation.model.correction',
    'foundation.geometry.validate', 'foundation.model.review', 'foundation.iteration.checkpoint', 'foundation.version.publish', 'llm.generation', 'llm.correction', 'llm.review'])
  assert.equal(root.attributes['t3.credits.consumed'], 50)
  assert.equal(root.attributes['t3.operation.status'], 'succeeded')
  assert.equal((await agent.get(f.user, f.project.id, run.id)).iterations.length, 2)
  const llms = spans.filter(span => span.attributes['openinference.span.kind'] === 'LLM')
  assert.equal(llms.length, 3)
  for (const llm of llms) {
    const parent = spans.find(span => span.spanContext().spanId === llm.parentSpanContext!.spanId)!
    assert.equal(parent.name, `foundation.model.${llm.attributes['t3.stage']}`)
    assert.equal(llm.attributes['llm.token_count.total'], 145)
  }
  assert.equal(llms.find(span => span.name === 'llm.generation')!.attributes['t3.call.status'], 'invalid')
})

test('official research traces source acquisition and refundable needs-input without a model call', async t => {
  const f = await fixture(t)
  const research: FoundationOfficialResearch = { countryCode: 'AR', jurisdiction: secret, summary: secret, sources: [], unknowns: [secret],
    geocode: null, parcels: [], selectedParcelId: null, selectionEvidence: null }
  const agent = f.agent(createFoundationGenerator({ references: { file: async () => null },
    acquireGeodata: async () => ({ status: 'partial', summary: secret, officialResearch: research, sources: [], questions: [secret], unknowns: [secret], geocode: null, context: null }),
    turn: async () => { throw new Error('No provider should run without sufficient source evidence') } }))
  const run = await agent.create(f.user, f.project.id, { target: 'building', revision: 1, message: secret }, randomUUID())
  const operationId = `foundation:${run.id}`
  await until(async () => (await f.credits.reservation(operationId))?.state === 'refunded')
  await f.runtime.forceFlush()
  const spans = f.exporter.getFinishedSpans()
  const root = assertTrace(spans, operationId, ['foundation.sources.acquire', 'foundation.geodata.acquire', 'foundation.research.checkpoint', 'foundation.version.publish'])
  assert.equal(root.attributes['t3.credits.consumed'], 0)
  assert.equal(root.attributes['t3.credits.refunded'], 100)
  assert.equal(root.attributes['t3.operation.status'], 'needs_input')
  assert.equal(spans.filter(span => span.attributes['openinference.span.kind'] === 'LLM').length, 0)
})

test('conceptual generation traces model, validation, deterministic scene and durable publication with real credit capture', async t => {
  const f = await fixture(t), worker = f.conceptual()
  const job = await worker.create(f.user, input, randomUUID()), operationId = `architecture:${job.id}`
  await until(async () => (await f.credits.reservation(operationId))?.state === 'committed')
  await f.runtime.forceFlush()
  const spans = f.exporter.getFinishedSpans()
  const root = assertTrace(spans, operationId, ['project.model.plan', 'project.plan.validate', 'project.scene.build', 'project.publish', 'llm.generation'])
  assert.equal(root.attributes['t3.credits.consumed'], 50)
  assert.equal(root.attributes['t3.operation.status'], 'succeeded')
  assert.equal((await f.projects.get(f.user, job.id)).scene?.project.id, job.id)
  const llm = spans.find(span => span.name === 'llm.generation')!
  assert.equal(spans.find(span => span.spanContext().spanId === llm.parentSpanContext!.spanId)!.name, 'project.model.plan')
  assert.equal(llm.attributes['llm.token_count.total'], 120)
  assert.equal(llm.attributes['llm.token_count.prompt_details.cache_read'], 10)
})
