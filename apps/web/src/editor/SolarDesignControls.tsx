import { useState, type FormEvent } from 'react'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import { useLocale } from '../i18n/useLocale'
import { buildSiteSolarSnapshot } from '../lib/solar-snapshot'

const copy = {
  es: { title: 'Luz natural · fecha y hora', date: 'Fecha del estudio', time: 'Hora del edificio', apply: 'Aplicar fecha y hora', hint: 'La misma fecha y hora se usan para comparar todas las distribuciones.', error: 'Revisá la fecha y la hora. Si cambia el horario de verano, elegí una hora válida y la primera o segunda ocurrencia.', occurrence: 'Hora repetida por cambio de horario', reject: 'Pedir una selección si se repite', earlier: 'Primera ocurrencia', later: 'Segunda ocurrencia', walls: 'Mostrar paredes completas' },
  en: { title: 'Daylight · date and time', date: 'Study date', time: 'Building time', apply: 'Apply date and time', hint: 'The same date and time are used to compare all layouts.', error: 'Check the date and time. At a daylight-saving transition, choose a valid time and its first or second occurrence.', occurrence: 'Repeated clock-change time', reject: 'Require a choice if repeated', earlier: 'First occurrence', later: 'Second occurrence', walls: 'Show full walls' },
  fr: { title: 'Lumière naturelle · date et heure', date: 'Date de l’étude', time: 'Heure du bâtiment', apply: 'Appliquer la date et l’heure', hint: 'La même date et la même heure servent à comparer tous les agencements.', error: 'Vérifiez la date et l’heure. Lors du changement d’heure, choisissez une heure valide et sa première ou seconde occurrence.', occurrence: 'Heure répétée lors du changement d’heure', reject: 'Demander un choix si répétée', earlier: 'Première occurrence', later: 'Seconde occurrence', walls: 'Afficher les murs entiers' },
}
const input = 'tw:box-border tw:w-full tw:min-w-0 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:text-[color:var(--settings-text)] tw:disabled:opacity-50'

export function FullWallsControl({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  const { locale } = useLocale()
  return <label className="tw:flex tw:items-center tw:gap-2 tw:text-xs"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{copy[locale].walls}</label>
}

export function SolarDesignControls({ scene, readOnly, onApply }: { scene: ProjectSnapshot; readOnly: boolean; onApply: (change: (current: ProjectSnapshot) => ProjectSnapshot) => boolean }) {
  const { locale } = useLocale(), c = copy[locale]
  const [error, setError] = useState(false)
  const time = `${String(Math.floor(scene.solar.selected.minutes / 60)).padStart(2, '0')}:${String(scene.solar.selected.minutes % 60).padStart(2, '0')}`
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly) return
    const form = new FormData(event.currentTarget)
    const [hour, minute] = String(form.get('time')).split(':').map(Number)
    try {
      const solar = buildSiteSolarSnapshot(scene.site, { date: String(form.get('date')), minutes: hour * 60 + minute, disambiguation: form.get('occurrence') as 'reject' | 'earlier' | 'later' })
      setError(!onApply(current => ({ ...current, solar })))
    } catch { setError(true) }
  }
  return <details className="tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:p-4">
    <summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.title} · {scene.solar.date} {time}</summary>
    <p className="tw:text-xs tw:text-[color:var(--settings-muted)]">{scene.site.timeZone} · {c.hint}</p>
    <form key={`${scene.solar.date}-${time}-${scene.solar.selected.disambiguation}`} onSubmit={submit} className="tw:grid tw:gap-3 tw:sm:grid-cols-2 tw:xl:grid-cols-4">
      <label className="tw:grid tw:gap-1.5 tw:text-xs">{c.date}<input className={input} type="date" name="date" defaultValue={scene.solar.date} min="1900-01-01" max="2100-12-31" required disabled={readOnly} /></label>
      <label className="tw:grid tw:gap-1.5 tw:text-xs">{c.time}<input className={input} type="time" name="time" defaultValue={time} required disabled={readOnly} /></label>
      <label className="tw:grid tw:gap-1.5 tw:text-xs">{c.occurrence}<select className={input} name="occurrence" defaultValue={scene.solar.selected.disambiguation} disabled={readOnly}><option value="reject">{c.reject}</option><option value="earlier">{c.earlier}</option><option value="later">{c.later}</option></select></label>
      <button className={`${input} tw:cursor-pointer tw:self-end`} disabled={readOnly}>{c.apply}</button>
    </form>
    {error && <p role="alert" className="tw:text-sm tw:text-[color:var(--settings-text)]">{c.error}</p>}
  </details>
}
