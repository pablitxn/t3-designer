import { lazy, Suspense, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { publicAssetFile, publicAssets } from '../data/public-assets'
import { useLocale } from '../i18n/useLocale'
import { backendEnabled } from '../lib/build-mode'
import './assets.css'

const AssetModelPreview = lazy(() => import('./AssetModelPreview').then(module => ({ default: module.AssetModelPreview })))
type PreviewMode = 'perspective' | 'front' | 'side' | 'model'
const imageFiles = { perspective: 'preview.png', front: 'front.png', side: 'side.png' } as const

/** The public gallery never connects to the private workshop or starts a job. */
export function PublicAssetsExplorer() {
  const { t } = useTranslation('assets')
  const { formatNumber, formatDate } = useLocale()
  const [selectedId, setSelectedId] = useState(publicAssets[0].id)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [mode, setMode] = useState<PreviewMode>('perspective')
  const detail = useRef<HTMLElement>(null)
  const selected = publicAssets.find(asset => asset.id === selectedId) ?? publicAssets[0]
  const revision = selected.revisions.find(item => item.id === versionId) ?? selected.revisions[0]
  const dimensions = (values: number[]) => `${values.map(value => formatNumber(value * 100, 0)).join(' × ')} cm`

  function selectObject(id: typeof selectedId) {
    setSelectedId(id)
    setVersionId(null)
    setMode('perspective')
    requestAnimationFrame(() => {
      detail.current?.focus({ preventScroll: true })
      detail.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    })
  }

  return <div className="asset-workshop public-asset-gallery">
    <header className="workshop-heading">
      <div><span className="eyebrow">{t('publicDemo.eyebrow')}</span><h2>{t('publicDemo.title')}</h2><p>{t('publicDemo.description')}</p></div>
      {backendEnabled && <a className="workshop-primary public-gallery-create" href="/app/assets">{t('publicDemo.create')} <span aria-hidden="true">↗</span></a>}
    </header>
    <section className="workshop-library" aria-label={t('publicDemo.library')}>
      <div className="workshop-library-heading"><h3>{t('publicDemo.library')}</h3><span>{t('library.count', { count: publicAssets.length })}</span></div>
      <div className="workshop-grid public-gallery-grid">
        {publicAssets.map(asset => <button key={asset.id} className="workshop-card" aria-pressed={asset.id === selected.id} aria-label={t('library.select', { label: asset.name })} onClick={() => selectObject(asset.id)}>
          <img src={publicAssetFile(asset.revisions[0], 'preview.png')} alt="" width="512" height="512" />
          <div><span className="workshop-card-title">{asset.name}</span><span className="public-gallery-variant">{t(`publicDemo.items.${asset.id}.variant`)}</span><span className="workshop-card-dimensions">{dimensions(asset.dimensions)}</span><span className="workshop-draft">{t('library.draft')}</span><span className="workshop-card-versions">{t('revision.versions', { count: asset.revisions.length })}</span></div>
        </button>)}
      </div>
    </section>
    <section ref={detail} tabIndex={-1} className="workshop-detail workshop-focus-target" aria-label={t('library.selected')}>
      <div className="workshop-detail-heading">
        <div><span className="eyebrow">{t('publicDemo.badge')} · {t('revision.version', { count: revision.version })}</span><h3>{selected.name}</h3><p className="public-gallery-variant">{t(`publicDemo.items.${selected.id}.variant`)}</p></div>
        <div className="workshop-preview-tabs" aria-label={t('library.preview')}>
          {(['perspective', 'front', 'side', 'model'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'model' ? t('library.model') : t(`publicDemo.${value}`)}</button>)}
        </div>
      </div>
      <div className="workshop-version-navigation">
        <label htmlFor="public-asset-version">{t('revision.history')}</label>
        <select id="public-asset-version" value={revision.id} onChange={event => setVersionId(event.target.value)}>
          {selected.revisions.map(item => <option key={item.id} value={item.id}>{t('revision.version', { count: item.version })} · {formatDate(new Date(item.createdAt), { dateStyle: 'medium', timeZone: 'UTC' })}</option>)}
        </select>
      </div>
      <div className="workshop-detail-body">
        <div className="workshop-preview">
          {mode === 'model' ? <Suspense fallback={<p className="workshop-canvas-message" role="status">{t('library.loading')}</p>}><AssetModelPreview url={publicAssetFile(revision, 'model.glb')} /></Suspense> : <img src={publicAssetFile(revision, imageFiles[mode])} alt={`${selected.name} · ${t('revision.version', { count: revision.version })} · ${t(`publicDemo.${mode}`)}`} width="512" height="512" />}
        </div>
        <div className="workshop-specs">
          <span className="workshop-draft">{t('library.draft')}</span>
          <p className="workshop-draft-help">{t('publicDemo.draftHelp')}</p>
          <dl><div><dt>{t('library.dimensions')}</dt><dd>{dimensions(selected.dimensions)}</dd></div><div><dt>{t('library.measurements')}</dt><dd className="public-gallery-evidence-date">{t('publicDemo.measurements')}</dd></div></dl>
          <p className="workshop-source-description">{t(`publicDemo.items.${selected.id}.description`)}</p>
          <a className="workshop-source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">{t('library.source')} ↗</a>
          <details className="workshop-review-notes"><summary>{t('library.evidence')}</summary><p>{t(`publicDemo.items.${selected.id}.evidence`)}</p></details>
          {revision.needsCorrection && <div className="workshop-visual-review"><span className="workshop-draft">{t('publicDemo.correction')}</span><p>{t('publicDemo.correctionHelp')}</p></div>}
          <h4>{t('library.downloads')}</h4><div className="workshop-downloads"><a href={publicAssetFile(revision, 'model.glb')} download>{t('library.glb')} ↓</a></div>
        </div>
      </div>
      <section className="workshop-detail-followup" aria-label={t('publicDemo.history')}>
        <h4>{t('publicDemo.history')}</h4><p className="public-gallery-history-help">{t('publicDemo.historyHelp')}</p>
        <ol className="public-gallery-history">
          {selected.revisions.map(item => <li key={item.id} aria-current={item.id === revision.id ? 'true' : undefined}>
            <button type="button" onClick={() => setVersionId(item.id)} aria-pressed={item.id === revision.id}>{t('revision.version', { count: item.version })}</button>
            <div><time dateTime={item.createdAt}>{t('publicDemo.generated')} · {formatDate(new Date(item.createdAt), { dateStyle: 'medium', timeZone: 'UTC' })}</time><p>{t(`publicDemo.versions.${item.id}`)}</p></div>
          </li>)}
        </ol>
      </section>
    </section>
    {backendEnabled && <aside className="workshop-panel public-gallery-account">
      <div><h3>{t('publicDemo.accountTitle')}</h3><p>{t('publicDemo.accountHelp')}</p></div>
      <a className="workshop-primary" href="/app/assets">{t('publicDemo.signIn')} <span aria-hidden="true">↗</span></a>
    </aside>}
    <p className="workshop-footnote public-gallery-curated">{t('publicDemo.curated')}</p>
  </div>
}
