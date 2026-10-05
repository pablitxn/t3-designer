import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { getAssetMobility, isFixtureMovable, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { polygonCentroid } from '@t3-designer/geometry'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import { LengthInput } from '../components/LengthInput'
import { EditorScene } from './EditorScene'
import { editorCopy } from './copy'
import { walkCopy } from '../walkthrough/copy'
import { CustomizationPanel } from './CustomizationPanel'
import { FullWallsControl, SolarDesignControls } from './SolarDesignControls'
import { addFixture, addPartition, duplicateArchitecture, duplicateFixture, duplicateLayout, ensureEditor, getActiveArchitecture, getActiveLayout, removeFixture, removePartition, rotateFixture, selectArchitecture, selectLayout, updateFixture } from './model'

const button = 'tw:cursor-pointer tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:font-medium tw:text-[color:var(--settings-text)] tw:transition-colors tw:hover:bg-[var(--settings-accent-soft)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:disabled:cursor-not-allowed tw:disabled:opacity-40'
const input = 'tw:box-border tw:w-full tw:min-w-0 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:text-[color:var(--settings-text)] tw:disabled:opacity-50'
const label = 'tw:grid tw:gap-1.5 tw:text-xs tw:font-medium'
const muted = 'tw:text-[color:var(--settings-muted)] tw:text-xs tw:leading-5'
const heading = 'tw:m-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide'
type History = { past: ProjectSnapshot[]; future: ProjectSnapshot[] }
const Walkthrough = lazy(() => import('../walkthrough/Walkthrough').then(module => ({ default: module.Walkthrough })))

function NumberField({ name, value, disabled, onChange, minimum = -1000, maximum = 1000, step = .05, length = false }: { name: string; value: number; disabled: boolean; onChange: (value: number) => void; minimum?: number; maximum?: number; step?: number; length?: boolean }) {
  const units = useUnits()
  const displayed = length ? units.toDisplayLength(value) : value
  const rounded = Number(displayed.toFixed(3))
  return <label className={label}>{length ? name.replace('(m)', `(${units.lengthUnit})`) : name}<input key={`${value}-${length ? units.system : 'number'}`} className={input} type="number" min={length ? units.toDisplayLength(minimum) : minimum} max={length ? units.toDisplayLength(maximum) : maximum} step={length ? 'any' : step} defaultValue={rounded} disabled={disabled}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={event => {
      const raw = event.currentTarget.valueAsNumber
      const next = length ? units.toMeters(raw) : raw
      if (raw !== rounded && Number.isFinite(next) && next >= minimum && next <= maximum && Math.abs(next - value) > .0001) onChange(next)
      event.currentTarget.value = String(rounded)
    }} /></label>
}

/** Controlled scene editor: the project owner supplies persistence and revision
 * checks. No private scene content is copied to localStorage or analytics. */
export function ApartmentEditor({ snapshot, onChange, readOnly }: { snapshot: ProjectSnapshot; onChange: (snapshot: ProjectSnapshot) => void; readOnly: boolean }) {
  const { locale } = useLocale(), c = editorCopy[locale]
  const units = useUnits()
  const [walking, setWalking] = useState(() => window.location.hash === '#walkthrough')
  useEffect(() => {
    const navigate = () => setWalking(window.location.hash === '#walkthrough')
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'3d' | 'top'>('3d')
  const [snap, setSnap] = useState(.1)
  const [fullWalls, setFullWalls] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [assetId, setAssetId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState<History>({ past: [], future: [] })
  const [viewSelection, setViewSelection] = useState<{ architectureId: string; layoutId?: string } | null>(null)
  const expected = useRef(snapshot)
  useEffect(() => {
    // Server reloads/imports establish a new undo boundary; our own controlled
    // edits retain their history. Saving never replays a stale local timeline.
    if (expected.current !== snapshot) { setHistory({ past: [], future: [] }); setViewSelection(null) }
    expected.current = snapshot
  }, [snapshot])
  const scene = useMemo(() => {
    const current = ensureEditor(snapshot)
    if (!readOnly || !viewSelection) return current
    try {
      const variant = selectArchitecture(current, viewSelection.architectureId)
      return viewSelection.layoutId ? selectLayout(variant, viewSelection.layoutId) : variant
    } catch { return current }
  }, [snapshot, readOnly, viewSelection])
  const architecture = getActiveArchitecture(scene), layout = getActiveLayout(scene)
  const selected = scene.fixtures.find(fixture => fixture.id === selectedId)
  const selectedAsset = scene.assets.find(asset => asset.id === selected?.assetId)
  const selectedMovable = selected ? isFixtureMovable(selected, selectedAsset) : false
  const placementAssets = scene.assets.filter(asset => getAssetMobility(asset) === 'movable')
  const placementAsset = placementAssets.find(asset => asset.id === assetId) ?? placementAssets[0]
  const placementRoom = scene.apartment.rooms.find(room => room.id === roomId) ?? scene.apartment.rooms[0]
  const center = polygonCentroid(placementRoom.polygon)

  function apply(change: (current: ProjectSnapshot) => ProjectSnapshot): boolean {
    if (readOnly) return false
    try {
      const next = change(scene)
      if (JSON.stringify(next) === JSON.stringify(snapshot)) return true
      expected.current = next
      setHistory(previous => ({ past: [...previous.past.slice(-49), snapshot], future: [] }))
      setError(''); onChange(next)
      return true
    } catch { setError(c.error); return false }
  }
  function travel(direction: 'past' | 'future') {
    if (readOnly) return
    const source = history[direction], next = source.at(-1)
    if (!next) return
    expected.current = next
    setHistory(direction === 'past'
      ? { past: source.slice(0, -1), future: [...history.future, snapshot] }
      : { past: [...history.past, snapshot], future: source.slice(0, -1) })
    setError(''); onChange(next)
  }
  function switchVariant(id: string) {
    if (readOnly) setViewSelection({ architectureId: id })
    else apply(current => selectArchitecture(current, id))
    setSelectedId(null)
  }
  function switchLayout(id: string) {
    if (readOnly) setViewSelection({ architectureId: architecture.id, layoutId: id })
    else apply(current => selectLayout(current, id))
    setSelectedId(null)
  }
  function copy(kind: 'architecture' | 'layout') {
    if (!copyName.trim()) { setError(c.nameError); return }
    const id = crypto.randomUUID()
    if (apply(current => kind === 'architecture' ? duplicateArchitecture(current, id, copyName.trim()) : duplicateLayout(current, id, copyName.trim()))) { setCopyName(''); setSelectedId(null) }
  }
  function position(axis: number, value: number) {
    if (!selected || !selectedMovable) return
    const next = [...selected.position] as Fixture['position']; next[axis] = value
    apply(current => updateFixture(current, selected.id, { position: next }))
  }
  function duplicateObject() {
    if (!selected || !selectedMovable) return
    const id = crypto.randomUUID()
    if (apply(current => duplicateFixture(current, selected.id, id))) setSelectedId(id)
  }
  function removeObject() { if (selected && selectedMovable && apply(current => removeFixture(current, selected.id))) setSelectedId(null) }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (readOnly || target.closest('input, textarea, select, [contenteditable="true"]')) return
    const command = event.ctrlKey || event.metaKey
    if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 'future' : 'past'); return }
    if (target.closest('button')) return
    if (!selected || !selectedMovable || command || event.altKey) return
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); apply(current => rotateFixture(current, selected.id, Math.PI / 2)); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeObject(); return }
    const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 0 : event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 2 : null
    if (axis !== null) { event.preventDefault(); position(axis, selected.position[axis] + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) * (snap || .05) * (event.shiftKey ? 10 : 1)) }
  }
  function partition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget), number = (key: string) => units.toMeters(Number(data.get(key)))
    apply(current => addPartition(current, { id: `partition-${crypto.randomUUID()}`, from: [number('fromX'), number('fromZ')], to: [number('toX'), number('toZ')], height: number('height'), thickness: number('thickness') }))
  }
  if (walking) return <Suspense fallback={<p role="status">{walkCopy[locale].loading}</p>}><Walkthrough snapshot={scene} onClose={() => { window.location.hash = 'editor'; setWalking(false) }} /></Suspense>
  return <section className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:text-[color:var(--settings-text)]" aria-label={c.title} onKeyDown={keyDown}>
    <header className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:p-4">
      <div><h2 className="tw:m-0 tw:text-lg tw:font-medium">{c.title}</h2><p className={`${muted} tw:mb-0 tw:mt-1`}>{readOnly ? c.readonly : c.subtitle}</p></div>
      <div className="tw:flex tw:flex-wrap tw:gap-2"><button className={`${button} tw:bg-[var(--settings-accent-soft)]!`} onClick={() => { window.location.hash = 'walkthrough'; setWalking(true) }}>{walkCopy[locale].launch} →</button><button className={button} disabled={readOnly || !history.past.length} onClick={() => travel('past')} title="⌘/Ctrl Z">↶ {c.undo}</button><button className={button} disabled={readOnly || !history.future.length} onClick={() => travel('future')}>↷ {c.redo}</button></div>
    </header>
    <div className="tw:grid tw:gap-4 tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4 tw:md:grid-cols-2">
      <label className={label}>{c.architecture}<select className={input} value={architecture.id} onChange={event => switchVariant(event.target.value)}>{scene.editor.architectures.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={label}>{c.layouts}<select className={input} value={layout.id} onChange={event => switchLayout(event.target.value)}>{architecture.layouts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.fixtures.length}</option>)}</select></label>
      {!readOnly && <><label className={label}>{c.copyName}<input className={input} value={copyName} maxLength={80} onChange={event => setCopyName(event.target.value)} placeholder={c.copyPlaceholder} /></label><div className="tw:flex tw:flex-wrap tw:items-end tw:gap-2"><button className={button} onClick={() => copy('architecture')}>{c.duplicateArchitecture}</button><button className={button} onClick={() => copy('layout')}>{c.duplicateLayout}</button></div></>}
      <p className={`${muted} tw:m-0 tw:md:col-span-2`}>{c.variantHint}</p>
    </div>
    {error && <p role="alert" className="tw:m-0 tw:border-0 tw:border-b tw:border-solid tw:border-amber-300 tw:bg-amber-50 tw:p-3 tw:text-sm tw:text-amber-950">{error}</p>}
    <div className="tw:grid tw:xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="tw:min-w-0">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:p-3"><div className="tw:flex tw:gap-1" role="group" aria-label={c.top}><button className={`${button} ${mode === '3d' ? 'tw:bg-[var(--settings-accent-soft)]!' : ''}`} aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>{c.three}</button><button className={`${button} ${mode === 'top' ? 'tw:bg-[var(--settings-accent-soft)]!' : ''}`} aria-pressed={mode === 'top'} onClick={() => setMode('top')}>{c.top}</button></div><FullWallsControl checked={fullWalls} onChange={setFullWalls} /><label className="tw:flex tw:items-center tw:gap-2 tw:text-xs">{c.snap}<select className={`${input} tw:w-24!`} value={snap} onChange={event => setSnap(Number(event.target.value))}><option value="0">{c.free}</option>{[.05, .1, .25].map(value => <option key={value} value={value}>{units.formatLength(value, 2)}</option>)}</select></label></div>
        <div className="tw:h-[520px] tw:min-w-0 tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2" tabIndex={0} aria-label={c.selected}>
          <EditorScene scene={scene} selectedId={selected?.id ?? null} onSelect={setSelectedId} onMove={(id, next) => { apply(current => updateFixture(current, id, { position: next })) }} mode={mode} cutaway={!fullWalls} editable={!readOnly} snap={snap} projectId={snapshot.project.id} />
        </div>
        <div className="tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:px-4 tw:py-3"><p className={`${muted} tw:m-0`}>{c.camera}</p>{!readOnly && <p className={`${muted} tw:mb-0 tw:mt-1`}>{c.shortcuts}</p>}</div>
      </div>
      <aside className="tw:grid tw:content-start tw:gap-4 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4 tw:xl:border-l tw:xl:border-t-0">
        <label className={label}>{c.objects} ({scene.fixtures.length})<select className={input} value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value || null)}><option value="">—</option>{scene.fixtures.map(fixture => <option key={fixture.id} value={fixture.id}>{fixture.label} · {isFixtureMovable(fixture, scene.assets.find(asset => asset.id === fixture.assetId)) ? c.movable : c.fixed} · {fixture.id.slice(-6)}</option>)}</select></label>
        {selected ? <div className="tw:grid tw:gap-3" aria-label={c.selected}>
          <div><h3 className="tw:m-0 tw:text-sm tw:font-semibold">{selected.label}</h3>{selectedAsset && <p className={`${muted} tw:mb-0 tw:mt-1`}>{units.formatDimensions(selectedAsset.dimensions)}</p>}</div>
          <p className={`${muted} tw:m-0`}>{selectedMovable ? c.movableHint : c.fixedHint}</p>
          <div className="tw:grid tw:grid-cols-2 tw:gap-2">{[c.x, c.y, c.z].map((name, axis) => <NumberField key={`${selected.id}-${axis}`} name={name} length value={selected.position[axis]} disabled={readOnly || !selectedMovable} minimum={axis === 1 ? 0 : undefined} onChange={value => position(axis, value)} />)}<NumberField key={`${selected.id}-rotation`} name={c.rotation} value={selected.rotation * 180 / Math.PI} disabled={readOnly || !selectedMovable} minimum={-360} maximum={360} step={15} onChange={rotation => { apply(current => updateFixture(current, selected.id, { rotation: rotation * Math.PI / 180 })) }} /></div>
          <button className={button} disabled={readOnly || !selectedMovable} onClick={() => { apply(current => rotateFixture(current, selected.id, Math.PI / 2)) }}>{c.rotate}</button><button className={button} disabled={readOnly || !selectedMovable} onClick={duplicateObject}>{c.duplicate}</button><button className={`${button} tw:text-red-700!`} disabled={readOnly || !selectedMovable} onClick={removeObject}>{c.remove}</button>
        </div> : <p className={`${muted} tw:m-0`}>{c.empty}</p>}
        <div className="tw:grid tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-4"><h3 className={heading}>{c.catalog}</h3>{placementAsset ? <>
          <label className={label}>{c.asset}<select className={input} value={placementAsset.id} disabled={readOnly} onChange={event => setAssetId(event.target.value)}>{placementAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select></label>
          <label className={label}>{c.room}<select className={input} value={placementRoom.id} disabled={readOnly} onChange={event => setRoomId(event.target.value)}>{scene.apartment.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <button className={`${button} tw:bg-[var(--settings-accent-soft)]!`} disabled={readOnly} onClick={() => { const id = crypto.randomUUID(); if (apply(current => addFixture(current, placementAsset.id, id, placementRoom.id))) setSelectedId(id) }}>+ {c.add}</button>
        </> : <p className={`${muted} tw:m-0`}>{c.noAssets}</p>}<p className={`${muted} tw:m-0`}>{c.catalogHint}</p></div>
      </aside>
    </div>
    <CustomizationPanel scene={scene} readOnly={readOnly} selectedFixtureId={selected?.id ?? null} onApply={apply} />
    <SolarDesignControls scene={scene} readOnly={readOnly} onApply={apply} />
    <details className="tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:p-4"><summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.partition} <span className={muted}>· {architecture.partitionWallIds.length}</span></summary><p className={muted}>{c.partitionHint}</p>
      <form onSubmit={partition} className="tw:grid tw:grid-cols-2 tw:gap-3 tw:md:grid-cols-3 tw:xl:grid-cols-7">
        {([{ key: 'fromX', title: c.fromX, value: center[0] - .75 }, { key: 'fromZ', title: c.fromZ, value: center[1] }, { key: 'toX', title: c.toX, value: center[0] + .75 }, { key: 'toZ', title: c.toZ, value: center[1] }, { key: 'height', title: c.height, value: Math.min(2.4, scene.geometry.ceiling.elevation) }, { key: 'thickness', title: c.thickness, value: .1 }]).map(field => <label className={label} key={`${placementRoom.id}-${field.key}`}>{field.title.replace('(m)', `(${units.lengthUnit})`)}<LengthInput className={input} name={field.key} defaultMeters={field.value} required minMeters={field.key === 'height' ? .2 : field.key === 'thickness' ? .05 : -1000} maxMeters={field.key === 'height' ? scene.geometry.ceiling.elevation : field.key === 'thickness' ? .5 : 1000} disabled={readOnly} /></label>)}
        <button className={`${button} tw:self-end`} disabled={readOnly}>+ {c.addPartition}</button>
      </form>
      {!!architecture.partitionWallIds.length && <ul className="tw:mb-0 tw:grid tw:list-none tw:gap-2 tw:pl-0" aria-label={c.partitions}>{architecture.partitionWallIds.map((id, index) => <li key={id} className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:text-xs"><span>{c.partition} {index + 1}</span><button className={button} disabled={readOnly} onClick={() => { apply(current => removePartition(current, id)) }}>{c.removePartition} {index + 1}</button></li>)}</ul>}
    </details>
    <footer className="tw:flex tw:flex-wrap tw:justify-between tw:gap-2 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:px-4 tw:py-3"><span className={muted}>{c.approximation}</span><span className={muted}>{readOnly ? c.readonly : c.saveHint}</span></footer>
  </section>
}
