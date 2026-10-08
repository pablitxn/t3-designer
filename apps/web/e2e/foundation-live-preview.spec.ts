import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FoundationCandidateSchema, type FoundationAgentRun, type FoundationAgentVersion } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'
import { creditFixture } from './credit-fixture'

// Explicitly supplied saved inference output only: no model calls or mutations.
const artifactDirectory = process.env.T3_FOUNDATION_RENDER_DIR
test.skip(!artifactDirectory, 'Set T3_FOUNDATION_RENDER_DIR to inspect a saved inference artifact.')
test.use({ locale: 'es-AR', viewport: { width: 1440, height: 1100 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'], ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}) } })

function referenceDirectories(directory: string) {
  const directories: string[] = [], seen = new Set<string>()
  let current: string | undefined = directory
  while (current && !seen.has(current)) {
    seen.add(current); directories.push(current)
    const inputPath = resolve(current, 'input.json')
    if (!existsSync(inputPath)) break
    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { resumeDirectory?: string }
    current = input.resumeDirectory ? resolve(fileURLToPath(new URL('../../../', import.meta.url)), input.resumeDirectory) : undefined
  }
  return directories
}

test('saved real inference renders with its actual status and without mutations', { tag: '@webgl' }, async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const directory = resolve(artifactDirectory!)
  const manualPath = process.env.T3_FOUNDATION_MANUAL_CANDIDATE
  const manual = manualPath ? FoundationCandidateSchema.parse(JSON.parse(readFileSync(resolve(manualPath), 'utf8'))) : null
  const outputPath = (name: string) => resolve(manualPath ? dirname(resolve(manualPath)) : directory, `${manual ? 'manual-' : ''}${name}`)
  const project = JSON.parse(readFileSync(resolve(directory, 'project-before.json'), 'utf8')) as Project
  if (manual) project.role = 'viewer'
  const versionText = existsSync(resolve(directory, 'version.json')) ? readFileSync(resolve(directory, 'version.json'), 'utf8') : null
  const version = versionText && !manual ? JSON.parse(versionText) as FoundationAgentVersion : null
  const runText = readFileSync(resolve(directory, 'run.json'), 'utf8')
  const sourceRun = JSON.parse(runText) as FoundationAgentRun
  const manualSummary = 'REVISIÓN MANUAL · sin nueva inferencia. Borrador local para inspección; no aprobado por el agente ni aplicado al proyecto.'
  const run: FoundationAgentRun = manual ? { ...sourceRun, status: 'failed', versionId: null, target: manual.target, createdAt: sourceRun.updatedAt, message: manualSummary, error: manualSummary, events: [], iterations: [{ index: 1, candidate: manual, review: { passed: false, summary: manualSummary, issues: [] } }] } : sourceRun
  const references = referenceDirectories(directory)
  const errors: string[] = []
  const writes: string[] = []
  const missingReferences: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()) })
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 405, json: { error: 'Saved inference inspection is read-only.' } }) }
    if (path === '/api/me') return route.fulfill({ json: { user: { id: project.ownerId, name: 'QA de reconstrucción real', email: 'qa@example.test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: { foundationAgentEnabled: true } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } })
    if (path === `/api/projects/${project.id}`) return route.fulfill({ json: { project } })
    if (path === `/api/projects/${project.id}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${project.id}/foundation-agent`) return route.fulfill({ json: { runs: [run], versions: version ? [version] : [] } })
    const reference = path.match(/\/references\/([\da-f-]+)\/image$/)
    if (reference) {
      for (const location of references) for (const [extension, contentType] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
        const file = resolve(location, 'references', `${reference[1]}.${extension}`)
        if (existsSync(file)) return route.fulfill({ contentType, body: readFileSync(file) })
      }
      missingReferences.push(reference[1])
      return route.fulfill({ status: 404, json: { error: 'Reference missing from the saved inference chain.' } })
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown inspection request.' } })
  })
  await page.goto(`/app/projects/${project.id}`)
  const workshop = page.getByTestId(`foundation-agent-${run.target}`)
  const manualBadge = async (surface: ReturnType<typeof page.locator>) => {
    if (!manual) return surface
    await surface.evaluate(element => {
      const container = element as HTMLElement
      if (container.querySelector('[data-manual-inspection]')) return
      container.style.position = 'relative'
      const label = document.createElement('div')
      label.dataset.manualInspection = 'true'
      label.textContent = 'REVISIÓN MANUAL · sin nueva inferencia'
      Object.assign(label.style, { position: 'absolute', right: '8px', bottom: '8px', zIndex: '5', padding: '5px 8px', background: '#fff0c9', border: '1px solid #b39c59', borderRadius: '5px', color: '#3f371f', font: '10px system-ui,sans-serif', pointerEvents: 'none' })
      container.appendChild(label)
    })
    return surface
  }
  if (version?.status === 'needs_input') {
    if (run.status === 'needs_input') await expect(workshop.getByText('Necesita tu respuesta', { exact: true })).toBeVisible()
    else await expect(workshop.getByRole('button', { name: /^Versión \d+ · Necesita tu respuesta$/ })).toBeVisible()
    await expect(workshop.getByRole('button', { name: 'Usar esta versión', exact: true })).toHaveCount(0)
    await expect(workshop.getByRole('region', { name: 'Correcciones con el agente', exact: true }).getByText(version.summary, { exact: true })).toBeVisible()
  }
  if (!version) {
    expect(['failed', 'cancelled']).toContain(run.status)
    expect(run.versionId).toBeNull()
    await expect(workshop.getByText('La generación se interrumpió. Este borrador no es una versión final y no puede aplicarse.', { exact: true })).toBeVisible()
    await expect(workshop.getByRole('button', { name: 'Usar esta versión', exact: true })).toHaveCount(0)
  }
  const candidate = version?.candidate ?? [...(version?.iterations ?? run.iterations)].reverse().find(iteration => iteration.candidate)?.candidate
  expect(candidate).toBeTruthy()
  const levels = candidate?.target === 'dwelling' ? candidate.levels : [{ levelId: 'building-context', name: 'Entorno' }, { levelId: 'building-target', name: 'Edificio principal' }]
  for (const level of levels) {
    if (candidate?.target === 'dwelling') await workshop.getByRole('combobox', { name: 'Planta de la propuesta', exact: true }).selectOption(level.levelId)
    const preview = workshop.getByRole('region', { name: 'Vista previa del modelo', exact: true })
    if (candidate?.target === 'building') {
      const view = preview.getByRole('button', { name: level.name, exact: true })
      await view.click()
      await expect(view).toHaveAttribute('aria-pressed', 'true')
      const target = candidate.buildings.find(building => building.isTarget)!
      await expect(preview.getByText(`${candidate.buildings.length} edificios · ${candidate.roads.length} tramos viales · ${target.holes?.length ?? 0} patios del edificio principal.`, { exact: false })).toBeVisible()
      if (candidate.buildingCorrections) {
        const format = (value: number) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)} m`
        for (const [index, original] of candidate.buildingCorrections.baseBuildings.entries()) {
          const edited = candidate.buildings.find(building => building.id === original.id)!
          const table = preview.getByRole('table').nth(index)
          const body = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Altura del cuerpo', exact: true }) })
          await expect(body.getByRole('cell')).toHaveText([format(original.height), format(edited.height)])
        }
        const provenance = preview.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Modificaciones geométricas del usuario$/ }) })
        await (await manualBadge(provenance)).screenshot({ path: outputPath('browser-building-provenance.png'), animations: 'disabled' })
      }
    }
    const canvas = preview.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
    await (await manualBadge(manual ? canvas.locator('..') : canvas)).screenshot({ path: outputPath(`browser-model-${level.levelId}.png`), animations: 'disabled' })
    const previewPath = outputPath(`browser-preview-${level.levelId}.png`)
    await preview.screenshot({ path: previewPath, animations: 'disabled' })
    await testInfo.attach(`real-${level.levelId}-${version?.status ?? run.status}`, { path: previewPath, contentType: 'image/png' })
    await workshop.evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: outputPath(`browser-workshop-${level.levelId}.png`), animations: 'disabled' })
    if (candidate?.target === 'dwelling') {
      await preview.getByRole('button', { name: 'Vista cenital', exact: true }).click()
      await expect(preview.getByRole('button', { name: 'Vista cenital', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(canvas).toBeVisible()
      expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
      await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
      await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
      const topPath = outputPath(`browser-model-${level.levelId}-top.png`)
      await (await manualBadge(manual ? canvas.locator('..') : canvas)).screenshot({ path: topPath, animations: 'disabled' })
      await testInfo.attach(`real-${level.levelId}-top`, { path: topPath, contentType: 'image/png' })
      await preview.getByRole('button', { name: 'Perspectiva', exact: true }).click()
    }
  }
  if (candidate?.target === 'dwelling' && candidate.levels.length > 1) {
    const preview = workshop.getByRole('region', { name: 'Vista previa del modelo', exact: true })
    await preview.getByRole('checkbox', { name: 'Ver todas las plantas', exact: true }).check()
    await expect(preview.getByText('Plantas en sus coordenadas y cotas originales;', { exact: false })).toBeVisible()
    await preview.getByText('Conexiones entre plantas', { exact: true }).click()
    for (const connection of candidate.connections) await expect(preview.getByText(connection.notes, { exact: false })).toBeVisible()
    for (const [view, label] of [['oblique', 'Perspectiva'], ['top', 'Vista cenital']]) {
      await preview.getByRole('button', { name: label, exact: true }).click()
      const canvas = preview.locator('canvas')
      await expect(canvas).toBeVisible()
      await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
      await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
      await (await manualBadge(manual ? canvas.locator('..') : canvas)).screenshot({ path: outputPath(`browser-model-all-floors-${view}.png`), animations: 'disabled' })
    }
  }
  expect(errors).toEqual([])
  expect(writes).toEqual([])
  expect(missingReferences).toEqual([])
  for (const reference of await page.locator('img[src*="/references/"]').all()) expect(await reference.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(readFileSync(resolve(directory, 'run.json'), 'utf8')).toBe(runText)
  expect(existsSync(resolve(directory, 'version.json')) ? readFileSync(resolve(directory, 'version.json'), 'utf8') : null).toBe(versionText)
})
