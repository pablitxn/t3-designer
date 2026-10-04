import { useSyncExternalStore } from 'react'
import { browserLanguages, i18n, readPreference } from './instance'
import { languageStorageKey, parsePreference, resolveLocale, type LanguagePreference } from './locale'

let preference = readPreference()
const listeners = new Set<() => void>()

function applyPreference(next: LanguagePreference) {
  preference = next
  void i18n.changeLanguage(resolveLocale(preference, browserLanguages()))
  listeners.forEach(listener => listener())
}

export function setLanguagePreference(next: LanguagePreference) {
  const validated = parsePreference(next)
  let saved = true
  try {
    if (validated === 'auto') window.localStorage.removeItem(languageStorageKey)
    else window.localStorage.setItem(languageStorageKey, validated)
  } catch {
    // Private/blocked storage still permits changing language for this session.
    saved = false
  }
  applyPreference(validated)
  return saved
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useLanguagePreference() {
  return useSyncExternalStore(subscribe, () => preference)
}

/** Install once at the app boundary; return cleanup for StrictMode/HMR. */
export function listenForLanguageChanges() {
  const browserChanged = () => {
    if (preference === 'auto') applyPreference('auto')
  }
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== null && event.key !== languageStorageKey) return
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    applyPreference(parsePreference(event.newValue))
  }
  window.addEventListener('languagechange', browserChanged)
  window.addEventListener('storage', storageChanged)
  return () => {
    window.removeEventListener('languagechange', browserChanged)
    window.removeEventListener('storage', storageChanged)
  }
}
