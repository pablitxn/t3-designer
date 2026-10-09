import { Fragment, useEffect, useId, useState } from 'react'
import { request } from './api'
import { getUsageCopy, type UsageCopy } from './usage-copy'
import { operationTokens, usageLinks, usagePeriod, usageQuery, type UsageCall, type UsageFilters, type UsageOperation, type UsageResponse } from './usage-api'
import { button, Field, Feedback, input, muted, panel } from './ui'

const link = 'tw:text-[color:var(--settings-accent)] tw:underline tw:underline-offset-4'
const cell = 'tw:px-4 tw:py-4 tw:align-top'
const border = 'tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)]'
const tokenNumber = (value: number | null, language: string, c: UsageCopy) => value === null ? c.unknownValue : value.toLocaleString(language)
function duration(value: number | null, c: UsageCopy) {
  if (value === null) return c.unknownValue
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
  return `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`
}

function TokenBreakdown({ tokens, language, c }: { tokens: Pick<UsageCall, 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens'>; language: string; c: UsageCopy }) {
  return <>{([[c.cached, tokens.cachedInputTokens], [c.cacheWrite, tokens.cacheWriteInputTokens], [c.reasoning, tokens.reasoningOutputTokens]] as const).filter(([, value]) => value !== null).map(([label, value]) => <p key={label} className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs`}>{label}: {tokenNumber(value, language, c)}</p>)}</>
}

function CallDetails({ call, language, c }: { call: UsageCall; language: string; c: UsageCopy }) {
  const time = (value: string | null) => value ? new Date(value).toLocaleString(language) : c.unknownValue
  return <article className="tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-4">
    <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><h3 className="tw:m-0 tw:text-sm tw:font-medium">{c.stages[call.stage]} · {c.iteration} {call.iteration}</h3><span className={`${muted} tw:text-xs`}>{c.statuses[call.status]} · {c[call.measurement]} · {duration(call.durationMs, c)}</span></div>
    <p className={`${muted} tw:my-3 tw:text-xs`}>{call.provider === 'codex-local' ? c.subscription : c.api}</p>
    <div className="tw:grid tw:gap-4 tw:md:grid-cols-2"><dl className="tw:m-0 tw:grid tw:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-2 tw:text-xs">
      {([[c.input, tokenNumber(call.inputTokens, language, c)], [c.output, tokenNumber(call.outputTokens, language, c)], [c.model, call.requestedModel ?? c.unknownValue], [c.effectiveModel, call.effectiveModel ?? c.unknownValue], [c.auth, call.authMode === 'chatgpt' ? 'ChatGPT' : 'API key'], [c.source, call.source ?? c.unknownValue]] as const).map(([label, value]) => <Fragment key={label}><dt className={muted}>{label}</dt><dd className="tw:m-0 tw:break-words">{value}</dd></Fragment>)}
    </dl><div><TokenBreakdown tokens={call} language={language} c={c} /><p className={`${muted} tw:mb-0 tw:mt-3 tw:text-xs tw:leading-5`}>{c.started}: {time(call.startedAt)}<br />{c.ended}: {time(call.endedAt)}</p></div></div>
    <p className={`${muted} tw:mb-0 tw:mt-4 tw:break-all tw:font-mono tw:text-[10px]`}>{c.call}: {call.id}</p>
  </article>
}

function OperationRow({ operation, language, c }: { operation: UsageOperation; language: string; c: UsageCopy }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const links = usageLinks(operation)
  const number = (value: number | null) => tokenNumber(value, language, c)
  return <>
    <tr className={border}>
      <td className={cell}><p className="tw:m-0 tw:font-medium">{c.kinds[operation.kind] ?? operation.kind}</p><p className={`${muted} tw:mb-2 tw:mt-1 tw:text-xs tw:leading-5`}>{operation.projectLabel ?? (operation.jobId ? c.asset : c.operation)}<br />{c.attempt} {operation.attempt ?? '—'}{operation.attempt !== null && operation.attempt > 1 ? ` · ${c.retry}` : ''}{operation.parentId ? ` · ${c.revision}` : ''}</p><time className={`${muted} tw:text-xs`} dateTime={operation.createdAt}>{new Date(operation.createdAt).toLocaleString(language)}</time><div className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-3 tw:text-xs">{links.project && <a className={link} href={links.project}>{c.project} ↗</a>}{links.job && <a className={link} href={links.job}>{c.job} ↗</a>}{links.asset && <a className={link} href={links.asset}>{c.asset} ↗</a>}</div></td>
      <td className={cell}><span className="tw:text-xs">{c.statuses[operation.status] ?? operation.status}</span><p className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs`}>{operation.calls.length} {c.calls.toLocaleLowerCase(language)}</p>{operation.calls.some(call => call.provider === 'codex-local') && <p className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs tw:leading-5`}>{c.subscription}</p>}{operation.calls.some(call => call.provider === 'openai') && <p className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs`}>{c.api}</p>}</td>
      <td className={`${cell} tw:text-xs tw:leading-6`}>{c.consumed}: {number(operation.credits.consumed)}<br />{c.reserved}: {number(operation.credits.reserved)}<br />{c.refunded}: {number(operation.credits.refunded)}</td>
      <td className={`${cell} tw:text-xs tw:leading-6`}>{c.input}: {number(operationTokens(operation.calls, 'inputTokens'))}<br />{c.output}: {number(operationTokens(operation.calls, 'outputTokens'))}<button className={`${button} tw:mt-2 tw:min-h-8! tw:px-2! tw:py-1! tw:text-xs!`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{c.details} {expanded ? '−' : '+'}</button></td>
    </tr>
    {expanded && <tr className={border}><td colSpan={4} id={detailsId} className="tw:bg-[var(--settings-surface)] tw:p-4"><div className="tw:grid tw:gap-3">{operation.calls.length ? operation.calls.map(call => <CallDetails key={call.id} call={call} language={language} c={c} />) : <p className={`${muted} tw:m-0 tw:text-sm tw:leading-6`}>{c.noCalls}</p>}</div><p className={`${muted} tw:mb-0 tw:mt-4 tw:break-all tw:font-mono tw:text-[10px]`}>{c.operation}: {operation.id}{operation.parentId && <><br />{c.parent}: {operation.parentId}</>}</p></td></tr>}
  </>
}

export function UsagePage({ language, embedded = false }: { language: string; embedded?: boolean }) {
  const c = getUsageCopy(language)
  const [period, setPeriod] = useState('month')
  const [filters, setFilters] = useState<UsageFilters>(() => ({ ...usagePeriod('month'), projectId: '', operationType: '', provider: '', status: '' }))
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [response, setResponse] = useState<{ query: string; data: UsageResponse } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const query = usageQuery(filters, offset)
  const invalidDates = !!(filters.from && filters.to && filters.from > filters.to)
  const data = response?.query === query && !invalidDates ? response.data : null
  useEffect(() => {
    if (invalidDates) return
    const abort = new AbortController()
    setLoading(true); setError('')
    void request<UsageResponse>(query, { signal: abort.signal }).then(data => { if (!abort.signal.aborted) setResponse({ query, data }) }).catch(() => { if (!abort.signal.aborted) setError(c.unavailable) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [query, refresh, invalidDates, c.unavailable])
  function filter(key: keyof UsageFilters, value: string) { setFilters(previous => ({ ...previous, [key]: value })); setOffset(0) }
  const number = (value: number | null) => tokenNumber(value, language, c)
  const periodOptions = [['today', c.today], ['month', c.month], ['last30', c.last30], ['all', c.allTime], ['custom', c.custom]]
  const filterSummary = [periodOptions.find(([value]) => value === period)?.[1],
    response?.data.projects.find(project => project.id === filters.projectId)?.label,
    Object.entries(c.kinds).find(([value]) => value === filters.operationType)?.[1],
    filters.provider === 'openai' ? c.api : filters.provider === 'codex-local' ? 'Codex' : null,
    Object.entries(c.statuses).find(([value]) => value === filters.status)?.[1],
  ].filter(Boolean).join(' · ')
  const filterFields = <section aria-label={c.period} className={`${panel} tw:grid tw:gap-4 tw:p-4 tw:sm:grid-cols-2 ${embedded ? '' : 'tw:xl:grid-cols-5'}`}>
      <Field label={c.period}><select className={input} value={period} onChange={event => { const value = event.target.value; setPeriod(value); setOffset(0); if (value !== 'custom') setFilters(previous => ({ ...previous, ...usagePeriod(value) })) }}>{periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label={c.project}><select className={input} value={filters.projectId} onChange={event => filter('projectId', event.target.value)}><option value="">{c.all}</option>{(response?.data.projects ?? []).map(project => <option key={project.id} value={project.id}>{project.label}</option>)}</select></Field>
      <Field label={c.kind}><select className={input} value={filters.operationType} onChange={event => filter('operationType', event.target.value)}><option value="">{c.all}</option>{Object.entries(c.kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label={c.provider}><select className={input} value={filters.provider} onChange={event => filter('provider', event.target.value)}><option value="">{c.all}</option><option value="codex-local">Codex</option><option value="openai">{c.api}</option></select></Field>
      <Field label={c.status}><select className={input} value={filters.status} onChange={event => filter('status', event.target.value)}><option value="">{c.all}</option>{Object.entries(c.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      {period === 'custom' && <><Field label={c.from}><input className={input} type="date" value={filters.from} max={filters.to || undefined} onChange={event => filter('from', event.target.value)} /></Field><Field label={c.to}><input className={input} type="date" value={filters.to} min={filters.from || undefined} onChange={event => filter('to', event.target.value)} /></Field></>}
    </section>
  return <>
    <div className="tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">{!embedded && <div><h1 className="tw:mt-0! tw:text-3xl! tw:font-medium!">{c.title}</h1><p className={`${muted} tw:max-w-3xl tw:text-sm tw:leading-6`}>{c.intro}</p></div>}<button className={button} disabled={loading || invalidDates} onClick={() => setRefresh(value => value + 1)}>{c.refresh}</button></div>
    {embedded ? <details className="tw:mb-6"><summary className="tw:cursor-pointer tw:py-2 tw:text-sm tw:leading-6">{c.filters} · {filterSummary}</summary><div className="tw:mt-2">{filterFields}</div></details> : <div className="tw:mb-6">{filterFields}</div>}
    <Feedback message={invalidDates ? c.invalidDates : error} error />
    {loading && !invalidDates && <p role="status" className={`${muted} tw:text-sm`}>{c.loading}</p>}
    {data && <div aria-busy={loading}>
      <p className={`${muted} tw:mb-4 tw:text-xs tw:leading-5`}>{c.totalsNote}</p>
      <div className={`tw:grid tw:gap-4 tw:sm:grid-cols-2 ${embedded ? '' : 'tw:xl:grid-cols-4'}`}>
        <section className={`${panel} tw:p-5`} aria-label={c.credits}><h2 className={`${muted} tw:m-0 tw:text-sm tw:font-normal`}>{c.credits}</h2><p className="tw:mb-1 tw:mt-3 tw:text-3xl tw:font-medium" data-testid="usage-credits-consumed">{number(data.totals.creditsConsumed)}</p><p className={`${muted} tw:mb-4 tw:mt-0 tw:text-xs`}>{c.consumed}</p><p className="tw:mb-0 tw:text-xs tw:leading-6">{c.reserved}: {number(data.totals.creditsReserved)}<br />{c.refunded}: {number(data.totals.creditsRefunded)}</p></section>
        <section className={`${panel} tw:p-5`} aria-label={c.observed}><h2 className={`${muted} tw:m-0 tw:text-sm tw:font-normal`}>{c.observed}</h2><p className="tw:mb-1 tw:mt-3 tw:text-2xl tw:font-medium" data-testid="usage-input-tokens">{number(data.totals.inputTokens)}</p><p className={`${muted} tw:mb-3 tw:mt-0 tw:text-xs`}>{c.input}</p><p className="tw:m-0 tw:text-sm">{c.output}: {number(data.totals.outputTokens)}</p><TokenBreakdown tokens={data.totals} language={language} c={c} /></section>
        <section className={`${panel} tw:p-5`} aria-label={c.calls}><h2 className={`${muted} tw:m-0 tw:text-sm tw:font-normal`}>{c.calls}</h2><p className="tw:my-3 tw:text-3xl tw:font-medium">{number(data.totals.calls)}</p><p className="tw:mb-0 tw:text-xs tw:leading-6">{c.attempts}: {number(data.totals.attempts)}<br />{c.duration}: {duration(data.totals.durationMs, c)}</p><p className={`${muted} tw:mb-0 tw:text-xs tw:leading-5`}>{c.durationNote}</p></section>
        <section className={`${panel} tw:p-5`} aria-label={c.measurement}><h2 className={`${muted} tw:m-0 tw:text-sm tw:font-normal`}>{c.measurement}</h2><p className="tw:my-3 tw:text-2xl tw:font-medium" data-testid="usage-measurement">{c[data.totals.measurement]}</p><p className="tw:mb-0 tw:text-xs tw:leading-6">{number(data.totals.measuredCalls)} {c.measuredCalls}<br />{number(data.totals.partialCalls)} {c.partialCalls}<br />{number(data.totals.unknownCalls)} {c.unknownCalls}</p></section>
      </div>
      <div className={`${muted} tw:my-5 tw:grid tw:gap-2 tw:text-xs tw:leading-6`}><p className="tw:m-0">{c.breakdownNote} {c.missingNote}</p><p className="tw:m-0">{c.accountingNote}</p></div>
      <section aria-label={c.operations}><h2 className="tw:mb-4 tw:mt-8 tw:text-xl tw:font-medium">{c.operations}</h2>{data.operations.length ? <div className={`${panel} tw:overflow-x-auto`}><table className="tw:w-full tw:min-w-[680px] tw:border-collapse tw:text-left tw:text-sm"><thead><tr>{[c.operation, c.status, c.credits, c.observed].map(label => <th key={label} className={`${cell} tw:font-medium`} scope="col">{label}</th>)}</tr></thead><tbody>{data.operations.map(operation => <OperationRow key={operation.id} operation={operation} language={language} c={c} />)}</tbody></table></div> : <p className={`${panel} ${muted} tw:p-5 tw:text-sm`}>{c.empty}</p>}</section>
      {data.pagination.total > data.pagination.limit && <nav aria-label={c.page} className="tw:mt-5 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3"><p className={`${muted} tw:text-xs`}>{c.page} {Math.floor(data.pagination.offset / data.pagination.limit) + 1} {c.of} {Math.ceil(data.pagination.total / data.pagination.limit)} · {number(data.pagination.total)} {c.attempts.toLocaleLowerCase(language)}</p><div className="tw:flex tw:gap-2"><button className={button} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - data.pagination.limit))}>{c.previous}</button><button className={button} disabled={loading || offset + data.pagination.limit >= data.pagination.total} onClick={() => setOffset(offset + data.pagination.limit)}>{c.next}</button></div></nav>}
    </div>}
  </>
}
