import { expect, test } from '@playwright/test'
import { setLanguage } from './settings-helpers'

test.use({
  locale: 'en-GB',
  // Keep real WebGL coverage within the CI runner's 2 CPU / 2 GiB budget.
  viewport: { width: 1280, height: 800 },
  launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'] },
})

test('rendered room labels and asset details update without replacing the canvas', { tag: '@webgl' }, async ({ page }) => {
  // SwiftShader under a cgroup CPU limit needs a bounded software-rendering budget.
  test.setTimeout(process.env.CI ? 120_000 : 60_000)
  await page.goto('/#apartment')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('checkbox', { name: 'Labels', exact: true }).check()
  // Projection requires the first rendered frame; the test-wide timeout does
  // not extend Playwright's default 5s assertion budget under SwiftShader.
  await expect(page.locator('.labels-overlay .room-label').filter({ hasText: 'Bedroom 1' })).toBeVisible({ timeout: process.env.CI ? 30_000 : 5_000 })
  await page.locator('canvas').evaluate(element => element.setAttribute('data-original-canvas', 'true'))
  await setLanguage(page, 'fr')
  await expect(page.locator('.labels-overlay .room-label').filter({ hasText: 'Chambre 1' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('data-original-canvas', 'true')
  await page.locator('.inspector-tabs button').nth(2).click()
  await page.locator('.asset-row').first().click()
  await expect(page.locator('.asset-details')).toContainText('P06 / P11')
  await setLanguage(page, 'en')
  await expect(page.locator('.asset-details h2')).toHaveText('Fridge-freezer')
  await expect(page.locator('.asset-details')).toContainText('Estimated dimensions')
  await expect(page.locator('.asset-details a')).toHaveAttribute('href', '/models/current/fridge-freezer.glb')
})
