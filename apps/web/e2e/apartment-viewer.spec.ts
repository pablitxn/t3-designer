import { expect, test } from '@playwright/test'
import type { RootStore } from '@react-three/fiber'

test.use({ locale: 'en-GB', viewport: { width: 1284, height: 926 } })

test('apartment panels stay inside the viewer and preserve the scene and solar choices', async ({ page }) => {
  await page.goto('/#apartment')
  const viewer = page.locator('.apartment-viewer')
  const scene = await viewer.locator('.scene-surface').elementHandle()
  await expect(viewer.locator('.viewer-panel')).toHaveCount(0)
  await expect(page.locator('.model-caption')).toHaveCount(0)
  await expect(page.locator('.apartment-workspace > aside')).toHaveCount(0)
  const settings = viewer.getByRole('button', { name: 'View layers', exact: true })
  await settings.click()
  const panel = viewer.locator('#apartment-controls')
  await expect(panel).toHaveRole('dialog')
  await expect(panel).not.toHaveAttribute('aria-modal', 'true')
  await panel.getByRole('checkbox', { name: 'Labels', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(settings).toBeFocused()
  expect(await scene!.evaluate(element => element.isConnected)).toBe(true)
  await settings.click()
  await expect(panel.getByRole('checkbox', { name: 'Labels', exact: true })).toBeChecked()
  await panel.getByRole('checkbox', { name: 'Fixtures', exact: true }).uncheck()
  await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await settings.click()
  await expect(panel.getByRole('checkbox', { name: 'Fixtures', exact: true })).toBeChecked()
  await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  const sun = viewer.getByRole('button', { name: 'Date and sun path', exact: true })
  await sun.click()
  await panel.locator('#solar-time').fill('16:30')
  await page.keyboard.press('Escape')
  await expect(sun).toBeFocused()
  await sun.click()
  await expect(panel.locator('#solar-time')).toHaveValue('16:30')
  expect(await scene!.evaluate(element => element.isConnected)).toBe(true)
  const [outer, inner] = await Promise.all([viewer.boundingBox(), panel.boundingBox()])
  expect(inner!.x).toBeGreaterThan(outer!.x)
  expect(inner!.x + inner!.width).toBeLessThan(outer!.x + outer!.width)
  await page.screenshot({ path: '/tmp/t3-apartment-overlay-desktop.png', fullPage: true })
})

test('closing furniture controls and expanding preserves editing; Escape closes panel before fullscreen', async ({ page }) => {
  await page.goto('/#apartment')
  const viewer = page.locator('.apartment-viewer')
  const furniture = viewer.getByRole('button', { name: 'Rearrange furniture', exact: true })
  await furniture.click()
  await page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button').click()
  const surface = viewer.locator('.scene-surface')
  await surface.focus()
  await surface.press('r')
  const scene = await surface.elementHandle()
  const rotation = () => page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!).placements[0].rotation as number)
  expect(await rotation()).toBeCloseTo(Math.PI / 2)
  await page.keyboard.press('Escape')
  await expect(viewer.locator('.viewer-panel')).toHaveCount(0)
  expect(await scene!.evaluate(element => element.isConnected)).toBe(true)
  await furniture.click()
  await expect(page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  expect(await rotation()).toBeCloseTo(Math.PI / 2)
  await viewer.getByRole('button', { name: 'Expand view', exact: true }).click()
  await expect(viewer).toHaveClass(/is-expanded/)
  await expect(viewer.locator('.viewer-panel')).toHaveCount(0)
  expect(await scene!.evaluate(element => element.isConnected)).toBe(true)
  const bounds = await viewer.boundingBox()
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 1284, height: 926 })
  await furniture.click()
  await expect(page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  expect(await rotation()).toBeCloseTo(Math.PI / 2)
  await page.keyboard.press('Escape')
  await expect(viewer.locator('.viewer-panel')).toHaveCount(0)
  await expect(viewer).toHaveClass(/is-expanded/)
  await page.keyboard.press('Escape')
  await expect(viewer).not.toHaveClass(/is-expanded/)
  await expect(viewer.getByRole('button', { name: 'Expand view', exact: true })).toBeFocused()
})

test('apartment controls remain reachable at the narrow annotated viewport', async ({ page }) => {
  await page.setViewportSize({ width: 605, height: 926 })
  await page.goto('/#apartment')
  const viewer = page.locator('.apartment-viewer')
  await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button').click()
  const panel = viewer.locator('.viewer-panel')
  const bounds = await panel.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(605)
  await viewer.locator('.scene-surface').focus()
  await viewer.locator('.scene-surface').press('r')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!).placements[0])
  expect(saved.id).toBe('living-table')
  expect(saved.rotation).toBeCloseTo(Math.PI / 2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-apartment-overlay-605.png', fullPage: true })
})

test('sun and furniture panels retain the Canvas, camera, lighting and fixture instances', { tag: '@webgl' }, async ({ playwright, baseURL }) => {
    test.setTimeout(180_000)
    // Only this regression needs WebGL; keep the ordinary panel tests on the fast fallback.
    const browser = await playwright.chromium.launch({ ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
    const page = await browser.newPage({ baseURL, locale: 'en-GB', viewport: { width: 1284, height: 926 } })
    try {
    const loaded = page.waitForResponse(response => response.url().endsWith('/models/current/low-table.glb') && response.ok())
    await page.goto('/#apartment')
    const viewer = page.locator('.apartment-viewer')
    const canvas = viewer.locator('.scene-surface canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await loaded
    // Read the active Vite module's R3F store; do not add test-only state to the application.
    const store = await page.evaluateHandle(async () => {
      const module = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
      if (!module) throw new Error('The active React Three Fiber module was not loaded')
      const fiber = await import(module.name)
      return fiber._roots.get(document.querySelector('.scene-surface canvas')).store as RootStore
    })
    await expect.poll(() => store.evaluate(store => !!store.getState().scene.getObjectByName('living-table')?.children.length)).toBe(true)
    const initialPose = await store.evaluate(store => store.getState().camera.position.toArray())
    await canvas.hover({ position: { x: 30, y: 220 } })
    await page.mouse.wheel(0, -180)
    await expect.poll(() => store.evaluate(store => store.getState().camera.position.toArray())).not.toEqual(initialPose)
    await store.evaluate(async store => {
      const previous = store.getState().camera.position.clone()
      for (let frame = 0; frame < 180; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const position = store.getState().camera.position
        if (frame > 5 && previous.distanceToSquared(position) < 1e-12) return
        previous.copy(position)
      }
      throw new Error('The orbit camera did not settle')
    })
    const original = await store.evaluateHandle(store => {
      const { camera, gl, scene } = store.getState()
      const fixture = scene.getObjectByName('living-table')!
      return { store, canvas: gl.domElement, camera, renderer: gl, fixture, light: scene.children.find(child => child.type === 'DirectionalLight')!, position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }
    })
    const pose = await original.evaluate(original => ({ position: original.position, quaternion: original.quaternion }))
    async function expectScenePreserved() {
      expect(await original.evaluate(original => {
        const current = original.store.getState()
        return original.canvas.isConnected && current.gl.domElement === original.canvas && current.gl === original.renderer && current.camera === original.camera && current.scene.getObjectByName('living-table') === original.fixture && current.scene.children.includes(original.light)
      })).toBe(true)
      const current = await store.evaluate(store => ({ position: store.getState().camera.position.toArray(), quaternion: store.getState().camera.quaternion.toArray() }))
      for (const [index, value] of pose.position.entries()) expect(current.position[index]).toBeCloseTo(value, 7)
      for (const [index, value] of pose.quaternion.entries()) expect(current.quaternion[index]).toBeCloseTo(value, 7)
      await expect(canvas).toHaveCount(1)
    }
    await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
    await page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button').click()
    await expectScenePreserved()
    await viewer.locator('.scene-surface').focus()
    await viewer.locator('.scene-surface').press('r')
    await expect.poll(() => original.evaluate(original => original.fixture.rotation.y)).toBeCloseTo(Math.PI / 2)
    await expectScenePreserved()
    const lightBefore = await original.evaluate(original => original.light.position.toArray())
    await viewer.getByRole('button', { name: 'Date and sun path', exact: true }).click()
    await page.locator('#solar-date').fill('2026-06-21')
    await page.locator('#solar-time').fill('16:30')
    await expect.poll(() => original.evaluate(original => original.light.position.toArray())).not.toEqual(lightBefore)
    await expectScenePreserved()
    await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
    await expect(page.locator('.arrangement-catalog-card[data-fixture-id="living-table"]').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    await expectScenePreserved()
    await viewer.getByRole('button', { name: 'Date and sun path', exact: true }).click()
    await expect(page.locator('#solar-time')).toHaveValue('16:30')
    await page.keyboard.press('Escape')
    await expectScenePreserved()
    await viewer.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
    for (const id of ['demo-strandmon-v1', 'demo-dyvlinge-v2', 'demo-fagelfjallet-v1']) {
      await page.locator(`.arrangement-catalog-card[data-fixture-id="${id}"]`).getByRole('checkbox').check()
      // Wait for the actual GLB scene, not just the selectable bounding box.
      await expect.poll(() => store.evaluate((store, id) => !!store.getState().scene.getObjectByName(id)?.children.some(child => child.type === 'Group' && child.children.length > 0), id), { timeout: 30_000 }).toBe(true)
      await expectScenePreserved()
    }
    await page.locator('.arrangement-catalog-card[data-fixture-id="b-washer"]').getByRole('checkbox').uncheck()
    await expect.poll(() => store.evaluate(store => !!store.getState().scene.getObjectByName('b-washer'))).toBe(false)
    await expect.poll(() => store.evaluate(store => !!store.getState().scene.getObjectByName('P02 butcher-block washer cap'))).toBe(false)
    await expectScenePreserved()
    await page.getByRole('button', { name: 'Walkthrough', exact: true }).click()
    await expect(page.locator('.walkthrough canvas')).toBeVisible({ timeout: 30_000 })
    // A lazy route may load a newer Vite dependency revision. Resolve the store
    // owning this canvas instead of retaining the first module URL from the visit.
    await expect.poll(() => page.evaluate(async () => {
      const modules = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/@react-three_fiber.js'))
      for (const module of modules.reverse()) {
        const fiber = await import(module.name)
        if (fiber._roots.get(document.querySelector('.walkthrough canvas'))?.store) return true
      }
      return false
    }), { timeout: 30_000 }).toBe(true)
    const walkStore = await page.evaluateHandle(async () => {
      const modules = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/@react-three_fiber.js'))
      for (const module of modules.reverse()) {
        const fiber = await import(module.name)
        const store = fiber._roots.get(document.querySelector('.walkthrough canvas'))?.store as RootStore | undefined
        if (store) return store
      }
      throw new Error('The walkthrough renderer was not registered')
    })
    for (const id of ['demo-strandmon-v1', 'demo-dyvlinge-v2', 'demo-fagelfjallet-v1']) {
      await expect.poll(() => walkStore.evaluate((store, id) => !!store.getState().scene.getObjectByName(id)?.children.some(child => child.type === 'Group' && child.children.length > 0), id), { timeout: 30_000 }).toBe(true)
    }
    expect(await walkStore.evaluate(store => !!store.getState().scene.getObjectByName('b-washer'))).toBe(false)
    } finally { await browser.close() }
})
