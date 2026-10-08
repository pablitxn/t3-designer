import { expect, test } from '@playwright/test'
import { foundationAgentFixture, projectPath } from './foundation-agent-fixture'

test.use({ locale: 'es-AR' })

test('a replaced dwelling explains the stale building alignment without showing the old scene as current', async ({ page }) => {
  const server = await foundationAgentFixture(page)
  server.makeReady(true)
  const project = server.saved()
  const building = project.foundationModels!.building!.candidate
  if (building.target !== 'building') throw new Error('Expected building fixture')
  building.dwellingRegistration = { dwellingVersionId: '11111111-1111-4111-8111-111111111111', position: [0, 0, 0], evidence: { confidence: 'user', note: 'Registro de la versión de vivienda anterior.' } }
  project.foundations!.building.status = 'draft'
  project.stage = 'setup'
  await page.route(`**/api/projects/${project.id}`, route => route.fulfill({ json: { project } }))
  await page.goto(projectPath)
  await expect(page.getByText('La vivienda cambió. Corregí su alineación desde el chat del edificio y aplicá la propuesta revisada. Conservamos la escena anterior como referencia hasta que ambas versiones vuelvan a coincidir.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('foundation-agent-building')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Planta', exact: true })).toHaveCount(0)
  await expect(page.locator('summary').filter({ hasText: /^Energía solar del edificio$/ })).toHaveCount(0)

  building.dwellingRegistration.dwellingVersionId = project.foundationModels!.dwelling!.versionId
  project.foundations!.building.status = 'ready'
  project.stage = 'ready'
  await page.reload()
  await expect(page.getByText(/^La vivienda cambió\./)).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Planta', exact: true })).toBeVisible()
  expect(server.starts).toHaveLength(0)
  expect(server.writes).toHaveLength(0)
})
