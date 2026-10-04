import { createRequire } from 'node:module'
import { mkdir, mkdtemp, copyFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Reuse the web workspace's pinned Playwright; no extra package or app hooks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(new URL('../apps/web/package.json', import.meta.url))('@playwright/test')
const baseURL = process.env.README_BASE_URL ?? 'http://127.0.0.1:5173'
const output = resolve(root, process.env.README_MEDIA_DIR ?? 'docs/media')
const date = '2026-09-22'
const fps = 8
const framesPerScene = 56

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('Install FFmpeg on PATH before capturing the README media.')
}
await mkdir(output, { recursive: true })
await mkdir(resolve(root, 'artifacts/readme'), { recursive: true })
const scratch = await mkdtemp(resolve(root, 'artifacts/readme/capture-'))
const browser = await chromium.launch({ channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chromium', headless: true })
const errors = []

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, locale: 'en-GB', colorScheme: 'light',
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/#apartment`)
  await page.getByTestId('privacy-preferences').waitFor()
  if (await page.getByTestId('analytics-reject').isVisible()) await page.getByTestId('analytics-reject').click()
  await page.locator('canvas').waitFor()
  await page.locator('html').evaluate(element => element.ownerDocument.fonts.ready)
  await page.locator('#solar-date').fill(date)

  async function time(value) {
    await page.locator('#solar-time').fill(value)
    await page.locator('#solar-time').blur()
    await page.locator('#solar-time').evaluate(element => { element.scrollLeft = 0 })
    // Let React and the on-demand WebGL shadow render reach the compositor.
    await page.waitForTimeout(180)
  }
  async function settle() {
    await page.waitForTimeout(1800)
  }
  async function still(name) {
    await settle()
    await page.locator('.workspace').screenshot({ path: resolve(output, name) })
    console.log(`Captured ${name}`)
  }

  await time('16:00')
  await page.getByRole('button', { name: 'Rooms 8', exact: true }).click()
  await settle()
  const canvas = await page.locator('canvas').boundingBox()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await page.mouse.wheel(0, -110)
  await still('apartment-overview.png')

  await page.getByRole('button', { name: 'Building and sun', exact: true }).click()
  await page.getByRole('button', { name: 'Show interior', exact: true }).click()
  await still('building-context.png')

  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await settle()
  const hero = await page.locator('.dossier-hero').boundingBox()
  const cards = await page.locator('.dossier-overview-grid').boundingBox()
  await page.screenshot({
    path: resolve(output, 'property-dossier.png'), fullPage: true,
    clip: { x: 0, y: hero.y - 12, width: 1440, height: Math.ceil(cards.y + cards.height - hero.y + 28) },
  })
  console.log('Captured property-dossier.png')

  // Screenshot each real UI time selection; encode an intentionally accelerated
  // two-scene study. The Play button and runtime animation speed are unchanged.
  await page.setViewportSize({ width: 1440, height: 1000 })
  let frameIndex = 0
  let frameSize
  async function frame() {
    const box = await page.locator('.workspace').boundingBox()
    frameSize ??= { width: box.width, height: Math.floor(box.height) }
    if (box.width !== frameSize.width || Math.floor(box.height) !== frameSize.height) {
      throw new Error('Workspace dimensions changed during the recording.')
    }
    // Element screenshots keep the viewport fixed. A full-page capture can
    // change viewport-relative scene heights and shift the camera mid-recording.
    await page.locator('.workspace').screenshot({
      path: resolve(scratch, `frame-${String(frameIndex++).padStart(4, '0')}.png`),
      scale: 'css',
    })
  }
  async function hold(count) {
    const source = resolve(scratch, `frame-${String(frameIndex - 1).padStart(4, '0')}.png`)
    for (let i = 0; i < count; i++) {
      await copyFile(source, resolve(scratch, `frame-${String(frameIndex++).padStart(4, '0')}.png`))
    }
  }
  async function sweep(start, end) {
    for (let i = 0; i < framesPerScene; i++) {
      const minutes = Math.round(start + (end - start) * i / (framesPerScene - 1))
      await time(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
      await frame()
      if (i === 0) await hold(fps)
      if (i % 14 === 0) console.log(`Captured time-lapse frame ${i + 1}/${framesPerScene}`)
    }
    await hold(fps)
  }
  async function showSolarControls() {
    await page.locator('.inspector').evaluate(element => {
      const status = element.querySelector('.sun-status')
      element.scrollTop += status.getBoundingClientRect().top - element.getBoundingClientRect().top - 24
    })
  }

  await page.getByRole('button', { name: 'Building and sun', exact: true }).click()
  await time('08:15')
  await showSolarControls()
  await settle()
  await sweep(8 * 60 + 15, 20 * 60)

  // The apartment's CSS reserves 23 fewer pixels above/below the workspace.
  // Compensate with the browser height, keeping both captures the same size.
  await page.setViewportSize({ width: 1440, height: 977 })
  await page.getByRole('button', { name: 'Apartment', exact: true }).click()
  await page.getByRole('button', { name: 'Sun', exact: true }).click()
  await page.getByRole('button', { name: 'Living room', exact: true }).click()
  await time('12:00')
  await showSolarControls()
  await settle()
  await sweep(12 * 60, 19 * 60)

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
} finally {
  await browser.close()
}

const result = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps),
  '-i', resolve(scratch, 'frame-%04d.png'),
  '-filter_complex', '[0:v]scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
  '-loop', '0', resolve(output, 'sunlight.gif'),
], { stdio: 'inherit' })
if (result.status !== 0) throw new Error('FFmpeg could not encode sunlight.gif')
console.log(`Captured sunlight.gif (${((await stat(resolve(output, 'sunlight.gif'))).size / 1024 / 1024).toFixed(2)} MiB)`)
console.log(`Original frames retained at ${scratch}`)
