import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Actual public UI in an isolated browser. No seeded storage, API fixtures,
// CSS overrides, app hooks or inference requests are used for this recording.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium, expect } = createRequire(new URL('../apps/web/package.json', import.meta.url))('@playwright/test')
const baseURL = process.env.README_BASE_URL ?? 'http://127.0.0.1:5173'
const output = resolve(root, process.env.README_MEDIA_DIR ?? 'docs/media')
const fps = 8
assert.equal(spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status, 0, 'FFmpeg is required')
await mkdir(output, { recursive: true })
await mkdir(resolve(root, 'artifacts/readme'), { recursive: true })
const scratch = await mkdtemp(resolve(root, 'artifacts/readme/energy-'))
const browser = await chromium.launch({
  channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chromium', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const errors = []
let frameIndex = 0

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1,
    locale: 'en-GB', colorScheme: 'light',
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/#building`)
  await page.getByTestId('privacy-preferences').waitFor()
  if (await page.getByTestId('analytics-reject').isVisible()) await page.getByTestId('analytics-reject').click()
  await page.getByRole('button', { name: 'Building and sun', exact: true }).click()
  await page.getByRole('button', { name: 'Solar energy', exact: true }).click()
  await page.locator('canvas').waitFor()
  await page.locator('html').evaluate(element => element.ownerDocument.fonts.ready)
  await page.locator('#solar-date').fill('2026-09-22')
  await page.locator('#solar-time').fill('14:00')
  await page.locator('#solar-time').blur()
  await expect(page.locator('.building-energy-intro')).toContainText('12 / 12')
  await page.waitForTimeout(2200)

  async function align(locator) {
    await locator.evaluate(element => {
      const view = element.ownerDocument.defaultView
      view.scrollTo({ top: view.scrollY + element.getBoundingClientRect().top - 20, behavior: 'instant' })
    })
    await page.waitForTimeout(600)
  }
  async function hold(name, seconds) {
    const source = resolve(scratch, `${name}.png`)
    await page.screenshot({ path: source, scale: 'css' })
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
      await copyFile(source, resolve(scratch, `frame-${String(frameIndex++).padStart(4, '0')}.png`))
    }
    console.log(`Captured ${name}`)
  }
  async function study(name) {
    await page.getByRole('tab', { name, exact: true }).click()
    await align(page.locator('.energy-workbench'))
    await expect(page.getByText('Scenario estimate', { exact: true })).toBeVisible()
  }

  // Deliberate cuts between the existing roof and study sections keep the real
  // page layout intact. Pauses are edited for a short, readable README loop.
  await align(page.locator('.workspace'))
  await hold('roof-12-panels', 1.5)
  await study('Panels')
  await hold('panels-before', 1.5)
  await page.getByRole('spinbutton', { name: 'Number of panels', exact: true }).fill('18')
  await page.getByRole('spinbutton', { name: 'Number of panels', exact: true }).press('Enter')
  await expect(page.locator('.energy-roof-summary')).toContainText('18')
  await page.waitForTimeout(800)
  await hold('panels-after', 1)
  await align(page.locator('.workspace'))
  await expect(page.locator('.building-energy-intro')).toContainText('18 / 18')
  await hold('roof-18-panels', 1.5)
  await study('Year')
  await expect(page.locator('.energy-monthly-chart')).toBeVisible()
  await hold('year', 2.5)
  await study('Investment')
  await expect(page.locator('.energy-chart')).toBeVisible()
  await hold('investment', 3)
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`)
} finally {
  await browser.close()
}

const destination = resolve(output, 'solar-energy.gif')
const encoded = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps),
  '-i', resolve(scratch, 'frame-%04d.png'),
  '-filter_complex', '[0:v]scale=1100:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
  '-loop', '0', destination,
], { stdio: 'inherit' })
assert.equal(encoded.status, 0, 'FFmpeg could not encode solar-energy.gif')
const size = (await stat(destination)).size
assert.ok(size < 4 * 1024 * 1024, 'Keep the README animation below 4 MiB')
console.log(`Captured solar-energy.gif (${frameIndex / fps}s, ${(size / 1024 / 1024).toFixed(2)} MiB)`)
console.log(`Original frames retained at ${scratch}`)
