import { expect, test } from '@playwright/test'
import { appearanceLabel, closeSettings, languageLabel, openSettings } from './settings-helpers'

const themeKey = 't3-designer.theme'

test.use({ locale: 'en-GB', colorScheme: 'light' })

test('follows system appearance until a manual preference overrides it', async ({ page }) => {
  await page.goto('/#documentation')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const dialog = await openSettings(page)
  const appearance = dialog.getByRole('combobox', { name: appearanceLabel })
  await expect(appearance).toHaveValue('system')
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBeNull()

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await appearance.selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await appearance.selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBeNull()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('persists appearance and language while preserving the current workspace', async ({ page }) => {
  await page.goto('/#building')
  await page.locator('#solar-date').fill('2026-12-21')
  await page.locator('#solar-time').fill('15:30')
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: appearanceLabel }).selectOption('dark')
  await dialog.getByRole('combobox', { name: languageLabel }).selectOption('fr')
  await expect(dialog.getByRole('button', { name: 'Fermer les paramètres', exact: true })).toBeVisible()
  await expect(dialog.locator('.settings-feedback')).toHaveAttribute('role', 'status')
  await expect(dialog.locator('.settings-feedback')).not.toHaveText('')
  await dialog.getByRole('button', { name: 'Fermer les paramètres', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
  await expect(page.locator('#solar-time')).toHaveValue('15:30')
  await expect(page).toHaveURL(/#building$/)
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe('dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page).toHaveURL(/#building$/)
  await openSettings(page)
  await expect(dialog.getByRole('combobox', { name: appearanceLabel })).toHaveValue('dark')
  await expect(dialog.getByRole('combobox', { name: languageLabel })).toHaveValue('fr')
})

test('synchronizes appearance across tabs and returns to system on removal or clear', async ({ page, context }) => {
  await page.goto('/#documentation')
  const firstDialog = await openSettings(page)
  const firstAppearance = firstDialog.getByRole('combobox', { name: appearanceLabel })
  const other = await context.newPage()
  await other.goto('/#apartment')
  const otherDialog = await openSettings(other)
  const otherAppearance = otherDialog.getByRole('combobox', { name: appearanceLabel })

  await otherAppearance.selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(firstAppearance).toHaveValue('dark')
  await firstAppearance.selectOption('light')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(otherAppearance).toHaveValue('light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await otherAppearance.selectOption('system')
  await expect(firstAppearance).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light')

  await otherAppearance.selectOption('light')
  await expect(firstAppearance).toHaveValue('light')
  await other.evaluate(key => localStorage.removeItem(key), themeKey)
  await expect(firstAppearance).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await otherAppearance.selectOption('dark')
  await otherAppearance.selectOption('light')
  await expect(firstAppearance).toHaveValue('light')
  await other.evaluate(() => localStorage.clear())
  await expect(firstAppearance).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('keeps keyboard focus in the modal and returns it after Escape or backdrop dismissal', async ({ page }) => {
  await page.goto('/#documentation')
  const trigger = page.locator('.settings-trigger')
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await trigger.focus()
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName('Settings')
  const controls = dialog.locator('button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')
  const first = controls.first()
  const last = controls.last()
  await expect(first).toBeFocused()
  await last.focus()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()

  await openSettings(page)
  await dialog.getByRole('heading').first().click()
  await expect(dialog).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('ignores invalid stored appearance and allows changes when storage is blocked', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(key => {
    if (sessionStorage.getItem('block-preferences') === 'true') {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('Blocked', 'SecurityError') },
      })
    } else {
      localStorage.setItem(key, 'unsupported')
    }
  }, themeKey)
  await page.goto('/#documentation')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const dialog = await openSettings(page)
  await expect(dialog.getByRole('combobox', { name: appearanceLabel })).toHaveValue('system')

  await page.evaluate(() => sessionStorage.setItem('block-preferences', 'true'))
  await page.reload()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await openSettings(page)
  await dialog.getByRole('combobox', { name: appearanceLabel }).selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(dialog.locator('.settings-feedback')).toHaveText('The browser could not save a change. It applies for this session but may be lost when you reload.')
  await dialog.getByRole('combobox', { name: languageLabel }).selectOption('es')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(dialog.locator('.settings-feedback')).toContainText('para esta sesión')
  await closeSettings(page)
  expect(errors).toEqual([])
})

test('settings and their controls remain usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/#documentation')
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: languageLabel }).selectOption('fr')
  await dialog.getByRole('combobox', { name: appearanceLabel }).selectOption('dark')
  for (const element of [dialog, ...await dialog.getByRole('combobox').all()]) {
    const bounds = await element.boundingBox()
    expect(bounds).toBeTruthy()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await dialog.getByRole('button', { name: 'Fermer les paramètres', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.settings-trigger')).toBeFocused()
})
