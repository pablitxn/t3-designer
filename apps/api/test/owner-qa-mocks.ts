import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { AssetRequest } from '@t3-designer/asset-schema'
import type { FoundationCandidate } from '@t3-designer/scene-schema'
import type { FoundationGenerator } from '../src/foundation-agent.ts'
import { buildGeneratedProjectScene } from '../src/project-generation-model.ts'
import type { Planner, Renderer } from '../src/worker.ts'

// Test-only injection. Neither production entry point nor provider adapters import this module.
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
export const demoInput = { name: 'Escenario sintético', prompt: 'Un ambiente rectangular para pruebas', kind: 'apartment' as const, width: 8, depth: 6, storeyHeight: 2.8, floors: 1, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }
export function demoScene(id: string) {
  return buildGeneratedProjectScene(id, demoInput, { summary: 'Fixture de QA; no generado por un modelo', assumptions: ['Geometría sintética'], rooms: [{ name: 'Ambiente QA', x: 0, z: 0, width: 8, depth: 6 }] })
}
const failedFoundations = new Set<string>()
export const foundationMock: FoundationGenerator = async ({ project, target, message }, options) => {
  options.onInference()
  options.onEvent({ kind: 'generation', message: 'QA determinista: leyendo fixture local, sin proveedor.' })
  await delay(message.includes('[qa:slow]') ? 30_000 : 500, undefined, { signal: options.signal })
  const failureKey = `${project.id}:${target}:${message}`
  if (message.includes('[qa:failed]') && !failedFoundations.has(failureKey)) { failedFoundations.add(failureKey); throw new Error('Synthetic generation failure') }
  if (message.includes('[qa:needs-input]')) return { status: 'needs_input', candidate: null, summary: 'Fixture: falta una medida.', questions: ['¿Cuánto mide el ancho en metros?'], iterations: [] }
  const scene = demoScene(project.id)
  const common = { summary: 'Fixture revisado para probar el flujo; no valida calidad 3D.', assumptions: ['Datos ficticios de QA'], unknowns: [], sources: [] }
  const candidate: FoundationCandidate = target === 'dwelling' ? { ...common, target,
    levels: project.foundations!.dwelling.levels.map(level => ({ levelId: level.id, name: level.name, levelIndex: level.levelIndex, elevation: level.elevation ?? level.levelIndex * 2.8, ceilingHeight: level.ceilingHeight ?? 2.8, scaleEvidence: 'Fixture de ocho por seis metros', apartment: scene.apartment })), connections: [],
  } : { ...common, target, site: scene.site, buildings: scene.buildings, roads: scene.roads, parcel: scene.parcel }
  const iteration = { index: 1, candidate, review: { passed: true, summary: 'Revisión sintética, sin modelo externo.', issues: [] } }
  await options.onIteration(iteration)
  return { status: 'ready', candidate, summary: common.summary, questions: [], iterations: [iteration] }
}
export function assetMock(): Planner {
  const failed = new Set<string>()
  return async (input, options) => {
    options.onInference?.()
    await delay(input.notes.includes('[qa:slow]') ? 30_000 : 500, undefined, { signal: options.signal })
    if (input.notes.includes('[qa:failed]') && !failed.has(input.url)) { failed.add(input.url); throw new Error('Synthetic first-attempt failure') }
    if (input.notes.includes('[qa:needs-input]') && !input.dimensions) return { status: 'needs_input', label: 'Mesa QA', summary: 'Fixture: faltan medidas.', questions: ['Indicá ancho, alto y profundidad.'], warnings: [], recipe: null }
    const recipe: AssetRequest = { schemaVersion: 1, id: 'qa-table', label: 'Mesa QA existente', kind: 'table', units: 'meters', dimensions: input.dimensions ?? [1.2, .75, .7],
      parameters: { topThickness: .04, legWidth: .06, legInset: .06 }, material: { baseColor: '#664422', roughness: .5 },
      source: { url: input.url, description: 'Fixture sin consulta al fabricante', dimensionalStatus: 'user-supplied' } }
    return { status: 'ready', label: recipe.label, summary: 'Fixture listo', questions: [], warnings: ['QA: GLB existente; no valida fidelidad ni dimensiones del modelo.'], recipe }
  }
}
export function artifactMock(root: string): Renderer {
  return async ({ inputPath, outputDirectory, signal }) => {
    signal.throwIfAborted()
    const recipe = JSON.parse(await readFile(inputPath, 'utf8')) as AssetRequest
    await mkdir(outputDirectory, { recursive: true })
    const model = await readFile(join(root, 'apps/web/public/models/current/fridge-freezer.glb'))
    const files = { 'model.glb': model, 'source.blend': Buffer.from('QA fixture; not a Blender file'), 'preview.png': png, 'front.png': png, 'side.png': png, 'request.json': Buffer.from(JSON.stringify(recipe)) }
    const artifacts: Record<string, { path: string; bytes: number; sha256: string }> = {}
    for (const [filename, data] of Object.entries(files)) {
      await writeFile(join(outputDirectory, filename), data)
      artifacts[filename] = { path: filename, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
    }
    // Exercises real artifact integrity/publication around known existing bytes.
    // This manifest is synthetic and MUST NOT be used to assess model geometry.
    await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify({ status: 'validated', id: recipe.id, units: 'meters', upAxis: '+Y', frontAxis: '+Z', origin: 'floor-center', dimensions: recipe.dimensions, validation: { errors: [] }, artifacts, qaFixture: true }))
  }
}
