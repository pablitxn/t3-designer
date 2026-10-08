import { useMemo, useState } from 'react'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import { useLocale } from '../i18n/useLocale'
import { getSolarPosition, resolveLocalDateTime } from '../lib/solar'
import { buildSiteSolarSnapshot } from '../lib/solar-snapshot'
import { createDefaultBuildingEnergy } from './model'
import { createRoofSolarLayout, roofSurfaceFromBuilding } from './roof-layout'
import { EnergyWorkbench } from './EnergyWorkbench'
import { SolarRoofPreview } from '../components/SolarRoofPreview'
import { energyIntegrationCopy } from './integration-copy'
import './integration.css'

/** Uses this project's geography and target roof, never the public demo state. */
export function ProjectEnergy({ snapshot, readOnly, onChange }: {
  snapshot: ProjectSnapshot
  readOnly: boolean
  onChange: (snapshot: ProjectSnapshot) => void
}) {
  const { locale } = useLocale()
  const copy = energyIntegrationCopy[locale]
  const value = useMemo(() => snapshot.buildingEnergy ?? createDefaultBuildingEnergy(snapshot.site.targetId, snapshot.site.latitude, snapshot.site.longitude), [snapshot.buildingEnergy, snapshot.site])
  const building = snapshot.buildings.find(item => item.id === snapshot.site.targetId)!
  const roof = useMemo(() => roofSurfaceFromBuilding(building), [building])
  const layout = useMemo(() => createRoofSolarLayout(roof, value.installation), [roof, value.installation.panelCount, value.installation.tiltDeg, value.installation.azimuthDeg])
  const date = snapshot.solar.date
  const minutes = snapshot.solar.selected.minutes
  const [invalidTime, setInvalidTime] = useState(false)
  const resolution = useMemo(() => resolveLocalDateTime(date, minutes, snapshot.site.timeZone), [date, minutes, snapshot.site.timeZone])
  const instant = new Date(snapshot.solar.selected.utc)
  const sun = getSolarPosition(instant, snapshot.site.latitude, snapshot.site.longitude)
  function changeMoment(nextDate: string, nextMinutes: number) {
    if (readOnly) return
    try {
      const solar = buildSiteSolarSnapshot(snapshot.site, { date: nextDate, minutes: nextMinutes, disambiguation: snapshot.solar.selected.disambiguation === 'later' ? 'later' : 'earlier' })
      setInvalidTime(false); onChange({ ...snapshot, solar })
    } catch { setInvalidTime(true) }
  }
  return <section className="project-energy" aria-label={copy.privateTitle}>
    <p className="tw:mt-0 tw:text-sm tw:leading-6 tw:text-[var(--settings-muted)]">{copy.privateHint}</p>
    <div className="private-energy-preview"><SolarRoofPreview roof={roof} layout={layout} sun={sun} /></div>
    {invalidTime && <p role="alert">{copy.dateError}</p>}
    {resolution.status === 'ambiguous' && <p role="status">{snapshot.solar.selected.disambiguation === 'later' ? copy.repeatedTimeLater : copy.repeatedTime}</p>}
    <EnergyWorkbench value={value} onChange={next => { if (!readOnly) onChange({ ...snapshot, buildingEnergy: next }) }}
      site={snapshot.site} date={date} minutes={minutes} readOnly={readOnly}
      onDateChange={next => changeMoment(next, minutes)} onTimeChange={next => changeMoment(date, next)}
      panelCapacity={layout.maxPanelCount} installedPanelCount={layout.installedCount} />
  </section>
}
