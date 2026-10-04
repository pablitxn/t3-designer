import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { apartmentBounds } from '@t3-designer/geometry'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { PerspectiveCamera, Vector3 } from 'three'
import type { Project } from '../src/private/api'

// This suite deliberately exercises a real software WebGL context. Other browser
// suites keep WebGL disabled to cover the fallback without requiring a host GPU.
test.setTimeout(90_000)

test.use({
  locale: 'es-AR', viewport: { width: 1720, height: 1300 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
})

const projectId = '990955db-87ec-4f71-8714-164bfcccb17a'
const source = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))
const bounds = apartmentBounds(source.apartment)
const initial: [number, number, number] = [bounds.center[0], .015, bounds.center[1]]

async function projectServer(page: Page, fullScene = false) {
  const scene = structuredClone(source)
  scene.project = { id: projectId, name: 'Prueba de arrastre' }
  if (!fullScene) scene.fixtures = [{ ...scene.fixtures[0], position: initial, rotation: 0 }]
  let saved: Project = { id: projectId, name: scene.project.name, notes: '', ownerId: 'drag-owner', role: 'owner', revision: 1,
    createdAt: '2026-10-04T12:00:00Z', updatedAt: '2026-10-04T12:00:00Z', scene }
  let writes = 0
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'drag-owner', name: 'Designer', email: 'drag@example.test', role: 'user' } } })
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

async function openScene(page: Page, mode: '3d' | 'top') {
  const model = page.waitForResponse(response => response.url().endsWith('/models/current/fridge-freezer.glb') && response.ok())
  await page.goto(`/app/projects/${projectId}`)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible({ timeout: 30_000 })
  if (mode === 'top') await page.getByRole('button', { name: 'Plano', exact: true }).click()
  const canvas = page.locator('.editor-scene canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await canvas.scrollIntoViewIfNeeded()
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  await model
  await frames(page)
  const rect = (await canvas.boundingBox())!
  const span = Math.max(bounds.depth, bounds.width / (rect.width / rect.height), 2)
  const camera = new PerspectiveCamera(42, rect.width / rect.height, .05, 500)
  camera.position.set(bounds.center[0] + (mode === 'top' ? 0 : span * .65), span * (mode === 'top' ? 1.6 : 1.2), bounds.center[1] + (mode === 'top' ? .01 : span * .85))
  camera.lookAt(bounds.center[0], source.geometry.floor.elevation, bounds.center[1])
  camera.updateMatrixWorld()
  const asset = source.assets.find(asset => asset.id === source.fixtures[0].assetId)!
  const projected = new Vector3(initial[0], initial[1] + asset.dimensions[1] / 2, initial[2]).project(camera)
  const point = { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2 }
  await page.mouse.click(point.x, point.y)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(Number(initial[0].toFixed(3))))
  await frames(page)
  return { canvas, point }
}

test('a real WebGL drag previews without history, commits once, snaps and persists on save', { tag: '@webgl' }, async ({ page }) => {
  const server = await projectServer(page)
  const { point } = await openScene(page, 'top')
  const undo = page.getByRole('button', { name: /Deshacer/ })
  await expect(undo).toBeDisabled()
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 38, point.y + 15, { steps: 8 })
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(Number(initial[0].toFixed(3))))
  await expect(undo).toBeDisabled()
  await page.mouse.up()
  await expect(undo).toBeEnabled()
  const movedX = Number(await page.getByLabel('X (m)', { exact: true }).inputValue())
  const movedZ = Number(await page.getByLabel('Z (m)', { exact: true }).inputValue())
  expect(movedX).toBeGreaterThan(initial[0])
  expect(movedZ).toBeGreaterThan(initial[2])
  expect(movedX * 10).toBeCloseTo(Math.round(movedX * 10), 8)
  expect(movedZ * 10).toBeCloseTo(Math.round(movedZ * 10), 8)
  await expect(page.getByLabel('Altura (m)', { exact: true })).toHaveValue('0.015')
  await undo.click()
  await expect(undo).toBeDisabled()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(Number(initial[0].toFixed(3))))
  await page.getByRole('button', { name: /Rehacer/ }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.writes()).toBe(1)
  expect(server.saved().scene.fixtures[0].position).toEqual([movedX, .015, movedZ])
  await page.reload()
  await page.getByRole('combobox', { name: /Objetos colocados/ }).selectOption(source.fixtures[0].id)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(movedX))
  await expect(page.getByLabel('Z (m)', { exact: true })).toHaveValue(String(movedZ))
})

test('Escape cancels a real 3D drag without moving the camera or adding an undo entry', { tag: '@webgl' }, async ({ page }) => {
  const server = await projectServer(page)
  const { canvas, point } = await openScene(page, '3d')
  const before = await canvas.screenshot()
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 34, point.y + 12, { steps: 8 })
  await frames(page)
  expect((await canvas.screenshot()).equals(before)).toBe(false)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await frames(page)
  await expect(page.getByRole('button', { name: /Deshacer/ })).toBeDisabled()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(Number(initial[0].toFixed(3))))
  await expect(page.getByLabel('Z (m)', { exact: true })).toHaveValue(String(Number(initial[2].toFixed(3))))
  // Restoring every rendered pixel verifies both the object and camera position.
  expect((await canvas.screenshot()).equals(before)).toBe(true)
  expect(server.writes()).toBe(0)
  await expect(page.locator('[tabindex="0"][aria-label="Objeto seleccionado"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(String(Number((initial[0] + .1).toFixed(3))))
  await page.keyboard.press('r')
  await expect(page.getByLabel('Rotación (°)', { exact: true })).toHaveValue('90')
})

test('the WebGL editor fits desktop and mobile widths', { tag: '@webgl' }, async ({ page }, testInfo) => {
  await projectServer(page, true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/app/projects/${projectId}`)
  await expect(page.locator('.editor-scene canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await frames(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-editor-desktop.png', fullPage: true })
  await testInfo.attach('desktop', { path: '/tmp/t3-editor-desktop.png', contentType: 'image/png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await frames(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-editor-mobile.png', fullPage: true })
  await testInfo.attach('mobile', { path: '/tmp/t3-editor-mobile.png', contentType: 'image/png' })
})

test('WebGL shows warm/cool room lighting, finish changes and window coverings', { tag: '@webgl' }, async ({ page }, testInfo) => {
  // CI software rendering needs time for every lighting/covering screenshot;
  // retain all pixel comparisons and the normal local budget.
  test.setTimeout(process.env.CI ? 180_000 : 90_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()) })
  await projectServer(page, true)
  await page.goto(`/app/projects/${projectId}`)
  const canvas = page.locator('.editor-scene canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  const section = async (title: string) => {
    const summary = page.locator('summary').filter({ hasText: title })
    if (!await summary.evaluate(element => element.parentElement?.hasAttribute('open'))) await summary.click()
  }
  const capture = async (name: string) => {
    await canvas.scrollIntoViewIfNeeded()
    await frames(page)
    const path = `/tmp/t3-customization-${name}.png`
    const pixels = await canvas.screenshot({ path })
    await testInfo.attach(name, { path, contentType: 'image/png' })
    return pixels
  }
  await section('Iluminación')
  await page.getByLabel('Luz natural', { exact: true }).uncheck()
  const unlit = await capture('unlit')
  await page.getByRole('combobox', { name: 'Ambiente para la nueva luz', exact: true }).selectOption('living')
  await page.getByRole('button', { name: /Añadir punto de luz$/ }).click()
  const warm = await capture('warm')
  expect(warm.equals(unlit)).toBe(false)
  await page.getByRole('button', { name: /^Blanca fría/ }).click()
  const cool = await capture('cool')
  expect(cool.equals(warm)).toBe(false)
  await page.getByLabel('Luces artificiales', { exact: true }).uncheck()
  const off = await capture('off')
  expect(off.equals(cool)).toBe(false)
  await page.getByLabel('Luz natural', { exact: true }).check()
  await section('Paredes y pisos')
  await page.getByRole('combobox', { name: 'Terminación del piso', exact: true }).selectOption('concrete')
  await capture('concrete')
  await page.getByRole('button', { name: 'Color de pared: Salvia', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Terminación del piso', exact: true }).selectOption('parquet')
  await page.getByLabel('Mostrar paredes completas', { exact: true }).check()
  await section('Puertas y ventanas')
  const beforeCover = await capture('finishes')
  await page.getByRole('combobox', { name: 'Cortina o persiana', exact: true }).selectOption('curtain')
  await page.getByLabel('Cierre de cortina o persiana').focus()
  await page.keyboard.press('End')
  const covered = await capture('curtains')
  expect(covered.equals(beforeCover)).toBe(false)
  await page.setViewportSize({ width: 390, height: 844 })
  await frames(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
