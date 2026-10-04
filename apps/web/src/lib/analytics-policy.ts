/** Public product policy, not a legal retention guarantee. Bump the version on material changes. */
export const POLICY_VERSION = '2026-10-04.1'
export const CONSENT_MONTHS = 6
export const CONSENT_KEY = 't3-designer.analytics-consent'

export type ConsentRecord = {
  choice: 'accepted' | 'rejected'
  version: string
  expiresAt: number
}

export function consentExpiry(now: number, months = CONSENT_MONTHS): number {
  const date = new Date(now)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date.getTime()
}

export function readConsent(raw: string | null, now: number, version = POLICY_VERSION): ConsentRecord | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (Object.keys(record).sort().join(',') !== 'choice,expiresAt,version'
      || (record.choice !== 'accepted' && record.choice !== 'rejected')
      || record.version !== version || typeof record.expiresAt !== 'number'
      || !Number.isFinite(record.expiresAt) || record.expiresAt <= now
      || record.expiresAt > consentExpiry(now)) return null
    return record as ConsentRecord
  } catch {
    return null
  }
}

export type AnalyticsEnv = {
  VITE_UMAMI_SCRIPT_URL?: string
  VITE_UMAMI_HOST_URL?: string
  VITE_UMAMI_WEBSITE_ID?: string
  VITE_UMAMI_ALLOWED_HOSTNAME?: string
}
export type AnalyticsConfig = {
  scriptUrl: string
  hostUrl: string
  collectorUrl: string
  websiteId: string
  hostname: string
}

/** All four public settings and an exact production hostname match are required. */
export function resolveAnalyticsConfig(
  env: AnalyticsEnv,
  location: { origin: string; hostname: string; protocol: string },
  production: boolean,
): AnalyticsConfig | null {
  if (!production) return null
  const websiteId = env.VITE_UMAMI_WEBSITE_ID?.trim()
  const hostname = env.VITE_UMAMI_ALLOWED_HOSTNAME?.trim().toLowerCase()
  if (!websiteId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(websiteId)
    || !hostname || hostname !== location.hostname.toLowerCase()
    || !/^[a-z0-9.-]+$/.test(hostname)) return null
  const isLocal = ['localhost', '127.0.0.1'].includes(hostname)
  if (location.protocol !== 'https:' && !(isLocal && location.protocol === 'http:')) return null
  function endpoint(value: string | undefined): URL | null {
    if (!value || value.trim() !== value || (!value.startsWith('/') && !value.startsWith('https://') && !value.startsWith('http://'))) return null
    try {
      const url = new URL(value, location.origin)
      if (url.username || url.password || url.search || url.hash
        || (url.protocol !== 'https:' && !(isLocal && url.origin === location.origin && url.protocol === 'http:'))) return null
      return url
    } catch {
      return null
    }
  }
  const script = endpoint(env.VITE_UMAMI_SCRIPT_URL)
  const host = endpoint(env.VITE_UMAMI_HOST_URL)
  if (!script || !host) return null
  const hostUrl = host.href.replace(/\/+$/, '')
  if (hostUrl.endsWith('/api/send')) return null
  return { scriptUrl: script.href, hostUrl, collectorUrl: `${hostUrl}/api/send`, websiteId, hostname }
}

export const analyticsViews = ['apartment', 'building', 'documentation'] as const
export type AnalyticsView = typeof analyticsViews[number]
export type AnalyticsEvent = { name: 'view_changed' | 'solar_opened' | 'dossier_opened' | 'glb_download' }
const names = new Set(['view_changed', 'solar_opened', 'dossier_opened', 'glb_download'])
const titles: Record<AnalyticsView, string> = { apartment: 'Apartment', building: 'Building', documentation: 'Documentation' }

/** Construct from constants only. Never spread DOM, URL, dossier or caller-supplied data. */
export function buildPayload(config: AnalyticsConfig, view: AnalyticsView, event?: AnalyticsEvent) {
  if (!analyticsViews.includes(view) || (event && !names.has(event.name))) return null
  return {
    website: config.websiteId,
    hostname: config.hostname,
    url: `/${view}`,
    title: `T3 Designer · ${titles[view]}`,
    referrer: '',
    ...(event ? { name: event.name, data: { view } } : {}),
  }
}
