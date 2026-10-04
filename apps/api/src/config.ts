import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isIP } from 'node:net'
import { inferenceProvider } from './openai.ts'

export async function runtimeConfig(root: string) {
  const production = process.env.NODE_ENV === 'production'
  const directory = resolve(root, process.env.T3_ASSET_DATA_DIR || 'artifacts/asset-library')
  const accountDirectory = resolve(root, process.env.T3_ACCOUNT_DATA_DIR || 'artifacts/accounts')
  const port = Number(process.env.T3_API_PORT || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('T3_API_PORT debe ser un puerto válido.')
  const host = process.env.T3_API_HOST || '127.0.0.1'
  const publicURL = process.env.T3_PUBLIC_URL || 'http://127.0.0.1:5173'
  const origin = new URL(publicURL)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('T3_PUBLIC_URL debe ser el origen de la web.')
  if (production && (origin.protocol !== 'https:' || !process.env.T3_DATABASE_URL)) throw new Error('Production requiere HTTPS y T3_DATABASE_URL (PostgreSQL).')
  // Docker's private bridge needs an explicit bind override. It is accepted only
  // for a loopback browser origin; published/remote installations still use the
  // production HTTPS contract. The reference Compose does not publish this port.
  const localContainer = process.env.T3_LOCAL_CONTAINER === 'true'
  if (localContainer && (production || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) {
    throw new Error('T3_LOCAL_CONTAINER requiere desarrollo y un origen web loopback.')
  }
  if (!production && !['127.0.0.1', 'localhost', '::1'].includes(host)
    && !(localContainer && host === '0.0.0.0')) throw new Error('El modo de desarrollo solo puede escuchar en loopback salvo T3_LOCAL_CONTAINER explícito.')
  const trustedProxyIPs = (process.env.T3_TRUSTED_PROXY_IPS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (trustedProxyIPs.some(value => !isIP(value) || value.includes('%'))) throw new Error('T3_TRUSTED_PROXY_IPS acepta únicamente IPs exactas separadas por comas; no CIDR, hosts, zonas ni comodines.')
  await mkdir(accountDirectory, { recursive: true, mode: 0o700 })
  let secret = process.env.T3_AUTH_SECRET
  if (!secret && production) throw new Error('Production requiere T3_AUTH_SECRET aleatorio (mínimo 32 caracteres).')
  if (!secret) {
    const path = resolve(accountDirectory, 'session-secret')
    try { secret = (await readFile(path, 'utf8')).trim() }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      try { await writeFile(path, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }) }
      catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError }
      secret = (await readFile(path, 'utf8')).trim()
    }
  }
  if (secret.length < 32) throw new Error('T3_AUTH_SECRET requiere al menos 32 caracteres aleatorios.')
  const limit = (name: string, fallback: number) => {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) throw new Error(`${name} debe ser un entero entre 1 y 10000.`)
    return value
  }
  const generation = {
    enabled: process.env.T3_GENERATION_ENABLED === 'true',
    userIds: (process.env.T3_GENERATION_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    dailyLimit: limit('T3_GENERATION_DAILY_LIMIT', 5), globalDailyLimit: limit('T3_GENERATION_GLOBAL_DAILY_LIMIT', 20),
    pendingLimit: limit('T3_GENERATION_PENDING_LIMIT', 2),
  }
  if (production && generation.enabled && (inferenceProvider() !== 'openai' || !process.env.OPENAI_API_KEY)) throw new Error('La generación remota requiere T3_INFERENCE_PROVIDER=openai y OPENAI_API_KEY del servidor.')
  const creditConfig = {
    trialDays: limit('T3_TRIAL_DAYS', 15), trialCredits: limit('T3_TRIAL_CREDITS', 100),
    premiumMonthlyCredits: limit('T3_PREMIUM_MONTHLY_CREDITS', 1000),
    costs: { asset: limit('T3_CREDIT_COST_ASSET', 20), revision: limit('T3_CREDIT_COST_REVISION', 10),
      project: limit('T3_CREDIT_COST_PROJECT', 50), building: limit('T3_CREDIT_COST_BUILDING', 100), apartment: limit('T3_CREDIT_COST_APARTMENT', 50) },
  }
  const billingMode = process.env.T3_BILLING_MODE || 'disabled'
  if (!['disabled', 'sandbox', 'mock'].includes(billingMode) || (production && billingMode === 'mock')) throw new Error('T3_BILLING_MODE debe ser disabled o sandbox en producción; mock solo es local.')
  const amount = (name: string, fallback: number) => {
    const value = Number(process.env[name] || fallback)
    if (!Number.isFinite(value) || value <= 0 || value > 10000000 || Math.round(value * 100) / 100 !== value) throw new Error(`${name} debe ser un importe ARS positivo con hasta 2 decimales.`)
    return value
  }
  const billing = { mode: billingMode as 'disabled' | 'sandbox' | 'mock', publicUrl: origin.origin,
    accessToken: process.env.MP_ACCESS_TOKEN, webhookSecret: process.env.MP_WEBHOOK_SECRET, payerEmail: process.env.MP_SANDBOX_PAYER_EMAIL,
    monthlyAmount: amount('T3_MONTHLY_AMOUNT_ARS', 10000), monthlyCredits: limit('T3_MONTHLY_CREDITS', 500),
    smallPackAmount: amount('T3_SMALL_PACK_AMOUNT_ARS', 3000), smallPackCredits: limit('T3_SMALL_PACK_CREDITS', 100),
    largePackAmount: amount('T3_LARGE_PACK_AMOUNT_ARS', 12000), largePackCredits: limit('T3_LARGE_PACK_CREDITS', 500),
  }
  if (billingMode === 'sandbox' && (!billing.accessToken || !billing.webhookSecret || billing.webhookSecret.length < 32 || !billing.payerEmail || origin.protocol !== 'https:')) throw new Error('Mercado Pago sandbox requiere credenciales de prueba, firma webhook, email comprador de prueba y HTTPS.')
  const libraryMaxBytes = limit('T3_LIBRARY_MAX_MIB', 1536) * 1024 * 1024
  return { libraryMaxBytes, creditConfig, billing, directory, accountDirectory, host, port, publicURL: origin.origin, secret, production, generation, trustedProxyIPs, databaseURL: process.env.T3_DATABASE_URL }
}
