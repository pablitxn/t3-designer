import { expect, test } from '@playwright/test'

const variants = [
  { locale: 'en-US', title: 'Objects with a history.', review: 'Review DYVLINGE', history: 'Saved history', create: '+ Create an object' },
  { locale: 'fr-FR', title: 'Des objets avec une histoire.', review: 'Examiner DYVLINGE', history: 'Historique enregistré', create: '+ Créer un objet' },
] as const

for (const variant of variants) {
  test.describe(variant.locale, () => {
    test.use({ locale: variant.locale, viewport: { width: 390, height: 844 } })
    test('public history is localized and usable on a narrow screen', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/#assets')
      await expect(page.getByRole('heading', { name: variant.title })).toBeVisible()
      await expect(page.getByRole('link', { name: variant.create })).toHaveAttribute('href', '/app/assets')
      await page.getByRole('button', { name: variant.review }).click()
      const history = page.getByRole('region', { name: variant.history })
      await expect(history.getByRole('button')).toHaveCount(2)
      await history.getByRole('button').last().click()
      await expect(page.locator('.workshop-preview img')).toHaveAttribute('src', '/demo-assets/dyvlinge-v1/preview.png')
      await expect(page.locator('.workshop-preview img')).toHaveJSProperty('naturalWidth', 512)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.locator('.public-asset-gallery')).not.toContainText(/publicDemo\.|\{\{/)
      expect(errors).toEqual([])
    })
  })
}
