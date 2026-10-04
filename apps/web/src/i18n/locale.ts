export const supportedLocales = ['es', 'en', 'fr'] as const
export type Locale = typeof supportedLocales[number]
export type LanguagePreference = Locale | 'auto'
export const fallbackLocale: Locale = 'en'
export const languageStorageKey = 't3-designer.language'
export const formattingLocales: Record<Locale, string> = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR' }

export function isLocale(value: unknown): value is Locale {
  return supportedLocales.some(locale => locale === value)
}

export function parsePreference(value: unknown): LanguagePreference {
  return isLocale(value) ? value : 'auto'
}

/** Match browser preferences in order, including regional/script variants. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    try {
      const [canonical] = Intl.getCanonicalLocales(language)
      const base = canonical?.split('-')[0]
      if (isLocale(base)) return base
    } catch {
      // Ignore malformed browser/storage input and keep checking preferences.
    }
  }
  return fallbackLocale
}

export function resolveLocale(preference: LanguagePreference, languages: readonly string[]): Locale {
  return preference === 'auto' ? detectLocale(languages) : preference
}

export function numberFormatter(locale: Locale, digits = 0) {
  return new Intl.NumberFormat(formattingLocales[locale], { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** UI language never changes the geographic study's civil timezone. */
export function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(formattingLocales[locale], { ...options, timeZone: 'Europe/Paris' })
}

export function compassBearing(locale: Locale, azimuth: number) {
  const bearings = locale === 'en'
    ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return bearings[((Math.round(azimuth / 45) % 8) + 8) % 8]
}
