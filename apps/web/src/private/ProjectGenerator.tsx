import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useUnits } from '../lib/useUnits'
import { LengthInput } from '../components/LengthInput'
import { goTo, mutate, PrivateApiError, request } from './api'
import { getAccountCopy } from './account-copy'
import type { CreditSummary } from './account-api'
import { getGenerationCopy } from './generation-copy'
import type { PrivateCopy } from './copy'
import { button, Field, Feedback, input, muted, panel, primary } from './ui'

type Kind = 'project' | 'apartment' | 'building'
type GenerationInput = { name: string; prompt: string; kind: Kind; width: number; depth: number; storeyHeight: number; floors: number; latitude: number; longitude: number; timeZone: string }
type GenerationJob = { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; projectId: string | null; input: GenerationInput; createdAt: string; updatedAt: string; error: string | null }
const active = (job: GenerationJob) => job.status === 'queued' || job.status === 'running'

export function ProjectGenerator({ language, c }: { language: string; c: PrivateCopy }) {
  const units = useUnits()
  const a = getAccountCopy(language)
  const g = getGenerationCopy(language)
  const [kind, setKind] = useState<Kind>('apartment')
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [jobs, setJobs] = useState<GenerationJob[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const sending = useRef(false)
  const polling = useRef<{ signal?: AbortSignal } | null>(null)
  const mutation = useRef(0)
  const mounted = useRef(true)
  const previousJobs = useRef<GenerationJob[]>([])
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null)
  const load = useCallback(async (signal?: AbortSignal) => {
    if (polling.current && !polling.current.signal?.aborted) return
    const current = { signal }; polling.current = current
    const version = mutation.current
    try {
      const data = await request<{ jobs: GenerationJob[] }>('/api/project-generations', { signal })
      if (signal?.aborted || !mounted.current || version !== mutation.current) return
      const completed = data.jobs.some(job => !active(job) && previousJobs.current.some(previous => previous.id === job.id && active(previous)))
      previousJobs.current = data.jobs; setJobs(data.jobs)
      if (completed) { window.dispatchEvent(new Event('t3:credits-changed')); const summary = await request<CreditSummary>('/api/credits', { signal }); if (!signal?.aborted && mounted.current) setCredits(summary) }
    } finally { if (polling.current === current) polling.current = null }
  }, [])
  useEffect(() => {
    mounted.current = true; const abort = new AbortController()
    void Promise.all([request<CreditSummary>('/api/credits', { signal: abort.signal }), request<{ generationEnabled?: boolean; projectGenerationEnabled?: boolean }>('/api/health', { signal: abort.signal }), load(abort.signal)]).then(([summary, health]) => { if (!abort.signal.aborted) { setCredits(summary); setEnabled(health.projectGenerationEnabled ?? health.generationEnabled ?? false) } }).catch(() => { if (!abort.signal.aborted) setError(c.unavailable) })
    return () => { mounted.current = false; abort.abort() }
  }, [load, c.unavailable])
  const hasActive = jobs?.some(active) ?? false
  useEffect(() => {
    if (!hasActive) return
    const abort = new AbortController()
    const interval = setInterval(() => { if (!document.hidden) void load(abort.signal).catch(() => { if (!abort.signal.aborted) setError(c.unavailable) }) }, 3000)
    return () => { clearInterval(interval); abort.abort() }
  }, [hasActive, load, c.unavailable])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || !enabled) return
    const data = new FormData(event.currentTarget)
    const body: GenerationInput = { name: String(data.get('name')).trim(), prompt: String(data.get('prompt')).trim(), kind, width: units.toMeters(Number(data.get('width'))), depth: units.toMeters(Number(data.get('depth'))), storeyHeight: units.toMeters(Number(data.get('storeyHeight'))), floors: Number(data.get('floors')), latitude: Number(data.get('latitude')), longitude: Number(data.get('longitude')), timeZone: String(data.get('timeZone')).trim() }
    try { new Intl.DateTimeFormat('en', { timeZone: body.timeZone }).format() } catch { setError(g.invalidTimeZone); return }
    const fingerprint = JSON.stringify(body)
    const retrying = pendingRequest.current?.fingerprint === fingerprint
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const summary = await request<CreditSummary>('/api/credits')
      if (!mounted.current) return
      setCredits(summary)
      const cost = summary.costs[kind]
      if (!retrying && summary.balance < cost) { setError(a.insufficient); return }
      if (!retrying && !window.confirm(a.confirmGeneration.replace('{cost}', String(cost)))) return
      if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: crypto.randomUUID() }
      const { job } = await request<{ job: GenerationJob }>('/api/project-generations', { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': pendingRequest.current.key } })
      if (!mounted.current) return
      mutation.current++; pendingRequest.current = null; previousJobs.current = [job, ...previousJobs.current.filter(item => item.id !== job.id)]; setJobs(previousJobs.current); setNotice(g.accepted)
      window.dispatchEvent(new Event('t3:credits-changed'))
      const latest = await request<CreditSummary>('/api/credits'); if (mounted.current) setCredits(latest)
    } catch (reason) { if (mounted.current) setError(reason instanceof PrivateApiError && reason.status === 402 ? a.insufficient : reason instanceof PrivateApiError && reason.status === 503 ? g.unavailable : c.genericError) }
    finally { sending.current = false; if (mounted.current) setBusy(false) }
  }
  async function cancel(job: GenerationJob) {
    if (sending.current) return; sending.current = true; setBusy(true); setError(''); setNotice('')
    try { const data = await mutate<{ job: GenerationJob }>(`/api/project-generations/${job.id}/cancel`, {}); mutation.current++; previousJobs.current = previousJobs.current.map(item => item.id === job.id ? data.job : item); setJobs(previousJobs.current); window.dispatchEvent(new Event('t3:credits-changed')); const summary = await request<CreditSummary>('/api/credits'); if (mounted.current) setCredits(summary) }
    catch { if (mounted.current) setError(c.genericError) } finally { sending.current = false; if (mounted.current) setBusy(false) }
  }
  return <>
    <h1 className="tw:mt-0! tw:text-3xl! tw:font-medium!">{g.title}</h1><p className={`${muted} tw:max-w-3xl tw:text-sm tw:leading-6`}>{g.intro}</p>
    <p className={`${panel} tw:my-6 tw:max-w-4xl tw:p-4 tw:text-sm tw:leading-6`}>{g.limit}</p>
    <Feedback message={error} error /><Feedback message={notice} />
    {jobs && !enabled && <Feedback message={g.unavailable} />}
    <form className="tw:grid tw:gap-5 tw:xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]" onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <section className={`${panel} tw:flex tw:flex-col tw:gap-5 tw:p-5`}><Field label={g.kind}><select name="kind" className={input} value={kind} onChange={event => setKind(event.target.value as Kind)} disabled={busy}><option value="apartment">{g.apartment}</option><option value="building">{g.building}</option><option value="project">{g.project}</option></select></Field><Field label={g.name}><input className={input} name="name" maxLength={120} required disabled={busy} /></Field><Field label={g.prompt} help={g.promptHelp}><textarea className={`${input} tw:min-h-44 tw:resize-y tw:font-[inherit]`} name="prompt" minLength={10} maxLength={4000} required disabled={busy} /></Field>

      </section>
      <div className="tw:flex tw:flex-col tw:gap-5"><section className={`${panel} tw:p-5`}><h2 className="tw:mt-0 tw:text-lg tw:font-medium">{g.dimensions}</h2><div className="tw:grid tw:grid-cols-2 tw:gap-4">{([{ name: 'width', label: g.width, min: 3, max: 100, step: .1 }, { name: 'depth', label: g.depth, min: 3, max: 100, step: .1 }, { name: 'storeyHeight', label: g.storeyHeight, min: 2.4, max: 5, step: .1 }, { name: 'floors', label: g.floors, min: 1, max: 30, step: 1 }] as const).map(field => <Field key={field.name} label={field.label.replace('(m)', `(${units.lengthUnit})`)}>{field.name === 'floors' ? <input className={input} type="number" name={field.name} min={field.min} max={field.max} step={field.step} required disabled={busy} /> : <LengthInput className={input} name={field.name} minMeters={field.min} maxMeters={field.max} required disabled={busy} />}</Field>)}</div></section>
        <section className={`${panel} tw:p-5`}><h2 className="tw:mt-0 tw:text-lg tw:font-medium">{g.location}</h2><p className={`${muted} tw:text-xs tw:leading-6`}>{g.locationHelp}</p><div className="tw:grid tw:grid-cols-2 tw:gap-4"><Field label={g.latitude}><input className={input} name="latitude" type="number" min={-90} max={90} step="any" required disabled={busy} /></Field><Field label={g.longitude}><input className={input} name="longitude" type="number" min={-180} max={180} step="any" required disabled={busy} /></Field><div className="tw:col-span-2"><Field label={g.timeZone}><input className={input} name="timeZone" required maxLength={100} disabled={busy} placeholder="Europe/Paris" /></Field></div></div></section></div>
      <section className={`${panel} tw:p-5 tw:xl:col-span-2`}>
        <div className="tw:mb-4 tw:rounded-lg tw:bg-[var(--settings-accent-soft)] tw:p-4"><p className="tw:mt-0 tw:text-sm">{credits ? `${a.cost}: ${credits.costs[kind]} ${a.creditUnit} · ${a.balance}: ${credits.balance}` : c.loading}</p><p className={`${muted} tw:mb-0 tw:text-xs tw:leading-6`}>{g.cancelHelp}</p></div><button className={primary} disabled={busy || !enabled || !credits}>{busy ? c.pending : g.submit} →</button>
      </section>
    </form>
    <section className="tw:mt-9"><div className="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><h2 className="tw:m-0 tw:text-xl tw:font-medium">{g.history}</h2><button className={button} disabled={busy} onClick={() => { void load().catch(() => setError(c.unavailable)) }}>{g.retry}</button></div>{jobs === null ? <p role="status" className={muted}>{c.loading}</p> : jobs.length === 0 ? <p className={muted}>{g.empty}</p> : <div className="tw:flex tw:flex-col tw:gap-3">{jobs.map(job => <article key={job.id} className={`${panel} tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4 tw:p-5`}><div className="tw:min-w-0"><h3 className="tw:m-0 tw:break-words tw:text-base tw:font-medium">{job.input.name}</h3><p className={`${muted} tw:mb-0 tw:text-xs tw:leading-6`}>{g[job.input.kind]} · {g[job.status]} · {new Date(job.createdAt).toLocaleString(language)}</p>{job.error && <p className="tw:mb-0 tw:max-w-xl tw:text-xs tw:leading-6">{job.error}</p>}</div>{active(job) ? <button className={button} disabled={busy} onClick={() => { void cancel(job) }}>{g.cancel}</button> : job.status === 'completed' && job.projectId && <a className={primary} href={`/app/projects/${job.projectId}`} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); goTo(`/app/projects/${job.projectId}`) } }}>{g.open} →</a>}</article>)}</div>}</section>
  </>
}
