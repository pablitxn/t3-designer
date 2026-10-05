import { expect, test } from '@playwright/test'
import { DEMO_GOOGLE_MAPS_URL } from '../src/data/demo-location'

test.setTimeout(60_000)

const tilePattern = 'https://tile.openstreetmap.org/**'
// Tests exercise the renderer against a local response, never OSM's tile fleet.
const tileImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4ee3cfwAIRgNtAogY2wAAAABJRU5ErkJggg==', 'base64')

test.use({
  locale: 'en-GB',
  reducedMotion: 'reduce',
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Exercise MapLibre's real WebGL renderer without also compiling the entire
    // apartment in software before the user can select Map. The 3D suite owns it.
    const getContext = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, contextId: string, options: unknown) {
        if (contextId === 'webgl2' && !this.classList.contains('maplibregl-canvas')) return null
        return Reflect.apply(getContext, this, [contextId, options])
      },
    })
    const fetch = window.fetch
    const tileRequests: { cache: RequestCache; credentials: RequestCredentials }[] = []
    Reflect.set(window, '__mapTileRequests', tileRequests)
    window.fetch = (input, options) => {
      const request = new Request(input, options)
      if (request.url.startsWith('https://tile.openstreetmap.org/')) tileRequests.push({ cache: request.cache, credentials: request.credentials })
      return fetch(input, options)
    }
  })
})

test('street map loads on demand and keeps its demo marker, recentering and attribution @webgl', async ({ page, baseURL }) => {
  const requests: { referer: string | undefined; zoom: number }[] = []
  await page.route(tilePattern, async route => {
    const headers = await route.request().allHeaders()
    requests.push({ referer: headers.referer, zoom: Number(new URL(route.request().url()).pathname.split('/')[1]) })
    await route.fulfill({ contentType: 'image/png', body: tileImage, headers: { 'Cache-Control': 'public, max-age=604800' } })
  })
  await page.goto('/#building')
  // Production's default policy remains no-referrer for other app traffic.
  await page.evaluate(() => {
    const policy = document.createElement('meta')
    policy.name = 'referrer'
    policy.content = 'no-referrer'
    document.head.append(policy)
  })
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeVisible({ timeout: 20_000 })
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.building-map')).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 })
  await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://www.openstreetmap.org/copyright"]')).toBeVisible()
  await expect(page.getByText('Quimper · example location', { exact: true })).toBeVisible()
  await expect(page.locator('.building-map-context')).toContainText('Illustrative demo point on Place Saint-Corentin')
  await expect(page.locator('.building-map-actions').getByRole('link', { name: 'Open Google Maps' })).toHaveAttribute('href', DEMO_GOOGLE_MAPS_URL)
  const marker = page.getByRole('img', { name: 'Place Saint-Corentin · example location', exact: true })
  await expect(marker).toHaveCount(1)
  await expect(marker).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    expect(request.referer).toBe(`${new URL(baseURL!).origin}/`)
    expect(request.zoom).toBeGreaterThanOrEqual(16)
  }
  // Routing disables Playwright's HTTP cache, so inspect the app's Request
  // options before that test-only override rather than the outgoing cache header.
  const tileRequests = await page.evaluate(() => Reflect.get(window, '__mapTileRequests')) as { cache: string; credentials: string }[]
  expect(tileRequests.length).toBeGreaterThan(0)
  expect(tileRequests.every(request => request.cache === 'default' && request.credentials === 'same-origin')).toBe(true)

  const initial = (await marker.boundingBox())!
  const canvas = page.locator('.maplibregl-canvas')
  const pan = async () => {
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width * .65, box.y + box.height * .4)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .76, box.y + box.height * .45, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - initial.x)).toBeGreaterThan(40)
  }
  const expectCentered = () => expect.poll(async () => {
    const box = (await marker.boundingBox())!
    return Math.hypot(box.x - initial.x, box.y - initial.y)
  }).toBeLessThan(1)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await pan()
  await page.getByRole('button', { name: 'Center location', exact: false }).click()
  await expectCentered()
  await pan()
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expectCentered()
  await page.getByRole('button', { name: 'Perspective', exact: true }).click()
  await expect(page.locator('.building-map')).toHaveCount(0)
})

test('map tile errors have a retry action that recovers @webgl', async ({ page }) => {
  await page.route(tilePattern, route => route.abort('failed'))
  await page.goto('/#building')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.building-map')).toHaveAttribute('data-map-state', 'failed', { timeout: 20_000 })
  await expect(page.locator('.building-map-state').getByRole('link', { name: 'Open Google Maps' })).toHaveAttribute('href', DEMO_GOOGLE_MAPS_URL)
  await page.unroute(tilePattern)
  await page.route(tilePattern, route => route.fulfill({ contentType: 'image/png', body: tileImage }))
  await page.locator('.building-map-state').getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.building-map')).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 })
  await expect(page.locator('.building-map-warning')).toHaveCount(0)
})
