import { useMemo, useState, type KeyboardEvent } from 'react'
import type { Fixture } from '@t3-designer/scene-schema'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { assetLabel, roomLabel } from '../i18n/workspace-labels'
import { EditorScene } from '../editor/EditorScene'
import { moveDemoFixture, movableDemoFixture } from '../lib/demo-layout'
import type { DemoLayout } from '../lib/useDemoLayout'
import { publicScene } from '../lib/public-scene'
import { demoLayoutCopy } from './demo-layout-copy'
import { backendEnabled } from '../lib/build-mode'

const button = 'tw:cursor-pointer tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:font-medium tw:text-[color:var(--settings-text)] tw:hover:bg-[var(--settings-accent-soft)] tw:disabled:cursor-not-allowed tw:disabled:opacity-40'
const input = 'tw:box-border tw:w-full tw:min-w-0 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-sm tw:text-[color:var(--settings-text)] tw:disabled:opacity-50'

function NumberField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="tw:grid tw:gap-1.5 tw:text-xs">{label}<input key={value} className={input} type="number" step={.1} defaultValue={Number(value.toFixed(3))} disabled={disabled}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={event => {
      const next = event.currentTarget.valueAsNumber
      if (Number.isFinite(next) && Math.abs(next - value) > .00001) onChange(next)
      event.currentTarget.value = String(Number(value.toFixed(3)))
    }} /></label>
}

export function PublicArrangement({ layout, onClose }: { layout: DemoLayout; onClose: () => void }) {
  const { t } = useTranslation('workspace')
  const { locale } = useLocale(), c = demoLayoutCopy[locale]
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'3d' | 'top'>('top')
  const [error, setError] = useState(false)
  const scene = useMemo(() => publicScene(layout.fixtures), [layout.fixtures])
  const selected = layout.fixtures.find(fixture => fixture.id === selectedId)
  const movable = selected ? movableDemoFixture(selected) : false
  function move(id: string, patch: { position?: Fixture['position']; rotation?: number }) {
    try { layout.change(moveDemoFixture(layout.fixtures, id, patch)); setError(false) }
    catch { setError(true) }
  }
  function position(axis: 0 | 2, value: number) {
    if (!selected || !movable) return
    const next: Fixture['position'] = [...selected.position]; next[axis] = value
    move(selected.id, { position: next })
  }
  function rotate() { if (selected && movable) move(selected.id, { rotation: selected.rotation + Math.PI / 2 }) }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); setError(false); if (event.shiftKey) layout.redo(); else layout.undo(); return
    }
    if (target.closest('button, a') || !selected || !movable || event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); return }
    const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 0 : event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 2 : null
    if (axis !== null) {
      event.preventDefault()
      position(axis, Number((selected.position[axis] + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? .5 : .1)).toFixed(4)))
    }
  }
  return <section className="tw:mx-auto tw:my-5 tw:w-[calc(100%-40px)] tw:overflow-hidden tw:rounded-2xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:text-[color:var(--settings-text)]" aria-label={c.title} onKeyDown={keyDown}>
    <header className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4 tw:p-5">
      <div><button className={button} onClick={onClose}>← {c.back}</button><h2 className="tw:mb-2 tw:text-xl tw:font-medium">{c.title}</h2><p className="tw:mb-0 tw:max-w-xl tw:text-sm tw:leading-6 tw:text-[color:var(--settings-muted)]">{c.intro}</p></div>
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        <button className={button} disabled={!layout.canUndo} onClick={() => { setError(false); layout.undo() }}>↶ {c.undo}</button>
        <button className={button} disabled={!layout.canRedo} onClick={() => { setError(false); layout.redo() }}>↷ {c.redo}</button>
        <button className={button} onClick={() => { setError(false); layout.reset() }}>↺ {c.reset}</button>
      </div>
    </header>
    <p role="status" className={`tw:m-0 tw:border-y tw:border-solid tw:border-[var(--settings-border)] tw:px-5 tw:py-3 tw:text-xs ${layout.status === 'unavailable' || layout.status === 'recovered' ? 'tw:bg-amber-50 tw:text-amber-900' : 'tw:bg-[var(--settings-accent-soft)] tw:text-[color:var(--settings-accent)]'}`}>{c[layout.status]}</p>
    <div className="tw:grid tw:lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="tw:min-w-0">
        <div className="tw:flex tw:items-center tw:gap-2 tw:p-3"><button className={button} aria-pressed={mode === 'top'} onClick={() => setMode('top')}>{c.top}</button><button className={button} aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>{c.three}</button><span className="tw:ml-2 tw:text-xs tw:text-[color:var(--settings-muted)]">{c.hint}</span></div>
        <div className="tw:h-[min(66vh,720px)] tw:min-h-[420px]" tabIndex={0} aria-label={c.controls}>
          <EditorScene scene={scene} selectedId={selectedId} onSelect={setSelectedId} onMove={(id, position) => move(id, { position })} mode={mode} editable snap={.1} projectId={scene.project.id} lighting="studio" />
        </div>
        <p className="tw:mx-5 tw:text-xs tw:leading-5 tw:text-[color:var(--settings-muted)]">{c.controls}</p>
      </div>
      <aside className="tw:grid tw:content-start tw:gap-5 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-5 tw:lg:border-l tw:lg:border-t-0">
        <label className="tw:grid tw:gap-2 tw:text-sm tw:font-medium">{c.objects}<select className={input} value={selectedId ?? ''} onChange={event => { setSelectedId(event.target.value || null); setError(false) }}>
          <option value="">{c.choose}</option>
          {[true, false].map(mobile => <optgroup key={String(mobile)} label={mobile ? c.movable : c.fixed}>{layout.fixtures.filter(item => movableDemoFixture(item) === mobile).map(item => <option key={item.id} value={item.id}>{assetLabel(t, item.assetId)} · {roomLabel(t, item.roomId)}</option>)}</optgroup>)}
        </select></label>
        {selected ? <div className="tw:grid tw:gap-4">
          <div><strong className="tw:text-sm">{assetLabel(t, selected.assetId)}</strong><span className="tw:ml-2 tw:rounded tw:bg-[var(--settings-bg)] tw:px-2 tw:py-1 tw:text-xs">{movable ? c.movable : c.fixed}</span><p className="tw:mb-0 tw:text-xs tw:leading-5 tw:text-[color:var(--settings-muted)]">{movable ? c.moveHelp : c.fixedHelp}</p></div>
          <p className="tw:m-0 tw:text-xs">{c.room}: {roomLabel(t, selected.roomId)}</p>
          <div className="tw:grid tw:grid-cols-2 tw:gap-3"><NumberField label={c.x} value={selected.position[0]} disabled={!movable} onChange={value => position(0, value)} /><NumberField label={c.z} value={selected.position[2]} disabled={!movable} onChange={value => position(2, value)} /></div>
          <NumberField label={c.rotation} value={selected.rotation * 180 / Math.PI} disabled={!movable} onChange={value => move(selected.id, { rotation: value * Math.PI / 180 })} />
          <button className={button} disabled={!movable} onClick={rotate}>{c.rotate}</button>
        </div> : <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-[color:var(--settings-muted)]">{c.selectHelp}</p>}
        {error && <p role="alert" className="tw:m-0 tw:text-sm tw:text-red-700">{c.error}</p>}
        <div className="tw:grid tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-5">{backendEnabled && <><h3 className="tw:m-0 tw:text-sm">{c.accountTitle}</h3><p className="tw:m-0 tw:text-xs tw:leading-5 tw:text-[color:var(--settings-muted)]">{c.accountHelp}</p><a className={`${button} tw:text-center tw:no-underline`} href="/app">{c.signIn} ↗</a></>}<a className="tw:text-xs tw:text-[color:var(--settings-accent)]" href="/#assets">{c.history} →</a></div>
      </aside>
    </div>
  </section>
}
