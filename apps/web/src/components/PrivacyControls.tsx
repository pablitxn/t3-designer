import { useId, useSyncExternalStore, type MouseEvent } from 'react'
import { useLocale } from '../i18n/useLocale'
import { analytics } from '../lib/analytics'
import { privacyCopy } from '../lib/privacy-copy'
import { PRIVACY_PATH } from '../lib/privacy-route'
import './privacy.css'

/** Show the initial choice only; persistent preferences live in Settings. */
export function PrivacyControls({ onOpenPrivacy, onChoice }: {
  onOpenPrivacy: (event: MouseEvent<HTMLAnchorElement>) => void
  onChoice: () => void
}) {
  const { locale } = useLocale()
  const copy = privacyCopy[locale]
  const state = useSyncExternalStore(analytics.subscribe, analytics.getSnapshot)
  const id = useId()
  const status = copy.status[state.reason]
  if (state.choice !== 'pending' || state.reason === 'config') return null

  function choose(accepted: boolean) {
    if (accepted) analytics.accept()
    else analytics.reject()
    if (analytics.getSnapshot().choice !== 'pending') onChoice()
  }

  return <section className="privacy-banner privacy-controls" role="region" aria-labelledby={`${id}-banner-title`} data-testid="analytics-consent-banner">
    <div className="privacy-banner-copy">
      <h2 id={`${id}-banner-title`}>{copy.title}</h2>
      <p>{copy.introduction}</p>
      {status && <p className="privacy-status" role="status">{status}</p>}
      <a className="privacy-text-button" href={PRIVACY_PATH} onClick={onOpenPrivacy}>{copy.policy}</a>
    </div>
    <div className="privacy-choices">
      <button type="button" data-testid="analytics-accept" onClick={() => choose(true)}>{copy.accept}</button>
      <button type="button" data-testid="analytics-reject" onClick={() => choose(false)}>{copy.reject}</button>
    </div>
  </section>
}
