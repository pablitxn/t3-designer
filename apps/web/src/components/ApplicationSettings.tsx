import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setThemePreference, useThemePreference } from '../lib/theme'
import { LanguageSettings } from './LanguageSettings'
import { SettingsDialog, SettingsIcon, SettingsRow, type SettingsSection } from './SettingsDialog'
import './settings.css'

/** The app owns preferences; new groups can be supplied as sections. */
export function ApplicationSettings({ sections = [] }: { sections?: readonly SettingsSection[] }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [unsaved, setUnsaved] = useState({ language: false, theme: false })
  const theme = useThemePreference()
  const themeId = useId()
  const sessionOnly = unsaved.language || unsaved.theme

  return <>
    <button type="button" className="settings-trigger" aria-label={t('settings.title')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <SettingsIcon /><span>{t('settings.title')}</span>
    </button>
    {open && <SettingsDialog
      title={t('settings.title')}
      closeLabel={t('settings.close')}
      onClose={() => setOpen(false)}
      sections={[
        {
          id: 'general', label: t('settings.general'), description: t('settings.generalDescription'), icon: <SettingsIcon />,
          content: <>
            <SettingsRow controlId={themeId} label={t('settings.appearance')} description={t('settings.appearanceDescription')}>
              <select id={themeId} aria-describedby={`${themeId}-description`} value={theme} onChange={event => {
                const value = event.target.value
                if (value !== 'system' && value !== 'light' && value !== 'dark') return
                const saved = setThemePreference(value)
                setUnsaved(previous => ({ ...previous, theme: !saved }))
              }}>
                <option value="system">{t('settings.system')}</option>
                <option value="light">{t('settings.light')}</option>
                <option value="dark">{t('settings.dark')}</option>
              </select>
            </SettingsRow>
            <LanguageSettings onPreferenceChange={saved => setUnsaved(previous => ({ ...previous, language: !saved }))} />
            <p className={`settings-feedback${sessionOnly ? ' settings-feedback-warning' : ''}`} role="status">
              {t(sessionOnly ? 'settings.sessionOnly' : 'settings.automatic')}
            </p>
          </>,
        },
        ...sections,
      ]}
    />}
  </>
}
