import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export const THEME_STORAGE_KEY = 't3-designer.theme'

const subscribers = new Set<() => void>()
let preference: ThemePreference = 'system'

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function storedPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme() {
  const theme = preference === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : preference
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function updatePreference(next: ThemePreference) {
  const changed = preference !== next
  preference = next
  applyTheme()
  if (changed) subscribers.forEach(subscriber => subscriber())
}

/** Apply the saved/system preference before React mounts. */
export function initializeTheme() {
  updatePreference(storedPreference())
}

/** The UI still changes for this session when storage is unavailable. */
export function setThemePreference(next: ThemePreference): boolean {
  if (!isThemePreference(next)) return false
  let persisted = true
  try {
    if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    persisted = false
  }
  updatePreference(next)
  return persisted
}

export function getThemePreference(): ThemePreference {
  return preference
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber)
  return () => { subscribers.delete(subscriber) }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => 'system')
}

export function listenForThemeChanges() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemChange = () => { if (preference === 'system') applyTheme() }
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    updatePreference(isThemePreference(event.newValue) ? event.newValue : 'system')
  }
  media.addEventListener('change', handleSystemChange)
  window.addEventListener('storage', handleStorageChange)
  applyTheme()
  return () => {
    media.removeEventListener('change', handleSystemChange)
    window.removeEventListener('storage', handleStorageChange)
  }
}
