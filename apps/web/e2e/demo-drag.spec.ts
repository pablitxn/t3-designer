import { expect, test } from '@playwright/test'
import type { RootStore } from '@react-three/fiber'
import { currentFixtures, assetCatalog } from '../src/data/current-state'
import { arrangementCard, selectedArrangementId } from './arrangement-helpers'

// The shared apartment/solar scene spends up to 50s preparing software WebGL.
// Keep the real geometry and camera, and use the same bounded CI budget locally.
test.setTimeout(180_000)
test.use({ locale: 'es-AR', viewport: { width: 1284, height: 926 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } })

for (const mode of ['top', '3d'] as const) test(`public ${mode} WebGL drag saves furniture and refuses fixed installations`, { tag: '@webgl' }, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const loaded = page.waitForResponse(response => response.url().endsWith('/models/current/low-table.glb') && response.ok())
  await page.goto('/#apartment')
  const canvas = page.locator('.scene-surface canvas')
  await canvas.waitFor({ state: 'attached' })
  // Project from the actual persistent apartment camera, including user/view transitions.
  const store = await page.evaluateHandle(async () => {
    const module = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
    if (!module) throw new Error('The active React Three Fiber module was not loaded')
    const fiber = await import(module.name)
    const canvas = document.querySelector('.scene-surface canvas')
    while (!fiber._roots.get(canvas)?.store.getState().gl) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const store = fiber._roots.get(canvas).store as RootStore
    const { gl, setDpr, invalidate } = store.getState()
    setDpr(.5)
    gl.shadowMap.enabled = false
    gl.shadowMap.autoUpdate = false
    invalidate()
    return store
  })
  await loaded
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await page.getByRole('button', { name: mode === '3d' ? 'Perspectiva' : 'Planta', exact: true }).click()
  await page.keyboard.press('Escape')
  async function point(id: string) {
    // The public page has content above the scene. Rendering and reset controls
    // can change document scrolling, so every gesture needs a fresh viewport.
    await expect(canvas).toBeInViewport({ ratio: .99 })
    const fixture = currentFixtures.find(item => item.id === id)!, asset = assetCatalog.find(item => item.id === fixture.assetId)!
    const local = await store.evaluate(async (store, { id, height }) => {
      // This is a hit-testing/history check, not a lighting or image-quality check.
      store.getState().setDpr(.5)
      store.getState().gl.shadowMap.enabled = false
      store.getState().gl.shadowMap.autoUpdate = false
      store.getState().invalidate()
      const previous = store.getState().camera.position.clone()
      let settled = false
      for (let frame = 0; frame < 180; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const position = store.getState().camera.position
        if (frame > 5 && previous.distanceToSquared(position) < 1e-12) { settled = true; break }
        previous.copy(position)
      }
      if (!settled) throw new Error('The apartment camera did not settle')
      const { camera, scene, size } = store.getState()
      camera.updateMatrixWorld()
      const projected = scene.getObjectByName(id)!.position.clone()
      projected.y += height / 2
      projected.project(camera)
      return { x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2 }
    }, { id, height: asset.dimensions[1] })
    await canvas.hover({ position: local })
    const visibleRect = (await canvas.boundingBox())!
    return { x: visibleRect.x + local.x, y: visibleRect.y + local.y, local }
  }
  const first = await point('living-table')
  // Confirm the camera and object picker are ready through a real pointer hit,
  // before the independent movement and persistence assertions below.
  await canvas.click({ position: first.local })
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expect(arrangementCard(page, 'living-table').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  const table = await point('living-table')
  await page.mouse.move(table.x, table.y); await page.mouse.down()
  await page.mouse.move(table.x - 24, table.y - 12); await page.mouse.up()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expect(arrangementCard(page, 'living-table').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!))
  expect(stored).toMatchObject({ version: 2, hidden: [], added: [] })
  expect(stored.placements).toHaveLength(1)
  expect(stored.placements[0].id).toBe('living-table')
  expect(stored.placements[0].position).not.toEqual(currentFixtures.find(item => item.id === 'living-table')!.position)
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  await page.keyboard.press('Escape')
  // Fixed objects are selectable, but pointer motion must never persist a transform.
  const installation = await point('wc-toilet')
  await page.mouse.move(installation.x, installation.y); await page.mouse.down()
  await page.mouse.move(installation.x - 16, installation.y - 8); await page.mouse.up()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  // In perspective, another fixed installation can occlude this projected center.
  // Check the actual pointer selection and its transform, rather than an invisible target.
  const selectedId = await selectedArrangementId(page)
  const selected = currentFixtures.find(fixture => fixture.id === selectedId)
  expect(selected?.mobility).toBe('fixed')
  const transform = await store.evaluate((store, id) => {
    const fixture = store.getState().scene.getObjectByName(id)!
    return { position: fixture.position.toArray(), rotation: fixture.rotation.y }
  }, selectedId)
  expect(transform.position).toEqual(selected!.position)
  expect(transform.rotation).toBe(selected!.rotation)
  await expect(page.getByText('Esta instalación forma parte del departamento y conserva su posición.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))).toBeNull()
  expect(errors).toEqual([])
})
