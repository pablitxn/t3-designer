import { expect, test, type Page } from '@playwright/test'
import common from '../src/i18n/locales/es/common'
import { getPrivateCopy } from '../src/private/copy'
import type { UsageResponse } from '../src/private/usage-api'
import { getUsageCopy } from '../src/private/usage-copy'
import { creditFixture } from './credit-fixture'
import { closeSettings, openSettings } from './settings-helpers'

test.use({ locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' })

const c = getUsageCopy('es')
const p = getPrivateCopy('es')
const user = { id: 'usage-user', name: 'Usuario de prueba', email: 'usage@example.test', role: 'user', tier: 'standard', canInvite: false }
const usage: UsageResponse = {
  totals: {
    creditsConsumed: 20, creditsReserved: 0, creditsRefunded: 0, calls: 2, attempts: 2,
    inputTokens: 18900, outputTokens: 4100, cachedInputTokens: 1200, cacheWriteInputTokens: null, reasoningOutputTokens: 600,
    durationMs: 18000, measuredCalls: 2, partialCalls: 0, unknownCalls: 0, measurement: 'complete',
  },
  projects: [{ id: 'usage-project', label: 'Prueba de vivienda' }],
  operations: [
    {
      id: 'operation-openai', kind: 'apartment', userId: user.id, projectId: 'usage-project', projectLabel: 'Prueba de vivienda',
      jobId: null, runId: 'run-openai', assetId: null, attempt: 1, parentId: null, createdAt: '2026-10-09T15:00:00Z', status: 'succeeded',
      credits: { consumed: 12, reserved: 0, refunded: 0, state: 'consumed' },
      calls: [{
        id: 'call-openai', operationId: 'operation-openai', stage: 'generation', iteration: 1,
        provider: 'openai', authMode: 'api-key', requestedModel: 'gpt-6-test', effectiveModel: 'gpt-6-test-2026-10-01',
        inputTokens: 12500, outputTokens: 2500, cachedInputTokens: 1200, cacheWriteInputTokens: null, reasoningOutputTokens: 600,
        startedAt: '2026-10-09T15:00:00Z', endedAt: '2026-10-09T15:00:12Z', durationMs: 12000,
        status: 'succeeded', measurement: 'complete', source: 'openai.responses',
      }],
    },
    {
      id: 'operation-codex', kind: 'building', userId: user.id, projectId: 'usage-project', projectLabel: 'Prueba de vivienda',
      jobId: null, runId: 'run-codex', assetId: null, attempt: 1, parentId: null, createdAt: '2026-10-09T14:00:00Z', status: 'succeeded',
      credits: { consumed: 8, reserved: 0, refunded: 0, state: 'consumed' },
      calls: [{
        id: 'call-codex', operationId: 'operation-codex', stage: 'analysis', iteration: 1,
        provider: 'codex-local', authMode: 'chatgpt', requestedModel: 'codex-test', effectiveModel: null,
        inputTokens: 6400, outputTokens: 1600, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null,
        startedAt: '2026-10-09T14:00:00Z', endedAt: '2026-10-09T14:00:06Z', durationMs: 6000,
        status: 'succeeded', measurement: 'complete', source: 'codex.turn.completed',
      }],
    },
  ],
  pagination: { limit: 20, offset: 0, total: 2 },
}

async function stubAccount(page: Page, authenticated = true) {
  const requests: URL[] = []
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/me') return route.fulfill(authenticated ? { json: { user } } : { status: 401, json: { error: 'Not authenticated' } })
    if (url.pathname === '/api/credits') return route.fulfill({ json: creditFixture })
    if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [] } })
    if (url.pathname === '/api/usage') {
      requests.push(url)
      return route.fulfill({ json: usage })
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  return requests
}

test('account settings loads usage on demand, exposes each provider, and preserves the current draft', async ({ page }) => {
  // It is already October 10 in UTC, but the user's local day is October 9.
  await page.clock.setFixedTime(new Date('2026-10-10T01:30:00Z'))
  const requests = await stubAccount(page)
  await page.goto('/app?manual-flow=usage#draft')
  await page.getByRole('button', { name: `+ ${p.newProject}`, exact: true }).first().click()
  await page.getByLabel(p.projectName, { exact: true }).fill('Borrador para probar consumo')
  const originalUrl = page.url()
  const dialog = await openSettings(page)
  await expect(dialog.getByRole('heading', { name: common.settings.general, exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
  await dialog.getByRole('button', { name: common.settings.privacy, exact: true }).click()
  await expect(dialog.getByRole('heading', { name: common.settings.privacy, exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)

  await dialog.getByRole('button', { name: c.title, exact: true }).click()
  await expect(dialog.getByTestId('usage-credits-consumed')).toHaveText('20')
  await expect(dialog.getByTestId('usage-input-tokens')).toHaveText((18900).toLocaleString('es'))
  await expect(dialog.getByTestId('usage-measurement')).toHaveText(c.complete)
  await expect(dialog.getByRole('region', { name: c.observed, exact: true })).toContainText(`${c.output}: ${(4100).toLocaleString('es')}`)
  await page.screenshot({ path: '/tmp/t3-usage-settings-desktop.png', fullPage: true })
  expect(requests.length).toBeGreaterThan(0)
  await expect(page).toHaveURL(originalUrl)

  const openaiRow = dialog.getByRole('row').filter({ has: page.getByText(c.kinds.apartment, { exact: true }) })
  await expect(openaiRow).toContainText(c.api)
  await expect(openaiRow).toContainText(`${c.consumed}: 12`)
  const openaiToggle = openaiRow.getByRole('button', { name: new RegExp(c.details) })
  const openaiDetails = await openaiToggle.getAttribute('aria-controls')
  await openaiToggle.click()
  const openaiCall = dialog.locator(`[id="${openaiDetails}"] article`)
  await expect(openaiCall.getByText('gpt-6-test', { exact: true })).toBeVisible()
  await expect(openaiCall.getByText('gpt-6-test-2026-10-01', { exact: true })).toBeVisible()
  await expect(openaiCall.getByText((12500).toLocaleString('es'), { exact: true })).toBeVisible()
  await expect(openaiCall.getByText((2500).toLocaleString('es'), { exact: true })).toBeVisible()
  await expect(openaiCall.getByText('API key', { exact: true })).toBeVisible()
  await expect(openaiCall.getByText('openai.responses', { exact: true })).toBeVisible()

  const codexRow = dialog.getByRole('row').filter({ has: page.getByText(c.kinds.building, { exact: true }) })
  await expect(codexRow).toContainText(c.subscription)
  await expect(codexRow).not.toContainText(c.api)
  const codexToggle = codexRow.getByRole('button', { name: new RegExp(c.details) })
  const codexDetails = await codexToggle.getAttribute('aria-controls')
  await codexToggle.click()
  const codexCall = dialog.locator(`[id="${codexDetails}"] article`)
  await expect(codexCall.getByText(c.subscription, { exact: true })).toBeVisible()
  await expect(codexCall.getByText('ChatGPT', { exact: true })).toBeVisible()
  await expect(codexCall.getByText(c.unknownValue, { exact: true })).toBeVisible()

  await dialog.locator('summary').filter({ hasText: c.filters }).click()
  await dialog.getByRole('combobox', { name: c.period, exact: true }).selectOption('today')
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBe('2026-10-09T03:00:00.000Z')
  expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-10-10T03:00:00.000Z')
  await expect(dialog.getByTestId('usage-credits-consumed')).toHaveText('20')
  const beforeRefresh = requests.length
  await dialog.getByRole('button', { name: c.refresh, exact: true }).click()
  await expect.poll(() => requests.length).toBe(beforeRefresh + 1)
  expect(requests.at(-1)?.search).toBe(requests.at(-2)?.search)

  await dialog.getByRole('button', { name: common.settings.general, exact: true }).click()
  await dialog.getByRole('button', { name: c.title, exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: c.period, exact: true })).toHaveValue('today')
  expect(requests).toHaveLength(beforeRefresh + 1)
  await closeSettings(page)
  await expect(page).toHaveURL(originalUrl)
  await expect(page.getByLabel(p.projectName, { exact: true })).toHaveValue('Borrador para probar consumo')
})

test('usage in mobile settings keeps wide call tables inside their own scrolling container', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await stubAccount(page)
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: p.projectsTitle, exact: true })).toBeVisible()
  const dialog = await openSettings(page)
  await dialog.getByRole('button', { name: c.title, exact: true }).click()
  await expect(dialog.getByTestId('usage-input-tokens')).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-usage-settings-mobile.png', fullPage: true })
  const table = dialog.getByRole('table')
  const sizes = await table.evaluate(element => {
    const container = element.parentElement!
    const settings = element.closest('dialog')!
    const content = settings.querySelector('.settings-content')!
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      dialogFits: settings.scrollWidth <= settings.clientWidth,
      contentFits: content.scrollWidth <= content.clientWidth,
      tableScrolls: container.scrollWidth > container.clientWidth && getComputedStyle(container).overflowX === 'auto',
    }
  })
  expect(sizes).toEqual({ documentFits: true, dialogFits: true, contentFits: true, tableScrolls: true })
  const toggle = table.getByRole('button', { name: new RegExp(c.details) }).first()
  const details = await toggle.getAttribute('aria-controls')
  await toggle.click()
  await expect(dialog.locator(`[id="${details}"]`)).toBeVisible()
  await expect(dialog.locator('.settings-content')).toHaveJSProperty('scrollLeft', 0)
  await closeSettings(page)
})

test('anonymous account settings do not offer private usage or fetch its data', async ({ page }) => {
  const requests = await stubAccount(page, false)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: p.loginTitle, exact: true })).toBeVisible()
  const dialog = await openSettings(page)
  await expect(dialog.getByRole('button', { name: c.title, exact: true })).toHaveCount(0)
  expect(requests).toHaveLength(0)
})
