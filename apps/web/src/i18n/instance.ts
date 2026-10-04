import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'
import { fallbackLocale, languageStorageKey, parsePreference, resolveLocale, supportedLocales, type LanguagePreference } from './locale'

export function browserLanguages(): readonly string[] {
  return navigator.languages.length ? navigator.languages : [navigator.language]
}

export function readPreference(): LanguagePreference {
  try {
    return parsePreference(window.localStorage.getItem(languageStorageKey))
  } catch {
    return 'auto'
  }
}

export const i18n = createInstance()
void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLocale(readPreference(), browserLanguages()),
  supportedLngs: [...supportedLocales],
  fallbackLng: fallbackLocale,
  defaultNS: 'common',
  initAsync: false,
  returnNull: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
})

// Set language before the first React render, and keep assistive technology in sync.
document.documentElement.lang = i18n.resolvedLanguage ?? fallbackLocale
i18n.on('languageChanged', language => { document.documentElement.lang = language })
