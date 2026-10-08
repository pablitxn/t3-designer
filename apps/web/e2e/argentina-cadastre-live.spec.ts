import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { createProjectFoundations, FoundationOfficialResearchSchema, type FoundationAgentRun, type FoundationAgentVersion } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'
import { creditFixture } from './credit-fixture'

const directory = process.env.T3_CABA_RESEARCH_DIR
const workerDirectory = process.env.T3_CADASTRE_WORKER_DIR
test.skip(!directory, 'Set T3_CABA_RESEARCH_DIR to inspect saved real public USIG acquisitions; no AI calls.')
test.use({ locale: 'es-AR', viewport: { width: 1440, height: 1000 } })

for (const slug of workerDirectory ? ['actual-worker'] : ['teatro-colon', 'museo-larreta']) test(`saved official parcel data renders ${slug} without implying a completed building`, async ({ page }) => {
  const prefix = process.env.T3_CADASTRE_OUTPUT_PREFIX ?? 'caba-chrome'
  const output = (name: string) => resolve(directory!, `${prefix}-${slug}-${name}`)
  async function capture(element: ReturnType<typeof page.locator>, filename: string) {
    // Document clipping avoids locator screenshots auto-scrolling a tall card
    // underneath the sticky project header; the UI itself is not modified.
    await page.evaluate(() => scrollTo(0, 0))
    const bounds = await element.boundingBox()
    expect(bounds).not.toBeNull()
    await page.screenshot({ path: output(filename), fullPage: true, clip: bounds!, animations: 'disabled' })
  }
  const record = JSON.parse(readFileSync(resolve(directory!, `caba-${workerDirectory ? 'teatro-colon' : slug}-research.json`), 'utf8'))
  let research = FoundationOfficialResearchSchema.parse(record.result.officialResearch)
  const foundations = createProjectFoundations()
  foundations.building = record.input
  const now = '2026-10-08T11:00:00Z'
  let project: Project = { id: 'cb110a86-61da-470e-8f91-4cc215a9543b', name: `CABA · ${slug} · inspección de datos públicos`, ownerId: 'qa', role: 'owner', revision: 1,
    notes: 'QA local: respuestas reales de USIG guardadas. Sin generación IA ni edificio aprobado.', stage: 'setup', scene: null, foundations, createdAt: now, updatedAt: now }
  let version: FoundationAgentVersion = { id: 'ce1d1279-9e54-4cbe-b641-184d0f2773b0', projectId: project.id, target: 'building',
    runId: '4168f8e5-6059-4fdf-9d51-612dbbdd98a9', parentVersionId: null, sourceRevision: 1, foundationsFingerprint: 'qa-recorded-public-http', createdAt: now,
    status: 'needs_input', candidate: null, summary: research.summary, questions: record.result.questions, iterations: [], officialResearch: research }
  let run: FoundationAgentRun = { id: version.runId, projectId: project.id, target: 'building', status: 'needs_input', message: 'Inspección local de respuestas públicas reales de USIG; no se ejecutó inferencia IA.',
    parentVersionId: null, sourceRevision: 1, createdAt: now, updatedAt: now, error: null, events: [{ id: 1, kind: 'search', message: research.summary, createdAt: now }],
    iterations: [], versionId: version.id, officialResearch: research }
  if (workerDirectory) {
    project = JSON.parse(readFileSync(resolve(workerDirectory, 'project-before.json'), 'utf8')) as Project
    version = JSON.parse(readFileSync(resolve(workerDirectory, 'version.json'), 'utf8')) as FoundationAgentVersion
    run = JSON.parse(readFileSync(resolve(workerDirectory, 'run.json'), 'utf8')) as FoundationAgentRun
    research = FoundationOfficialResearchSchema.parse(version.officialResearch)
    expect(version.candidate).toBeNull(); expect(version.status).toBe('needs_input')
  }
  const errors: string[] = [], writes: string[] = [], unexpected: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 405, json: { error: 'Read-only recorded data inspection' } }) }
    if (path === '/api/me') return route.fulfill({ json: { user: { id: project.ownerId, name: 'QA de catastro público', email: 'qa@example.test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: { foundationAgentEnabled: true } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } })
    if (path === `/api/projects/${project.id}`) return route.fulfill({ json: { project } })
    if (path === `/api/projects/${project.id}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${project.id}/foundation-agent`) return route.fulfill({ json: { runs: [run], versions: [version] } })
    unexpected.push(path); return route.fulfill({ status: 404, json: { error: 'Unknown recorded data route' } })
  })
  await page.goto(`/app/projects/${project.id}`)
  await expect(page.getByLabel('Referencia catastral (opcional)', { exact: true })).toHaveValue(project.foundations?.building.cadastralReference ?? '')
  const workshop = page.getByTestId('foundation-agent-building'), card = workshop.getByTestId('official-research')
  const parcel = research.parcels[0], area = new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(parcel.area)
  await expect(card).toBeVisible()
  await expect(card.getByText(`${area} m²`, { exact: true })).toBeVisible()
  await expect(card.getByText(parcel.areaBasis === 'published' ? 'Superficie publicada' : 'Superficie calculada del contorno', { exact: true })).toBeVisible()
  if (parcel.sourceDate) await expect(card.getByText(parcel.sourceDate, { exact: true })).toBeVisible()
  await expect(card.getByRole('combobox', { name: 'Inspeccionar una parcela', exact: true })).toHaveValue(parcel.id)
  const contour = card.locator(`[data-parcel-id="${parcel.id}"]`)
  await expect(contour).toHaveAttribute('fill-rule', 'evenodd')
  await expect(contour).toHaveAttribute('data-inspected', 'true')
  expect((await contour.getAttribute('d'))!.match(/[ML]/g)).toHaveLength(parcel.footprint.length)
  await expect(workshop.getByRole('button', { name: 'Usar esta versión', exact: true })).toHaveCount(0)
  await expect(workshop.locator('canvas')).toHaveCount(0)
  await capture(card, 'desktop.png')
  const inspections = [{ id: parcel.id, areaM2: parcel.area, vertices: parcel.footprint.length }]
  if (research.parcels.length > 1) {
    const alternative = research.parcels.find(value => value.area !== parcel.area && value.footprint.length !== parcel.footprint.length)!
    expect(alternative).toBeTruthy()
    await expect(card.locator('[data-parcel-id]')).toHaveCount(research.parcels.length)
    await card.getByRole('combobox', { name: 'Inspeccionar una parcela', exact: true }).selectOption(alternative.id)
    await expect(contour).toHaveAttribute('data-inspected', 'false')
    const otherContour = card.locator(`[data-parcel-id="${alternative.id}"]`)
    await expect(otherContour).toHaveAttribute('data-inspected', 'true')
    await expect(card.locator('[data-inspected="true"]')).toHaveCount(1)
    expect((await otherContour.getAttribute('d'))!.match(/[ML]/g)).toHaveLength(alternative.footprint.length)
    await expect(card.getByText(`${new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(alternative.area)} m²`, { exact: true })).toBeVisible()
    await expect(card.getByText('Parcela pendiente de confirmar', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Referencia catastral (opcional)', { exact: true })).toHaveValue('')
    await capture(card, 'second-parcel-desktop.png')
    await card.locator('summary').filter({ hasText: 'Información faltante y límites' }).click()
    await expect(card.getByText(/La consulta parcelaria es parcial: se recibieron 20 registros/)).toBeVisible()
    await capture(card.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Información faltante y límites' }) }), 'limits.png')
    await card.locator('summary').filter({ hasText: 'Información faltante y límites' }).click()
    inspections.push({ id: alternative.id, areaM2: alternative.area, vertices: alternative.footprint.length })
  }
  await card.locator('summary').filter({ hasText: 'Fuentes consultadas' }).click()
  for (const source of research.sources) await expect(card.getByRole('link', { name: source.title, exact: false })).toHaveAttribute('href', source.url)
  await capture(card.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Fuentes consultadas' }) }), 'sources.png')
  await card.locator('summary').filter({ hasText: 'Fuentes consultadas' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(card.getByRole('img', { name: 'Contornos de parcelas de fuentes oficiales' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(card, 'mobile.png')
  if (inspections.length > 1) {
    await page.reload()
    await expect(card.getByRole('combobox', { name: 'Inspeccionar una parcela', exact: true })).toHaveValue(parcel.id)
    await expect(card.getByText('Parcela pendiente de confirmar', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Referencia catastral (opcional)', { exact: true })).toHaveValue('')
  }
  expect(errors).toEqual([]); expect(writes).toEqual([]); expect(unexpected).toEqual([])
  writeFileSync(output('assessment.json'), JSON.stringify({ completed: true, mode: workerDirectory ? 'Actual persisted worker project, run and version, replayed read-only in browser; no additional inference or project mutations' : 'Recorded real public HTTP acquisition; local project/run fixtures, no AI, no building acceptance',
    sourceArtifact: workerDirectory ?? `caba-${slug}-research.json`, projectId: project.id, runId: run.id, versionId: version.id, candidateNull: version.candidate === null,
    selectedParcelId: research.selectedParcelId, reference: parcel.id, areaM2: parcel.area, areaBasis: parcel.areaBasis, sourceDate: parcel.sourceDate,
    displayedVertices: parcel.footprint.length, parcelCount: research.parcels.length, inspections, inspectionResetOnReload: inspections.length > 1,
    sourceCount: research.sources.length, desktop: [1440, 1000], mobile: [390, 844], horizontalOverflow: false, errors, writes, unexpected }, null, 2) + '\n')
})
