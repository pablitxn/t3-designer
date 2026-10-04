import { expect, test } from '@playwright/test'
import { apartmentBounds } from '@t3-designer/geometry'
import { PerspectiveCamera, Vector3 } from 'three'
import { currentFixtures, assetCatalog } from '../src/data/current-state'
import { t3Apartment } from '../src/data/t3'

// Software WebGL on CI can finish the saved drag and reset near 90 seconds;
// leave time for the final real-pointer check of the fixed installation too.
test.setTimeout(process.env.CI ? 180_000 : 90_000)
test.use({ locale: 'es-AR', viewport: { width: 1280, height: 900 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } })

for (const mode of ['top', '3d'] as const) test(`public ${mode} WebGL drag saves furniture and refuses fixed installations`, { tag: '@webgl' }, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const loaded = page.waitForResponse(response => response.url().endsWith('/models/current/low-table.glb') && response.ok())
  await page.goto('/#apartment')
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  if (mode === '3d') await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.locator('.editor-scene canvas')
  await expect(canvas).toBeVisible()
  await loaded
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  async function point(id: string) {
    // The public page has content above the scene. Rendering and reset controls
    // can change document scrolling, so every gesture needs a fresh viewport.
    await canvas.scrollIntoViewIfNeeded()
    await expect(canvas).toBeInViewport({ ratio: .99 })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const rect = (await canvas.boundingBox())!, bounds = apartmentBounds(t3Apartment)
    const span = Math.max(bounds.depth, bounds.width / (rect.width / rect.height), 2)
    const camera = new PerspectiveCamera(42, rect.width / rect.height, .05, 500)
    camera.position.set(bounds.center[0] + (mode === 'top' ? 0 : span * .65), span * (mode === 'top' ? 1.6 : 1.2), bounds.center[1] + (mode === 'top' ? .01 : span * .85))
    camera.lookAt(bounds.center[0], 0, bounds.center[1]); camera.updateMatrixWorld()
    const fixture = currentFixtures.find(item => item.id === id)!, asset = assetCatalog.find(item => item.id === fixture.assetId)!
    const projected = new Vector3(fixture.position[0], fixture.position[1] + asset.dimensions[1] / 2, fixture.position[2]).project(camera)
    const local = { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 }
    await canvas.hover({ position: local })
    const visibleRect = (await canvas.boundingBox())!
    return { x: visibleRect.x + local.x, y: visibleRect.y + local.y, local }
  }
  const first = await point('living-table')
  // Confirm the camera and object picker are ready through a real pointer hit,
  // before the independent movement and persistence assertions below.
  await canvas.click({ position: first.local })
  await expect(page.getByLabel('Objetos del departamento')).toHaveValue('living-table')
  const table = await point('living-table')
  await page.mouse.move(table.x, table.y); await page.mouse.down()
  await page.mouse.move(table.x - 24, table.y - 12, { steps: 8 }); await page.mouse.up()
  await expect(page.getByLabel('Objetos del departamento')).toHaveValue('living-table')
  await expect(page.getByRole('region', { name: 'Tu distribución de la demo' }).getByRole('status')).toContainText('Distribución guardada')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!))
  expect(stored.placements).toHaveLength(1)
  expect(stored.placements[0].id).toBe('living-table')
  expect(stored.placements[0].position).not.toEqual(currentFixtures.find(item => item.id === 'living-table')!.position)
  await page.screenshot({ path: `/tmp/t3-public-arrangement-${mode}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  // Fixed objects are selectable, but pointer motion must never persist a transform.
  const toilet = await point('wc-toilet')
  await page.mouse.move(toilet.x, toilet.y); await page.mouse.down()
  await page.mouse.move(toilet.x - 16, toilet.y - 8, { steps: 5 }); await page.mouse.up()
  await expect(page.getByLabel('Objetos del departamento')).toHaveValue('wc-toilet')
  await expect(page.getByLabel('Posición X (m)', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))).toBeNull()
  expect(errors).toEqual([])
})
