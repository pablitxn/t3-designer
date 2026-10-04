import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { compassBearing, dateFormatter, fallbackLocale, isLocale, numberFormatter } from './locale'

export function useLocale() {
  const { i18n } = useTranslation()
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : fallbackLocale
  return useMemo(() => ({
    locale,
    formatNumber: (value: number, digits = 0) => numberFormatter(locale, digits).format(value),
    formatDate: (value: Date, options: Intl.DateTimeFormatOptions) => dateFormatter(locale, options).format(value),
    formatTime: (value: Date) => dateFormatter(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value),
    compass: (azimuth: number) => compassBearing(locale, azimuth),
  }), [locale])
}
