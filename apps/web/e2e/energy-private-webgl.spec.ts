import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'

test.setTimeout(120_000)
test.use({
  locale: 'es-AR', viewport: { width: 1440, height: 1100 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
})

const projectId = '27514409-8839-43cd-bc64-a34cd274a3ba'
const source = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

async function projectServer(page: Page, withoutContextFlanks = false) {
  const scene = structuredClone(source)
  if (withoutContextFlanks) { scene.geometry.contextSections.before = []; scene.geometry.contextSections.after = [] }
  scene.project = { id: projectId, name: 'Estudio solar privado' }
  // One existing fixture is sufficient to verify preservation through apartment edits.
  scene.fixtures = scene.fixtures.slice(0, 1)
  let saved: Project = { id: projectId, name: scene.project.name, notes: '', ownerId: 'solar-owner', role: 'owner', revision: 1,
    createdAt: '2026-10-04T12:00:00Z', updatedAt: '2026-10-04T12:00:00Z', scene }
  let writes = 0
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'solar-owner', name: 'Designer', email: 'solar@example.test', role: 'user' } } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [saved] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === `/api/projects/${projectId}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${projectId}` && request.method() === 'GET') return route.fulfill({ json: { project: saved } })
    if (path === `/api/projects/${projectId}` && request.method() === 'PUT') {
      const body = request.postDataJSON()
      expect(body.revision).toBe(saved.revision)
      writes += 1
      saved = { ...saved, scene: ProjectSnapshotSchema.parse(body.scene), revision: saved.revision + 1 }
      return route.fulfill({ json: { project: saved } })
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected request: ${request.method()} ${path}` } })
  })
  return { saved: () => saved, writes: () => writes }
}

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

test('private rooftop WebGL renders panel changes, preserves them through apartment editing, and locks viewer inputs', { tag: '@webgl' }, async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()) })
  const server = await projectServer(page)
  const energy = page.locator('.project-energy')
  const openEnergy = async () => {
    await page.locator('summary').filter({ hasText: /^Energía solar del edificio$/ }).click()
    await expect(energy.getByRole('heading', { name: 'Un techo que genera energía.', exact: true })).toBeVisible()
  }
  await page.goto(`/app/projects/${projectId}`)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible({ timeout: 30_000 })
  await openEnergy()
  const canvas = energy.locator('.private-energy-preview canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await canvas.scrollIntoViewIfNeeded()
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  const rect = (await canvas.boundingBox())!
  expect(rect.width).toBeGreaterThan(600)
  expect(rect.height).toBeGreaterThan(300)
  await frames(page)
  const original = await canvas.screenshot()
  const directory = fileURLToPath(new URL('../../../artifacts/solar/', import.meta.url))
  mkdirSync(directory, { recursive: true })
  await energy.screenshot({ path: `${directory}/private-roof.png`, animations: 'disabled' })
  await testInfo.attach('private-roof', { path: `${directory}/private-roof.png`, contentType: 'image/png' })
  await energy.getByRole('tab', { name: 'Paneles', exact: true }).click()
  const count = energy.getByLabel('Cantidad de paneles', { exact: true })
  await count.fill('0'); await count.press('Tab')
  await canvas.scrollIntoViewIfNeeded(); await frames(page)
  expect((await canvas.screenshot()).equals(original)).toBe(false)
  await expect(energy.getByText('Agregá paneles para explorar la producción y el retorno de inversión.', { exact: true })).toBeVisible()
  await count.fill('20'); await count.press('Tab')
  const tilt = energy.getByLabel(/^Inclinación desde la horizontal/)
  await tilt.fill('90'); await tilt.press('Tab')
  await canvas.scrollIntoViewIfNeeded(); await frames(page)
  expect((await canvas.screenshot()).equals(original)).toBe(false)
  await expect(tilt).toHaveValue('90')
  expect(server.writes()).toBe(0)
  // An apartment edit must keep the building installation in the shared snapshot.
  await page.getByRole('combobox', { name: /Objetos colocados/ }).selectOption(source.fixtures[0].id)
  const fixtureX = page.getByLabel('X (m)', { exact: true })
  const nextX = String(Number(await fixtureX.inputValue()) + .1)
  await fixtureX.fill(nextX); await fixtureX.press('Tab')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.writes()).toBe(1)
  expect(server.saved().scene.buildingEnergy?.installation).toMatchObject({ panelCount: 20, tiltDeg: 90 })
  expect(server.saved().scene.fixtures[0].position[0]).toBeCloseTo(Number(nextX))
  server.saved().role = 'viewer'
  await page.reload()
  await openEnergy()
  await expect(canvas).toBeVisible()
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  await energy.getByRole('tab', { name: 'Paneles', exact: true }).click()
  await expect(count).toHaveValue('20')
  await expect(count).toBeDisabled()
  await expect(tilt).toHaveValue('90')
  await expect(tilt).toBeDisabled()
  await expect(energy.getByText('Acceso de lectura · no podés editar los parámetros', { exact: true })).toBeVisible()
  await energy.getByRole('tab', { name: 'Inversión', exact: true }).click()
  await expect(energy.getByLabel(/^Costo de instalación completa/)).toBeDisabled()
  expect(server.writes()).toBe(1)
  expect(errors).toEqual([])
})


test('a full-footprint concept with empty context flanks renders without crashing the lighting envelope', { tag: '@webgl' }, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await projectServer(page, true)
  await page.goto(`/app/projects/${projectId}`)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible({ timeout: 30_000 })
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  await page.getByRole('button', { name: 'Plano', exact: true }).click()
  await frames(page)
  expect(errors).toEqual([])
})
