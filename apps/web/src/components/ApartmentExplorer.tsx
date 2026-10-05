import { ApartmentScene } from './ApartmentScene'
import { SolarControls, SolarMomentTag } from './SolarControls'
import { t3Apartment } from '../data/t3'
import { APARTMENT_PLACEMENT } from '../data/apartment-placement'
import { demoAssets } from '../data/demo-catalog'
import type { SolarStudy } from '../lib/useSolarStudy'
import type { ApartmentView } from '../lib/useApartmentView'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import { assetEvidence, assetLabel, roomLabel } from '../i18n/workspace-labels'
import { analytics } from '../lib/analytics'
import { useState } from 'react'
import { useExpandedWorkspace } from '../lib/useExpandedWorkspace'
import { ViewerIcon, ViewerPanel } from './ViewerPanel'
import { buildingStudioCopy } from './building-studio-copy'
import './apartment-viewer.css'
import type { DemoLayout } from '../lib/useDemoLayout'
import { demoLayoutCopy } from './demo-layout-copy'

import { PublicArrangement } from './PublicArrangement'
import { usePublicArrangement } from '../lib/usePublicArrangement'
import { movableDemoFixture } from '../lib/demo-layout'

const finishes = [
  { color: '#a97539', name: 'apartment.parquet', rooms: 'apartment.parquetRooms' },
  { color: '#595955', name: 'apartment.darkTile', rooms: 'apartment.darkTileRooms' },
  { color: '#ddddd0', name: 'apartment.lightTile', rooms: 'apartment.lightTileRooms' },
  { color: '#68726a', name: 'apartment.greenGrayFloor', rooms: 'apartment.greenGrayFloorRooms' },
  { color: '#637e89', name: 'apartment.blueGrayPaint', rooms: 'apartment.blueGrayPaintRooms' },
] as const

export function ApartmentExplorer({ solar, state, layout }: { solar: SolarStudy; state: ApartmentView; layout: DemoLayout }) {
  const { t } = useTranslation('workspace')
  const { t: common } = useTranslation('common')
  const { formatNumber, compass, locale } = useLocale()
  const { formatArea, formatLength, formatDimensions } = useUnits()
  const demo = demoLayoutCopy[locale]
  const studio = buildingStudioCopy[locale]
  const { expanded, setExpanded, container, trigger } = useExpandedWorkspace()
  const [activePanel, setActivePanel] = useState<'sun' | 'settings' | 'furniture' | null>(() => state.arranging ? 'furniture' : null)
  const {
    cutaway, setCutaway, showLabels, setShowLabels, showFixtures, setShowFixtures,
    focusRoomId, setFocusRoomId, panel, setPanel, showContext, setShowContext,
    selectedAsset, setSelectedAsset, view, resetView, focusRoom,
  } = state
  const arrangement = usePublicArrangement(layout, state.arranging)
  const asset = demoAssets.find(item => item.id === selectedAsset)
  const canRotate = state.arranging && showFixtures && arrangement.selected && movableDemoFixture(arrangement.selected)
  const selectedName = arrangement.selected ? assetLabel(t, arrangement.selected.assetId, arrangement.selected.label) : ''

  function togglePanel(next: 'sun' | 'settings' | 'furniture') {
    if (activePanel === next) { setActivePanel(null); return }
    state.setArranging(next === 'furniture')
    if (next === 'furniture') { solar.setPlaying(false); setShowFixtures(true) }
    if (next === 'sun') setPanel('sun')
    else if (next === 'settings' && panel === 'sun') setPanel('rooms')
    setActivePanel(next)
  }

  return <>
      <section ref={container} className={`apartment-viewer${expanded ? ' is-expanded' : ''}${activePanel ? ' has-panel' : ''}${canRotate ? ' has-arrangement-selection' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={t('apartment.modelAria')}>
        <div className={`viewport apartment-viewport ${solar.sun.isDaylight ? 'is-day' : 'is-night'}`} onKeyDown={arrangement.keyDown}>
          <ApartmentScene apartment={t3Apartment} fixtures={layout.fixtures} cutaway={cutaway} showLabels={showLabels} showFixtures={showFixtures} focusRoomId={focusRoomId} view={view} sun={solar.sun} showContext={showContext} editing={{ enabled: state.arranging, selectedId: arrangement.selectedId, onSelect: arrangement.onSelect, onMove: arrangement.onMove, label: demo.controls }} />
          {activePanel === 'furniture' && <PublicArrangement layout={layout} onClose={() => setActivePanel(null)} selectedId={arrangement.selectedId} onSelect={arrangement.onSelect} error={arrangement.error} onClearError={arrangement.onClearError} />}
          <div className="viewer-toolbar apartment-viewer-toolbar">
            <div className="view-buttons" role="group" aria-label={t('apartment.cameraView')}>
              <button aria-pressed={view.mode === '3d'} onClick={() => resetView('3d')}>{t('apartment.perspective')}</button>
              <button aria-pressed={view.mode === 'top'} onClick={() => resetView('top')}>{t('apartment.plan')}</button>
              <button className="camera-reset" aria-label={t('apartment.resetView')} title={t('apartment.resetView')} onClick={() => { setFocusRoomId(undefined); resetView(view.mode) }}>↺</button>
            </div>
            <div className="apartment-viewer-actions">
              <button className="viewer-action" aria-label={demo.launch} title={demo.launch} aria-expanded={activePanel === 'furniture'} aria-controls="apartment-controls" onClick={() => togglePanel('furniture')}><ViewerIcon kind="furniture" /></button>
              <button className="viewer-action" aria-label={studio.solar} title={studio.solar} aria-expanded={activePanel === 'sun'} aria-controls="apartment-controls" onClick={() => togglePanel('sun')}><ViewerIcon kind="sun" /></button>
              <button className="viewer-action" aria-label={studio.layers} title={studio.layers} aria-expanded={activePanel === 'settings'} aria-controls="apartment-controls" onClick={() => togglePanel('settings')}><ViewerIcon kind="settings" /></button>
              <button ref={trigger} className="viewer-action" aria-label={expanded ? studio.collapse : studio.expand} title={expanded ? studio.collapse : studio.expand} aria-pressed={expanded} onClick={() => { setActivePanel(null); setExpanded(previous => !previous) }}><ViewerIcon kind={expanded ? 'collapse' : 'expand'} /></button>
            </div>
          </div>
          {canRotate && <div className="arrangement-selection-toolbar" role="group" aria-label={`${demo.rotationControls}: ${selectedName}`}>
            <span className="arrangement-selection-name" title={selectedName}>{selectedName}</span>
            <button type="button" aria-label={demo.rotateLeft} title={demo.rotateLeft} onClick={() => arrangement.onRotate('left')}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg></button>
            <button type="button" aria-label={demo.rotateRight} title={demo.rotateRight} onClick={() => arrangement.onRotate('right')}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10a9 9 0 1 0-2 8M21 4v6h-6" /></svg></button>
          </div>}
          {canRotate && arrangement.error && activePanel !== 'furniture' && <p className="arrangement-selection-error" role="alert">{demo.error}</p>}
          <SolarMomentTag solar={solar} className="apartment-moment-tag" />
          {(activePanel === 'sun' || activePanel === 'settings') && <ViewerPanel id="apartment-controls" title={activePanel === 'sun' ? studio.solar : common('settings.title')} onClose={() => setActivePanel(null)} className="apartment-inspector">
          {activePanel === 'settings' && <>
            <fieldset className="apartment-viewer-layers">
              <legend>{t('apartment.modelLayers')}</legend>
              <label><input type="checkbox" checked={cutaway} onChange={event => setCutaway(event.target.checked)} /> {t('apartment.cutaway')}</label>
              <label><input type="checkbox" checked={showFixtures} onChange={event => setShowFixtures(event.target.checked)} /> {t('apartment.fixtures')}</label>
              <label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> {t('apartment.labels')}</label>
              <label><input type="checkbox" checked={showContext} onChange={event => setShowContext(event.target.checked)} /> {t('apartment.showBuilding')}</label>
            </fieldset>
            <div className="inspector-tabs" role="group" aria-label={t('apartment.inspectorContents')}>
              <button aria-pressed={panel === 'rooms'} onClick={() => setPanel('rooms')}>{t('apartment.roomsTab')} <span>{t3Apartment.rooms.length}</span></button>
              <button aria-pressed={panel === 'assets'} onClick={() => setPanel('assets')}>{t('apartment.assetsTab')} <span>{demoAssets.length}</span></button>
            </div>
          </>}
          {activePanel === 'sun' ? <>
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
                <span><i>{String(index + 1).padStart(2, '0')}</i>{roomLabel(t, room.id)}</span><small>{formatArea(room.reportedArea)}</small>
              </button>)}
            </div>
            <div className="finish-list"><h2>{t('apartment.materials')}</h2>{finishes.map(finish => <div className="finish" key={finish.name}><span style={{ background: finish.color }} /><div>{t(finish.name)}<small>{t(finish.rooms)}</small></div></div>)}</div>
          </> : <>
            <p className="inspector-note">{t('apartment.assetCountNote', { count: layout.fixtures.length })}</p>
            <div className="asset-list">{demoAssets.map(item => <button key={item.id} className={`asset-row ${selectedAsset === item.id ? 'selected' : ''}`} onClick={() => { setSelectedAsset(item.id); focusRoom(layout.fixtures.find(f => f.assetId === item.id)?.roomId); setShowFixtures(true) }}><span>{assetLabel(t, item.id, item.label)}</span><small>×{layout.fixtures.filter(f => f.assetId === item.id).length}</small></button>)}</div>
            {asset && <div className="asset-details"><h2>{assetLabel(t, asset.id, asset.label)}</h2><p>{formatDimensions(asset.dimensions)} <span>{t('apartment.assetDimensions')}</span></p><small>{t('apartment.estimatedDimensions')}</small><p className="asset-evidence">{assetEvidence(t, asset.id)}</p><a href={asset.url} download onClick={() => analytics.downloadGlb()}>{t('apartment.downloadGlb')}</a></div>}
          </>}
          </ViewerPanel>}
        </div>
      </section>
      <footer className="app-footer">
        <span className="footer-label">{t('apartment.footerTitle')}</span>
        <p>{t('apartment.footerDescription')}</p>
        <span className="wall-height">{t('apartment.wallHeight', { height: formatLength(t3Apartment.walls[0]?.height ?? 0) })} <span>{t('apartment.estimated')}</span></span>
      </footer>
  </>
}
