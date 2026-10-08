import { useState } from 'react'
import type { FoundationOfficialResearch, Point2D } from '@t3-designer/scene-schema'
import { getOfficialResearchCopy } from './official-research-copy'
import { Field, input, muted } from './ui'

function sourceLink(value: string) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null } }
const path = (ring: Point2D[]) => `${ring.map(([x, z], index) => `${index ? 'L' : 'M'}${x} ${z}`).join(' ')} Z`

/** Cadastral evidence remains inspectable before there is any building model.
 * Selecting a record here changes only this view; confirmation uses the saved
 * intake reference and the official acquisition adapter. */
export function OfficialResearch({ research, language }: { research: FoundationOfficialResearch; language: string }) {
  const c = getOfficialResearchCopy(language), [inspected, setInspected] = useState<string | null>(null)
  const selected = research.parcels.find(parcel => parcel.id === inspected) ?? research.parcels.find(parcel => parcel.id === research.selectedParcelId) ?? research.parcels[0]
  const points: Point2D[] = [[0, 0], ...research.parcels.flatMap(parcel => parcel.footprint)]
  const minX = Math.min(...points.map(point => point[0])), minZ = Math.min(...points.map(point => point[1]))
  const width = Math.max(1, Math.max(...points.map(point => point[0])) - minX), depth = Math.max(1, Math.max(...points.map(point => point[1])) - minZ)
  const padding = Math.max(width, depth) * .08 + 1, marker = Math.max(width, depth) * .018
  const scale = 10 ** Math.floor(Math.log10(Math.max(width, depth) / 4))
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  return <section data-testid="official-research" aria-label={c.title} className="tw:mt-4 tw:min-w-0 tw:rounded-xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4">
    <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2"><h5 className="tw:m-0 tw:text-base tw:font-medium">{c.title}</h5><span className={`${muted} tw:text-xs`}>{research.jurisdiction}</span></div>
    <p className="tw:mb-2 tw:mt-3 tw:text-sm tw:leading-6">{research.summary}</p><p className={`${muted} tw:mb-4 tw:mt-0 tw:text-xs tw:leading-5`}>{c.intro}</p>
    <div className="tw:rounded-lg tw:bg-[var(--settings-bg)] tw:p-3"><p className="tw:m-0 tw:break-words tw:text-sm">{research.geocode?.label ?? c.noLocation}</p>{research.geocode && <p className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs tw:leading-5`}>{research.geocode.precision === 'approximate' ? c.approximate : c.address} · {research.geocode.provider} · {research.geocode.latitude.toFixed(6)}, {research.geocode.longitude.toFixed(6)}</p>}</div>
    {selected ? <>
      <div className="tw:my-4"><Field label={c.inspect}><select aria-label={c.inspect} className={`${input} tw:box-border tw:min-w-0`} value={selected.id} onChange={event => setInspected(event.target.value)}>{research.parcels.map(parcel => <option key={parcel.id} value={parcel.id}>{parcel.label} · {parcel.id}</option>)}</select></Field></div>
      <div className="tw:relative tw:overflow-hidden tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)]">
        <svg role="img" aria-label={c.parcelMap} viewBox={`${minX - padding} ${minZ - padding} ${width + padding * 2} ${depth + padding * 2}`} className="tw:block tw:h-72 tw:w-full" preserveAspectRatio="xMidYMid meet">
          {research.parcels.map(parcel => <path key={parcel.id} data-parcel-id={parcel.id} data-inspected={parcel.id === selected.id} d={[path(parcel.footprint), ...(parcel.holes ?? []).map(path)].join(' ')} fillRule="evenodd" clipRule="evenodd" fill={parcel.id === selected.id ? 'var(--settings-accent-soft)' : 'var(--settings-surface)'} stroke={parcel.id === selected.id ? 'var(--settings-accent)' : 'var(--settings-muted)'} strokeWidth={parcel.id === selected.id ? 2.5 : 1} vectorEffect="non-scaling-stroke"><title>{parcel.label} · {parcel.id}</title></path>)}
          <path d={`M${-marker} 0 H${marker} M0 ${-marker} V${marker}`} stroke="var(--settings-text)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path d={`M${minX} ${minZ + depth + padding / 2} h${scale}`} stroke="var(--settings-text)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden="true" className="tw:absolute tw:right-3 tw:top-3 tw:rounded tw:bg-[var(--settings-bg)] tw:px-2 tw:py-1 tw:text-center tw:text-xs">{c.north}<br />↑</span><span className={`${muted} tw:absolute tw:bottom-2 tw:left-3 tw:rounded tw:bg-[var(--settings-bg)] tw:px-2 tw:text-xs`}>{number.format(scale)} m</span>
      </div><p className={`${muted} tw:mb-3 tw:mt-2 tw:text-[11px] tw:leading-5`}>{c.mapHelp}</p>
      <dl className="tw:my-4 tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-4 tw:gap-y-2 tw:text-xs tw:leading-5"><dt className={muted}>{c.reference}</dt><dd className="tw:m-0 tw:break-all tw:font-medium">{selected.id}</dd><dt className={muted}>{selected.areaBasis === 'published' ? c.published : c.calculated}</dt><dd className="tw:m-0">{number.format(selected.area)} m²</dd><dt className={muted}>{c.provider}</dt><dd className="tw:m-0 tw:break-words">{selected.provider}</dd><dt className={muted}>{c.sourceDate}</dt><dd className="tw:m-0">{selected.sourceDate ?? c.noDate}</dd></dl>
      {sourceLink(selected.sourceUrl) && <a className="tw:break-words tw:text-xs tw:text-[color:var(--settings-accent)] tw:underline" href={sourceLink(selected.sourceUrl)!} target="_blank" rel="noreferrer">{c.source} ↗</a>}<p className={`${muted} tw:mb-0 tw:text-xs tw:leading-5`}>{c.attribution}: {selected.attribution}</p>
    </> : <p className={`${muted} tw:text-sm tw:leading-6`}>{c.noParcels}</p>}
    <div className="tw:mt-4 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-3"><p className="tw:m-0 tw:text-sm tw:font-medium">{research.selectedParcelId ? `${c.confirmed}: ${research.selectedParcelId}` : c.pending}</p><p className={`${muted} tw:mb-0 tw:mt-2 tw:text-xs tw:leading-5`}>{research.selectionEvidence ?? c.confirmHelp}</p></div>
    {research.unknowns.length > 0 && <details className="tw:mt-4 tw:text-xs"><summary className="tw:cursor-pointer tw:font-medium">{c.unknowns} ({research.unknowns.length})</summary><ul className={`${muted} tw:mb-0 tw:pl-5 tw:leading-6`}>{research.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    {research.sources.length > 0 && <details className="tw:mt-4 tw:text-xs"><summary className="tw:cursor-pointer tw:font-medium">{c.sources} ({research.sources.length})</summary><ul className="tw:mb-0 tw:list-none tw:space-y-4 tw:pl-0">{research.sources.map((source, index) => <li key={index} className="tw:break-words tw:leading-5">{sourceLink(source.url) ? <a className="tw:text-[color:var(--settings-accent)] tw:underline" href={sourceLink(source.url)!} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}<p className={`${muted} tw:mb-1 tw:mt-1`}>{c.consulted}: {source.retrievedAt}</p>{source.claims.map((claim, index) => <p className={`${muted} tw:my-1`} key={index}>{claim}</p>)}</li>)}</ul></details>}
  </section>
}
