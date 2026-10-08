import { expect, test } from '@playwright/test'
import { creditFixture } from './credit-fixture'
import { foundationAgentFixture, projectPath } from './foundation-agent-fixture'

test.use({ locale: 'es-AR' })

test('terminal polling refreshes both workshop balances after a delayed refund response', async ({ page }) => {
  const server = await foundationAgentFixture(page)
  const run = server.seedRun('dwelling')
  let balance = 4900
  let releaseCredits!: () => void
  const creditResponse = new Promise<void>(resolve => { releaseCredits = resolve })
  await page.route('**/api/credits', async route => {
    const summary = { ...creditFixture, balance }
    if (summary.balance === 4950) await creditResponse
    await route.fulfill({ json: summary })
  })
  await page.goto(projectPath)
  const dwelling = page.getByTestId('foundation-agent-dwelling')
  const building = page.getByTestId('foundation-agent-building')
  await expect(dwelling.getByRole('button', { name: 'Cancelar generación', exact: true })).toBeVisible()
  await expect(building.getByText('Créditos disponibles: 4900', { exact: true })).toBeVisible()

  balance = 4950
  run.status = 'failed'
  run.error = 'No se pudo completar el intento. Se devolvieron los créditos.'
  run.updatedAt = new Date().toISOString()

  // Keep the response pending until React renders the terminal state and stops polling.
  await expect(dwelling.getByText(run.error, { exact: true })).toBeVisible()
  releaseCredits()
  await expect(dwelling.getByText('Créditos disponibles: 4950', { exact: true })).toBeVisible()
  await expect(building.getByText('Créditos disponibles: 4950', { exact: true })).toBeVisible()
  expect(server.starts).toHaveLength(0)
})
