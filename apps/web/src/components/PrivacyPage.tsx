import { useEffect, useRef, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { privacyCopy } from '../lib/privacy-copy'
import { privacyDetails } from '../lib/privacy-settings'
import { CONSENT_MONTHS, POLICY_VERSION } from '../lib/analytics-policy'
import { getSiteConfig } from '../lib/site-config'
import type { WorkspaceView } from '../lib/workspace-view'
import './privacy.css'

export function PrivacyPage({ workspace, onReturn }: {
  workspace: WorkspaceView
  onReturn: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { i18n } = useTranslation('common')
  const locale = i18n.resolvedLanguage === 'es' || i18n.resolvedLanguage === 'fr' ? i18n.resolvedLanguage : 'en'
  const copy = privacyCopy[locale]
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Honour shared section links; otherwise move keyboard focus to the new page.
    const section = document.getElementById(window.location.hash.slice(1))
    if (section) section.scrollIntoView()
    else { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }
  }, [])

  const reviewedDate = privacyDetails && new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${privacyDetails.reviewedOn}T12:00:00Z`))
  return <article className="privacy-page" data-testid="privacy-page" aria-labelledby="privacy-page-title">
    <header className="privacy-page-header">
      <a className="privacy-text-button" href={`/#${workspace}`} data-testid="privacy-back" onClick={onReturn}>← {copy.backToApp}</a>
      <h1 id="privacy-page-title" ref={heading} tabIndex={-1}>{copy.policy}</h1>
      <p>{copy.pageIntro}</p>
      <p>{copy.pageAnalyticsOff}</p>
      {privacyDetails && <p className="privacy-page-date">{copy.reviewedOnLabel} <time dateTime={privacyDetails.reviewedOn}>{reviewedDate}</time></p>}
    </header>
    <div className="privacy-page-layout">
      <nav className="privacy-page-index" aria-label={copy.contents}>
        <strong>{copy.contents}</strong>
        {copy.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
      </nav>
      <div className="privacy-page-content">
        {copy.sections.map(section => <section className="privacy-policy-section" key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph.replaceAll('{months}', String(CONSENT_MONTHS))}</p>)}
          {section.id === 'controller' && privacyDetails && <p>{copy.contactLabel}: <a href={`mailto:${privacyDetails.contactEmail}`}>{privacyDetails.contactEmail}</a></p>}
          {section.links?.map(link => <p key={link.href}><a href={link.href} rel={link.href.startsWith('https:') ? 'noreferrer' : undefined}>{link.label}</a></p>)}
        </section>)}
        <p className="privacy-version">{copy.version}: {POLICY_VERSION}:{getSiteConfig().privacyRevision}</p>
      </div>
    </div>
  </article>
}
