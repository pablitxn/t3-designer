import { openApartmentDetails, openSolarControls } from './viewer-helpers'
import { expect, test } from '@playwright/test'
import { closeSettings, languageLabel, openSettings, setLanguage } from './settings-helpers'

const storageKey = 't3-designer.language'
const variants = [
  { browser: 'es-AR', language: 'es', label: 'Idioma', title: 'Ficha del inmueble', area: '49,18' },
  { browser: 'en-US', language: 'en', label: 'Language', title: 'Property details', area: '49.18' },
  { browser: 'fr-CA', language: 'fr', label: 'Langue', title: 'Fiche du bien', area: '49,18' },
] as const

for (const variant of variants) {
  test.describe(variant.browser, () => {
    test.use({ locale: variant.browser, timezoneId: 'America/Argentina/Buenos_Aires' })

    test('uses browser language on a direct workspace link', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/#documentation')
      await expect(page.locator('html')).toHaveAttribute('lang', variant.language)
      await expect(page).toHaveTitle(`T3 Designer · ${variant.title}`)
      const settings = await openSettings(page)
      await expect(settings.getByRole('combobox', { name: variant.label, exact: true })).toHaveValue('auto')
      await closeSettings(page)
      await expect(page.locator('.dossier-stats button').first()).toContainText(variant.area)
      await expect(page.locator('.dossier-hero')).toBeVisible()
      expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull()
      expect(errors).toEqual([])
    })

    test('translates all workspaces and preserves solar controls and selection', async ({ page }) => {
      await page.goto('/#apartment')
      await openSolarControls(page)
      await expect(page.locator('#solar-date')).toBeVisible()
      await openSolarControls(page)
      await page.locator('#solar-date').fill('2026-12-21')
      await page.locator('#solar-time').fill('15:30')
      await openApartmentDetails(page)
      await page.locator('.inspector-tabs button').first().click()
      await page.locator('.room-navigation button').first().click()
      const selectedRoom = await page.locator('.room-navigation .selected').innerText()
      expect(selectedRoom).toBeTruthy()
      await setLanguage(page, 'fr')
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
      await expect(page.locator('.room-navigation button').first()).toHaveClass(/selected/)
      await expect(page.locator('.room-navigation button').first()).toContainText('Chambre')
      await openSolarControls(page)
      await openSolarControls(page)
      await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
      await expect(page.locator('#solar-time')).toHaveValue('15:30')
      await page.getByRole('button', { name: 'Bâtiment et soleil', exact: true }).click()
      await openSolarControls(page)
      await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
      await expect(page.locator('#solar-time')).toHaveValue('15:30')
      await expect(page.locator('.solar-time-heading')).toContainText('Europe/Paris')
      await expect(page.locator('.canvas-fallback')).toContainText('WebGL')
      await page.getByRole('button', { name: 'Fiche du bien', exact: true }).click()
      await expect(page.locator('.dossier-hero')).toBeVisible()
      await setLanguage(page, 'auto')
      await expect(page.locator('html')).toHaveAttribute('lang', variant.language)
      await expect(page).toHaveURL(/#documentation$/)
    })

    test('localizes dossier sections, search, source dialogs and example downloads', async ({ page }) => {
      await page.goto('/#documentation')
      await expect(page.locator('.dossier-hero')).toBeVisible()
      await expect(page.locator('.dossier-hero')).not.toContainText('{{')
      const navigation = page.locator('.dossier-sidebar nav button')
      await expect(navigation).toHaveCount(5)
      for (let index = 0; index < 5; index++) {
        await navigation.nth(index).click()
        await expect(navigation.nth(index)).toHaveAttribute('aria-current', 'page')
        await expect(page.locator('.dossier-content')).not.toContainText('{{')
        await expect(page.locator('.dossier-content')).not.toContainText(/(?:facts|sources|questions|ui)\.[a-z]/)
        await expect(page.locator('.dossier-content .status-pending')).toHaveCount(0)
        if (index === 1) {
          await expect(page.locator('.dossier-surfaces tbody tr')).toHaveCount(8)
          await expect(page.locator('.dossier-surfaces tfoot')).toContainText(variant.area)
        }
        if (index === 3) {
          await expect(page.locator('.dossier-fact .status-demo')).toHaveCount(6)
          await page.locator('.dossier-fact .dossier-source-links button').first().click()
          await expect(page.getByRole('dialog')).toContainText({ es: 'Escenario ficticio', en: 'Complete fictional scenario', fr: 'Scénario fictif' }[variant.language])
          await page.keyboard.press('Escape')
        }
      }
      await navigation.nth(4).click()
      await page.locator('.dossier-source-card').first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('h2')).toHaveText({ es: 'Escenario ficticio completo · 2026', en: 'Complete fictional scenario · 2026', fr: 'Scénario fictif complet · 2026' }[variant.language])
      await expect(dialog.locator('a[href="/dossier/demo-evidence.json"]')).toBeVisible()
      await expect(dialog).not.toContainText('{{')
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await page.locator('#dossier-search').fill({ es: 'superficie', en: 'area', fr: 'energie' }[variant.language])
      await expect(page.locator('.dossier-search-results .dossier-fact').first()).toBeVisible()
      await page.locator('#dossier-search').fill('zzz-no-such-record')
      await expect(page.locator('.dossier-empty')).toBeVisible()
    })
  })
}

test('honours ordered navigator.languages, then falls back to English', async ({ page }) => {
  let releaseProfile: () => void = () => {}
  const profilePending = new Promise<void>(resolve => { releaseProfile = resolve })
  await page.route('**/site-config.json', async route => { await profilePending; await route.fulfill({ status: 404, body: '' }) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { configurable: true, value: ['de-DE', 'fr-BE', 'es-AR'] }))
  await page.goto('/#documentation')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  try {
    // Language changes must be observed even before the runtime profile and App load.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', { configurable: true, value: ['de-DE', 'ja-JP'] })
      window.dispatchEvent(new Event('languagechange'))
    })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  } finally { releaseProfile() }
  await expect(page.locator('.dossier-hero')).toBeVisible()
})

test('manual preference persists and synchronizes across tabs', async ({ page, context }) => {
  await page.goto('/#documentation')
  await setLanguage(page, 'es')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  const settings = await openSettings(page)
  await expect(settings.getByRole('combobox', { name: languageLabel })).toHaveValue('es')
  await closeSettings(page)
  await page.locator('.dossier-sidebar nav button').nth(4).click()
  await page.locator('.dossier-source-card').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const other = await context.newPage()
  await other.goto('/#documentation')
  await expect(other.locator('html')).toHaveAttribute('lang', 'es')
  await setLanguage(other, 'fr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('dialog').locator('h2')).toHaveText('Scénario fictif complet · 2026')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['es'] })
    window.dispatchEvent(new Event('languagechange'))
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await setLanguage(other, 'auto')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await page.keyboard.press('Escape')
  await openSettings(page)
  await expect(settings.getByRole('combobox', { name: languageLabel })).toHaveValue('auto')
})

test('invalid or unavailable storage does not prevent rendering or switching', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'unsupported')
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-CA'] })
  }, storageKey)
  await page.goto('/#documentation')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await page.reload()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await setLanguage(page, 'es')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
})

test('keyboard language control fits on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#documentation')
  const settings = await openSettings(page)
  const select = settings.getByRole('combobox', { name: languageLabel })
  await select.scrollIntoViewIfNeeded()
  await select.focus()
  await expect(select).toBeFocused()
  await select.press('f')
  await select.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  const bounds = await select.boundingBox()
  expect(bounds).toBeTruthy()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
})

test('season labels stay on regional demo dates even across the international date line', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'en-GB', timezoneId: 'Pacific/Kiritimati' })
  const page = await context.newPage()
  try {
    await page.goto('/#building')
    await openSolarControls(page)
    await expect(page.locator('.season-presets button').last()).toContainText('21 Dec')
    await page.locator('.season-presets button').last().click()
    await openSolarControls(page)
    await expect(page.locator('#solar-date')).toHaveValue(/-12-21$/)
  } finally {
    await context.close()
  }
})
