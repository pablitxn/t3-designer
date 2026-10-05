import { useMemo, useState } from 'react'
import { BuildingScene } from './BuildingScene'
import { BuildingMap } from './BuildingMap'
import { buildingStudioCopy } from './building-studio-copy'
import { useExpandedWorkspace } from '../lib/useExpandedWorkspace'
import { ViewerIcon, ViewerPanel } from './ViewerPanel'
import { SolarControls, SolarMomentTag } from './SolarControls'
import { BUILDING_SITE, SITE_BUILDINGS, SITE_PARCEL } from '../data/building-site'
import { APARTMENT_PLACEMENT } from '../data/apartment-placement'
import type { SolarStudy } from '../lib/useSolarStudy'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import '../building.css'
import { EnergyWorkbench } from '../energy/EnergyWorkbench'
import { createRoofSolarLayout, TARGET_SOLAR_ROOF } from '../energy/roof-layout'
import { energyIntegrationCopy } from '../energy/integration-copy'
import type { DemoEnergy } from '../energy/useDemoEnergy'
import '../energy/integration.css'
import './building-studio.css'

const targetBuilding = SITE_BUILDINGS.find(building => building.isTarget)

export function BuildingExplorer({ solar, energy, onOpenApartment }: { solar: SolarStudy; energy: DemoEnergy; onOpenApartment: () => void }) {
  const { t } = useTranslation('workspace')
  const { locale, formatNumber, formatDate } = useLocale()
  const { formatLength, formatArea } = useUnits()
  const copy = energyIntegrationCopy[locale]
  const studio = buildingStudioCopy[locale]
  const { expanded, setExpanded, container, trigger } = useExpandedWorkspace()
  const [controlsOpen, setControlsOpen] = useState(false)
  const [mode, setMode] = useState<'light' | 'energy'>('light')
  const [showPanels, setShowPanels] = useState(false)
  const installation = energy.value.installation
  const layout = useMemo(() => createRoofSolarLayout(TARGET_SOLAR_ROOF, installation), [installation.panelCount, installation.tiltDeg, installation.azimuthDeg])
  const { sun, instant } = solar
  const [cutaway, setCutaway] = useState<'none' | 'floor' | 'apartment'>('none')
  const [focusApartment, setFocusApartment] = useState(false)
  const [showNeighbors, setShowNeighbors] = useState(true)
  const [showSunPath, setShowSunPath] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [view, setView] = useState<{ mode: '3d' | 'map'; revision: number }>({ mode: '3d', revision: 0 })
  const sceneView = useMemo(() => ({ mode: '3d' as const, revision: view.revision }), [view.revision])
  function resetView(mode: '3d' | 'map') {
    setView(previous => ({ mode, revision: previous.revision + 1 }))
  }

  return <>
    <section ref={container} className={`building-studio${expanded ? ' is-expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={studio.scene}>
    <div className="workspace building-workspace">
      <section className={`viewport building-viewport ${sun.isDaylight ? 'is-day' : 'is-night'}`} aria-label={t('building.sceneAria')}>
        {view.mode === 'map' ? <BuildingMap resetRevision={view.revision} /> : <BuildingScene instant={instant} sun={sun} showNeighbors={showNeighbors} showSunPath={showSunPath} showLabels={showLabels} view={sceneView} cutaway={cutaway} focusApartment={focusApartment} solarLayout={showPanels ? layout : undefined} />}
        <div className="viewer-toolbar building-studio-toolbar">
          <div className="view-buttons" role="group" aria-label={t('building.camera')}>
            <button aria-pressed={view.mode === '3d'} onClick={() => resetView('3d')}>{t('apartment.perspective')}</button>
            <button aria-pressed={view.mode === 'map'} onClick={() => resetView('map')}>{studio.map}</button>
            <button className="camera-reset" aria-label={t('apartment.resetView')} title={t('apartment.resetView')} onClick={() => resetView(view.mode)}>↺</button>
          </div>
          <button className="viewer-action" aria-label={controlsOpen ? studio.hideControls : studio.showControls} title={controlsOpen ? studio.hideControls : studio.showControls} aria-expanded={controlsOpen} aria-controls="building-inspector" onClick={() => setControlsOpen(previous => !previous)}><ViewerIcon kind="settings" /></button>
          <button ref={trigger} className="viewer-action" aria-label={expanded ? studio.collapse : studio.expand} title={expanded ? studio.collapse : studio.expand} aria-pressed={expanded} onClick={() => { setControlsOpen(false); setExpanded(previous => !previous) }}><ViewerIcon kind={expanded ? 'collapse' : 'expand'} /></button>
        </div>
        {view.mode !== 'map' && <>
        <SolarMomentTag solar={solar} />
        <div className="viewport-bottom building-viewport-bottom">
          <div className="scene-guide"><span><i className="target-key" /> {t('building.buildingPart')} <i className="apartment-key" /> {t('building.apartmentKey')} <i className="neighbor-key" /> {t('building.contextKey')}</span><small>{t('building.navigationHelp')}</small></div>
          <fieldset className="display-options building-layers">
            <legend className="sr-only">{studio.layers}</legend>
            <label><input type="checkbox" checked={showNeighbors} onChange={event => setShowNeighbors(event.target.checked)} /> {t('building.neighbors')}</label>
            <label><input type="checkbox" checked={showSunPath} onChange={event => setShowSunPath(event.target.checked)} /> {t('building.solarOrbit')}</label>
            <label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> {t('apartment.labels')}</label>
            <label><input type="checkbox" checked={showPanels} onChange={event => setShowPanels(event.target.checked)} /> {copy.panels}</label>
          </fieldset>
        </div>
        </>}

      {controlsOpen && <ViewerPanel id="building-inspector" title={studio.controls} onClose={() => setControlsOpen(false)} className={`building-viewer-panel${mode === 'energy' ? ' wide' : ''}`}>
        <div className="building-study-switcher" role="group" aria-label={copy.modeLabel}>
          <button aria-pressed={mode === 'light'} onClick={() => setMode('light')}>{copy.light}</button>
          <button aria-pressed={mode === 'energy'} onClick={() => setMode('energy')}>{copy.energy}</button>
        </div>
        {mode === 'energy' ? <section className="building-energy-intro">
          <span className="eyebrow">{copy.scope}</span><h2>{copy.title}</h2><p>{copy.intro}</p>
          <dl><div><dt>{copy.planned}</dt><dd>{formatNumber(layout.installedCount)} / {formatNumber(installation.panelCount)}</dd></div><div><dt>{copy.capacity}</dt><dd>{formatNumber(layout.installedCount * installation.panelWattPeak / 1000, 2)} <small>kWp</small></dd></div></dl>
          <p className="building-energy-roof-note">{copy.roofHint}</p>
        </section> : <>
        <section className="apartment-location-card" aria-label={t('building.department')}>
          <span className="eyebrow">{t('building.department')}</span><h2>{t('building.apartmentLocationTitle')}</h2>
          <p>{t('building.apartmentFloor', { floor: formatNumber(APARTMENT_PLACEMENT.floorIndex) })}<br /><small>{t('building.courtyardAssumption')}</small></p>
          <div className="building-section-options" role="group" aria-label={t('building.buildingCuts')}>
            {([{ mode: 'none', label: t('building.wholeBuilding') }, { mode: 'floor', label: t('building.floorCut') }, { mode: 'apartment', label: t('building.interior') }] as const).map(option => <button key={option.mode} aria-pressed={cutaway === option.mode} onClick={() => { setCutaway(option.mode); setFocusApartment(option.mode !== 'none'); resetView('3d') }}>{option.label}</button>)}
          </div>
          <button className="apartment-locate" aria-pressed={focusApartment} onClick={() => { setFocusApartment(previous => !previous); resetView('3d') }}>{focusApartment ? t('building.wholeBuildingLink') : t('building.locateApartment')}</button>
          <button className="apartment-enter" onClick={onOpenApartment}>{t('building.exploreApartment')} <span>→</span></button>
        </section>
        <div className="solar-heading"><span className="eyebrow">{t('building.solarStudy')}</span><h2>{t('building.annualLightLine1')} {t('building.annualLightLine2')}</h2><p>{t('building.sharedMoment')}</p></div>
        </>}

        <details className="studio-solar-controls" open={mode === 'light'} key={mode}>
          <summary>{studio.solar}</summary>
          <SolarControls solar={solar} />
        </details>

        {mode === 'energy' && <div className="building-energy-study">
          <div className="building-energy-savebar">
            <p role="status">{energy.status === 'unavailable' ? copy.unavailable : energy.dirty ? copy.dirty : copy[energy.status]}</p>
            <div><button onClick={energy.reset}>{copy.reset}</button>{energy.dirty && <button onClick={energy.revert}>{copy.revert}</button>}<button className="is-primary" onClick={energy.save} disabled={!energy.dirty && energy.status === 'saved'}>{copy.save}</button></div>
          </div>
          <EnergyWorkbench value={energy.value} onChange={energy.change} site={BUILDING_SITE} date={solar.moment.date} minutes={solar.moment.minutes}
            onTimeChange={solar.changeTime} onDateChange={solar.changeDate} panelCapacity={layout.maxPanelCount} installedPanelCount={layout.installedCount} />
        </div>}

        <details className="evidence-notes building-evidence"><summary>{t('building.evidencePrecision')}</summary>
          <p><a href={BUILDING_SITE.rnbUrl} target="_blank" rel="noreferrer">{t('building.nationalBuildingRegister')}</a><br />{t('building.registerDescription', { address: BUILDING_SITE.officialAddress })}</p>
          <p><a href="https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/" target="_blank" rel="noreferrer">{t('building.ignTopo')}</a><br />{t('building.ignDescription', { height: formatLength(targetBuilding?.height ?? 0, 1), floors: formatNumber(targetBuilding?.floors ?? 0), planar: formatLength(targetBuilding?.planarAccuracy ?? 0, 1), vertical: formatLength(targetBuilding?.verticalAccuracy ?? 0, 1) })}</p>
          <p><a href="https://cadastre.data.gouv.fr/" target="_blank" rel="noreferrer">{t('building.cadastre', { label: SITE_PARCEL.label })}</a><br />{t('building.parcelDescription', { area: formatArea(SITE_PARCEL.area, 0) })}</p>
          <p>{t('building.modelScope', { radius: formatLength(BUILDING_SITE.radiusMeters, 0), assumption: t('apartment.placementAssumption') })}</p>
          <p><a href="https://gml.noaa.gov/grad/solcalc/calcdetails.html" target="_blank" rel="noreferrer">{t('building.solarSource')}</a><br />{t('building.solarDescription')}</p>
          <p>{t('building.dataConsulted', { date: formatDate(new Date(`${BUILDING_SITE.retrievedAt}T12:00:00Z`), { dateStyle: 'long' }), attribution: BUILDING_SITE.attribution })}</p>
        </details>
      </ViewerPanel>}
      </section>
    </div>
    </section>
    <footer className="app-footer building-footer"><span className="footer-label">{t('building.footerTitle')}</span><p>{t('building.footerDescription')}</p><a href={BUILDING_SITE.mapUrl} target="_blank" rel="noreferrer">{t('building.mapLink')}</a></footer>
  </>
}
