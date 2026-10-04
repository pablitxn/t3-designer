import { useId, useRef, useSyncExternalStore, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../lib/analytics'
import { CONSENT_MONTHS } from '../lib/analytics-policy'
import { privacyCopy } from '../lib/privacy-copy'
import { PRIVACY_PATH } from '../lib/privacy-route'
import './privacy.css'

export function PrivacyControls({ onOpenPrivacy, privacyPage = false }: {
  onOpenPrivacy: (event: MouseEvent<HTMLAnchorElement>) => void
  privacyPage?: boolean
}) {
  const { i18n } = useTranslation('common')
  const language = i18n.resolvedLanguage
  const copy = privacyCopy[language === 'fr' || language === 'en' ? language : 'es']
  const state = useSyncExternalStore(analytics.subscribe, analytics.getSnapshot)
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const preferenceButton = useRef<HTMLButtonElement>(null)
  const status = copy.status[state.reason]

  function openDialog(button: HTMLButtonElement) {
    opener.current = button
    dialog.current?.showModal()
    closeButton.current?.focus()
  }

  function choose(accepted: boolean, fromBanner = false) {
    if (accepted) analytics.accept()
    else analytics.reject()
    // The banner disappears after a successful choice. Keep keyboard focus useful.
    if (fromBanner && analytics.getSnapshot().choice !== 'pending') preferenceButton.current?.focus()
  }

  return <div className="privacy-controls">
    <div className="privacy-links">
      <button ref={preferenceButton} type="button" className="privacy-text-button" data-testid="privacy-preferences" aria-haspopup="dialog" onClick={event => openDialog(event.currentTarget)}>{copy.preferences}</button>
      <a className="privacy-text-button" data-testid="privacy-policy" href={PRIVACY_PATH} aria-current={privacyPage ? 'page' : undefined} onClick={onOpenPrivacy}>{copy.policy}</a>
    </div>

    {state.choice === 'pending' && state.reason !== 'config' && <section className="privacy-banner" role="region" aria-labelledby={`${id}-banner-title`} data-testid="analytics-consent-banner">
      <div className="privacy-banner-copy">
        <h2 id={`${id}-banner-title`}>{copy.title}</h2>
        <p>{copy.introduction}</p>
        {status && <p className="privacy-status" role="status">{status}</p>}
        <a className="privacy-text-button" href={PRIVACY_PATH} onClick={onOpenPrivacy}>{copy.policy}</a>
      </div>
      <div className="privacy-choices">
        <button type="button" data-testid="analytics-accept" onClick={() => choose(true, true)}>{copy.accept}</button>
        <button type="button" data-testid="analytics-reject" onClick={() => choose(false, true)}>{copy.reject}</button>
      </div>
    </section>}

    <dialog ref={dialog} className="privacy-dialog" data-testid="privacy-dialog" aria-labelledby={`${id}-dialog-title`} onClose={() => {
      const target = opener.current?.isConnected ? opener.current : preferenceButton.current
      target?.focus()
    }}>
      <div className="privacy-dialog-header">
        <h2 id={`${id}-dialog-title`}>{copy.preferences}</h2>
        <button ref={closeButton} type="button" className="privacy-close" data-testid="privacy-close" onClick={() => dialog.current?.close()}>{copy.close}</button>
      </div>
      <div className="privacy-dialog-body">
        <section className="privacy-preference" aria-labelledby={`${id}-choice-title`}>
          <h3 id={`${id}-choice-title`}>{copy.choiceTitle}</h3>
          <div role="status" aria-live="polite" aria-atomic="true" data-testid="analytics-status">
            <p>{copy.choice[state.choice]} {state.enabled ? copy.active : copy.inactive}</p>
            {status && <p className="privacy-status">{status}</p>}
          </div>
          <div className="privacy-choices">
            <button type="button" data-testid="analytics-dialog-accept" disabled={state.reason === 'config'} onClick={() => choose(true)}>{copy.accept}</button>
            <button type="button" data-testid="analytics-dialog-reject" onClick={() => choose(false)}>{state.choice === 'accepted' ? copy.withdraw : copy.reject}</button>
          </div>
          <p>{copy.lifetime.replace('{months}', String(CONSENT_MONTHS))}</p>
          {privacyPage && <p>{copy.pageAnalyticsOff}</p>}
        </section>
        <p><a className="privacy-text-button" href={PRIVACY_PATH} onClick={event => {
          if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) dialog.current?.close()
          onOpenPrivacy(event)
        }}>{copy.policy}</a></p>
      </div>
    </dialog>
  </div>
}
