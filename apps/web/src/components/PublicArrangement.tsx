import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { assetLabel, roomLabel } from '../i18n/workspace-labels'
import { movableDemoFixture, toggleDemoFixture } from '../lib/demo-layout'
import type { DemoLayout } from '../lib/useDemoLayout'
import { demoFixtureCatalog } from '../data/demo-catalog'
import { demoLayoutCopy } from './demo-layout-copy'
import { backendEnabled } from '../lib/build-mode'
import { ViewerIcon, ViewerPanel } from './ViewerPanel'

export function PublicArrangement({ layout, onClose, selectedId, onSelect, error, onClearError }: {
  layout: DemoLayout
  onClose: () => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  error: boolean
  onClearError: () => void
}) {
  const { t } = useTranslation('workspace')
  const { locale } = useLocale(), c = demoLayoutCopy[locale]
  const warning = layout.status === 'unavailable' || layout.status === 'recovered'
  const selected = layout.fixtures.find(fixture => fixture.id === selectedId)

  function setPresent(id: string, present: boolean) {
    onClearError()
    layout.change(toggleDemoFixture(layout.fixtures, id, present))
    if (present) onSelect(id)
    else if (selectedId === id) onSelect(null)
  }

  return <ViewerPanel id="apartment-controls" title={c.title} hideTitle onClose={onClose} className="apartment-furniture-panel" headerActions={<>
    <button type="button" className="viewer-panel-action" aria-label={c.undo} title={c.undo} disabled={!layout.canUndo} onClick={() => { onClearError(); layout.undo() }}><ViewerIcon kind="undo" /></button>
    <button type="button" className="viewer-panel-action" aria-label={c.redo} title={c.redo} disabled={!layout.canRedo} onClick={() => { onClearError(); layout.redo() }}><ViewerIcon kind="redo" /></button>
    <button type="button" className="viewer-panel-action" aria-label={c.reset} title={c.reset} onClick={() => { onClearError(); layout.reset() }}><ViewerIcon kind="reset" /></button>
  </>}>
    <p className="arrangement-intro">{c.intro}</p>
    {warning && <p role="status" className="arrangement-status is-warning">{c[layout.status]}</p>}
    <div className="arrangement-controls">
      <p className="arrangement-help">{selected && !movableDemoFixture(selected) ? c.fixedHelp : c.moveHelp}</p>
      {error && <p role="alert" className="tw:m-0 tw:text-sm tw:text-red-700">{c.error}</p>}
      {(['generated', 'apartment'] as const).map(source => <details className="arrangement-catalog-section" key={source} data-catalog-source={source} aria-label={source === 'generated' ? c.generated : c.objects} open>
        <summary><span>{source === 'generated' ? c.generated : c.objects}</span><span className="arrangement-catalog-count">{demoFixtureCatalog.filter(item => item.source === source).length}</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
        <ul className="arrangement-catalog">
          {demoFixtureCatalog.filter(item => item.source === source).map(({ fixture, asset, previewUrl }) => {
            const current = layout.fixtures.find(item => item.id === fixture.id)
            const present = !!current
            const label = source === 'generated' ? asset.label : assetLabel(t, fixture.assetId)
            const room = roomLabel(t, current?.roomId ?? fixture.roomId)
            const description = `${label} · ${room}`
            return <li key={fixture.id} data-fixture-id={fixture.id} className={`arrangement-catalog-card${selectedId === fixture.id && present ? ' is-selected' : ''}${present ? ' is-present' : ' is-absent'}`}>
              <button type="button" className="arrangement-catalog-select" aria-label={`${present ? c.select : c.addAndSelect}: ${description}`} aria-pressed={selectedId === fixture.id && present} onClick={() => setPresent(fixture.id, true)}>
                <span className="arrangement-catalog-preview"><img src={previewUrl} alt="" loading="lazy" decoding="async" width="160" height="104" />{source === 'generated' && <span className="arrangement-catalog-draft">{c.draft}</span>}</span>
                <span className="arrangement-catalog-name">{label}</span>
                <span className="arrangement-catalog-room">{room}{!movableDemoFixture(fixture) && <span> · {c.fixed}</span>}</span>
              </button>
              <label className="arrangement-catalog-presence"><input type="checkbox" checked={present} aria-label={`${c.inScene}: ${description}`} onChange={event => setPresent(fixture.id, event.target.checked)} /><span>{c.inScene}</span></label>
            </li>
          })}
        </ul>
      </details>)}
      <div className="arrangement-links">{backendEnabled && <a href="/app" title={c.accountHelp}>{c.signIn} ↗</a>}<a href="/#assets">{c.history} →</a></div>
    </div>
  </ViewerPanel>
}
