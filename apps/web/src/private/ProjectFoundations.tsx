import { useEffect, useMemo, useRef, useState } from 'react'
import { getPropertySourcePortals, type ProjectFoundations as Foundations } from '@t3-designer/scene-schema'
import { useUnits } from '../lib/useUnits'
import { request } from './api'
import { getFoundationsCopy } from './foundations-copy'
import { button, Field, Feedback, input, muted, panel } from './ui'

type Level = Foundations['dwelling']['levels'][number]
const fieldInput = `${input} tw:box-border tw:min-w-0`
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image read failed'))
    reader.onerror = () => reject(new Error('Image read failed'))
    reader.readAsDataURL(file)
  })
}

function FloorNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const expected = useRef(value)
  useEffect(() => {
    if (!Object.is(value, expected.current)) setDraft(Number.isFinite(value) ? String(value) : '')
    expected.current = value
  }, [value])
  return <input className={fieldInput} type="text" inputMode="numeric" pattern="-?[0-9]+" value={draft} onChange={event => {
    const raw = event.target.value
    setDraft(raw)
    expected.current = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN
    onChange(expected.current)
  }} />
}

/** Intake stays separate from a modeled scene. It never marks a model complete. */
export function ProjectFoundations({ projectId, value, language, readOnly, onChange, onBusyChange, showProgress = true }: {
  projectId: string; value: Foundations; language: string; readOnly: boolean;
  onChange: (value: Foundations) => void; onBusyChange: (busy: boolean) => void; showProgress?: boolean;
}) {
  const c = getFoundationsCopy(language)
  const units = useUnits()
  const locale = language.startsWith('es') ? 'es' : language.startsWith('fr') ? 'fr' : 'en'
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const operation = useRef<AbortController | null>(null)
  const callbacks = useRef({ onChange, onBusyChange })
  useEffect(() => { callbacks.current = { onChange, onBusyChange } }, [onChange, onBusyChange])
  useEffect(() => () => { operation.current?.abort() }, [])
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: 'region' })
    return countryCodes.map(code => ({ code, label: names.of(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label, language))
  }, [language])
  const disabled = readOnly || uploading !== null
  const portals = getPropertySourcePortals(value.building.countryCode)
  function changeLevel(id: string, changes: Partial<Level>) {
    onChange({ ...value, dwelling: { ...value.dwelling, levels: value.dwelling.levels.map(level => level.id === id ? { ...level, ...changes } : level) } })
  }
  function changeBuilding(changes: Partial<Foundations['building']>) { onChange({ ...value, building: { ...value.building, ...changes } }) }
  function addLevel() {
    const occupied = new Set(value.dwelling.levels.map(level => level.levelIndex).filter(Number.isInteger))
    const highest = Math.max(0, ...occupied)
    const index = highest < 200 ? highest + 1 : Array.from({ length: 201 }, (_, number) => number).find(number => !occupied.has(number))! 
    onChange({ ...value, dwelling: { ...value.dwelling, levels: [...value.dwelling.levels, { id: crypto.randomUUID(), name: c.levelDefault.replace('{number}', String(index)), levelIndex: index, elevation: null, ceilingHeight: null, width: null, depth: null, notes: '', planReferences: [] }] } })
  }
  async function upload(levelId: string, files: File[], element: HTMLInputElement) {
    if (!files.length || disabled || operation.current) return
    const level = value.dwelling.levels.find(item => item.id === levelId)
    if (!level) return
    if (level.planReferences.length + files.length > 4) { setError(c.tooMany); element.value = ''; return }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) { setError(c.uploadInvalid); element.value = ''; return }
    const controller = new AbortController()
    operation.current = controller; setUploading(levelId); onBusyChange(true); setError('')
    let next = value
    try {
      for (const file of files) {
        const dataUrl = await readImage(file)
        if (controller.signal.aborted) return
        const { reference } = await request<{ reference: { id: string; name: string } }>(`/api/projects/${projectId}/references`, { method: 'POST', body: JSON.stringify({ name: file.name, dataUrl }), signal: controller.signal })
        if (controller.signal.aborted) return
        next = { ...next, dwelling: { ...next.dwelling, levels: next.dwelling.levels.map(item => item.id === levelId ? { ...item, planReferences: [...item.planReferences, { id: reference.id, name: reference.name }] } : item) } }
        callbacks.current.onChange(next)
      }
    } catch { if (!controller.signal.aborted) setError(c.uploadFailed) }
    finally { if (!controller.signal.aborted) { operation.current = null; setUploading(null); callbacks.current.onBusyChange(false); element.value = '' } }
  }
  function measure(level: Level, name: 'elevation' | 'ceilingHeight' | 'width' | 'depth', label: string, min: number) {
    const amount = level[name]
    return <Field label={`${label} (${units.lengthUnit})`}><input className={fieldInput} type="number" step="any" min={units.toDisplayLength(min)} max={units.toDisplayLength(name === 'elevation' ? 1000 : 500)} value={amount === null ? '' : Number(units.toDisplayLength(amount).toFixed(5))} onChange={event => changeLevel(level.id, { [name]: event.target.value === '' ? null : units.toMeters(event.target.valueAsNumber) })} /></Field>
  }
  const plansCount = value.dwelling.levels.filter(level => level.planReferences.length > 0).length
  return <section aria-label={c.title} className="tw:flex tw:min-w-0 tw:flex-col tw:gap-6">
    <div><p className={`${muted} tw:mb-2 tw:mt-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest`}>{showProgress ? c.setup : c.ready}</p><h2 className="tw:m-0 tw:text-2xl tw:font-medium tw:tracking-tight">{showProgress ? c.title : c.reviewTitle}</h2><p className={`${muted} tw:mb-0 tw:max-w-3xl tw:text-sm tw:leading-6`}>{showProgress ? c.intro : c.reviewIntro}</p></div>
    <Feedback message={error} error />
    <div className="tw:grid tw:min-w-0 tw:items-start tw:gap-6 tw:xl:grid-cols-2">
      <section className={`${panel} tw:min-w-0 tw:overflow-hidden`} aria-labelledby="foundation-dwelling">
        <header className="tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:p-5"><div className="tw:flex tw:items-center tw:gap-3"><span className="tw:flex tw:h-8 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-[var(--settings-accent-soft)] tw:text-sm tw:font-semibold tw:text-[color:var(--settings-accent)]" aria-hidden="true">1</span><h3 id="foundation-dwelling" className="tw:m-0 tw:text-lg tw:font-medium">{c.dwelling}</h3></div><p className={`${muted} tw:mb-0 tw:text-sm tw:leading-6`}>{c.dwellingIntro}</p></header>
        <fieldset disabled={disabled} className="tw:m-0 tw:flex tw:min-w-0 tw:flex-col tw:gap-5 tw:border-0 tw:p-5">
          <Field label={c.kind}><select aria-label={c.kind} className={fieldInput} value={value.dwelling.kind} onChange={event => onChange({ ...value, dwelling: { ...value.dwelling, kind: event.target.value as 'apartment' | 'house' } })}><option value="apartment">{c.apartment}</option><option value="house">{c.house}</option></select></Field>
          {value.dwelling.levels.map((level, index) => <fieldset key={level.id} data-testid="foundation-level" aria-label={`${c.level} ${index + 1}`} className="tw:m-0 tw:min-w-0 tw:rounded-xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4">
            <legend className="tw:px-2 tw:text-sm tw:font-medium">{level.name || `${c.level} ${index + 1}`}</legend>
            <div className="tw:flex tw:flex-col tw:gap-4"><div className="tw:grid tw:gap-4 tw:sm:grid-cols-[minmax(0,1fr)_130px]"><Field label={c.levelName}><input className={fieldInput} value={level.name} maxLength={120} onChange={event => changeLevel(level.id, { name: event.target.value })} /></Field><Field label={c.levelNumber}><FloorNumber value={level.levelIndex} onChange={levelIndex => changeLevel(level.id, { levelIndex })} /></Field></div><p className={`${muted} tw:m-0 tw:text-xs tw:leading-5`}>{c.levelNumberHelp}</p>
              <section aria-label={`${c.plans}: ${level.name}`} className="tw:rounded-lg tw:border tw:border-dashed tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:p-3"><h4 className="tw:mb-2 tw:mt-0 tw:text-sm tw:font-medium">{c.plans}</h4>
                {level.planReferences.length === 0 && <p className={`${muted} tw:text-xs tw:leading-5`}>{c.noPlans}</p>}
                {level.planReferences.length > 0 && <ul className="tw:m-0 tw:grid tw:list-none tw:gap-3 tw:p-0 tw:sm:grid-cols-2">{level.planReferences.map(reference => <li key={reference.id} className="tw:min-w-0"><a href={`/api/projects/${projectId}/references/${reference.id}/image`} target="_blank" rel="noreferrer" className="tw:block tw:text-[color:var(--settings-accent)] tw:no-underline"><img src={`/api/projects/${projectId}/references/${reference.id}/image`} alt={reference.name} className="tw:h-28 tw:w-full tw:rounded-md tw:bg-[var(--settings-surface)] tw:object-contain" /><span className="tw:mt-1 tw:block tw:break-all tw:text-xs tw:underline">{c.viewPlan}: {reference.name}</span></a><p className={`${muted} tw:my-1 tw:text-[11px] tw:leading-5`}>{c.sourceUser}</p>{!readOnly && <button type="button" className={`${button} tw:min-h-8! tw:px-2! tw:py-1! tw:text-xs!`} aria-label={`${c.removePlan}: ${reference.name}`} onClick={() => changeLevel(level.id, { planReferences: level.planReferences.filter(item => item.id !== reference.id) })}>{c.removePlan}</button>}</li>)}</ul>}
                {!readOnly && <div className="tw:mt-3"><Field label={c.upload} help={c.uploadHelp}><input type="file" accept="image/png,image/jpeg,image/webp" multiple className="tw:block tw:w-full tw:min-w-0 tw:text-xs tw:file:mr-2 tw:file:rounded-md tw:file:border tw:file:border-solid tw:file:border-[var(--settings-border)] tw:file:bg-[var(--settings-surface)] tw:file:p-2 tw:file:text-[color:var(--settings-text)]" disabled={disabled || level.planReferences.length >= 4} onChange={event => { void upload(level.id, Array.from(event.target.files ?? []), event.currentTarget) }} /></Field></div>}
                {uploading === level.id && <p role="status" className={`${muted} tw:text-xs`}>{c.uploading}</p>}
              </section>
              <details><summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.measurements}</summary><div className="tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4">{measure(level, 'elevation', c.elevation, -100)}{measure(level, 'ceilingHeight', c.ceilingHeight, .1)}{measure(level, 'width', c.width, .1)}{measure(level, 'depth', c.depth, .1)}</div><p className={`${muted} tw:mb-0 tw:text-xs tw:leading-5`}>{c.elevationHelp}</p></details>
              <Field label={c.levelNotes}><textarea className={`${fieldInput} tw:min-h-24 tw:resize-y tw:font-[inherit]`} value={level.notes} maxLength={4000} placeholder={c.levelNotesPlaceholder} onChange={event => changeLevel(level.id, { notes: event.target.value })} /></Field>
              {!readOnly && value.dwelling.levels.length > 1 && <button className={`${button} tw:self-start`} type="button" aria-label={`${c.removeLevel}: ${level.name}`} onClick={() => onChange({ ...value, dwelling: { ...value.dwelling, levels: value.dwelling.levels.filter(item => item.id !== level.id) } })}>{c.removeLevel}</button>}
            </div>
          </fieldset>)}
          {!readOnly && <button className={`${button} tw:self-start`} type="button" disabled={disabled || value.dwelling.levels.length >= 30} onClick={addLevel}>+ {c.addLevel}</button>}
          {!!plansCount && <p className={`${muted} tw:m-0 tw:text-xs tw:leading-5`}>{c.savePlans}</p>}
        </fieldset>
      </section>
      <section className={`${panel} tw:min-w-0 tw:overflow-hidden`} aria-labelledby="foundation-building">
        <header className="tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:p-5"><div className="tw:flex tw:items-center tw:gap-3"><span className="tw:flex tw:h-8 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-[var(--settings-accent-soft)] tw:text-sm tw:font-semibold tw:text-[color:var(--settings-accent)]" aria-hidden="true">2</span><h3 id="foundation-building" className="tw:m-0 tw:text-lg tw:font-medium">{c.building}</h3></div><p className={`${muted} tw:mb-0 tw:text-sm tw:leading-6`}>{c.buildingIntro}</p></header>
        <fieldset disabled={disabled} className="tw:m-0 tw:flex tw:min-w-0 tw:flex-col tw:gap-5 tw:border-0 tw:p-5">
          <Field label={c.country}><select aria-label={c.country} className={fieldInput} value={value.building.countryCode} onChange={event => changeBuilding({ countryCode: event.target.value })}><option value="">{c.chooseCountry}</option>{countries.map(country => <option value={country.code} key={country.code}>{country.label} ({country.code})</option>)}</select></Field>
          <Field label={c.region} help={c.regionHelp}><input className={fieldInput} value={value.building.region} maxLength={250} onChange={event => changeBuilding({ region: event.target.value })} /></Field>
          <Field label={c.address}><input className={fieldInput} autoComplete="street-address" value={value.building.address} maxLength={500} placeholder={c.addressPlaceholder} onChange={event => changeBuilding({ address: event.target.value })} /></Field>
          {value.building.countryCode === 'AR' && <Field label={c.cadastralReference} help={c.cadastralReferenceHelp}><input className={fieldInput} value={value.building.cadastralReference ?? ''} maxLength={250} onChange={event => changeBuilding({ cadastralReference: event.target.value })} /></Field>}
          {value.building.countryCode && <section className="tw:rounded-lg tw:bg-[var(--settings-surface)] tw:p-4" aria-label={c.portals}><h4 className="tw:mt-0 tw:text-sm tw:font-medium">{c.portals}</h4><p className={`${muted} tw:text-xs tw:leading-5`}>{c.portalsHelp}</p>{portals.length ? <ul className="tw:mb-0 tw:list-none tw:space-y-4 tw:pl-0">{portals.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="tw:text-sm tw:font-medium tw:text-[color:var(--settings-accent)] tw:underline tw:underline-offset-4">{source.label} ↗</a><p className={`${muted} tw:mb-0 tw:mt-1 tw:text-xs tw:leading-5`}>{source.jurisdiction[locale]} · {source.description[locale]}</p></li>)}</ul> : <p className={`${muted} tw:mb-0 tw:text-xs tw:leading-5`}>{c.noPortals}</p>}</section>}
          <Field label={c.buildingNotes}><textarea className={`${fieldInput} tw:min-h-28 tw:resize-y tw:font-[inherit]`} value={value.building.notes} maxLength={4000} placeholder={c.buildingNotesPlaceholder} onChange={event => changeBuilding({ notes: event.target.value })} /></Field>
          <section aria-label={c.sources}><h4 className="tw:mb-2 tw:mt-0 tw:text-sm tw:font-medium">{c.sources}</h4><p className={`${muted} tw:text-xs tw:leading-5`}>{c.sourcesIntro}</p>{value.building.sources.length === 0 && <p className={`${muted} tw:text-xs`}>{c.noSources}</p>}
            <div className="tw:flex tw:flex-col tw:gap-4">{value.building.sources.map((source, index) => {
              const update = (changes: Partial<typeof source>) => changeBuilding({ sources: value.building.sources.map(item => item.id === source.id ? { ...item, ...changes } : item) })
              return <fieldset key={source.id} aria-label={`${c.sources} ${index + 1}`} className="tw:m-0 tw:flex tw:min-w-0 tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-4"><Field label={c.sourceTitle}><input className={fieldInput} value={source.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></Field><Field label={c.sourceUrl}><input className={fieldInput} type="url" value={source.url} maxLength={2000} placeholder="https://" onChange={event => update({ url: event.target.value })} /></Field><Field label={c.sourceKind}><select aria-label={c.sourceKind} className={fieldInput} value={source.kind} onChange={event => update({ kind: event.target.value as 'official' | 'user' })}><option value="official">{c.official}</option><option value="user">{c.user}</option></select></Field><Field label={c.retrievedAt}><input className={fieldInput} type="date" value={source.retrievedAt ?? ''} onChange={event => update({ retrievedAt: event.target.value || undefined })} /></Field>{!readOnly && <button type="button" className={`${button} tw:self-start`} onClick={() => changeBuilding({ sources: value.building.sources.filter(item => item.id !== source.id) })}>{c.removeSource}</button>}</fieldset>
            })}</div>
            {!readOnly && <button type="button" className={`${button} tw:mt-4`} disabled={disabled || value.building.sources.length >= 20} onClick={() => changeBuilding({ sources: [...value.building.sources, { id: crypto.randomUUID(), title: '', url: '', kind: 'user' }] })}>+ {c.addSource}</button>}
          </section>
        </fieldset>
      </section>
    </div>
    {showProgress && <section className={`${panel} tw:p-5`} aria-label={c.next}><p className={`${muted} tw:mb-2 tw:mt-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest`}>{c.next}</p><h3 className="tw:m-0 tw:text-lg tw:font-medium">{c.pendingTitle}</h3><ul className="tw:my-4 tw:flex tw:list-none tw:flex-wrap tw:gap-2 tw:p-0">{[c.plansCount.replace('{count}', String(plansCount)).replace('{total}', String(value.dwelling.levels.length)), value.building.address.trim() && value.building.countryCode ? c.addressPresent : c.addressMissing, c.modelPending].map(text => <li key={text} className="tw:rounded-lg tw:bg-[var(--settings-surface)] tw:px-3 tw:py-2 tw:text-xs tw:leading-5">{text}</li>)}</ul><p className={`${muted} tw:mb-2 tw:text-sm tw:leading-6`}>{c.pending}</p><p className={`${muted} tw:mb-0 tw:text-sm tw:leading-6`}>{c.future}</p></section>}
  </section>
}
