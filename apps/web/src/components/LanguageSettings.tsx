import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectLocale, parsePreference, supportedLocales } from '../i18n/locale'
import { setLanguagePreference, useLanguagePreference } from '../i18n/preferences'
import { useLocale } from '../i18n/useLocale'
import { SettingsRow, SettingsSelect } from './SettingsDialog'

const languageFlags = { es: '🇪🇸', en: '🇬🇧', fr: '🇫🇷' } as const

export function LanguageSettings({ onPreferenceChange }: { onPreferenceChange?: (saved: boolean) => void }) {
  const { t } = useTranslation('common')
  const preference = useLanguagePreference()
  const { locale } = useLocale()
  const [announceChange, setAnnounceChange] = useState(false)
  const id = useId()
  const browserLocale = detectLocale(navigator.languages)
  return <SettingsRow controlId={id} label={t('language.label')} description={t('language.description')}>
    <SettingsSelect id={id} aria-describedby={`${id}-description`} value={preference} onChange={event => {
      const saved = setLanguagePreference(parsePreference(event.target.value))
      onPreferenceChange?.(saved)
      setAnnounceChange(true)
    }}>
      <option value="auto">{t(`language.${browserLocale}`)} {languageFlags[browserLocale]} · {t('language.automatic')}</option>
      {supportedLocales.map(locale => <option key={locale} value={locale} lang={locale}>{t(`language.${locale}`)} {languageFlags[locale]}</option>)}
    </SettingsSelect>
    <span className="sr-only" role="status">{announceChange ? t('language.changed', { language: t(`language.${locale}`) }) : ''}</span>
  </SettingsRow>
}
