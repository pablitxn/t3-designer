import { expect, type Page } from '@playwright/test'

export async function openSolarControls(page: Page) {
  if (await page.locator('#solar-date').isVisible()) return
  const label = page.url().endsWith('#building')
    ? /^(Show controls|Mostrar controles|Afficher les réglages)$/
    : /^(Date and sun path|Fecha y recorrido solar|Date et course du soleil)$/
  await page.getByRole('button', { name: label }).click()
  await expect(page.locator('#solar-date')).toBeVisible()
}

export async function openApartmentDetails(page: Page) {
  if (await page.locator('.apartment-viewer-layers').isVisible()) return
  await page.getByRole('button', { name: /^(View layers|Capas de la vista|Calques de la vue)$/ }).click()
  await expect(page.locator('.apartment-viewer-layers')).toBeVisible()
}
