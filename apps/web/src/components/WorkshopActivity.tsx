import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, Job, JobEvent } from '@t3-designer/asset-schema'
import { useJobActivity } from '../lib/use-job-activity'

const activeStatuses = new Set<Job['status']>(['queued', 'analyzing', 'needs_input', 'generating'])
const phases = ['product', 'model', 'render', 'validate', 'ready'] as const
const phaseForEvent: Partial<Record<JobEvent['kind'], number>> = { analysis: 0, search: 0, source: 0, reference: 0, plan: 0, modeling: 1, render: 2, validation: 3, review: 3, complete: 4 }

function publicLink(value: string | undefined) {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null }
  catch { return null }
}

function EventRow({ event, previousAttempt }: { event: JobEvent; previousAttempt?: number }) {
  const { t, i18n } = useTranslation('assets')
  const link = publicLink(event.url)
  return <>
    {event.attempt !== previousAttempt && <li className="workshop-attempt">{t('activity.attempt', { count: event.attempt })}</li>}
    <li className={`workshop-event kind-${event.kind}`}>
      <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      <span className="workshop-event-marker" aria-hidden="true" />
      <div><span className="workshop-event-kind">{t(`activity.kinds.${event.kind}`)}</span><p>{event.message}</p>
        {link && <a href={link.href} target="_blank" rel="noreferrer">{link.hostname} ↗</a>}
        {event.detail && <details><summary>{t('activity.details')}</summary><pre>{event.detail}</pre></details>}
      </div>
    </li>
  </>
}

function LiveActivity({ job }: { job: Job }) {
  const { t } = useTranslation('assets')
  const { events, connection } = useJobActivity(job)
  const [now, setNow] = useState(() => Date.now())
  const [follow, setFollow] = useState(true)
  const feed = useRef<HTMLOListElement>(null)
  const active = activeStatuses.has(job.status)
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [active])
  useEffect(() => {
    if (follow && feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [events, follow])
  const seconds = Math.max(0, Math.floor(((active ? now : new Date(job.updatedAt).getTime()) - new Date(job.createdAt).getTime()) / 1000))
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const attempt = events.at(-1)?.attempt
  const currentEvents = events.filter(event => event.attempt === attempt)
  const currentPhase = job.status === 'completed' ? 4 : currentEvents.reduce((phase, event) => {
    if (event.kind === 'revision') return 1
    // Blender audits its GLB before rendering and validates the full result afterwards.
    const next = event.kind === 'validation' && phase < 2 ? 1 : phaseForEvent[event.kind] ?? phase
    return Math.max(phase, next)
  }, job.status === 'generating' ? 1 : 0)
  return <>
    <div className="workshop-live-status">
      <div><span className={`workshop-stream is-${connection}`}><i aria-hidden="true" />{t(`activity.connection.${connection}`)}</span><span className="workshop-elapsed">{t('activity.elapsed')} <span>{elapsed}</span></span></div>
      <span className={`workshop-job-status status-${job.status}`} role="status">{t(`jobs.${job.status}`)}</span>
    </div>
    <ol className="workshop-phases" aria-label={t('activity.phases')}>
      {phases.map((phase, index) => <li key={phase} className={index < currentPhase || job.status === 'completed' ? 'is-done' : index === currentPhase ? 'is-current' : ''} aria-current={index === currentPhase && active ? 'step' : undefined}><span aria-hidden="true">{index < currentPhase || job.status === 'completed' ? '✓' : String(index + 1).padStart(2, '0')}</span>{t(`activity.steps.${phase}`)}</li>)}
    </ol>
    {job.stage && active && <p className="workshop-current-stage">{job.stage}</p>}
    <ol ref={feed} className="workshop-event-feed" aria-label={t('activity.events')} tabIndex={0} onScroll={() => {
      if (feed.current) setFollow(feed.current.scrollHeight - feed.current.scrollTop - feed.current.clientHeight < 36)
    }}>
      {events.map((event, index) => <EventRow key={event.seq} event={event} previousAttempt={events[index - 1]?.attempt} />)}
      {!events.length && <li className="workshop-events-empty">{t(connection === 'connecting' ? 'activity.loading' : connection === 'offline' ? 'activity.unavailable' : active ? 'activity.waiting' : 'activity.noHistory')}</li>}
    </ol>
    <div className="workshop-feed-footer"><span>{t(connection === 'offline' ? 'activity.reconnecting' : 'activity.observed')}</span>{!follow && <button type="button" onClick={() => setFollow(true)}>{t('activity.follow')} ↓</button>}</div>
  </>
}

export function WorkshopActivity({ job, jobs, assets, disabled, retryDisabled, busy, onSelect, onCancel, onRetry, onView, onNew, children }: {
  job: Job | undefined; jobs: Job[]; assets: Asset[]; disabled: boolean; retryDisabled: boolean; busy: boolean;
  onSelect: (id: string) => void; onCancel: () => void; onRetry: () => void; onView: () => void; onNew: () => void; children?: ReactNode;
}) {
  const { t, i18n } = useTranslation('assets')
  function label(item: Job) {
    return assets.find(asset => asset.id === item.assetId)?.label ?? publicLink(item.input.url)?.hostname ?? t('jobs.untitled')
  }
  return <section className="workshop-activity workshop-panel" aria-label={t('activity.title')}>
    <header className="workshop-activity-heading"><div><span className="eyebrow">{t('jobs.title')}</span><h3>{t('activity.title')}</h3></div><button type="button" className="workshop-text-button" onClick={onNew}>+ {t('activity.newObject')}</button></header>
    {job ? <>
      <label className="workshop-history-label" htmlFor="workshop-job-history">{t('activity.history')}</label>
      <select id="workshop-job-history" value={job.id} onChange={event => onSelect(event.target.value)}>{jobs.map(item => <option key={item.id} value={item.id}>{label(item)} · {t(`jobs.${item.status}`)} · {new Date(item.createdAt).toLocaleString(i18n.resolvedLanguage, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</option>)}</select>
      <a className="workshop-job-source" href={job.input.url} target="_blank" rel="noreferrer">{t('library.source')} ↗</a>
      <LiveActivity key={`activity-${job.id}`} job={job} />
      {job.error && <p className="workshop-error">{job.error}</p>}
      {children}
      <div className="workshop-job-actions workshop-live-actions">
        {activeStatuses.has(job.status) && <button type="button" disabled={disabled} onClick={onCancel}>{t(busy ? 'jobs.busy' : 'jobs.cancel')}</button>}
        {(job.status === 'failed' || job.status === 'cancelled') && <button type="button" disabled={retryDisabled} onClick={onRetry}>{t(busy ? 'jobs.busy' : 'jobs.retry')}</button>}
        {job.assetId && <button type="button" className="workshop-result-button" onClick={onView}>{t('jobs.view')} ↗</button>}
      </div>
    </> : <p className="workshop-activity-intro">{t('activity.intro')}</p>}
  </section>
}
