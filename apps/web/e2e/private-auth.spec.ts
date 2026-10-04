import { expect, test } from '@playwright/test'

test.use({ locale: 'es-AR' })
const user = { id: 'test-user', name: 'Usuario de prueba', email: 'owner@example.test', role: 'user' }

test('requires a session before loading private assets and keeps sign-in errors generic', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/**', route => {
    requests.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 401, json: { error: 'The account exists but its password is wrong' } })
  })
  await page.goto('/app/assets')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toHaveText('No pudimos iniciar sesión. Revisá tus datos o contactá a quien te invitó.')
  expect(requests).not.toContain('/api/assets')
  expect(requests).not.toContain('/api/jobs')
  await expect(page.getByText('The account exists')).toHaveCount(0)
})

test('accepts an invitation from memory after removing its token from the address bar', async ({ page }) => {
  const token = 'private-test-invitation-token'
  const urls: string[] = []
  let submitted: unknown
  await page.route('**/api/**', route => {
    urls.push(route.request().url())
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    if (path === '/api/account/invitation') return route.fulfill({ json: { invitation: { email: user.email, tier: 'standard', trialDays: 15, trialCredits: 100, expiresAt: '2030-10-04T10:00:00Z' } } })
    if (path === '/api/account/accept-invitation') { submitted = route.request().postDataJSON(); return route.fulfill({ json: { user } }) }
    return route.fulfill({ json: { projects: [] } })
  })
  await page.goto(`/invite#token=${token}`)
  await expect(page).toHaveURL(/\/invite$/)
  await page.getByLabel('Tu nombre', { exact: true }).fill(user.name)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('long-test-password')
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Tu primer proyecto empieza acá.' })).toBeVisible()
  expect(submitted).toEqual({ token, email: user.email, name: user.name, password: 'long-test-password' })
  expect(urls.every(url => !url.includes(token))).toBe(true)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token)
})

test('recovers a password with a one-use fragment token and returns to sign-in', async ({ page }) => {
  let submitted: unknown
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/account/reset-password') { submitted = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  })
  await page.goto('/recover#token=recovery-test-token')
  await expect(page).toHaveURL(/\/recover$/)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveCount(0)
  await page.getByLabel('Contraseña', { exact: true }).fill('replacement-password')
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toHaveText('Contraseña actualizada. Iniciá sesión con tu nueva contraseña.')
  expect(submitted).toEqual({ token: 'recovery-test-token', password: 'replacement-password' })
})

test('session expiry clears mounted private data before showing sign-in', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    return route.fulfill({ json: { projects: [{ id: 'project-private', name: 'Private project title', notes: '', role: 'owner', ownerId: user.id, revision: 1, createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z' }] } })
  })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Private project title' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('t3:session-expired')))
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByText('Private project title')).toHaveCount(0)
})
