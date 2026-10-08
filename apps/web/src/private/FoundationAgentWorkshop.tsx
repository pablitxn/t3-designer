import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { FoundationAgentRun, FoundationAgentVersion, FoundationCandidate, FoundationTarget, FoundationOfficialResearch } from '@t3-designer/scene-schema'
import { OfficialResearch } from './OfficialResearch'
import { getAccountCopy } from './account-copy'
import type { CreditSummary } from './account-api'
import { PrivateApiError, request, type Project } from './api'
import { acceptFoundationVersion, cancelFoundationAgent, getFoundationAgentHistory, startFoundationAgent, type FoundationAgentHistory, type FoundationAgentInput } from './foundation-agent-client'
import { getFoundationAgentCopy, type FoundationAgentCopy } from './foundation-agent-copy'
import { button, Field, Feedback, input, muted, panel, primary } from './ui'

const active = (run: FoundationAgentRun) => run.status === 'queued' || run.status === 'running'
const field = `${input} tw:box-border tw:min-w-0`
const numberLabel = (template: string, number: number) => template.replace('{number}', String(number))

function Evidence({ candidate, copy: c }: { candidate: FoundationCandidate; copy: FoundationAgentCopy }) {
  const unknowns = [...candidate.assumptions, ...candidate.unknowns]
  return <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-3">
    {unknowns.length > 0 && <details className="tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-3"><summary className="tw:cursor-pointer tw:text-xs tw:font-medium">{c.assumptions} ({unknowns.length})</summary><ul className={`${muted} tw:mb-0 tw:pl-5 tw:text-xs tw:leading-6`}>{unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    {candidate.sources.length > 0 && <details className="tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-3"><summary className="tw:cursor-pointer tw:text-xs tw:font-medium">{c.evidence} ({candidate.sources.length})</summary><ul className="tw:mb-0 tw:list-none tw:space-y-4 tw:pl-0">{candidate.sources.map((source, index) => {
      let url: URL | null = null
      try { const parsed = new URL(source.url); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed } catch { /* Show source text without turning an invalid URL into a link. */ }
      return <li key={index} className="tw:break-words tw:text-xs tw:leading-5">{url ? <a className="tw:text-[color:var(--settings-accent)] tw:underline tw:underline-offset-4" href={url.href} target="_blank" rel="noreferrer">{source.title} ↗</a> : <span>{source.title}</span>}<p className={`${muted} tw:mb-1 tw:mt-1`}>{source.kind === 'official' ? c.sourceOfficial : source.kind === 'user' ? c.sourceUser : c.sourcePublic} · {source.retrievedAt}</p>{source.claims.map((claim, claimIndex) => <p key={claimIndex} className={`${muted} tw:my-1`}>{claim}</p>)}</li>
    })}</ul></details>}
  </div>
}

function Activity({ run, language, copy: c, offline }: { run: FoundationAgentRun; language: string; copy: FoundationAgentCopy; offline: boolean }) {
  const feed = useRef<HTMLOListElement>(null)
  const [follow, setFollow] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const running = active(run)
  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [running])
  useEffect(() => { if (follow && feed.current) feed.current.scrollTop = feed.current.scrollHeight }, [run.events, follow])
  const elapsed = Math.max(0, Math.floor(((running ? now : Date.parse(run.updatedAt)) - Date.parse(run.createdAt)) / 1000))
  const phase = run.status === 'completed' ? 3 : run.events.reduce((value, event) => Math.max(value, event.kind === 'review' || event.kind === 'validation' || event.kind === 'revision' ? 2 : event.kind === 'generation' ? 1 : 0), 0)
  return <>
    <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:text-xs"><span role="status" className="tw:rounded-full tw:bg-[var(--settings-accent-soft)] tw:px-3 tw:py-2 tw:font-medium">{c[run.status]}</span><span className={muted}>{c.elapsed} {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div>
    <ol aria-label={c.phases} className="tw:my-5 tw:grid tw:list-none tw:grid-cols-4 tw:gap-2 tw:p-0">
      {[c.phaseInput, c.phaseModel, c.phaseReview, c.phaseReady].map((label, index) => <li key={label} aria-current={index === phase && running ? 'step' : undefined} className={`tw:border-0 tw:border-t-2 tw:border-solid tw:pt-2 tw:text-[11px] tw:leading-4 ${index <= phase ? 'tw:border-[var(--settings-accent)]' : `tw:border-[var(--settings-border)] ${muted}`}`}><span className="tw:mb-1 tw:block tw:font-semibold">{index < phase || run.status === 'completed' ? '✓' : `0${index + 1}`}</span>{label}</li>)}
    </ol>
    <ol ref={feed} aria-label={c.activity} tabIndex={0} className="tw:m-0 tw:max-h-80 tw:list-none tw:overflow-y-auto tw:overscroll-contain tw:p-0" onScroll={() => { if (feed.current) setFollow(feed.current.scrollHeight - feed.current.scrollTop - feed.current.clientHeight < 36) }}>
      {run.events.map(event => <li key={event.id} className="tw:relative tw:mb-0 tw:border-0 tw:border-l tw:border-solid tw:border-[var(--settings-border)] tw:pb-5 tw:pl-4"><span aria-hidden="true" className="tw:absolute tw:-left-1 tw:top-1 tw:h-2 tw:w-2 tw:rounded-full tw:bg-[var(--settings-accent)]" /><time className={`${muted} tw:text-[11px]`} dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><p className="tw:mb-0 tw:mt-1 tw:whitespace-pre-wrap tw:break-words tw:text-sm tw:leading-6">{event.message}</p>{event.detail && <details className="tw:mt-2 tw:text-xs"><summary className="tw:cursor-pointer">{c.details}</summary><pre className={`${muted} tw:whitespace-pre-wrap tw:break-words tw:font-[inherit] tw:leading-5`}>{event.detail}</pre></details>}</li>)}
      {!run.events.length && <li className={`${muted} tw:py-4 tw:text-sm tw:leading-6`}>{c.noHistory}</li>}
    </ol>
    <div className={`${muted} tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-3 tw:text-[11px]`}><span>{offline ? c.offline : running ? c.live : c.observed}</span>{!follow && <button type="button" className={`${button} tw:min-h-8! tw:px-2! tw:py-1! tw:text-xs!`} onClick={() => setFollow(true)}>{c.follow} ↓</button>}</div>
  </>
}

export function FoundationAgentWorkshop({ projectId, target, revision, language, readOnly, dirty, onProjectUpdated, renderPreview, acceptedVersionId, acceptedOfficialResearch, onBusyChange }: {
  projectId: string; target: FoundationTarget; revision: number; language: string; readOnly: boolean; dirty: boolean;
  onProjectUpdated: (project: Project) => void; renderPreview: (candidate: FoundationCandidate) => ReactNode; acceptedVersionId?: string; acceptedOfficialResearch?: FoundationOfficialResearch; onBusyChange?: (busy: boolean) => void;
}) {
  const c = getFoundationAgentCopy(language)
  const a = getAccountCopy(language)
  const [history, setHistory] = useState<FoundationAgentHistory | null>(null)
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [iterationIndex, setIterationIndex] = useState<number | null>(null)
  const [instructions, setInstructions] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(false)
  const sending = useRef(false)
  const generation = useRef(0)
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const currentHistory = useRef<FoundationAgentHistory | null>(null)
  const mutationAbort = useRef<AbortController | null>(null)
  const loadPending = useRef<AbortSignal | undefined>(undefined)
  const busyCallback = useRef(onBusyChange)
  useEffect(() => { busyCallback.current = onBusyChange }, [onBusyChange])
  useEffect(() => () => { busyCallback.current?.(false) }, [])

  const load = useCallback(async (signal: AbortSignal) => {
    if (loadPending.current && !loadPending.current.aborted) return
    loadPending.current = signal
    const observedGeneration = generation.current
    try {
      const data = await getFoundationAgentHistory(projectId, signal)
      if (signal.aborted || !mounted.current || observedGeneration !== generation.current) return
      const settled = data.runs.some(run => !active(run) && currentHistory.current?.runs.some(previous => previous.id === run.id && active(previous)))
      currentHistory.current = data; setHistory(data); setOffline(false); setError(previous => previous === c.loadFailed ? '' : previous)
      if (settled) {
        window.dispatchEvent(new Event('t3:credits-changed'))
        const summary = await request<CreditSummary>('/api/credits', { signal })
        if (!signal.aborted && mounted.current) setCredits(summary)
      }
    } finally { if (loadPending.current === signal) loadPending.current = undefined }
  }, [projectId, c.loadFailed])

  const refreshWorkshop = useCallback(async (signal: AbortSignal) => {
    const [historyResult, creditResult, healthResult] = await Promise.allSettled([load(signal), request<CreditSummary>('/api/credits', { signal }), request<{ foundationAgentEnabled?: boolean }>('/api/health', { signal })])
    if (signal.aborted || !mounted.current) return
    if (creditResult.status === 'fulfilled') setCredits(creditResult.value)
    if (healthResult.status === 'fulfilled') setEnabled(healthResult.value.foundationAgentEnabled === true)
    if (historyResult.status === 'rejected') { setOffline(true); setError(c.loadFailed) }
    else if (creditResult.status === 'rejected' || healthResult.status === 'rejected') setError(c.loadFailed)
  }, [load, c.loadFailed])

  useEffect(() => {
    mounted.current = true
    const abort = new AbortController()
    void refreshWorkshop(abort.signal)
    return () => { mounted.current = false; abort.abort(); mutationAbort.current?.abort() }
  }, [refreshWorkshop])

  const runs = (history?.runs ?? []).filter(run => run.target === target)
  const versions = (history?.versions ?? []).filter(version => version.target === target)
  const run = runs.find(item => item.id === selectedRunId) ?? runs[0]
  const version = versions.find(item => item.id === selectedVersionId) ?? versions.find(item => item.id === run?.versionId)
  const versionNumber = (item: FoundationAgentVersion) => [...versions].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).findIndex(existing => existing.id === item.id) + 1
  const hasActive = runs.some(active)
  useEffect(() => {
    if (!hasActive && !offline) return
    const abort = new AbortController()
    const refresh = () => { if (!document.hidden) void load(abort.signal).catch(() => { if (!abort.signal.aborted) setOffline(true) }) }
    const interval = setInterval(refresh, 2000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(interval); abort.abort(); document.removeEventListener('visibilitychange', refresh) }
  }, [hasActive, offline, load])

  const disabled = busy || readOnly || dirty
  const cost = credits?.costs[target === 'dwelling' ? 'apartment' : 'building']
  const iterations = version?.iterations ?? run?.iterations ?? []
  const iteration = iterations.find(item => item.index === iterationIndex) ?? [...iterations].reverse().find(item => item.candidate) ?? iterations.at(-1)
  const candidate = iteration ? iteration.candidate : version?.candidate ?? null
  const officialResearch = version?.officialResearch ?? run?.officialResearch ?? (candidate?.target === 'building' ? candidate.officialResearch : undefined) ?? (!run && !version ? acceptedOfficialResearch : undefined)
  const viewingFinal = !iteration || iteration.index === iterations.at(-1)?.index
  const questions = version?.questions ?? []
  const needsInput = version?.status === 'needs_input' || run?.status === 'needs_input'

  function report(reason: unknown) {
    if (!mounted.current) return
    setError(reason instanceof PrivateApiError ? reason.status === 402 ? a.insufficient : reason.status === 409 ? c.conflict : reason.status === 503 ? c.unavailable : reason.status === 400 || reason.status === 422 ? c.invalid : c.actionFailed : c.actionFailed)
  }
  function updateRun(next: FoundationAgentRun) {
    const data = currentHistory.current ?? { runs: [], versions: [] }
    const updated = { ...data, runs: [next, ...data.runs.filter(item => item.id !== next.id)] }
    currentHistory.current = updated; setHistory(updated)
  }
  async function refreshCredits(signal: AbortSignal) {
    window.dispatchEvent(new Event('t3:credits-changed'))
    try { const summary = await request<CreditSummary>('/api/credits', { signal }); if (!signal.aborted && mounted.current) setCredits(summary) }
    catch { /* The completed action remains valid even when balance refresh fails. */ }
  }
  async function start(message: string, parent?: FoundationAgentVersion) {
    if (sending.current || disabled || !enabled || hasActive) return
    const body: FoundationAgentInput = { target, revision, message: message.trim() || (target === 'dwelling' ? c.defaultDwelling : c.defaultBuilding), ...(parent ? { parentVersionId: parent.id } : {}) }
    const fingerprint = JSON.stringify(body)
    const retrying = pending.current?.fingerprint === fingerprint
    const abort = new AbortController(); mutationAbort.current = abort
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const summary = await request<CreditSummary>('/api/credits', { signal: abort.signal })
      if (abort.signal.aborted || !mounted.current) return
      setCredits(summary)
      const amount = summary.costs[target === 'dwelling' ? 'apartment' : 'building']
      if (!retrying && summary.balance < amount) { setError(a.insufficient); return }
      if (!retrying && !window.confirm(a.confirmGeneration.replace('{cost}', String(amount)))) return
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
      const { run: next } = await startFoundationAgent(projectId, body, pending.current.key, abort.signal)
      if (abort.signal.aborted || !mounted.current) return
      generation.current++; pending.current = null; updateRun(next); setSelectedRunId(next.id); setSelectedVersionId(null); setIterationIndex(null); setFeedback('')
      await refreshCredits(abort.signal)
    } catch (reason) { if (!abort.signal.aborted) report(reason) }
    finally { sending.current = false; if (mutationAbort.current === abort) mutationAbort.current = null; if (mounted.current) setBusy(false) }
  }
  async function cancel() {
    if (!run || sending.current || readOnly || !active(run)) return
    const abort = new AbortController(); mutationAbort.current = abort
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const { run: next } = await cancelFoundationAgent(projectId, run.id, abort.signal)
      if (abort.signal.aborted || !mounted.current) return
      generation.current++; updateRun(next); await refreshCredits(abort.signal)
    } catch (reason) { if (!abort.signal.aborted) report(reason) }
    finally { sending.current = false; if (mutationAbort.current === abort) mutationAbort.current = null; if (mounted.current) setBusy(false) }
  }
  async function accept() {
    if (!version || version.status !== 'ready' || sending.current || disabled || !viewingFinal) return
    if (acceptedVersionId && !window.confirm(target === 'building' ? c.replaceBuildingConfirm : c.replaceConfirm)) return
    const abort = new AbortController(); mutationAbort.current = abort
    sending.current = true; setBusy(true); busyCallback.current?.(true); setError(''); setNotice('')
    try {
      const { project } = await acceptFoundationVersion(projectId, version.id, revision, abort.signal)
      if (abort.signal.aborted || !mounted.current) return
      onProjectUpdated(project); setNotice(c.applied)
    } catch (reason) { if (!abort.signal.aborted) report(reason) }
    finally { sending.current = false; busyCallback.current?.(false); if (mutationAbort.current === abort) mutationAbort.current = null; if (mounted.current) setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void start(version ? feedback : instructions, version) }
  function selectVersion(id: string) {
    const selected = versions.find(item => item.id === id)
    setSelectedVersionId(id); setSelectedRunId(selected?.runId ?? null); setIterationIndex(null); setFeedback('')
  }

  return <section aria-label={c[target]} data-testid={`foundation-agent-${target}`} className={`${panel} tw:min-w-0 tw:scroll-mt-40 tw:overflow-hidden`} aria-busy={busy}>
    <header className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4 tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:p-5"><div className="tw:min-w-0"><p className={`${muted} tw:mb-2 tw:mt-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest`}>{c.eyebrow}</p><h3 className="tw:m-0 tw:text-xl tw:font-medium">{c[target]}</h3><p className={`${muted} tw:mb-0 tw:max-w-3xl tw:text-sm tw:leading-6`}>{target === 'dwelling' ? c.dwellingIntro : c.buildingIntro}</p></div><button type="button" className={button} disabled={busy} onClick={() => { const abort = new AbortController(); void refreshWorkshop(abort.signal) }}>{c.refresh}</button></header>
    <div className="tw:px-5"><Feedback message={error} error /><Feedback message={notice} />{dirty && <Feedback message={c.saveFirst} />}{history && !enabled && !readOnly && <Feedback message={c.unavailable} />}{readOnly && <p className={`${muted} tw:text-sm tw:leading-6`}>{c.readOnly}</p>}</div>
    {!history ? <p role="status" className={`${muted} tw:p-5 tw:text-sm`}>{c.loading}</p> : <div className="tw:grid tw:min-w-0 tw:xl:grid-cols-[minmax(260px,.65fr)_minmax(0,1.35fr)]">
      <aside className="tw:min-w-0 tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-5 tw:xl:border-b-0 tw:xl:border-r">
        <h4 className="tw:mb-4 tw:mt-0 tw:text-base tw:font-medium">{c.activity}</h4>
        {runs.length > 0 && <Field label={c.history}><select className={field} value={run?.id ?? ''} onChange={event => { setSelectedRunId(event.target.value); setSelectedVersionId(null); setIterationIndex(null); setFeedback('') }}>{runs.map(item => <option key={item.id} value={item.id}>{c[item.status]} · {new Date(item.createdAt).toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</option>)}</select></Field>}
        {run ? <><Activity key={run.id} run={run} language={language} copy={c} offline={offline} />{run.error && <Feedback message={run.error} error />}
          {!readOnly && <div className="tw:mt-4 tw:flex tw:flex-wrap tw:gap-2">{active(run) && <button type="button" className={button} disabled={busy} onClick={() => { void cancel() }}>{c.cancel}</button>}{(run.status === 'failed' || run.status === 'cancelled') && <button type="button" className={button} disabled={disabled || !enabled || hasActive} onClick={() => { void start(run.message, versions.find(item => item.id === run.versionId) ?? versions.find(item => item.id === run.parentVersionId)) }}>{c.retry}</button>}</div>}
        </> : <p className={`${muted} tw:my-6 tw:text-sm tw:leading-6`}>{c.noHistory}</p>}
        <div className="tw:mt-6 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-5"><h4 className="tw:mb-3 tw:mt-0 tw:text-sm tw:font-medium">{c.versions}</h4>{versions.length ? <div className="tw:flex tw:flex-wrap tw:gap-2">{versions.map(item => <button type="button" key={item.id} className={`${button} tw:min-h-9! tw:px-3! tw:text-xs! ${version?.id === item.id ? 'tw:bg-[var(--settings-accent-soft)]!' : ''}`} aria-pressed={version?.id === item.id} onClick={() => selectVersion(item.id)}>{numberLabel(c.version, versionNumber(item))}{item.id === acceptedVersionId ? ` · ${c.current}` : item.status === 'needs_input' ? ` · ${c.needs_input}` : ''}</button>)}</div> : <p className={`${muted} tw:m-0 tw:text-xs tw:leading-5`}>{c.noVersions}</p>}</div>
      </aside>
      <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-5 tw:p-5">
        <section aria-label={c.preview} className="tw:min-w-0 tw:scroll-mt-40">
          {!version && candidate && run && (run.status === 'failed' || run.status === 'cancelled') && <Feedback message={c.interruptedDraft} />}
          <div className="tw:mb-3 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><h4 className="tw:m-0 tw:text-base tw:font-medium">{version ? numberLabel(c.version, versionNumber(version)) : c.preview}</h4>{iterations.length > 0 && <label className={`${muted} tw:flex tw:items-center tw:gap-2 tw:text-xs`}>{c.iterations}<select className={`${field} tw:w-auto! tw:py-2! tw:text-xs!`} value={iteration?.index ?? ''} onChange={event => setIterationIndex(Number(event.target.value))}>{iterations.map(item => <option key={item.index} value={item.index}>{numberLabel(c.iteration, item.index)}</option>)}</select></label>}</div>
          {candidate ? <div className="tw:min-w-0">{renderPreview(candidate)}<p className={`${muted} tw:mb-0 tw:text-xs tw:leading-5`}>{c.previewCaption}</p></div> : officialResearch ? null : <div className="tw:flex tw:min-h-44 tw:flex-col tw:items-center tw:justify-center tw:rounded-xl tw:border tw:border-dashed tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-6 tw:text-center"><svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="tw:mb-3 tw:text-[color:var(--settings-muted)]"><path d="m10 23 22-12 22 12v24L32 59 10 47V23Zm0 0 22 12 22-12M32 35v24M21 17l22 12v13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg><p className={`${muted} tw:m-0 tw:max-w-sm tw:text-sm tw:leading-6`}>{iterations.length ? c.previewPending : c.noIterations}</p></div>}
          {officialResearch && <OfficialResearch key={version?.id ?? run?.id ?? acceptedVersionId} research={officialResearch} language={language} />}
          {iteration?.review && <div className="tw:mt-4 tw:rounded-lg tw:bg-[var(--settings-surface)] tw:p-4"><h5 className="tw:m-0 tw:text-sm tw:font-medium">{c.review}</h5><p className="tw:mb-0 tw:mt-2 tw:whitespace-pre-wrap tw:text-sm tw:leading-6">{iteration.review.summary}</p>{iteration.review.issues.length > 0 && <ul className={`${muted} tw:mb-0 tw:pl-5 tw:text-xs tw:leading-6`}>{iteration.review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}</div>}
          {candidate && <Evidence candidate={candidate} copy={c} />}
          {version?.status === 'ready' && <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><p className={`${muted} tw:m-0 tw:max-w-sm tw:text-xs tw:leading-5`}>{viewingFinal ? c.applyHelp : c.applyFinal}</p>{acceptedVersionId === version.id ? <span className="tw:text-sm tw:font-medium">✓ {c.current}</span> : !readOnly && <button type="button" className={primary} disabled={disabled || !viewingFinal} onClick={() => { void accept() }}>{c.apply}</button>}</div>}
        </section>
        {(version || run?.message) && <section aria-label={c.chat} className="tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-5"><h4 className="tw:mb-3 tw:mt-0 tw:text-base tw:font-medium">{c.chat}</h4>{run?.message && <div className="tw:mb-3 tw:ml-6 tw:rounded-xl tw:bg-[var(--settings-accent-soft)] tw:p-4"><span className={`${muted} tw:text-xs tw:font-medium`}>{c.user}</span><p className="tw:mb-0 tw:mt-1 tw:whitespace-pre-wrap tw:break-words tw:text-sm tw:leading-6">{run.message}</p></div>}{version?.summary && <div className="tw:mr-6 tw:rounded-xl tw:bg-[var(--settings-surface)] tw:p-4"><span className={`${muted} tw:text-xs tw:font-medium`}>{c.agent}</span><p className="tw:mb-0 tw:mt-1 tw:whitespace-pre-wrap tw:break-words tw:text-sm tw:leading-6">{version.summary}</p></div>}{needsInput && <div className="tw:mt-4 tw:rounded-xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-4"><h5 className="tw:m-0 tw:text-sm tw:font-medium">{c.questions}</h5><ul className="tw:mb-0 tw:pl-5 tw:text-sm tw:leading-6">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}</section>}
        {!readOnly && (!hasActive || version) && <form onSubmit={submit} className="tw:flex tw:flex-col tw:gap-4">
          {version && <p className={`${muted} tw:mb-0 tw:mt-0 tw:text-sm tw:leading-6`}>{needsInput ? c.inputHelp : c.chatIntro}</p>}
          <Field label={version ? needsInput ? c.answer : c.message : c.instructions} help={version ? numberLabel(c.basedOn, versionNumber(version)) : c.instructionsHelp}><textarea className={`${field} tw:min-h-28 tw:resize-y tw:font-[inherit]`} value={version ? feedback : instructions} disabled={disabled || hasActive} required={!!version} maxLength={4000} rows={3} placeholder={version ? needsInput ? c.answerPlaceholder : target === 'dwelling' ? c.messagePlaceholder : c.buildingCorrection : target === 'dwelling' ? c.dwellingPlaceholder : c.buildingPlaceholder} onChange={event => version ? setFeedback(event.target.value) : setInstructions(event.target.value)} /></Field>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><div className={`${muted} tw:text-xs tw:leading-5`}><span>{a.cost}: {cost === undefined ? '…' : `${cost} ${a.creditUnit}`}</span>{credits && <span className="tw:block">{a.balance}: {credits.balance}</span>}</div><button type="submit" className={primary} disabled={disabled || !enabled || !credits || hasActive || (!!version && !feedback.trim())}>{busy ? c.busy : version ? needsInput ? c.continue : c.send : c.start} →</button></div>
          <p className={`${muted} tw:m-0 tw:text-xs tw:leading-5`}>{version ? c.preserved : a.jobHold}</p>
          {version && <button type="button" className={`${button} tw:self-start tw:text-xs!`} disabled={disabled || !enabled || hasActive} onClick={() => { setSelectedVersionId(null); setSelectedRunId(null); setIterationIndex(null); void start(instructions) }}>{c.newRun}</button>}
        </form>}
      </div>
    </div>}
  </section>
}
