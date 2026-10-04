import { resolveAnalyticsConfig, type AnalyticsEnv } from './analytics-policy.ts'

export type SiteOperator = {
  name: string
  contactEmail: string
  reviewedOn: string
  hosting: string
  operationalLogs: string
  retention: string
}
export type SiteConfig = {
  version: 1
  privacyRevision: string
  operator?: SiteOperator
  analytics?: { scriptUrl: string; hostUrl: string; websiteId: string; hostname: string }
}
export const defaultSiteConfig: Readonly<SiteConfig> = Object.freeze({ version: 1, privacyRevision: 'unconfigured' })
let activeConfig: Readonly<SiteConfig> = defaultSiteConfig
export function getSiteConfig(): Readonly<SiteConfig> { return activeConfig }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum
    && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}
export function analyticsEnvironment(config: Readonly<SiteConfig>): AnalyticsEnv {
  return config.analytics ? {
    VITE_UMAMI_SCRIPT_URL: config.analytics.scriptUrl,
    VITE_UMAMI_HOST_URL: config.analytics.hostUrl,
    VITE_UMAMI_WEBSITE_ID: config.analytics.websiteId,
    VITE_UMAMI_ALLOWED_HOSTNAME: config.analytics.hostname,
  } : {}
}

/** Public JSON only. Invalid or incomplete operator information disables the profile. */
export function parseSiteConfig(value: unknown, location: { origin: string; hostname: string; protocol: string }): Readonly<SiteConfig> {
  if (!record(value) || !keys(value, ['version', 'privacyRevision', 'operator', 'analytics']) || value.version !== 1
    || !text(value.privacyRevision, 64) || !/^[a-zA-Z0-9._-]+$/.test(value.privacyRevision)) return defaultSiteConfig
  const operator = value.operator
  if (!record(operator) || !keys(operator, ['name', 'contactEmail', 'reviewedOn', 'hosting', 'operationalLogs', 'retention'])
    || !text(operator.name, 120) || !text(operator.contactEmail, 254) || !/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(operator.contactEmail)
    || !text(operator.reviewedOn, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(operator.reviewedOn)
    || !Number.isFinite(Date.parse(operator.reviewedOn)) || new Date(operator.reviewedOn).toISOString().slice(0, 10) !== operator.reviewedOn
    || !text(operator.hosting, 1500) || !text(operator.operationalLogs, 1500) || !text(operator.retention, 1500)) return defaultSiteConfig
  const config: SiteConfig = { version: 1, privacyRevision: value.privacyRevision, operator: Object.freeze({
    name: operator.name, contactEmail: operator.contactEmail, reviewedOn: operator.reviewedOn,
    hosting: operator.hosting, operationalLogs: operator.operationalLogs, retention: operator.retention,
  }) }
  if (value.analytics !== undefined) {
    const analytics = value.analytics
    if (!record(analytics) || !keys(analytics, ['scriptUrl', 'hostUrl', 'websiteId', 'hostname'])
      || !text(analytics.scriptUrl, 2048) || !text(analytics.hostUrl, 2048) || !text(analytics.websiteId, 36) || !text(analytics.hostname, 253)) return defaultSiteConfig
    config.analytics = { scriptUrl: analytics.scriptUrl, hostUrl: analytics.hostUrl, websiteId: analytics.websiteId, hostname: analytics.hostname }
    if (!resolveAnalyticsConfig(analyticsEnvironment(config), location, true)) return defaultSiteConfig
    Object.freeze(config.analytics)
  }
  return Object.freeze(config)
}

/** Runs before App/analytics imports. Missing JSON, SPA fallbacks and failures are neutral. */
export async function loadSiteConfig(options: {
  origin: string
  baseUrl: string
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<Readonly<SiteConfig>> {
  activeConfig = defaultSiteConfig
  try {
    const origin = new URL(options.origin)
    const url = new URL(`${options.baseUrl.replace(/\/?$/, '/')}site-config.json`, origin)
    if (url.origin !== origin.origin) return activeConfig
    const response = await (options.fetcher ?? fetch)(url, {
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(options.timeoutMs ?? 1500),
    })
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
      || Number(response.headers.get('content-length') ?? 0) > 32768) return activeConfig
    const body = await response.text()
    if (body.length > 32768) return activeConfig
    activeConfig = parseSiteConfig(JSON.parse(body), origin)
  } catch { /* A static demo never depends on operator configuration availability. */ }
  return activeConfig
}
