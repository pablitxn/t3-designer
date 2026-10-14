import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSolarControls } from './viewer-helpers'
import { selectArrangementObject } from './arrangement-helpers'

test.use({ launchOptions: {
  ...(process.env.T3_ANONYMOUS_EXECUTABLE ? { executablePath: process.env.T3_ANONYMOUS_EXECUTABLE } : {}),
  ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}),
  ...(process.env.T3_ANONYMOUS_BROWSER === 'webkit' ? {} : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }),
} })

test.afterEach(async ({ page, browser }, info) => {
  await info.attach('environment', { body: JSON.stringify({ engine: browser.version(), viewport: page.viewportSize(),
    emulation: await page.evaluate(() => ({ touchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia('(pointer: coarse)').matches })).catch(() => null), renderer: 'SwiftShader; DPR .5; shadows disabled for interaction coverage' }), contentType: 'application/json' })
})

async function evidence(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`)
  if (name === 'object-webgl') await page.locator('.workshop-model').screenshot({ path, timeout: 90_000 })
  else await page.screenshot({ path, fullPage: true, timeout: 90_000 })
  await info.attach(name, { path, contentType: 'image/png' })
}
async function controlRenderer(page: Page, selector: string) {
  await expect(page.locator(`${selector} canvas`)).toBeVisible({ timeout: 30_000 })
  await page.locator(`${selector} canvas`).evaluate(async canvas => {
    const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
    if (!resource) throw new Error('Missing active Fiber module')
    const { _roots } = await import(resource.name)
    let state = _roots.get(canvas)?.store.getState()
    while (!state?.gl) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); state = _roots.get(canvas)?.store.getState() }
    // Software-rendered interaction check only; no geometry/fidelity assessment.
    state.setDpr(.5); state.gl.shadowMap.enabled = false; state.invalidate()
  })
  if (selector === '.workshop-model') {
    await page.locator(`${selector} canvas`).scrollIntoViewIfNeeded()
    // A mounted Canvas can still be blank while the GLB is loading. Require
    // an actual loaded mesh before capturing the existing model's controls.
    await expect.poll(() => page.locator(`${selector} canvas`).evaluate(async canvas => {
      const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))!
      const { _roots } = await import(resource.name)
      const state = _roots.get(canvas).store.getState()
      let meshes = 0
      state.scene.traverse((node: { isMesh?: boolean }) => { if (node.isMesh) meshes++ })
      if (meshes) { state.gl.render(state.scene, state.camera); state.invalidate() }
      return meshes
    }), { timeout: 30_000 }).toBeGreaterThan(0)
  }
}

test('apartment software WebGL camera, rotation and expansion use existing assets', { tag: '@webgl' }, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#apartment'); await controlRenderer(page, '.scene-surface')
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Floor plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await selectArrangementObject(page, 'living-table')
  await page.getByRole('button', { name: 'Rotate 90° left', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!).placements[0].rotation)).toBeCloseTo(Math.PI / 2)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Expand view', exact: true }).click()
  await expect(page.locator('.apartment-viewer')).toHaveAttribute('aria-modal', 'true')
  await evidence(page, info, 'apartment-webgl')
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})

test('building software WebGL solar controls keep the existing scene usable', { tag: '@webgl' }, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#building'); await controlRenderer(page, '.building-scene-surface')
  await openSolarControls(page); await page.locator('#solar-time').fill('21:00')
  await expect(page.locator('.building-viewport')).toHaveClass(/is-night/)
  await evidence(page, info, 'building-webgl')
  expect(errors).toEqual([])
})

test('gallery software WebGL opens an existing model and responds to orbit gestures', { tag: '@webgl' }, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#assets')
  await page.locator('.workshop-preview-tabs button').last().click(); await controlRenderer(page, '.workshop-model')
  const canvas = page.locator('.workshop-model canvas')
  const position = () => canvas.evaluate(async canvas => {
    const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))!
    const { _roots } = await import(resource.name)
    return _roots.get(canvas).store.getState().camera.position.toArray() as number[]
  })
  const before = await position(), rect = (await canvas.boundingBox())!
  const x = rect.x + rect.width / 2, y = Math.max(20, Math.min(page.viewportSize()!.height - 40, rect.y + rect.height / 2))
  if (info.project.use.hasTouch && info.project.use.browserName === 'chromium') {
    const input = await page.context().newCDPSession(page)
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y: y + 10 }] })
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach()
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 10, { steps: 3 }); await page.mouse.up()
  }
  await expect.poll(async () => JSON.stringify(await position())).not.toBe(JSON.stringify(before))
  await evidence(page, info, 'object-webgl')
  expect(errors).toEqual([])
})

async function openVisit(page: Page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('QA fallback', 'NotAllowedError'))
    HTMLElement.prototype.requestFullscreen = () => Promise.reject(new DOMException('QA fullscreen denied', 'NotAllowedError'))
  })
  await page.goto('/#walkthrough'); await controlRenderer(page, '[data-testid="walkthrough"]')
  const visit = page.getByTestId('walkthrough')
  await expect(visit.locator('.walk-primary')).toBeVisible({ timeout: 30_000 })
  return visit
}

async function entryUncovered(page: Page) {
  const visit = page.getByTestId('walkthrough')
  await visit.locator('.walk-primary').scrollIntoViewIfNeeded()
  const uncovered = await visit.evaluate(root => {
    const card = root.querySelector<HTMLElement>('.walk-start-card')!, map = root.querySelector<HTMLElement>('.walk-map-wrap')!
    const a = card.getBoundingClientRect(), b = map.getBoundingClientRect()
    const left = Math.max(a.left, b.left, 0), right = Math.min(a.right, b.right, innerWidth)
    const top = Math.max(a.top, b.top, 0), bottom = Math.min(a.bottom, b.bottom, innerHeight)
    if (left >= right || top >= bottom) return true
    // Include the noninteractive map in hit testing to verify actual paint
    // order, then restore behavior. No fixed z-index or snapshot assertion.
    const pointerEvents = map.style.pointerEvents
    map.style.pointerEvents = 'auto'
    const topmost = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
    map.style.pointerEvents = pointerEvents
    return !!topmost && card.contains(topmost)
  })
  expect(uncovered, 'The minimap must not paint over the entry instructions or button').toBe(true)
}

test('public walkthrough movement, jump, pause/resume and return never write private data', { tag: '@webgl' }, async ({ page }, info) => {
  const errors: string[] = [], privateRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) privateRequests.push(request.url()) })
  const visit = await openVisit(page)
  await visit.getByRole('button', { name: 'Set up your visit', exact: true }).click()
  const settings = visit.locator('#walk-settings')
  await settings.getByRole('combobox', { name: 'Starting point', exact: true }).selectOption('living')
  await settings.getByLabel('On-screen controls', { exact: true }).check()
  await page.keyboard.press('Escape')
  await visit.locator('.walk-primary').click(); await expect(visit).toHaveAttribute('data-active', 'true')
  const map = visit.locator('.walk-map > g')
  await expect(map).toHaveCount(1)
  const translation = async () => (await map.getAttribute('transform'))?.split(' rotate(')[0]
  const before = await translation()
  const forward = visit.getByRole('button', { name: 'Move forward', exact: true })
  await forward.scrollIntoViewIfNeeded()
  const rect = (await forward.boundingBox())!
  if (info.project.use.hasTouch && info.project.use.browserName === 'chromium') {
    const input = await page.context().newCDPSession(page)
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] })
    await expect.poll(translation).not.toBe(before)
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach()
  } else {
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down()
    await expect.poll(translation).not.toBe(before); await page.mouse.up()
  }
  await visit.getByRole('button', { name: 'Jump', exact: true }).click()
  await expect(visit.locator('.walk-map')).toHaveAttribute('data-grounded', 'false')
  // Physics advances on real rendered frames; slow software WebGL can take
  // tens of seconds to complete the same jump. Keep the landing assertion.
  await expect(visit.locator('.walk-map')).toHaveAttribute('data-grounded', 'true', { timeout: 60_000 })
  await page.keyboard.press('Escape'); await expect(visit).toHaveAttribute('data-active', 'false')
  await visit.locator('.walk-primary').click(); await expect(visit).toHaveAttribute('data-active', 'true')
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(visit).toHaveAttribute('data-active', 'false')
  await evidence(page, info, 'walkthrough-movement')
  await visit.getByRole('button', { name: /Back to/ }).click()
  await expect(page.locator('.apartment-viewer')).toBeVisible({ timeout: 30_000 })
  expect(privateRequests).toEqual([]); expect(errors).toEqual([])
})

test('walkthrough settings validate time, name sliders and recover from denied fullscreen', { tag: '@webgl' }, async ({ page }, info) => {
  const visit = await openVisit(page)
  await visit.getByRole('button', { name: 'Set up your visit', exact: true }).click()
  const settings = visit.locator('#walk-settings')
  await settings.getByRole('combobox', { name: 'Starting point', exact: true }).selectOption('living')
  await settings.getByLabel('Help flashlight', { exact: true }).check()
  await settings.getByLabel('Design lights', { exact: true }).uncheck()
  for (const [label, value] of [['Eye height', '1.7'], ['Field of view', '71'], ['Mouse sensitivity', '1.1']]) {
    const slider = settings.getByRole('slider', { name: new RegExp(`^${label}`) })
    await slider.press('ArrowRight'); await expect(slider).toHaveValue(value)
  }
  await settings.locator('input[type="date"]').fill('')
  await page.keyboard.press('Escape'); await expect(visit.locator('.walk-primary')).toBeDisabled()
  await visit.getByRole('button', { name: 'Set up your visit', exact: true }).click()
  await settings.locator('input[type="date"]').fill('2026-10-13')
  await settings.locator('input[type="time"]').fill('14:00')
  await settings.getByRole('button', { name: /Restore design time/ }).click()
  await settings.getByRole('button', { name: /Return to start/ }).click()
  await page.keyboard.press('Escape'); await expect(visit.locator('.walk-primary')).toBeEnabled()
  await expect(visit.locator('.walk-primary')).toContainText('Enter the apartment')
  await visit.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await expect(visit.getByRole('status')).toContainText('The browser could not open fullscreen.')
  await evidence(page, info, 'walkthrough-settings-webgl')
})

test('walkthrough entry instructions stay above the minimap and the active map remains visible', { tag: '@webgl' }, async ({ page }, info) => {
  const visit = await openVisit(page)
  await entryUncovered(page)
  await evidence(page, info, 'walkthrough-entry')
  await visit.locator('.walk-primary').click(); await expect(visit).toHaveAttribute('data-active', 'true')
  await expect(visit.locator('.walk-map')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(visit).toHaveAttribute('data-active', 'false')
  await entryUncovered(page)
})

test('an unavailable bundled model shows a fallback and another existing version still opens', { tag: '@webgl' }, async ({ page }, info) => {
  await page.route('**/demo-assets/dyvlinge-v2/model.glb', route => route.abort('connectionreset'))
  await page.goto('/#assets'); await page.getByRole('button', { name: 'Review DYVLINGE', exact: true }).click()
  await page.locator('.workshop-preview-tabs button').last().click()
  await expect(page.locator('.workshop-preview').getByRole('status')).toContainText('We could not open the 3D view.')
  await evidence(page, info, 'model-response-loss')
  await page.locator('#public-asset-version').selectOption('dyvlinge-v1')
  await controlRenderer(page, '.workshop-model')
  await expect(page.locator('.workshop-preview').getByRole('status')).toHaveCount(0)
  await page.unroute('**/demo-assets/dyvlinge-v2/model.glb')
  await page.reload(); await page.getByRole('button', { name: 'Review DYVLINGE', exact: true }).click()
  await page.locator('.workshop-preview-tabs button').last().click(); await controlRenderer(page, '.workshop-model')
  await expect(page.locator('.workshop-preview').getByRole('status')).toHaveCount(0)
})
