import { useId, useState, useSyncExternalStore, type MouseEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { analytics } from '../lib/analytics'
import { CONSENT_MONTHS } from '../lib/analytics-policy'
import { privacyCopy } from '../lib/privacy-copy'
import { PRIVACY_PATH } from '../lib/privacy-route'
import { setThemePreference, useThemePreference } from '../lib/theme'
import { useUnits } from '../lib/useUnits'
import { LanguageSettings } from './LanguageSettings'
import { SettingsDialog, SettingsIcon, SettingsRow, SettingsSelect, type SettingsSection } from './SettingsDialog'
import './settings.css'

/** The app owns preferences; new groups can be supplied as sections. */
export function ApplicationSettings({ sections = [], triggerRef, onOpenPrivacy }: { sections?: readonly SettingsSection[]; triggerRef?: Ref<HTMLButtonElement>; onOpenPrivacy?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [unsaved, setUnsaved] = useState({ language: false, theme: false, units: false })
  const theme = useThemePreference()
  const units = useUnits()
  const themeId = useId()
  const unitsId = useId()
  const sessionOnly = unsaved.language || unsaved.theme || unsaved.units

  return <>
    <button ref={triggerRef} type="button" className="settings-trigger" aria-label={t('settings.title')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
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
              <SettingsSelect id={themeId} aria-describedby={`${themeId}-description`} value={theme} onChange={event => {
                const value = event.target.value
                if (value !== 'system' && value !== 'light' && value !== 'dark') return
                const saved = setThemePreference(value)
                setUnsaved(previous => ({ ...previous, theme: !saved }))
              }}>
                <option value="system">{t('settings.system')}</option>
                <option value="light">{t('settings.light')}</option>
                <option value="dark">{t('settings.dark')}</option>
              </SettingsSelect>
            </SettingsRow>
            <LanguageSettings onPreferenceChange={saved => setUnsaved(previous => ({ ...previous, language: !saved }))} />
            <SettingsRow controlId={unitsId} label={t('settings.units')} description={t('settings.unitsDescription')}>
              <SettingsSelect id={unitsId} aria-describedby={`${unitsId}-description`} value={units.system} onChange={event => {
                const value = event.target.value
                if (value !== 'metric' && value !== 'imperial') return
                const saved = units.setSystem(value)
                setUnsaved(previous => ({ ...previous, units: !saved }))
              }}>
                <option value="metric">{t('settings.metric')}</option>
                <option value="imperial">{t('settings.imperial')}</option>
              </SettingsSelect>
            </SettingsRow>
            <p className={`settings-feedback${sessionOnly ? ' settings-feedback-warning' : ''}`} role="status">
              {t(sessionOnly ? 'settings.sessionOnly' : 'settings.automatic')}
            </p>
          </>,
        },
        {
          id: 'privacy', label: t('settings.privacy'), description: t('settings.privacyDescription'), icon: <PrivacyIcon />,
          content: <PrivacyPreferences onOpenPrivacy={event => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setOpen(false)
            onOpenPrivacy?.(event)
          }} />,
        },
        ...sections,
      ]}
    />}
  </>
}

function PrivacyIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 4 6v6c0 4.5 8 9 8 9s8-4.5 8-9V6Z" /><path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
}

function PrivacyPreferences({ onOpenPrivacy }: { onOpenPrivacy: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const { locale } = useLocale()
  const copy = privacyCopy[locale]
  const state = useSyncExternalStore(analytics.subscribe, analytics.getSnapshot)
  const status = copy.status[state.reason]
  return <div className="settings-privacy">
    <h4>{copy.title}</h4>
    <p>{copy.introduction}</p>
    <div className="settings-privacy-status" role="status" aria-live="polite" aria-atomic="true" data-testid="settings-analytics-status">
      <p>{copy.choice[state.choice]} {state.enabled ? copy.active : copy.inactive}</p>
      {status && <p>{status}</p>}
    </div>
    <div className="settings-privacy-actions">
      <button type="button" data-testid="settings-analytics-accept" disabled={state.reason === 'config'} onClick={() => analytics.accept()}>{copy.accept}</button>
      <button type="button" data-testid="settings-analytics-reject" disabled={state.choice === 'rejected'} onClick={() => analytics.reject()}>{state.choice === 'accepted' ? copy.withdraw : copy.reject}</button>
    </div>
    <p><a className="settings-policy-link" data-testid="privacy-policy" href={PRIVACY_PATH} onClick={onOpenPrivacy}>{copy.policy} ↗</a></p>
    <p className="settings-feedback">{copy.lifetime.replace('{months}', String(CONSENT_MONTHS))}</p>
  </div>
}
