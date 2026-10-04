import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Current application views, without source photographs, private data or retouching.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(new URL('../apps/web/package.json', import.meta.url))('@playwright/test')
const baseURL = process.env.README_BASE_URL ?? 'http://127.0.0.1:5173'
const output = resolve(root, process.env.README_REFERENCE_DIR ?? 'docs/reference')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chromium', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'light' })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/#building`)
  await page.getByTestId('privacy-preferences').waitFor()
  if (await page.getByTestId('analytics-reject').isVisible()) await page.getByTestId('analytics-reject').click()
  await page.locator('canvas').waitFor()
  await page.locator('html').evaluate(element => element.ownerDocument.fonts.ready)
  await page.locator('#solar-date').fill('2026-09-22')
  await page.locator('#solar-time').fill('16:00')
  await page.locator('#solar-time').blur()
  async function capture(filename) {
    await page.waitForTimeout(1800)
    await page.locator('.workspace').screenshot({ path: resolve(output, filename), scale: 'css' })
    console.log(`Captured ${filename}`)
  }
  await capture('building-explorer.png')
  await page.getByRole('button', { name: 'Show interior', exact: true }).click()
  await capture('t3-building-cutaway.png')
  await page.getByRole('button', { name: 'Apartment', exact: true }).click()
  await page.getByRole('button', { name: 'Sun', exact: true }).click()
  await page.getByRole('button', { name: 'Living room', exact: true }).click()
  await capture('apartment-solar-study.png')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
