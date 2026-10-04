import { expect, type Page } from '@playwright/test'

export const languageLabel = /^(Language|Idioma|Langue)$/
export const appearanceLabel = /^(Appearance|Apariencia|Apparence)$/

export async function openSettings(page: Page) {
  await page.locator('.settings-trigger').click()
  const dialog = page.locator('.settings-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

export async function closeSettings(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('.settings-dialog')).not.toBeVisible()
}

export async function setLanguage(page: Page, language: 'auto' | 'es' | 'en' | 'fr') {
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: languageLabel }).selectOption(language)
  await closeSettings(page)
}
