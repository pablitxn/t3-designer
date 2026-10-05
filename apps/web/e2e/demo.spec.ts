import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { siteConfigFixture } from './site-config-fixture'
import { arrangementCard, arrangementPresence, selectArrangementObject } from './arrangement-helpers'
import { openSettings } from './settings-helpers'

test('the default production demo excludes account chunks and works with no operator profile or backend', async ({ page, baseURL }) => {
  const manifest = await readFile(join(process.env.T3_DEMO_BUILD_DIR!, '.vite/manifest.json'), 'utf8')
  expect(manifest).not.toMatch(/PrivateApp|AccountHub|ProjectGenerator|components\/AssetsExplorer\.tsx/)
  // PublicAssetsExplorer is deliberately preserved in the manifest.
  expect(manifest).toContain('PublicAssetsExplorer')
  const unexpected: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== new URL(baseURL!).origin || /^\/(api|umami)(?:\/|$)/.test(url.pathname)) unexpected.push(url.href)
  })
  await page.route('**/site-config.json', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/#apartment')
  await expect(page.getByRole('button', { name: 'Apartment', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/app"]')).toHaveCount(0)
  await expect(page.getByTestId('analytics-consent-banner')).toHaveCount(0)
  await page.getByRole('button', { name: 'Rearrange furniture' }).click()
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0)
  await selectArrangementObject(page, 'living-table')
  await expect(arrangementCard(page, 'living-table').locator('img')).toHaveAttribute('src', '/models/current/previews/low-table.png')
  await page.locator('.scene-surface').press('r')
  const saved = await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))
  expect(JSON.parse(saved!)).toMatchObject({ version: 2, hidden: [], added: [] })
  expect(JSON.parse(saved!).placements[0]).toMatchObject({ id: 'living-table', rotation: Math.PI / 2 })
  await page.reload()
  await page.getByRole('button', { name: 'Rearrange furniture' }).click()
  await selectArrangementObject(page, 'living-table')
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))).toBe(saved)
  for (const [id, preview] of [
    ['demo-strandmon-v1', '/demo-assets/strandmon-v1/preview.png'],
    ['demo-dyvlinge-v2', '/demo-assets/dyvlinge-v2/preview.png'],
    ['demo-fagelfjallet-v1', '/demo-assets/fagelfjallet-v1/preview.png'],
  ]) {
    await expect(arrangementCard(page, id).locator('img')).toHaveAttribute('src', preview)
    await arrangementPresence(page, id).check()
  }
  const expanded = await page.evaluate(() => JSON.parse(localStorage.getItem('t3-designer.demo-layout.v1')!))
  expect(expanded.added).toEqual(expect.arrayContaining(['demo-strandmon-v1', 'demo-dyvlinge-v2', 'demo-fagelfjallet-v1']))
  for (const view of ['walkthrough', 'building', 'documentation', 'assets']) {
    await page.goto(`/#${view}`)
    await expect(page.locator('.workspace-loading')).toHaveCount(0)
    await expect(page.locator('main.designer')).toBeVisible()
    await expect(page.locator('a[href^="/app"]')).toHaveCount(0)
  }
  for (const path of ['/app', '/login', '/invite?token=example', '/recover?token=example']) {
    await page.goto(path)
    await expect(page.getByRole('button', { name: 'Apartment', exact: true })).toBeVisible()
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  }
  await page.goto('/privacy')
  await expect(page.getByTestId('privacy-page')).toContainText('has not supplied operator details')
  for (const value of [siteConfigFixture.operator.name, siteConfigFixture.operator.contactEmail, siteConfigFixture.operator.hosting, siteConfigFixture.operator.operationalLogs, siteConfigFixture.operator.retention]) {
    await expect(page.getByTestId('privacy-page')).not.toContainText(value)
  }
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('a mounted public operator profile changes the static privacy page without rebuilding', async ({ page }) => {
  const profile = { version: siteConfigFixture.version, privacyRevision: siteConfigFixture.privacyRevision, operator: siteConfigFixture.operator }
  await page.route('**/site-config.json', route => route.fulfill({ json: profile }))
  await page.goto('/privacy')
  await expect(page.getByTestId('privacy-page')).toContainText('Example Operator')
  await expect(page.locator('a[href="mailto:privacy@example.test"]')).toBeVisible()
  await expect(page.getByTestId('privacy-page')).toContainText(profile.operator.retention)
  await expect(page.getByTestId('analytics-consent-banner')).toHaveCount(0)
})

test('an invalid profile fails closed while the demo stays usable', async ({ page }) => {
  const analyticsRequests: string[] = []
  page.on('request', request => { if (request.url().includes('/umami/')) analyticsRequests.push(request.url()) })
  await page.route('**/site-config.json', route => route.fulfill({ json: { ...siteConfigFixture, operator: { name: 'Incomplete Operator' } } }))
  await page.goto('/privacy')
  await expect(page.getByTestId('privacy-page')).toContainText('has not supplied operator details')
  await page.goto('/#apartment')
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: 'Privacy', exact: true }).click()
  await expect(settings.getByTestId('settings-analytics-accept')).toBeDisabled()
  expect(analyticsRequests).toEqual([])
})
