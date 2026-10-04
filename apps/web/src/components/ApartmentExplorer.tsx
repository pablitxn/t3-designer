import { ApartmentScene } from './ApartmentScene'
import { SolarControls, SolarMomentTag } from './SolarControls'
import { t3Apartment } from '../data/t3'
import { APARTMENT_PLACEMENT } from '../data/apartment-placement'
import { assetCatalog } from '../data/current-state'
import type { SolarStudy } from '../lib/useSolarStudy'
import type { ApartmentView } from '../lib/useApartmentView'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { assetEvidence, assetLabel, roomLabel } from '../i18n/workspace-labels'
import { analytics } from '../lib/analytics'
import { lazy, Suspense } from 'react'
import type { DemoLayout } from '../lib/useDemoLayout'
import { demoLayoutCopy } from './demo-layout-copy'

const PublicArrangement = lazy(() => import('./PublicArrangement').then(module => ({ default: module.PublicArrangement })))

const finishes = [
  { color: '#a97539', name: 'apartment.parquet', rooms: 'apartment.parquetRooms' },
  { color: '#595955', name: 'apartment.darkTile', rooms: 'apartment.darkTileRooms' },
  { color: '#ddddd0', name: 'apartment.lightTile', rooms: 'apartment.lightTileRooms' },
  { color: '#68726a', name: 'apartment.greenGrayFloor', rooms: 'apartment.greenGrayFloorRooms' },
  { color: '#637e89', name: 'apartment.blueGrayPaint', rooms: 'apartment.blueGrayPaintRooms' },
] as const
const reconstructionNoteKeys = [
  'reconstruction.note1', 'reconstruction.note2', 'reconstruction.note3', 'reconstruction.note4', 'reconstruction.note5',
] as const

export function ApartmentExplorer({ solar, state, layout }: { solar: SolarStudy; state: ApartmentView; layout: DemoLayout }) {
  const { t } = useTranslation('workspace')
  const { formatNumber, compass, locale } = useLocale()
  const demo = demoLayoutCopy[locale]
  const {
    cutaway, setCutaway, showLabels, setShowLabels, showFixtures, setShowFixtures,
    focusRoomId, setFocusRoomId, panel, setPanel, showContext, setShowContext,
    selectedAsset, setSelectedAsset, view, resetView, focusRoom,
  } = state
  const asset = assetCatalog.find(item => item.id === selectedAsset)

  if (state.arranging) return <Suspense fallback={<div className="workspace-loading" role="status">{demo.title}…</div>}><PublicArrangement layout={layout} onClose={() => state.setArranging(false)} /></Suspense>

  return <>
      <div className="tw:mx-5 tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:px-4 tw:py-3">
        <p className="tw:m-0 tw:text-xs tw:leading-5 tw:text-[color:var(--settings-muted)]">{demo.hint}</p>
        <button className="tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-[var(--settings-accent)] tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-white" onClick={() => { solar.setPlaying(false); state.setArranging(true) }}>{demo.launch} →</button>
      </div>
      <div className="workspace apartment-workspace">
        <section className={`viewport apartment-viewport ${solar.sun.isDaylight ? 'is-day' : 'is-night'}`} aria-label={t('apartment.modelAria')}>
          <ApartmentScene apartment={t3Apartment} fixtures={layout.fixtures} cutaway={cutaway} showLabels={showLabels} showFixtures={showFixtures} focusRoomId={focusRoomId} view={view} sun={solar.sun} showContext={showContext} />
          <div className="viewport-top">
            <div className="model-caption"><span className="caption-dot" /> {t('apartment.caption')} <span className="version">{t('apartment.sunInDemo')}</span></div>
            <div className="view-buttons" role="group" aria-label={t('apartment.cameraView')}>
              <button aria-pressed={view.mode === '3d'} onClick={() => resetView('3d')}>{t('apartment.perspective')}</button>
              <button aria-pressed={view.mode === 'top'} onClick={() => resetView('top')}>{t('apartment.plan')}</button>
              <button className="camera-reset" aria-label={t('apartment.resetView')} title={t('apartment.resetView')} onClick={() => { setFocusRoomId(undefined); resetView(view.mode) }}>↺</button>
            </div>
          </div>
          <SolarMomentTag solar={solar} className="apartment-moment-tag" />
          <button className="apartment-context-toggle" aria-pressed={showContext} onClick={() => setShowContext(previous => !previous)}><span aria-hidden="true">▥</span> {showContext ? t('apartment.hideBuilding') : t('apartment.showBuilding')}</button>
          <div className="viewport-bottom">
            <div className="scene-guide"><span>{solar.sun.isDaylight ? t('apartment.interiorSunlight') : t('apartment.ambientReference')}</span><small>{t('apartment.navigationHelp')}</small></div>
            <fieldset className="display-options">
              <legend className="sr-only">{t('apartment.modelLayers')}</legend>
              <label><input type="checkbox" checked={cutaway} onChange={event => setCutaway(event.target.checked)} /> {t('apartment.cutaway')}</label>
              <label><input type="checkbox" checked={showFixtures} onChange={event => setShowFixtures(event.target.checked)} /> {t('apartment.fixtures')}</label>
              <label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> {t('apartment.labels')}</label>
            </fieldset>
          </div>
        </section>

        <aside className="inspector solar-inspector apartment-inspector" aria-label={t('apartment.inspectorAria')}>
          <div className="inspector-heading"><span className="eyebrow">{t('apartment.insideEyebrow')}</span><p>{t('apartment.tagline')}</p></div>
          <div className="inspector-tabs" role="group" aria-label={t('apartment.inspectorContents')}>
            <button aria-pressed={panel === 'sun'} onClick={() => setPanel('sun')}>{t('apartment.sunTab')}</button>
            <button aria-pressed={panel === 'rooms'} onClick={() => setPanel('rooms')}>{t('apartment.roomsTab')} <span>8</span></button>
            <button aria-pressed={panel === 'assets'} onClick={() => setPanel('assets')}>{t('apartment.assetsTab')} <span>{assetCatalog.length}</span></button>
          </div>
          {panel === 'sun' ? <>
            <section className="solar-room-focus" aria-label={t('apartment.observeLight')}>
              <h2>{t('apartment.lookAtLight')}</h2>
              <div role="group" aria-label={t('apartment.focusRoom')}>
                {([{ id: undefined, label: t('apartment.allApartment') }, { id: 'living', label: t('apartment.living') }, { id: 'bedroom-1', label: t('apartment.bedroomOne') }, { id: 'bedroom-2', label: t('apartment.bedroomTwo') }]).map(room => <button key={room.id ?? 'all'} aria-pressed={focusRoomId === room.id} onClick={() => focusRoom(room.id)}>{room.label}</button>)}
              </div>
              <p>{t('apartment.lightInstruction')}</p>
              <div className="apartment-orientation"><span>{t('apartment.livingFacade')} <b>{compass(APARTMENT_PLACEMENT.livingFacadeAzimuth)} · {formatNumber(APARTMENT_PLACEMENT.livingFacadeAzimuth, 0)}°</b></span><span>{t('apartment.bedroomsFacade')} <b>{compass(APARTMENT_PLACEMENT.bedroomFacadeAzimuth)} · {formatNumber(APARTMENT_PLACEMENT.bedroomFacadeAzimuth, 0)}°</b></span><small>{t('apartment.estimatedOrientation')}</small></div>
            </section>
            <SolarControls solar={solar} />
            <div className="solar-interior-note"><strong>{t('apartment.buildingShadowTitle')}</strong><p>{t('apartment.buildingShadowBody')}</p></div>
            <details className="evidence-notes"><summary>{t('apartment.sunLocationPrecision')}</summary><p>{t('apartment.placementAssumption')}</p><p>{t('apartment.placementUnconfirmed')} {t('apartment.sunMethod')}</p><p><a href="https://gml.noaa.gov/grad/solcalc/calcdetails.html" target="_blank" rel="noreferrer">{t('apartment.sunSource')}</a></p></details>
          </> : panel === 'rooms' ? <>
            <button className={`room-nav overview ${!focusRoomId ? 'selected' : ''}`} onClick={() => focusRoom()}><span>{t('apartment.fullView')}</span><small>{t('apartment.allApartment')} ↗</small></button>
            <div className="room-navigation">
              {t3Apartment.rooms.map((room, index) => <button key={room.id} className={`room-nav ${focusRoomId === room.id ? 'selected' : ''}`} onClick={() => focusRoom(room.id)}>
                <span><i>{String(index + 1).padStart(2, '0')}</i>{roomLabel(t, room.id)}</span><small>{t('apartment.roomArea', { area: formatNumber(room.reportedArea, 2) })}</small>
              </button>)}
            </div>
            <div className="finish-list"><h2>{t('apartment.materials')}</h2>{finishes.map(finish => <div className="finish" key={finish.name}><span style={{ background: finish.color }} /><div>{t(finish.name)}<small>{t(finish.rooms)}</small></div></div>)}</div>
          </> : <>
            <p className="inspector-note">{t('apartment.assetCountNote', { count: layout.fixtures.length })}</p>
            <div className="asset-list">{assetCatalog.map(item => <button key={item.id} className={`asset-row ${selectedAsset === item.id ? 'selected' : ''}`} onClick={() => { setSelectedAsset(item.id); focusRoom(layout.fixtures.find(f => f.assetId === item.id)?.roomId); setShowFixtures(true) }}><span>{assetLabel(t, item.id)}</span><small>×{layout.fixtures.filter(f => f.assetId === item.id).length}</small></button>)}</div>
            {asset && <div className="asset-details"><h2>{assetLabel(t, asset.id)}</h2><p>{asset.dimensions.map(n => formatNumber(n * 100, 0)).join(' × ')} cm <span>{t('apartment.assetDimensions')}</span></p><small>{t('apartment.estimatedDimensions')}</small><p className="asset-evidence">{assetEvidence(t, asset.id)}</p><a href={asset.url} download onClick={() => analytics.downloadGlb()}>{t('apartment.downloadGlb')}</a></div>}
          </>}
          <details className="evidence-notes"><summary>{t('apartment.evidenceSources')}</summary>{reconstructionNoteKeys.map(key => <p key={key}>{t(key)}</p>)}</details>
        </aside>
      </div>
      <footer className="app-footer">
        <span className="footer-label">{t('apartment.footerTitle')}</span>
        <p>{t('apartment.footerDescription')}</p>
        <span className="wall-height">{t('apartment.wallHeight', { height: formatNumber(t3Apartment.walls[0]?.height ?? 0, 2) })} <span>{t('apartment.estimated')}</span></span>
      </footer>
  </>
}
