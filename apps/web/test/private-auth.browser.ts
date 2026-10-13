import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, expect, type Browser } from '@playwright/test'
import { createServer } from 'vite'

// Real browser → Vite proxy → production API entry point → Better Auth/SQLite.
// All accounts, passwords and files are disposable. Never consumes inference.
test('activation, login, project persistence, sharing and revocation through the real API', { timeout: 120_000 }, async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), 't3-account-browser-'))
  const available = createNetServer()
  available.listen(0, '127.0.0.1'); await once(available, 'listening')
  const address = available.address(); assert.ok(address && typeof address !== 'string')
  const apiPort = address.port
  available.close(); await once(available, 'close')
  const vite = await createServer({
    mode: 'full', configFile: join(root, 'apps/web/vite.config.ts'), root: join(root, 'apps/web'),
    server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  })
  await vite.listen()
  const origin = vite.resolvedUrls!.local[0].replace(/\/$/, '')
  const env = { ...process.env, NODE_ENV: 'development', T3_DATABASE_URL: '', T3_AUTH_SECRET: randomBytes(48).toString('hex'),
    T3_BILLING_MODE: 'disabled', T3_TRIAL_DAYS: '15', T3_TRIAL_CREDITS: '100', T3_PREMIUM_MONTHLY_CREDITS: '1000',
    T3_PUBLIC_URL: origin, T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_GENERATION_ENABLED: 'false',
    T3_ACCOUNT_DATA_DIR: join(directory, 'accounts'), T3_ASSET_DATA_DIR: join(directory, 'assets') }
  let browser: Browser | undefined
  let logs = ''
  const api = spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', chunk => { logs += String(chunk) }); api.stderr.on('data', chunk => { logs += String(chunk) })
  try {
    await expect.poll(async () => {
      if (api.exitCode !== null) throw new Error(`API stopped: ${logs}`)
      return fetch(`http://127.0.0.1:${apiPort}/api/live`).then(response => response.status, () => 0)
    }, { timeout: 20_000 }).toBe(200)
    await promisify(execFile)(process.execPath, [join(root, 'apps/api/src/account-cli.ts'), 'bootstrap', 'owner@example.test'], { env })
    const activation = (await readFile(join(directory, 'accounts/bootstrap-link.txt'), 'utf8')).trim()
    browser = await chromium.launch({ args: ['--disable-webgl'], ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}), ...(process.env.T3_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.T3_PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
    const owner = await browser.newContext({ locale: 'es-AR' })
    const guest = await browser.newContext({ locale: 'es-AR' })
    const page = await owner.newPage()
    const other = await guest.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message)); other.on('pageerror', error => errors.push(error.message))
    const password = randomBytes(24).toString('base64url')
    await page.goto(activation)
    await page.getByLabel('Tu nombre', { exact: true }).fill('Propietario de prueba')
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.test')
    await page.getByLabel(/^Contraseña/).fill(password)
    await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/app`)
    await page.getByRole('navigation', { name: 'Tu espacio', exact: true }).getByRole('link', { name: 'Créditos y plan', exact: true }).click()
    await expect(page.getByTestId('credit-balance')).toHaveText('1000')
    await expect(page.getByRole('button', { name: 'Elegir suscripción' })).toBeDisabled()
    await page.getByRole('link', { name: 'Mis proyectos', exact: true }).click()
    await page.getByRole('button', { name: /Nuevo proyecto/ }).first().click()
    await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Proyecto privado de prueba')
    await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/projects\/[\da-f-]+$/)
    const projectURL = page.url()
    await expect(page.getByRole('heading', { name: 'Las bases de tu proyecto', exact: true })).toBeVisible()
    await expect(page.getByLabel('Variantes del departamento')).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Tipo de vivienda', exact: true }).selectOption('house')
    await page.getByLabel('Nombre de la planta', { exact: true }).fill('Planta baja de Juan')
    await page.getByLabel('Agregar imagen del plano', { exact: true }).setInputFiles({
      name: 'planta-baja.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'),
    })
    await expect(page.getByRole('img', { name: 'planta-baja.png', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Agregar planta', exact: false }).click()
    await page.getByLabel('Nombre de la planta', { exact: true }).nth(1).fill('Primer piso de Juan')
    await page.getByRole('combobox', { name: 'País / territorio', exact: true }).selectOption('AR')
    await page.getByLabel('Dirección de la propiedad', { exact: true }).fill('Dirección de prueba, Córdoba')
    await page.getByLabel(/^Notas del proyecto/).fill('Nota privada persistida por el servidor')
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel(/^Notas del proyecto/)).toHaveValue('Nota privada persistida por el servidor')
    await expect(page.getByLabel('Nombre de la planta', { exact: true })).toHaveCount(2)
    await expect(page.getByLabel('Nombre de la planta', { exact: true }).nth(1)).toHaveValue('Primer piso de Juan')
    await expect(page.getByLabel('Dirección de la propiedad', { exact: true })).toHaveValue('Dirección de prueba, Córdoba')
    const planURL = await page.getByRole('img', { name: 'planta-baja.png', exact: true }).getAttribute('src')
    assert.ok(planURL && planURL.startsWith('/api/projects/'))
    assert.equal((await owner.request.get(origin + planURL)).status(), 200)
    const projectId = new URL(projectURL).pathname.split('/').at(-1)
    const clonedResponse = await owner.request.post(`${origin}/api/projects/${projectId}/clone`, { data: {}, headers: { Origin: origin } })
    assert.equal(clonedResponse.status(), 201)
    const { project: cloned } = await clonedResponse.json()
    assert.equal(cloned.scene, null)
    assert.equal(cloned.foundations.dwelling.levels.length, 2)
    assert.equal((await owner.request.get(origin + planURL.replace(projectId!, cloned.id))).status(), 200)
    const cookies = await owner.cookies()
    assert.ok(cookies.some(cookie => cookie.httpOnly && cookie.sameSite === 'Lax'))
    await page.getByRole('link', { name: 'Personas e invitaciones', exact: true }).click()
    await page.getByLabel('Correo para invitar', { exact: true }).fill('friend@example.test')
    await page.getByRole('button', { name: 'Crear invitación', exact: true }).click()
    const invitation = await page.getByLabel('Enlace personal de invitación', { exact: true }).inputValue()
    await other.goto(invitation)
    await expect(other.getByText('100 créditos · 15 días', { exact: true })).toBeVisible()
    await other.getByLabel('Tu nombre', { exact: true }).fill('Amiga de prueba')
    await other.getByLabel('Correo electrónico', { exact: true }).fill('friend@example.test')
    await other.getByLabel(/^Contraseña/).fill(password)
    await other.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click()
    await expect(other).toHaveURL(`${origin}/app`)
    await expect(other.getByText('Tu primer proyecto empieza acá.', { exact: true })).toBeVisible()
    await expect(other.getByRole('link', { name: 'Invitaciones', exact: true })).toHaveCount(0)
    await other.getByRole('navigation', { name: 'Tu espacio', exact: true }).getByRole('link', { name: 'Créditos y plan', exact: true }).click()
    await expect(other.getByTestId('credit-balance')).toHaveText('100')
    await other.goto(projectURL)
    await expect(other.getByText('Este proyecto no está disponible o ya no tenés acceso.', { exact: true })).toBeVisible()
    await page.goto(projectURL)
    await page.getByLabel('Correo de la persona', { exact: true }).fill('friend@example.test')
    await page.getByRole('button', { name: 'Compartir proyecto', exact: true }).click()
    await expect(page.getByText('friend@example.test', { exact: true })).toBeVisible()
    await other.reload()
    await expect(other.getByLabel(/^Notas del proyecto/)).toHaveValue('Nota privada persistida por el servidor')
    await expect(other.getByLabel(/^Notas del proyecto/)).toHaveAttribute('readonly')
    await expect(other.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0)
    await expect(other.getByLabel('Nombre de la planta', { exact: true }).nth(1)).toHaveValue('Primer piso de Juan')
    await expect(other.getByLabel('Nombre de la planta', { exact: true }).nth(1)).toBeDisabled()
    assert.equal((await guest.request.get(origin + planURL)).status(), 200)
    await page.getByRole('button', { name: 'Quitar acceso', exact: true }).click()
    await expect(page.getByText('Solo vos tenés acceso a este proyecto.', { exact: true })).toBeVisible()
    await other.reload()
    await expect(other.getByText('Este proyecto no está disponible o ya no tenés acceso.', { exact: true })).toBeVisible()
    assert.equal((await guest.request.get(origin + planURL)).status(), 404)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.test')
    await page.getByLabel(/^Contraseña/).fill(password)
    await page.getByRole('button', { name: /^Iniciar sesión/ }).click()
    await expect(page.getByRole('heading', { name: 'Proyecto privado de prueba', exact: true })).toBeVisible()
    await page.goto(projectURL)
    await expect(page.getByLabel(/^Notas del proyecto/)).toHaveValue('Nota privada persistida por el servidor')
    await page.screenshot({ path: '/tmp/t3-private-project-real.png', fullPage: true })
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await vite.close()
    if (api.exitCode === null) { const exited = once(api, 'exit'); api.kill('SIGTERM'); await exited }
    await rm(directory, { recursive: true, force: true })
  }
})
