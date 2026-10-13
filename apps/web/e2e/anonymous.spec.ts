import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openApartmentDetails, openSolarControls } from './viewer-helpers'
import { closeSettings, openSettings } from './settings-helpers'
import { arrangementPresence, selectArrangementObject } from './arrangement-helpers'

const layoutKey = 't3-designer.demo-layout.v1'
test.afterEach(async ({ page, browser }, info) => {
  await info.attach('environment', { body: JSON.stringify({ engine: browser.version(), viewport: page.viewportSize(),
    emulation: await page.evaluate(() => ({ touchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia('(pointer: coarse)').matches, language: navigator.language })).catch(() => null) }), contentType: 'application/json' })
})
async function evidence(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('visitor inventory: every workspace, direct links, reload, history and unknown hash', async ({ page }, info) => {
  const errors: string[] = [], api: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()) })
  await page.goto('/')
  await expect(page.locator('.building-studio')).toBeVisible()
  const nav = page.locator('.workspace-switcher button')
  for (const [index, hash, selector] of [
    [1, 'walkthrough', '[data-testid="walkthrough"]'], [2, 'building', '.building-studio'],
    [3, 'documentation', '.dossier-hero'], [4, 'assets', '.public-asset-gallery'], [0, 'apartment', '.apartment-viewer'],
  ] as const) {
    await nav.nth(index).click()
    await expect(page).toHaveURL(new RegExp(`#${hash}$`))
    await expect(nav.nth(index)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(selector)).toBeVisible()
    await fits(page)
    await evidence(page, info, hash)
  }
  await page.goBack(); await expect(page.locator('.public-asset-gallery')).toBeVisible()
  await page.goForward(); await expect(page.locator('.apartment-viewer')).toBeVisible()
  await page.reload(); await expect(nav.first()).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#unknown'); await expect(page.locator('.building-studio')).toBeVisible()
  for (const hash of ['walkthrough', 'building', 'documentation', 'assets']) {
    await page.goto(`/#${hash}`); await expect(page.locator('.workspace-switcher button[aria-pressed="true"]')).toHaveCount(1)
    await page.reload(); await expect(page.locator('.workspace-switcher button[aria-pressed="true"]')).toHaveCount(1)
  }
  expect(api).toEqual([])
  expect(errors).toEqual([])
})

test('public arrangement: empty catalog scene, double taps, reset undo/redo and context isolation', async ({ page, browser }, info) => {
  await page.goto('/#apartment')
  await page.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  for (const checkbox of await page.locator('.arrangement-catalog-card input[type="checkbox"]').all()) if (await checkbox.isChecked()) await checkbox.uncheck()
  const saved = () => page.evaluate(key => localStorage.getItem(key), layoutKey)
  expect(JSON.parse((await saved())!).hidden).toHaveLength(21)
  await evidence(page, info, 'empty-arrangement')
  await page.getByRole('button', { name: 'Restore original layout', exact: true }).dblclick()
  expect(await saved()).toBeNull()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(JSON.parse((await saved())!).hidden).toHaveLength(21)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await saved()).toBeNull()
  await selectArrangementObject(page, 'living-table')
  await page.getByRole('button', { name: 'Rotate 90° left', exact: true }).dblclick()
  expect(JSON.parse((await saved())!).placements[0].rotation).toBeCloseTo(Math.PI)
  const isolated = await browser.newContext({ locale: 'en-GB' })
  try {
    const other = await isolated.newPage(); await other.goto(`${new URL(page.url()).origin}/#apartment`)
    expect(await other.evaluate(key => localStorage.getItem(key), layoutKey)).toBeNull()
  } finally { await isolated.close() }
  await page.reload(); await page.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await expect(arrangementPresence(page, 'living-table')).toBeChecked()
  expect(JSON.parse((await saved())!).placements[0].rotation).toBeCloseTo(Math.PI)
})

test('solar clock: night, noon, seasons, invalid/empty input, DST and stopped playback on navigation', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#apartment'); await openSolarControls(page)
  await page.locator('#solar-date').fill('2026-03-29')
  await page.locator('#solar-time').fill('02:30')
  await expect(page.locator('#solar-time')).toHaveValue('03:00')
  await expect(page.locator('.solar-time-note[role="status"]')).toBeVisible()
  await page.locator('#solar-date').fill('2026-10-25'); await page.locator('#solar-time').fill('02:30')
  await expect(page.locator('.solar-time-note')).toBeVisible()
  await page.locator('#solar-time').fill('00:00'); await expect(page.locator('.sun-status-night')).toBeVisible()
  await page.locator('.sunrise-sunset button').click(); await expect(page.locator('.sun-status-night')).toHaveCount(0)
  for (const button of await page.locator('.season-presets button').all()) {
    await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true')
  }
  await page.locator('#solar-date').fill('1800-01-01')
  await page.locator('#solar-date').fill(''); await page.locator('#solar-time').fill('')
  await page.locator('.season-presets button').last().click(); await page.locator('#solar-time').fill('12:00')
  await evidence(page, info, 'solar')
  await page.getByRole('button', { name: 'Play day timeline', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause day timeline', exact: true })).toBeVisible()
  await page.locator('.workspace-switcher button').nth(2).click(); await openSolarControls(page)
  await expect(page.getByRole('button', { name: 'Play day timeline', exact: true })).toBeVisible()
  const time = await page.locator('#solar-time').inputValue()
  await page.locator('.workspace-switcher button').first().click(); await openSolarControls(page)
  await expect(page.locator('#solar-time')).toHaveValue(time)
  await openApartmentDetails(page)
  await page.locator('.room-navigation button').first().click()
  await expect(page.locator('.room-navigation button').first()).toHaveClass(/selected/)
  expect(errors).toEqual([])
})

test('dossier: search empty/results, evidence, close/backdrop, downloads and explorer links', async ({ page }, info) => {
  await page.goto('/#documentation')
  const search = page.locator('#dossier-search')
  await search.fill('no-such-fixture-98241'); await expect(page.locator('.dossier-empty')).toBeVisible()
  await search.fill('area'); await expect(page.locator('.dossier-search-results .dossier-fact').first()).toBeVisible()
  await search.fill('   '); await expect(page.locator('.dossier-search-results')).toHaveCount(0)
  await page.locator('.dossier-sidebar nav button').last().click()
  const source = page.locator('.dossier-source-card').first()
  await source.click()
  const dialog = page.locator('.dossier-dialog')
  await expect(dialog).toBeVisible()
  await evidence(page, info, 'dossier-source')
  const copy = dialog.locator('a[href="/dossier/demo-evidence.json"]')
  const [popup] = await Promise.all([page.waitForEvent('popup'), copy.click()])
  await popup.waitForLoadState(); expect(await popup.locator('body').innerText()).toContain('demo')
  await popup.close()
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(source).toBeFocused()
  await source.click(); await page.mouse.click(0, 0); await expect(dialog).not.toBeVisible()
  await page.locator('.dossier-sidebar nav button').first().click()
  await page.locator('.dossier-model-links button').first().click()
  await expect(page.locator('.apartment-viewer')).toBeVisible()
})

test('gallery: every bundled object/version/image, download and login CTA', async ({ page }, info) => {
  const api: string[] = []; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()) })
  await page.goto('/#assets')
  const cards = page.locator('.public-gallery-grid .workshop-card')
  await expect(cards).toHaveCount(3)
  for (const card of await cards.all()) {
    await card.click()
    const history = page.locator('.public-gallery-history button')
    for (const version of await history.all()) {
      await version.click(); await expect(version).toHaveAttribute('aria-pressed', 'true')
      for (const tab of (await page.locator('.workshop-preview-tabs button').all()).slice(0, 3)) {
        await tab.click()
        await expect.poll(() => page.locator('.workshop-preview > img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(512)
      }
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.workshop-downloads a').click()])
      expect(download.suggestedFilename()).toBe('model.glb'); expect(await download.failure()).toBeNull()
    }
  }
  await fits(page); await evidence(page, info, 'gallery-history')
  expect(api).toEqual([])
  await page.locator('.public-gallery-create').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await evidence(page, info, 'login')
})

test('login boundary: native validation, fictitious credentials, unavailable response, retry and reload', async ({ page }, info) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login$/)
  const submits: string[] = []
  page.on('request', request => { if (request.url().endsWith('/api/account/sign-in')) submits.push(request.method()) })
  const submit = page.locator('form button[type="submit"]')
  await submit.click(); expect(submits).toEqual([])
  await page.locator('[name="email"]').fill('bad-email'); await page.locator('[name="password"]').fill('fictitious-passphrase-2026')
  await submit.click(); expect(submits).toEqual([])
  await page.locator('[name="email"]').fill('anonymous-qa@example.test')
  await submit.click(); await expect(page.getByRole('alert')).toContainText('We could not sign you in.')
  await page.route('**/api/account/sign-in', route => route.abort('connectionreset'))
  await submit.click(); await expect(page.getByRole('alert')).toContainText('unavailable')
  await expect(page.locator('[name="email"]')).toHaveValue('anonymous-qa@example.test')
  await expect(submit).toBeEnabled()
  await page.unroute('**/api/account/sign-in')
  await submit.click(); await expect(page.getByRole('alert')).toContainText('We could not sign you in.')
  await evidence(page, info, 'login-errors')
  await page.reload(); await expect(page.locator('[name="password"]')).toHaveValue('')
  await page.locator('a[href="/#apartment"]').last().click(); await expect(page.locator('.apartment-viewer')).toBeVisible()
})

test('anonymous direct private routes never expose fixtures; missing invitation/recovery show errors', async ({ page }) => {
  for (const path of ['/app/assets', '/app/credits', '/app/usage', '/app/users', '/app/generate', '/app/projects/qa-unknown']) {
    await page.goto(path); await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('.workshop-library')).toHaveCount(0)
  }
  for (const path of ['/invite', '/recover', '/invite#token=fictitious-invalid-token', '/recover#token=fictitious-invalid-token']) {
    await page.goto(path)
    if (path.startsWith('/recover#')) {
      await page.locator('[name="password"]').fill('fictitious-recovery-password')
      await page.locator('form button[type="submit"]').click(); await expect(page.getByRole('alert')).toBeVisible()
    }
    await expect(page.getByRole('alert')).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  }
})

test('session unavailable and response loss have recoverable UI; cancel navigation does not capture late responses', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 503, json: { error: 'QA unavailable' } }))
  await page.goto('/app'); await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute('**/api/me'); await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/me', async route => { await wait; await route.fulfill({ status: 401, json: { error: 'Unauthorized' } }).catch(() => {}) })
  await page.goto('/app'); await expect(page.getByRole('status')).toBeVisible()
  await page.locator('a[href="/#apartment"]').click(); release()
  await expect(page.locator('.apartment-viewer')).toBeVisible()
  await page.reload(); await expect(page.locator('.apartment-viewer')).toBeVisible()
})

test('privacy navigation, theme and units do not erase visitor state', async ({ page }, info) => {
  await page.goto('/#apartment'); await page.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await selectArrangementObject(page, 'living-table'); await page.locator('.scene-surface').press('r')
  const layout = await page.evaluate(key => localStorage.getItem(key), layoutKey)
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark')
  await dialog.getByRole('combobox', { name: 'Measurement units', exact: true }).selectOption('imperial')
  await dialog.getByRole('button', { name: 'Privacy', exact: true }).click()
  await dialog.getByTestId('settings-analytics-reject').click()
  await dialog.getByTestId('privacy-policy').click()
  await expect(page.getByTestId('privacy-page')).toBeVisible(); await fits(page)
  await evidence(page, info, 'privacy-dark')
  await page.goBack(); await expect(page.locator('.apartment-viewer')).toBeVisible()
  await page.goForward(); await expect(page.getByTestId('privacy-page')).toBeVisible()
  await page.reload(); await expect(page.getByTestId('privacy-page')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(key => localStorage.getItem(key), layoutKey)).toBe(layout)
  const settings = await openSettings(page)
  await expect(settings.getByRole('combobox', { name: 'Measurement units', exact: true })).toHaveValue('imperial')
  await closeSettings(page)
})

test('dossier source dialog restores its opener on Escape, close and backdrop', async ({ page }) => {
  await page.goto('/#documentation')
  await page.locator('.dossier-sidebar nav button').last().click()
  const source = page.locator('.dossier-source-card').first()
  for (const method of ['escape', 'close', 'backdrop']) {
    await source.click(); await expect(page.locator('.dossier-dialog')).toBeVisible()
    if (method === 'escape') await page.keyboard.press('Escape')
    else if (method === 'close') await page.getByRole('button', { name: 'Close source record', exact: true }).click()
    else await page.mouse.click(0, 0)
    await expect(page.locator('.dossier-dialog')).not.toBeVisible()
    await expect(source).toBeFocused()
  }
})

test('gallery handles unavailable preview images and retries without losing the selected version', async ({ page }, info) => {
  await page.route('**/demo-assets/dyvlinge-v1/front.png', route => route.abort('connectionreset'))
  await page.goto('/#assets')
  await page.getByRole('button', { name: 'Review DYVLINGE', exact: true }).click()
  await page.locator('#public-asset-version').selectOption('dyvlinge-v1')
  await page.locator('.workshop-preview-tabs button').nth(1).click()
  const preview = page.locator('.workshop-preview')
  await evidence(page, info, 'preview-response-loss')
  await expect(preview.getByRole('status')).toContainText('We could not load this image.')
  await page.unroute('**/demo-assets/dyvlinge-v1/front.png')
  await preview.getByRole('button', { name: 'Retry image', exact: true }).click()
  await expect.poll(() => preview.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(512)
  await expect(page.locator('#public-asset-version')).toHaveValue('dyvlinge-v1')
  await page.locator('.workshop-preview-tabs button').nth(2).click()
  await expect(preview.getByRole('status')).toHaveCount(0)
  await evidence(page, info, 'preview-recovered')
})

for (const variant of [
  { language: 'es', error: 'No se pudo cargar esta imagen.', retry: 'Reintentar imagen' },
  { language: 'fr', error: 'Impossible de charger cette image.', retry: 'Réessayer l’image' },
]) test(`gallery image errors and recovery are localized in ${variant.language}`, async ({ page }) => {
  await page.route('**/demo-assets/strandmon-v1/front.png', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/#assets')
  const settings = await openSettings(page)
  await settings.getByRole('combobox', { name: 'Language', exact: true }).selectOption(variant.language)
  await closeSettings(page)
  await page.locator('.workshop-preview-tabs button').nth(1).click()
  await expect(page.locator('.workshop-preview').getByRole('status')).toContainText(variant.error)
  await page.unroute('**/demo-assets/strandmon-v1/front.png')
  await page.getByRole('button', { name: variant.retry, exact: true }).click()
  await expect.poll(() => page.locator('.workshop-preview img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(512)
})

test('login double submission is bounded, cancelled responses and an invalid session remain anonymous', async ({ page, context }) => {
  await context.addCookies([{ name: 'better-auth.session_token', value: 'expired-fictitious-session', url: new URL('/', test.info().project.use.baseURL!).href }])
  await page.goto('/app/assets'); await expect(page).toHaveURL(/\/login$/)
  await page.locator('[name="email"]').fill('anonymous-qa@example.test')
  await page.locator('[name="password"]').fill('fictitious-passphrase-2026')
  let attempts = 0, release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/account/sign-in', async route => {
    attempts++; await wait
    await route.fulfill({ status: 429, json: { error: 'QA throttled' } }).catch(() => {})
  })
  const submit = page.locator('form button[type="submit"]')
  await submit.click()
  await expect(submit).toBeDisabled(); await expect(page.locator('[name="email"]')).toBeDisabled()
  await page.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(attempts).toBe(1)
  release(); await expect(submit).toBeEnabled(); await expect(page.getByRole('alert')).toContainText('We could not sign you in.')
  let cancelRelease!: () => void
  const cancelled = new Promise<void>(resolve => { cancelRelease = resolve })
  await page.unroute('**/api/account/sign-in')
  await page.route('**/api/account/sign-in', async route => { await cancelled; await route.abort('connectionreset').catch(() => {}) })
  await submit.click(); await page.locator('a[href="/#apartment"]').last().click(); cancelRelease()
  await expect(page.locator('.apartment-viewer')).toBeVisible()
  await page.goto('/app'); await expect(page).toHaveURL(/\/login$/)
})
