import { expect, type Page } from '@playwright/test'

export function arrangementCard(page: Page, fixtureId: string) {
  return page.locator(`.arrangement-catalog-card[data-fixture-id="${fixtureId}"]`)
}

export function arrangementPresence(page: Page, fixtureId: string) {
  return arrangementCard(page, fixtureId).getByRole('checkbox', { name: /^(En la escena|In the scene|Dans la scène)/ })
}

export async function selectArrangementObject(page: Page, fixtureId: string) {
  const button = arrangementCard(page, fixtureId).getByRole('button')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}

export async function selectedArrangementId(page: Page) {
  const selected = page.locator('.arrangement-catalog-card:has(button[aria-pressed="true"])')
  await expect(selected).toHaveCount(1)
  return (await selected.getAttribute('data-fixture-id'))!
}
