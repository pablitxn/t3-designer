import { useMemo, useState } from 'react'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import { useLocale } from '../i18n/useLocale'
import { getSolarPosition, resolveLocalDateTime } from '../lib/solar'
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
  const [date, setDate] = useState(snapshot.solar.date)
  const [minutes, setMinutes] = useState(snapshot.solar.selected.minutes)
  const [invalidTime, setInvalidTime] = useState(false)
  const resolution = useMemo(() => resolveLocalDateTime(date, minutes, snapshot.site.timeZone), [date, minutes, snapshot.site.timeZone])
  const instant = resolution.instants[0] ?? new Date(snapshot.solar.selected.utc)
  const sun = getSolarPosition(instant, snapshot.site.latitude, snapshot.site.longitude)
  function changeMoment(nextDate: string, nextMinutes: number) {
    try {
      const next = resolveLocalDateTime(nextDate, nextMinutes, snapshot.site.timeZone)
      if (!next.instants.length) { setInvalidTime(true); return }
      setInvalidTime(false); setDate(nextDate); setMinutes(nextMinutes)
    } catch { setInvalidTime(true) }
  }
  return <section className="project-energy" aria-label={copy.privateTitle}>
    <p className="tw:mt-0 tw:text-sm tw:leading-6 tw:text-[var(--settings-muted)]">{copy.privateHint}</p>
    <div className="private-energy-preview"><SolarRoofPreview roof={roof} layout={layout} sun={sun} /></div>
    {invalidTime && <p role="alert">{copy.dateError}</p>}
    {resolution.status === 'ambiguous' && <p role="status">{copy.repeatedTime}</p>}
    <EnergyWorkbench value={value} onChange={next => { if (!readOnly) onChange({ ...snapshot, buildingEnergy: next }) }}
      site={snapshot.site} date={date} minutes={minutes} readOnly={readOnly}
      onDateChange={next => changeMoment(next, minutes)} onTimeChange={next => changeMoment(date, next)}
      panelCapacity={layout.maxPanelCount} installedPanelCount={layout.installedCount} />
  </section>
}
