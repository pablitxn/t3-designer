import { createRequire } from 'node:module'
import { copyFile, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Real public UI, fresh browser storage, the workspace's pinned Playwright.
// Run Vite separately, then README_BASE_URL=http://127.0.0.1:5173 node scripts/capture_readme_interactions.mjs
// No application hooks, API fixtures, scene replacements or screenshot retouching.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(new URL('../apps/web/package.json', import.meta.url))('@playwright/test')
const baseURL = process.env.README_BASE_URL ?? 'http://127.0.0.1:5173'
const output = resolve(root, process.env.README_MEDIA_DIR ?? 'docs/media')
const fps = 8
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('FFmpeg is required on PATH.')
await mkdir(output, { recursive: true })
await mkdir(resolve(root, 'artifacts/readme'), { recursive: true })
const scratch = await mkdtemp(resolve(root, 'artifacts/readme/interactions-'))
const browser = await chromium.launch({ channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chromium', headless: true })
const errors = []
const report = { baseURL, fps, captures: [] }

async function pageAt(hash, height) {
  const context = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'light' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/#${hash}`)
  await page.getByTestId('privacy-preferences').waitFor()
  if (await page.getByTestId('analytics-reject').isVisible()) await page.getByTestId('analytics-reject').click()
  await page.locator('html').evaluate(element => element.ownerDocument.fonts.ready)
  return { page, context }
}

async function recorder(page, locator, name) {
  const directory = resolve(scratch, name)
  await mkdir(directory)
  let count = 0
  let size
  const path = index => resolve(directory, `frame-${String(index).padStart(4, '0')}.png`)
  async function frame() {
    const box = await locator.boundingBox()
    if (!box) throw new Error(`Missing ${name} capture area`)
    const current = [Math.round(box.width), Math.round(box.height)]
    size ??= current
    if (String(size) !== String(current)) throw new Error(`${name} dimensions changed during capture`)
    await locator.screenshot({ path: path(count++), scale: 'css' })
  }
  async function hold(frames = fps) {
    if (!count) await frame()
    const source = path(count - 1)
    for (let i = 0; i < frames; i++) await copyFile(source, path(count++))
  }
  async function finish() {
    const destination = resolve(output, `${name}.gif`)
    const result = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-i', resolve(directory, 'frame-%04d.png'),
      '-filter_complex', '[0:v]scale=1120:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', destination,
    ], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`FFmpeg failed for ${name}`)
    const bytes = (await stat(destination)).size
    report.captures.push({ name, frames: count, seconds: count / fps, bytes, size, directory })
    console.log(`${name}.gif: ${count} frames, ${(bytes / 1024 / 1024).toFixed(2)} MiB`)
  }
  return { frame, hold, finish }
}

async function captureFurniture() {
  const { page, context } = await pageAt('apartment', 1100)
  try {
    await page.getByRole('button', { name: /Rearrange furniture/ }).click()
    const region = page.getByRole('region', { name: 'Your demo layout', exact: true })
    await page.getByRole('combobox', { name: 'Apartment objects', exact: true }).selectOption('living-table')
    await page.waitForTimeout(2500)
    const capture = await recorder(page, region, 'furniture-layout')
    await capture.frame()
    await capture.hold(8)
    const canvas = await region.locator('canvas').boundingBox()
    if (!canvas) throw new Error('Missing furniture canvas')
    // The initial plan's low table is visibly at the south-east corner.
    // Drag its centre into the living room using ordinary pointer input.
    const origin = { x: canvas.x + canvas.width * .609, y: canvas.y + canvas.height * .809 }
    const before = await page.getByLabel('X position (m)', { exact: true }).inputValue()
    await page.mouse.move(origin.x, origin.y)
    await page.mouse.down()
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(origin.x - 95 * i / 16, origin.y - 100 * i / 16)
      await capture.frame()
    }
    await page.mouse.up()
    await page.waitForTimeout(250)
    const after = await page.getByLabel('X position (m)', { exact: true }).inputValue()
    if (after === before) throw new Error('The furniture drag did not move the selected table')
    await capture.frame()
    await capture.hold(6)
    await page.getByRole('button', { name: 'Rotate 90°', exact: true }).click()
    await page.waitForTimeout(250)
    if (await page.getByLabel('Rotation (°)', { exact: true }).inputValue() !== '90') throw new Error('Table rotation did not apply')
    await capture.frame()
    await capture.hold(8)
    await page.getByRole('button', { name: /Undo/ }).click()
    await page.waitForTimeout(200)
    await capture.frame()
    await capture.hold(5)
    await page.getByRole('button', { name: /Redo/ }).click()
    await page.waitForTimeout(200)
    await capture.frame()
    await capture.hold(5)
    await page.getByRole('button', { name: '3D', exact: true }).click()
    await page.waitForTimeout(1500)
    await capture.frame()
    await capture.hold(8)
    const three = await region.locator('canvas').boundingBox()
    await page.mouse.move(three.x + three.width * .8, three.y + three.height * .7)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(three.x + three.width * .8 - i * 6, three.y + three.height * .7)
      await capture.frame()
    }
    await page.mouse.up()
    await page.waitForTimeout(800)
    await capture.frame()
    await capture.hold(10)
    if (!await region.getByRole('status').innerText().then(text => text.includes('Layout saved in this browser'))) throw new Error('Missing local-save confirmation')
    await capture.finish()
  } finally { await context.close() }
}

async function captureWalkthrough() {
  const { page, context } = await pageAt('walkthrough', 1000)
  try {
    const visit = page.getByTestId('walkthrough')
    await visit.getByRole('combobox', { name: 'Starting point', exact: true }).selectOption('living')
    await visit.getByLabel('Date', { exact: true }).fill('2026-09-22')
    await visit.getByLabel('Local time', { exact: true }).fill('16:00')
    await visit.getByRole('button', { name: /Enter the apartment/ }).click()
    await page.waitForTimeout(2500)
    const capture = await recorder(page, visit, 'walkthrough')
    async function pose() {
      const value = await page.locator('.walk-map > g').getAttribute('transform')
      const match = value?.match(/translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)/)
      if (!match) throw new Error(`Missing walkthrough pose: ${value}`)
      return { x: Number(match[1]), z: Number(match[2]), yaw: -Number(match[3]) * Math.PI / 180 }
    }
    async function press(key, milliseconds) {
      await page.keyboard.down(key)
      await page.waitForTimeout(milliseconds)
      await page.keyboard.up(key)
      // The minimap publishes the actual pose at 10 Hz.
      await page.waitForTimeout(150)
    }
    async function turnTo(target) {
      for (let attempt = 0; attempt < 35; attempt++) {
        const current = await pose()
        const difference = Math.atan2(Math.sin(target - current.yaw), Math.cos(target - current.yaw))
        if (Math.abs(difference) < .035) return
        await press(difference > 0 ? 'ArrowLeft' : 'ArrowRight', Math.max(20, Math.min(120, Math.abs(difference) / 1.65 * 900)))
        await capture.frame()
      }
      throw new Error('Could not reach the walkthrough camera angle')
    }
    async function face(x, z) {
      const current = await pose()
      await turnTo(Math.atan2(current.x - x, current.z - z))
    }
    await capture.frame()
    await capture.hold(8)
    // Walk from the furnished kitchen view across the real living room.
    await face(4.5, 4.6)
    for (let step = 0; step < 16; step++) {
      const current = await pose()
      const distance = Math.hypot(current.x - 4.5, current.z - 4.6)
      if (distance < .18) break
      await press('w', Math.min(120, distance / 1.45 * 700))
      await capture.frame()
    }
    // This existing closet panel starts open. Close it, then reopen it with E.
    await face(5.25, 3.604)
    const interaction = visit.getByTestId('walk-interact')
    await interaction.waitFor({ state: 'visible' })
    if (await interaction.getAttribute('data-door-id') !== 'closet-entry') throw new Error('Expected the closet panel')
    await capture.frame()
    await capture.hold(7)
    await page.keyboard.press('e')
    await page.waitForTimeout(300)
    if (await page.locator('.walk-map [data-door-id="closet-entry"]').getAttribute('data-openness') !== '0') throw new Error('Closet door did not close')
    await capture.frame()
    await capture.hold(7)
    await face(5.6017, 3.9465)
    await interaction.waitFor({ state: 'visible' })
    await capture.frame()
    await capture.hold(7)
    await page.keyboard.press('e')
    await page.waitForTimeout(300)
    if (await page.locator('.walk-map [data-door-id="closet-entry"]').getAttribute('data-openness') !== '1') throw new Error('Closet door did not open')
    await capture.frame()
    await capture.hold(7)
    // End looking back through the living room toward the balcony and kitchen.
    await face(3.2, 8)
    await capture.frame()
    await capture.hold(10)
    await visit.screenshot({ path: resolve(output, 'walkthrough.png'), scale: 'css' })
    await capture.finish()
  } finally { await context.close() }
}

try {
  if (process.env.README_CAPTURE_ONLY !== 'walkthrough') await captureFurniture()
  if (process.env.README_CAPTURE_ONLY !== 'furniture') await captureWalkthrough()
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
} finally {
  await browser.close()
  await writeFile(resolve(scratch, 'capture-report.json'), JSON.stringify({ ...report, errors }, null, 2) + '\n')
  console.log(`Original UI frames and capture report: ${scratch}`)
}
