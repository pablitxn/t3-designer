import {
  buildPayload, CONSENT_KEY, consentExpiry, POLICY_VERSION, readConsent, resolveAnalyticsConfig,
  type AnalyticsEvent, type AnalyticsView, type ConsentRecord,
} from './analytics-policy.ts'
import { workspaceFromHash } from './workspace-view.ts'
import { isPrivacyPath } from './privacy-route.ts'
import { analyticsEnvironment, getSiteConfig } from './site-config.ts'

type Snapshot = {
  choice: 'pending' | 'accepted' | 'rejected'
  reason: 'available' | 'config' | 'signals' | 'storage' | 'tracker'
  enabled: boolean
}
type Umami = { track: (payload: () => object) => Promise<unknown> }
type AnalyticsWindow = Window & {
  umami?: Umami
  t3AnalyticsBeforeSend?: (type: string, payload: object) => false
  doNotTrack?: string
}
const browser = window as AnalyticsWindow
const config = resolveAnalyticsConfig(analyticsEnvironment(getSiteConfig()), window.location, import.meta.env.PROD)
const consentVersion = `${POLICY_VERSION}:${getSiteConfig().privacyRevision}`
const listeners = new Set<() => void>()
const storageProbeKey = 't3-designer.analytics-storage-check'
let snapshot: Snapshot = { choice: 'pending', reason: config ? 'available' : 'config', enabled: false }
let record: ConsentRecord | null = null
let storageFailed = false
let trackerFailed = false
let suspended = false
let script: HTMLScriptElement | undefined
let loadingTimer: ReturnType<typeof setTimeout> | undefined
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let generation = 0
let tracker: Umami | undefined
let cache: string | undefined
let sending = false
let queue: object[] = []
const pending = new Set<AbortController>()
let permittedPayloads = new WeakSet<object>()
const initialWorkspace = workspaceFromHash(window.location.hash)
let currentView: AnalyticsView | null = window.location.pathname !== '/' || isPrivacyPath(window.location.pathname) || initialWorkspace === 'assets' || initialWorkspace === 'walkthrough' ? null : initialWorkspace
let solarVisible = currentView === 'building' || currentView === 'apartment'
let lastView: AnalyticsView | undefined
let lastSolar: AnalyticsView | undefined

function privacySignal() {
  const navigator = window.navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return navigator.globalPrivacyControl === true
    || [navigator.doNotTrack, navigator.msDoNotTrack, browser.doNotTrack].some(value => String(value) === '1' || value === 'yes')
}

function publish() {
  const next: Snapshot = {
    choice: record?.choice ?? 'pending',
    reason: storageFailed ? 'storage' : privacySignal() ? 'signals' : !config ? 'config' : trackerFailed ? 'tracker' : 'available',
    enabled: !!config && record?.choice === 'accepted' && !storageFailed && !privacySignal() && !trackerFailed && !suspended && currentView !== null && !!tracker,
  }
  if (next.choice !== snapshot.choice || next.reason !== snapshot.reason || next.enabled !== snapshot.enabled) {
    snapshot = next
    listeners.forEach(listener => listener())
  }
}

function stop() {
  generation++
  clearTimeout(loadingTimer)
  script?.remove()
  script = undefined
  tracker = undefined
  delete browser.umami
  cache = undefined
  queue = []
  permittedPayloads = new WeakSet<object>()
  sending = false
  lastView = undefined
  lastSolar = undefined
  pending.forEach(controller => controller.abort())
  pending.clear()
  // Keep the before-send gate installed: a removed script can still finish loading.
}

function refreshRecord() {
  if (storageFailed) return
  try {
    let stored = window.localStorage.getItem(CONSENT_KEY)
    record = readConsent(stored, Date.now(), consentVersion)
    if (record?.choice === 'accepted' && stored) {
      // Readable-but-readonly storage cannot safely persist a future withdrawal.
      // Never rewrite a read consent: that could overwrite another tab's rejection.
      // This empty technical probe is removed immediately and carries no user data.
      try {
        window.localStorage.setItem(storageProbeKey, '')
        if (window.localStorage.getItem(storageProbeKey) !== '') throw new Error('Storage unavailable')
      } finally {
        window.localStorage.removeItem(storageProbeKey)
      }
      stored = window.localStorage.getItem(CONSENT_KEY)
      record = readConsent(stored, Date.now(), consentVersion)
    }
  } catch {
    storageFailed = true
    record = null
  }
}

/** Re-read consent before every network operation, including continuations and other-tab changes. */
function allowed() {
  refreshRecord()
  const value = !!config && record?.choice === 'accepted' && !storageFailed && !privacySignal() && !trackerFailed && !suspended
    && currentView !== null && window.location.pathname === '/' && !isPrivacyPath(window.location.pathname)
  if (!value) {
    stop()
    publish()
  }
  return value
}

function failTracker() {
  trackerFailed = true
  stop()
  publish()
}

/** Serial, bounded delivery. Umami's cache is kept only in memory and cleared on withdrawal. */
function deliverNext() {
  if (sending || !queue.length || !config || !allowed()) return
  const payload = queue.shift()!
  const activeGeneration = generation
  const controller = new AbortController()
  pending.add(controller)
  sending = true
  const timeout = setTimeout(() => controller.abort(), 8_000)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-umami-website-id': config.websiteId,
    'x-umami-hostname': config.hostname,
  }
  if (cache) headers['x-umami-cache'] = cache
  void fetch(config.collectorUrl, {
    method: 'POST', headers, body: JSON.stringify({ type: 'event', payload }),
    credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
    // No keepalive, retries or offline replay after the page/consent lifetime ends.
  }).then(async response => {
    if (!response.ok) throw new Error('Analytics unavailable')
    const result: unknown = await response.json()
    if (generation !== activeGeneration || !allowed()) return
    if (!result || typeof result !== 'object') throw new Error('Invalid analytics response')
    const value = result as { cache?: unknown; disabled?: unknown }
    if (value.disabled === true) throw new Error('Analytics disabled')
    cache = typeof value.cache === 'string' ? value.cache : undefined
  }).catch(() => {
    if (generation === activeGeneration) failTracker()
  }).finally(() => {
    clearTimeout(timeout)
    pending.delete(controller)
    if (generation === activeGeneration) {
      sending = false
      deliverNext()
    }
  })
}

// Umami 3.4 awaits before-send before its own fetch. Returning false ALWAYS is essential:
// consent may change during that await. Only this synchronous gate owns the transport.
browser.t3AnalyticsBeforeSend = (type, payload) => {
  if (type === 'event' && permittedPayloads.has(payload)) {
    permittedPayloads.delete(payload)
    if (allowed() && queue.length < 16) {
      queue.push(payload)
      deliverNext()
    }
  }
  return false
}

function send(event?: AnalyticsEvent) {
  if (!tracker || !config || !currentView || !allowed()) return
  const activeGeneration = generation
  const payload = buildPayload(config, currentView, event)
  if (!payload) return
  permittedPayloads.add(payload)
  try {
    // The callback form preserves identity; track(object) clones it in Umami 3.4.
    void tracker.track(() => payload).catch(() => {
      // A broken/blocked tracker must not affect the application.
      if (generation === activeGeneration) failTracker()
    })
  } catch {
    failTracker()
  }
}

function flushView() {
  if (!tracker || !currentView || !allowed()) return
  if (lastView !== currentView) {
    const previous = lastView
    lastView = currentView
    lastSolar = undefined
    send()
    if (previous) send({ name: 'view_changed' })
    if (currentView === 'documentation') send({ name: 'dossier_opened' })
  }
  if (solarVisible && currentView !== 'documentation') {
    if (lastSolar !== currentView) {
      lastSolar = currentView
      send({ name: 'solar_opened' })
    }
  } else lastSolar = undefined
}

function start() {
  if (!allowed() || script || tracker || !config) return
  const activeGeneration = generation
  const element = document.createElement('script')
  script = element
  element.src = config.scriptUrl
  element.async = true
  element.referrerPolicy = 'no-referrer'
  element.dataset.websiteId = config.websiteId
  element.dataset.hostUrl = config.hostUrl
  element.dataset.domains = config.hostname
  element.dataset.autoTrack = 'false'
  element.dataset.doNotTrack = 'true'
  element.dataset.excludeSearch = 'true'
  element.dataset.excludeHash = 'true'
  element.dataset.beforeSend = 't3AnalyticsBeforeSend'
  element.onload = () => {
    if (generation !== activeGeneration || !allowed()) return
    clearTimeout(loadingTimer)
    if (typeof browser.umami?.track !== 'function') return failTracker()
    tracker = browser.umami
    publish()
    flushView()
  }
  element.onerror = () => { if (generation === activeGeneration) failTracker() }
  loadingTimer = setTimeout(() => { if (generation === activeGeneration) failTracker() }, 8_000)
  document.head.append(element)
}

function scheduleExpiry() {
  clearTimeout(expiryTimer)
  if (!record) return
  expiryTimer = setTimeout(reconcile, Math.min(Math.max(record.expiresAt - Date.now(), 1), 2_147_483_647))
}

function reconcile() {
  refreshRecord()
  if (!allowed()) stop()
  else start()
  scheduleExpiry()
  publish()
}

function choose(choice: ConsentRecord['choice']) {
  if (choice === 'accepted' && record?.choice === 'accepted' && allowed() && (script || tracker)) return
  // Close the old session synchronously, even when persisting the decision fails.
  stop()
  record = null
  trackerFailed = false
  try {
    const next = { choice, version: consentVersion, expiresAt: consentExpiry(Date.now()) }
    const encoded = JSON.stringify(next)
    window.localStorage.setItem(CONSENT_KEY, encoded)
    if (window.localStorage.getItem(CONSENT_KEY) !== encoded) throw new Error('Consent storage unavailable')
    storageFailed = false
    record = next
  } catch {
    storageFailed = true
    // Best effort: don't leave a previously accepted choice behind on a write failure.
    try { window.localStorage.removeItem(CONSENT_KEY) } catch { /* fail closed for this page */ }
  }
  reconcile()
}

function storageChanged(event: StorageEvent) {
  if (event.key === null || event.key === CONSENT_KEY) reconcile()
}
function resume() { if (!suspended) reconcile() }
function restore() { suspended = false; reconcile() }
function visibilityChanged() { if (document.visibilityState === 'visible') resume() }
function suspend() { suspended = true; stop(); publish() }
window.addEventListener('storage', storageChanged)
window.addEventListener('pageshow', restore)
window.addEventListener('pagehide', suspend)
window.addEventListener('focus', resume)
document.addEventListener('visibilitychange', visibilityChanged)

export const analytics = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot: () => snapshot,
  accept: () => choose('accepted'),
  reject: () => choose('rejected'),
  view(view: AnalyticsView | null, solarOpen: boolean) {
    currentView = view
    solarVisible = solarOpen
    if (view === null) { stop(); publish(); return }
    start()
    flushView()
  },
  downloadGlb() { send({ name: 'glb_download' }) },
}

reconcile()

if (import.meta.hot) import.meta.hot.dispose(() => {
  stop()
  clearTimeout(expiryTimer)
  window.removeEventListener('storage', storageChanged)
  window.removeEventListener('pageshow', restore)
  window.removeEventListener('pagehide', suspend)
  window.removeEventListener('focus', resume)
  document.removeEventListener('visibilitychange', visibilityChanged)
  browser.t3AnalyticsBeforeSend = () => false
})
