import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateJobInputSchema, type AnswersInput, type Asset, type Health, type Job, type ReferenceImage, type RevisionInput } from '@t3-designer/asset-schema'
import { assetApi, AssetApiError, dimensionsFromCentimetres } from '../lib/asset-api'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import { WorkshopActivity } from './WorkshopActivity'
import { AssetRevision, type RevisionDraft } from './AssetRevision'
import { ReferenceComparison, ReferenceImagePicker } from './ReferenceImages'
import { assetFamilies, assetFamilyId } from '../lib/asset-versions'
import './assets.css'
import { getAccountCopy } from '../private/account-copy'
import { request } from '../private/api'
import type { CreditSummary } from '../private/account-api'

const AssetModelPreview = lazy(() => import('./AssetModelPreview').then(module => ({ default: module.AssetModelPreview })))
type DimensionFields = [string, string, string]
type WorkshopSnapshot = { connection: 'checking' | 'online' | 'offline'; health: Health | null; jobs: Job[]; assets: Asset[] }
const activeStatuses = new Set<Job['status']>(['queued', 'analyzing', 'needs_input', 'generating'])

function DimensionInput({ value, onChange, id }: { value: string; onChange: (value: string) => void; id: string }) {
  const { system } = useUnits()
  const factor = system === 'imperial' ? 2.54 : 1
  const unit = system === 'imperial' ? 'in' : 'cm'
  const [draft, setDraft] = useState<{ source: string; system: string; text: string } | null>(null)
  const minimum = 5 / factor, maximum = 2000 / factor
  const rounded = Number((Number(value) / factor).toFixed(6))
  // Formatting a valid boundary value must not push it outside the native range.
  const displayed = Number(value) >= 5 && Number(value) <= 2000 ? Math.max(minimum, Math.min(maximum, rounded)) : rounded
  const text = draft?.source === value && draft.system === system ? draft.text : value === '' ? '' : String(displayed)
  return <div className="workshop-unit-input"><input id={id} type="number" min={minimum} max={maximum} step="any" inputMode="decimal" value={text} onChange={event => {
    const text = event.target.value
    const canonical = text === '' ? '' : String(Number(text) * factor)
    setDraft({ source: canonical, system, text })
    onChange(canonical)
  }} /><span aria-hidden="true">{unit}</span></div>
}

function DimensionInputs({ values, onChange, prefix }: { values: DimensionFields; onChange: (value: DimensionFields) => void; prefix: string }) {
  const { t } = useTranslation('assets')
  const { system } = useUnits()
  const unit = system === 'imperial' ? 'in' : 'cm'
  return <fieldset className="workshop-dimensions">
    <legend>{t('form.dimensions')}</legend>
    <div>{(['width', 'height', 'depth'] as const).map((axis, index) => <label key={axis} htmlFor={`${prefix}-${axis}`}>
      <span>{t(`form.${axis}`)} <span className="sr-only">({unit})</span></span>
      <DimensionInput id={`${prefix}-${axis}`} value={values[index]} onChange={value => {
        const next: DimensionFields = [...values]
        next[index] = value
        onChange(next)
      }} />
    </label>)}</div>
    <p>{t('form.dimensionHelp', { unit })}</p>
  </fieldset>
}

function AnswerForm({ job, disabled, onAnswer }: { job: Job; disabled: boolean; onAnswer: (input: AnswersInput) => Promise<void> }) {
  const { t } = useTranslation('assets')
  const { formatLength } = useUnits()
  const [notes, setNotes] = useState('')
  const [dimensions, setDimensions] = useState<DimensionFields>(['', '', ''])
  const [error, setError] = useState('')
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [uploading, setUploading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || uploading || (!notes.trim() && !references.length)) return
    let result: AnswersInput['dimensions']
    try { result = dimensionsFromCentimetres(dimensions) } catch { setError(t('form.invalidDimensions', { min: formatLength(.05), max: formatLength(20) })); return }
    setError('')
    await onAnswer({ notes: notes.trim() || t('references.attached'), ...(result ? { dimensions: result } : {}), ...(references.length ? { referenceImageIds: references.map(image => image.id) } : {}) })
  }
  return <form className="workshop-answer" onSubmit={event => { void submit(event) }}>
    <h4>{t('jobs.questions')}</h4>
    <ul>{job.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
    <label htmlFor={`answer-${job.id}`}>{t('jobs.answerLabel')}</label>
    <textarea id={`answer-${job.id}`} value={notes} onChange={event => setNotes(event.target.value)} placeholder={t('jobs.answerPlaceholder')} required={!references.length} maxLength={12000} rows={3} />
    <DimensionInputs prefix={`answer-${job.id}`} values={dimensions} onChange={setDimensions} />
    <ReferenceImagePicker id={`answer-photos-${job.id}`} values={references} onChange={setReferences} onUploading={setUploading} disabled={disabled} />
    {error && <p className="workshop-error" role="alert">{error}</p>}
    <button className="workshop-primary" type="submit" disabled={disabled || uploading || (!notes.trim() && !references.length)}>{t('jobs.continue')}</button>
  </form>
}

function AssetDetails({ asset, versions, job, draft, disabled, creditNote, onSelect, onDraft, onRevise }: {
  asset: Asset; versions: Asset[]; job: Job | undefined; draft: RevisionDraft; disabled: boolean; creditNote: string; onSelect: (id: string) => void; onDraft: (draft: RevisionDraft) => void; onRevise: (input: RevisionInput) => Promise<void>;
}) {
  const { t } = useTranslation('assets')
  const { formatDimensions } = useUnits()
  const [mode, setMode] = useState<'image' | 'model'>('image')
  return <section className="workshop-detail" aria-label={t('library.selected')}>
    <div className="workshop-detail-heading">
      <div><span className="eyebrow">{t('library.selected')} · {t('revision.version', { count: asset.revision ?? 1 })}</span><h3>{asset.label}</h3></div>
      <div className="workshop-preview-tabs" aria-label={t('library.preview')}>
        <button aria-pressed={mode === 'image'} onClick={() => setMode('image')}>{t('library.preview')}</button>
        <button aria-pressed={mode === 'model'} onClick={() => setMode('model')}>{t('library.model')}</button>
      </div>
    </div>
    {versions.length > 1 && <div className="workshop-version-navigation"><label htmlFor="asset-version">{t('revision.history')}</label><select id="asset-version" value={asset.id} onChange={event => onSelect(event.target.value)}>{versions.map(version => <option key={version.id} value={version.id}>{t('revision.version', { count: version.revision ?? 1 })} · {version.label}</option>)}</select>{versions.some(version => version.id === asset.parentAssetId) && <button type="button" onClick={() => { if (asset.parentAssetId) onSelect(asset.parentAssetId) }}>{t('revision.previous')} ↗</button>}</div>}
    <div className="workshop-detail-body">
      <div className="workshop-preview">
        {mode === 'image' ? <img src={asset.files.preview} alt={asset.label} /> : <Suspense fallback={<p className="workshop-canvas-message" role="status">{t('library.loading')}</p>}><AssetModelPreview url={asset.files.model} /></Suspense>}
      </div>
      <div className="workshop-specs">
        <span className="workshop-draft">{t('library.draft')}</span>
        <p className="workshop-draft-help">{t('library.draftHelp')}</p>
        <dl>
          <div><dt>{t('library.dimensions')}</dt><dd>{formatDimensions(asset.dimensions, 1)}</dd></div>
          <div><dt>{t('library.measurements')}</dt><dd>{t(`library.${asset.source.dimensionalStatus}`)}</dd></div>
        </dl>
        <p className="workshop-source-description">{asset.source.description}</p>
        {asset.source.url && <a className="workshop-source-link" href={asset.source.url} target="_blank" rel="noreferrer">{t('library.source')} ↗</a>}
        {(asset.warnings.length > 0 || (asset.source.notes?.length ?? 0) > 0) && <details className="workshop-review-notes"><summary>{t('library.warnings')}</summary><ul>{[...asset.warnings, ...(asset.source.notes ?? [])].map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
        <h4>{t('library.downloads')}</h4>
        <div className="workshop-downloads">
          <a href={asset.files.model} download>{t('library.glb')} ↓</a>
          <a href={asset.files.blend} download>{t('library.blend')} ↓</a>
          <a href={asset.files.manifest} download>{t('library.manifest')} ↓</a>
        </div>
      </div>
    </div>
    <div className="workshop-detail-followup">
      <ReferenceComparison referenceIds={job?.input.referenceImageIds ?? []} references={asset.referenceImages} preview={asset.files.preview} label={asset.label} />
      {asset.visualReview && <section className={`workshop-visual-review verdict-${asset.visualReview.verdict}`} aria-label={t('revision.review')}>
        <h4>{t('revision.review')}</h4><span className="workshop-draft">{t(`revision.verdict.${asset.visualReview.verdict}`)}</span><p>{asset.visualReview.summary}</p>
        {asset.visualReview.issues.length > 0 && <ul>{asset.visualReview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
        <p className="workshop-review-count">{t('revision.iterations', { count: asset.visualReview.iterations })}</p><p className="workshop-footnote">{t('revision.reviewLimit')}</p>
      </section>}
      <p className="workshop-footnote">{creditNote}</p>
      <AssetRevision asset={asset} draft={draft} disabled={disabled} onChange={onDraft} onSubmit={onRevise} />
    </div>
  </section>
}

export function AssetsExplorer() {
  const { t, i18n } = useTranslation('assets')
  const a = getAccountCopy(i18n.resolvedLanguage)
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [creditsFailed, setCreditsFailed] = useState(false)
  const { formatNumber } = useLocale()
  const { formatDimensions, formatLength } = useUnits()
  const [snapshot, setSnapshot] = useState<WorkshopSnapshot>({ connection: 'checking', health: null, jobs: [], assets: [] })
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [dimensions, setDimensions] = useState<DimensionFields>(['', '', ''])
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, RevisionDraft>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const poll = useRef<AbortController | null>(null)
  const mutation = useRef(0)
  const busyRef = useRef(false)
  const pendingGenerations = useRef(new Map<string, string>())
  const draftVersion = useRef(0)
  const mounted = useRef(true)
  const urlInput = useRef<HTMLInputElement>(null)
  const activityPanel = useRef<HTMLDivElement>(null)
  const resultPanel = useRef<HTMLDivElement>(null)
  const refresh = useCallback(async () => {
    if (poll.current) return
    const controller = new AbortController()
    poll.current = controller
    const version = mutation.current
    try {
      const [health, { jobs }, { assets }] = await Promise.all([assetApi.health(controller.signal), assetApi.jobs(controller.signal), assetApi.assets(controller.signal)])
      if (!controller.signal.aborted && version === mutation.current) setSnapshot({ connection: 'online', health, jobs, assets })
    } catch {
      if (!controller.signal.aborted && version === mutation.current) setSnapshot(previous => ({ ...previous, connection: 'offline' }))
    } finally {
      if (poll.current === controller) poll.current = null
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    const load = () => { if (!document.hidden) void request<CreditSummary>('/api/credits', { signal: abort.signal }).then(data => { setCredits(data); setCreditsFailed(false) }).catch(() => { if (!abort.signal.aborted) setCreditsFailed(true) }) }
    load(); const interval = setInterval(load, 15_000); window.addEventListener('t3:credits-changed', load)
    return () => { abort.abort(); clearInterval(interval); window.removeEventListener('t3:credits-changed', load) }
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const interval = setInterval(() => { if (!document.hidden) void refresh() }, 3000)
    const onVisibility = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { mounted.current = false; clearInterval(interval); poll.current?.abort(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [refresh])

  const connected = snapshot.connection === 'online'
  const ready = connected && snapshot.health?.generationEnabled !== false && snapshot.health?.codex.authenticated && snapshot.health?.blender.available
  const selected = snapshot.assets.find(asset => asset.id === selectedId) ?? snapshot.assets[0]
  const families = assetFamilies(snapshot.assets)
  const versions = families.find(family => family.some(asset => asset.id === selected?.id)) ?? []
  const jobs = [...snapshot.jobs].sort((a, b) => Number(activeStatuses.has(b.status)) - Number(activeStatuses.has(a.status)) || b.createdAt.localeCompare(a.createdAt))
  const selectedJob = jobs.find(job => job.id === selectedJobId) ?? jobs[0]

  function focusActivity() {
    requestAnimationFrame(() => {
      activityPanel.current?.focus({ preventScroll: true })
      activityPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function viewResult() {
    if (!selectedJob?.assetId) return
    setSelectedId(selectedJob.assetId)
    requestAnimationFrame(() => {
      resultPanel.current?.focus({ preventScroll: true })
      resultPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function action(id: string, operation: () => Promise<{ job: Job }>, afterSuccess?: () => void) {
    if (busyRef.current) return
    busyRef.current = true
    mutation.current += 1
    setBusy(id)
    setError('')
    setNotice('')
    try {
      const { job } = await operation()
      if (!mounted.current) return
      mutation.current += 1
      poll.current?.abort()
      poll.current = null
      setSnapshot(previous => ({ ...previous, jobs: [job, ...previous.jobs.filter(item => item.id !== job.id)] }))
      setSelectedJobId(job.id)
      afterSuccess?.()
      await refresh()
    }
    catch (failure) { if (mounted.current) setError(failure instanceof AssetApiError ? failure.message : t('form.requestFailed')) }
    finally { busyRef.current = false; if (mounted.current) { setBusy(null); window.dispatchEvent(new Event('t3:credits-changed')) } }
  }

  async function confirmCost(kind: 'asset' | 'revision') {
    if (busyRef.current) return false
    busyRef.current = true; setBusy('credit-check'); setError('')
    try {
      const current = await request<CreditSummary>('/api/credits')
      if (!mounted.current) return false
      setCredits(current); setCreditsFailed(false)
      const cost = current.costs[kind]
      if (current.balance < cost) { setError(a.insufficient); return false }
      return window.confirm(a.confirmGeneration.replace('{cost}', String(cost)))
    } catch { if (mounted.current) { setCreditsFailed(true); setError(a.creditUnavailable) }; return false }
    finally { busyRef.current = false; if (mounted.current) setBusy(null) }
  }

  async function chargedAction(id: string, kind: 'asset' | 'revision', identity: string, operation: (key: string) => Promise<{ job: Job }>, afterSuccess?: () => void) {
    if (busyRef.current) return
    const pendingKey = pendingGenerations.current.get(identity)
    if (!pendingKey && !await confirmCost(kind)) return
    const key = pendingKey ?? crypto.randomUUID()
    pendingGenerations.current.set(identity, key)
    await action(id, async () => {
      try { const result = await operation(key); pendingGenerations.current.delete(identity); return result }
      catch (failure) { if (failure instanceof AssetApiError && [400, 401, 402, 403, 404, 409, 413, 422, 429].includes(failure.status)) pendingGenerations.current.delete(identity); throw failure }
    }, afterSuccess)
  }

  async function retry(job: Job) {
    await chargedAction(job.id, job.parentAssetId ? 'revision' : 'asset', `retry:${job.id}`, key => assetApi.retry(job.id, key))
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || uploading) return
    setNotice('')
    let measured: AnswersInput['dimensions']
    try { measured = dimensionsFromCentimetres(dimensions) } catch { setError(t('form.invalidDimensions', { min: formatLength(.05), max: formatLength(20) })); return }
    const input = CreateJobInputSchema.safeParse({ url: url.trim(), notes: notes.trim(), ...(measured ? { dimensions: measured } : {}), ...(references.length ? { referenceImageIds: references.map(image => image.id) } : {}) })
    if (!input.success) { setError(t('form.invalidUrl')); return }
    const version = draftVersion.current
    await chargedAction('create', 'asset', `create:${JSON.stringify(input.data)}`, key => assetApi.create(input.data, key), () => {
      if (version === draftVersion.current) {
        setUrl('')
        setNotes('')
        setDimensions(['', '', ''])
        setReferences([])
        draftVersion.current += 1
      }
      setNotice(t('form.created'))
      focusActivity()
    })
  }

  async function revise(asset: Asset, input: RevisionInput) {
    const submittedDraft = revisionDrafts[asset.id]
    await chargedAction(`revision-${asset.id}`, 'revision', `revision:${asset.id}:${JSON.stringify(input)}`, key => assetApi.revise(asset.id, input, key), () => {
      setRevisionDrafts(previous => previous[asset.id] === submittedDraft ? { ...previous, [asset.id]: { feedback: '', references: [] } } : previous)
      setNotice(t('revision.created'))
      focusActivity()
    })
  }

  return <div className="asset-workshop">
    <header className="workshop-heading">
      <div><span className="eyebrow">{t('eyebrow')}</span><h2>{t('title')}</h2><p>{t('description')}</p></div>
      <span className={`workshop-connection is-${snapshot.connection}`} role="status"><i />{t(`connection.${snapshot.connection}`)}</span>
    </header>
    <div className="workshop-banner" role="status"><p>{creditsFailed ? a.creditUnavailable : credits ? `${a.balance}: ${formatNumber(credits.balance, 0)} · ${a.reserved}: ${formatNumber(credits.reserved, 0)}. ${a.jobHold}` : a.credits}</p><a href="/app/credits">{a.credits} →</a></div>
    {snapshot.connection === 'offline' && <div className="workshop-banner" role="status"><p>{t('connection.offlineHelp')}</p><button onClick={() => { void refresh() }}>{t('connection.reconnect')}</button></div>}
    {connected && !snapshot.health?.codex.authenticated && <div className="workshop-banner"><p>{t('connection.login')}</p></div>}
    {connected && !snapshot.health?.blender.available && <div className="workshop-banner"><p>{t('connection.blender')}</p></div>}
    {connected && snapshot.health?.generationEnabled === false && <div className="workshop-banner" role="status"><p>{t('connection.generationDisabled')}</p></div>}
    {error && <p className="workshop-error workshop-global-message" role="alert">{error}</p>}
    {notice && <div className="workshop-notice workshop-global-message" role="status"><span>{notice}</span><button type="button" className="workshop-text-button" onClick={focusActivity}>{t('activity.view')} ↓</button></div>}
    <div className="workshop-layout">
      <aside className="workshop-sidebar">
        <form className="workshop-create workshop-panel" onSubmit={event => { void create(event) }}>
          <h3>{t('form.title')}</h3><p className="workshop-subtitle">{t('form.subtitle')}</p>
          <label htmlFor="asset-product-url">{t('form.url')}</label>
          <input ref={urlInput} id="asset-product-url" type="url" value={url} onChange={event => { draftVersion.current += 1; setUrl(event.target.value) }} placeholder={t('form.urlPlaceholder')} required maxLength={2048} autoComplete="url" />
          <label htmlFor="asset-notes">{t('form.notes')}</label>
          <textarea id="asset-notes" value={notes} onChange={event => { draftVersion.current += 1; setNotes(event.target.value) }} placeholder={t('form.notesPlaceholder')} maxLength={12000} rows={4} />
          <DimensionInputs prefix="create" values={dimensions} onChange={value => { draftVersion.current += 1; setDimensions(value) }} />
          <ReferenceImagePicker id="create-photos" values={references} onChange={value => { draftVersion.current += 1; setReferences(value) }} onUploading={setUploading} disabled={!connected || busy !== null} />
          <p className="workshop-footnote">{credits ? `${a.cost}: ${credits.costs.asset} ${a.creditUnit}. ${a.retryCost}` : a.creditUnavailable}</p>
          <button type="submit" className="workshop-primary" disabled={!ready || !credits || creditsFailed || uploading || busy !== null}>{t(busy === 'create' ? 'form.sending' : 'form.submit')} <span aria-hidden="true">↗</span></button>
          <p className="workshop-footnote">{t('form.footnote')}</p>
        </form>
      </aside>
      <div className="workshop-main">
        <div ref={activityPanel} tabIndex={-1} className="workshop-focus-target">
          <WorkshopActivity job={selectedJob} jobs={jobs} assets={snapshot.assets} disabled={!connected || busy !== null} retryDisabled={!ready || !credits || creditsFailed || busy !== null} busy={busy === selectedJob?.id} onSelect={setSelectedJobId}
            onCancel={() => { if (selectedJob) void action(selectedJob.id, () => assetApi.cancel(selectedJob.id)) }}
            onRetry={() => { if (selectedJob) void retry(selectedJob) }}
            onView={viewResult} onNew={() => { urlInput.current?.focus(); urlInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>
            {selectedJob?.status === 'needs_input' && <AnswerForm key={selectedJob.id} job={selectedJob} disabled={!connected || busy !== null} onAnswer={input => action(selectedJob.id, () => assetApi.answer(selectedJob.id, input))} />}
          </WorkshopActivity>
        </div>
      <section className="workshop-library" aria-label={t('library.title')}>
        <div className="workshop-library-heading"><h3>{t('library.title')}</h3><span>{t('library.count', { count: families.length })}</span></div>
        {snapshot.assets.length === 0 ? <div className="workshop-empty"><div className="workshop-empty-object" aria-hidden="true">◇</div><h3>{t('library.emptyTitle')}</h3><p>{t('library.emptyDescription')}</p></div> : <>
          <div className="workshop-grid">{families.map(family => { const asset = family[0]; return <button className="workshop-card" key={asset.id} aria-label={t('library.select', { label: asset.label })} aria-pressed={selected ? assetFamilyId(selected, snapshot.assets) === assetFamilyId(asset, snapshot.assets) : false} onClick={() => setSelectedId(asset.id)}>
            <img src={asset.files.preview} alt="" loading="lazy" />
            <div><span className="workshop-card-title">{asset.label}</span><span className="workshop-card-dimensions">{formatDimensions(asset.dimensions, 1)}</span><span className="workshop-draft">{t('library.draft')}</span>{family.length > 1 && <span className="workshop-card-versions">{t('revision.versions', { count: family.length })}</span>}</div>
          </button> })}</div>
          {selected && <div ref={resultPanel} tabIndex={-1} className="workshop-focus-target"><AssetDetails key={selected.id} asset={selected} versions={versions} job={snapshot.jobs.find(job => job.id === selected.jobId)} draft={revisionDrafts[selected.id] ?? { feedback: '', references: [] }} disabled={!ready || !credits || creditsFailed || busy !== null} creditNote={credits ? `${a.cost}: ${credits.costs.revision} ${a.creditUnit}. ${a.retryCost}` : a.creditUnavailable} onSelect={setSelectedId} onDraft={draft => setRevisionDrafts(previous => ({ ...previous, [selected.id]: draft }))} onRevise={input => revise(selected, input)} /></div>}
        </>}
      </section>
      </div>
    </div>
  </div>
}
