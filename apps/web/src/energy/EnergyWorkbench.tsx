import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocale } from '../i18n/useLocale'
import { formattingLocales } from '../i18n/locale'
import { energyCopy } from './copy'
import { type BuildingEnergy, type EnergySite, type FinanceAssumptions, type SolarInstallation, REGIONAL_DEMO_CLIMATE, getEffectiveClimateSource } from './model'
import { getAnnualGeneration, getDailyGeneration } from './generation'
import { calculateFinance } from './finance'
import './energy.css'

export type EnergyWorkbenchProps = {
  value: BuildingEnergy
  onChange: (value: BuildingEnergy) => void
  site: EnergySite
  date: string
  minutes: number
  onTimeChange?: (minutes: number) => void
  onDateChange?: (date: string) => void
  readOnly?: boolean
  panelCapacity?: number
  installedPanelCount?: number
}
type StudyTab = 'day' | 'year' | 'panels' | 'bill' | 'investment'
const studyTabs: StudyTab[] = ['day', 'year', 'panels', 'bill', 'investment']
const clockLabel = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${Math.floor(minutes % 60).toString().padStart(2, '0')}`

function NumberField({ label, value, onChange, unit, min = 0, max, step = 1, hint }: {
  label: string; value: number; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number; hint?: string
}) {
  const id = useId()
  // Keep incomplete edits local, so replacing a multi-digit number does not clamp it mid-keystroke.
  const [draft, setDraft] = useState<{ source: number; text: string } | null>(null)
  const text = draft?.source === value ? draft.text : String(value)
  function commit() {
    const number = Number(text)
    if (draft?.source === value && text.trim() && Number.isFinite(number)) {
      const next = Math.max(min, Math.min(max ?? Infinity, step === 1 ? Math.round(number) : number))
      if (next !== value) onChange(next)
    }
    setDraft(null)
  }
  return <div className="energy-field">
    <label htmlFor={id}>{label}{unit && <span className="sr-only"> ({unit})</span>}</label>
    <div className="energy-input-wrap"><input id={id} type="number" value={text} min={min} max={max} step={step} inputMode={step === 1 ? 'numeric' : 'decimal'} aria-describedby={hint ? `${id}-hint` : undefined} onChange={event => setDraft({ source: value, text: event.target.value })} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />{unit && <span aria-hidden="true">{unit}</span>}</div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>
}

function Metric({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: string }) {
  return <div className="energy-metric"><span>{label}</span><strong>{value}{unit && <small>{unit}</small>}</strong>{note && <p>{note}</p>}</div>
}

function DataTable({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return <details className="energy-data"><summary>{title}</summary><div className="energy-table-scroll" tabIndex={0}><table><caption className="sr-only">{title}</caption><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, cell) => cell === 0 ? <th key={cell} scope="row">{value}</th> : <td key={cell}>{value}</td>)}</tr>)}</tbody></table></div></details>
}

/** SVG is decorative: title, summary figures and the complete data table carry the accessible information. */
function LineChart({ points, reference, marker, xMax, yMin = 0, yMax, xTicks, formatY, area = false }: {
  points: { x: number; y: number }[]; reference?: { x: number; y: number }[]; marker?: number; xMax: number; yMin?: number; yMax: number; xTicks: { value: number; label: string }[]; formatY: (value: number) => string; area?: boolean
}) {
  const w = 720, h = 230, left = 72, right = 14, top = 18, bottom = 30
  const x = (value: number) => left + value / Math.max(1, xMax) * (w - left - right)
  const y = (value: number) => h - bottom - (value - yMin) / Math.max(0.01, yMax - yMin) * (h - top - bottom)
  const path = (values: typeof points) => values.map((point, index) => `${index ? 'L' : 'M'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(' ')
  const zero = Math.max(yMin, Math.min(0, yMax))
  return <svg className="energy-chart" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
    {[0, 0.25, 0.5, 0.75, 1].map(tick => { const value = yMin + (yMax - yMin) * tick; return <g key={tick}><line className="energy-chart-grid" x1={left} x2={w - right} y1={y(value)} y2={y(value)} /><text className="energy-chart-label" textAnchor="end" x={left - 9} y={y(value) + 4}>{formatY(value)}</text></g> })}
    {yMin < 0 && <line className="energy-chart-zero" x1={left} x2={w - right} y1={y(0)} y2={y(0)} />}
    {area && points.length > 0 && <path className="energy-chart-area" d={`${path(points)} L${x(points.at(-1)!.x)},${y(zero)} L${x(points[0].x)},${y(zero)} Z`} />}
    {reference && <path className="energy-chart-reference" d={path(reference)} />}
    <path className="energy-chart-line" d={path(points)} />
    {marker !== undefined && <line className="energy-chart-marker" x1={x(marker)} x2={x(marker)} y1={top} y2={h - bottom} />}
    {xTicks.map(tick => <text key={tick.value} className="energy-chart-label" textAnchor="middle" x={x(tick.value)} y={h - 9}>{tick.label}</text>)}
  </svg>
}

export function EnergyWorkbench({ value, onChange, site, date, minutes, onTimeChange, onDateChange, readOnly = false, panelCapacity, installedPanelCount }: EnergyWorkbenchProps) {
  const { locale, formatNumber } = useLocale()
  const c = energyCopy[locale]
  const id = useId()
  const [tab, setTab] = useState<StudyTab>('day')
  const installation = useMemo(() => ({ ...value.installation, panelCount: installedPanelCount ?? value.installation.panelCount }), [value.installation, installedPanelCount])
  const year = Number(date.slice(0, 4))
  const annual = useMemo(() => getAnnualGeneration(site, installation, year), [site, installation, year])
  const daily = useMemo(() => getDailyGeneration(site, installation, date), [site, installation, date])
  const finance = useMemo(() => calculateFinance(annual.annualKwh, value.finance), [annual.annualKwh, value.finance])
  const money = (amount: number) => new Intl.NumberFormat(formattingLocales[locale], { style: 'currency', currency: value.currency, maximumFractionDigits: 0 }).format(amount)
  const month = (index: number, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(formattingLocales[locale], { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(year, index - 1, 15)))
  const current = daily.samples.reduce((nearest, sample) => Math.abs(sample.minutes - minutes) < Math.abs(nearest.minutes - minutes) ? sample : nearest, daily.samples[0])
  const payback = finance.paybackYears === null ? c.noPayback : finance.paybackYears === 0 ? c.noInvestment : `${formatNumber(finance.paybackYears, 1)} ${c.years}`
  const title = { day: c.dayTitle, year: c.yearTitle, panels: c.panelsTitle, bill: c.billTitle, investment: c.investmentTitle }[tab]
  const intro = { day: c.dayIntro, year: c.yearIntro, panels: c.panelsIntro, bill: c.billIntro, investment: c.investmentIntro }[tab]
  function updateInstallation(update: Partial<SolarInstallation>) { onChange({ ...value, installation: { ...value.installation, ...update } }) }
  function updateFinance(update: Partial<FinanceAssumptions>) { onChange({ ...value, finance: { ...value.finance, ...update } }) }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!offset && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? studyTabs.length - 1 : (studyTabs.indexOf(tab) + offset + studyTabs.length) % studyTabs.length
    setTab(studyTabs[index])
    document.getElementById(`${id}-tab-${studyTabs[index]}`)?.focus()
  }
  const field = (key: keyof FinanceAssumptions, label: string, unit: string, max: number, step = 1, hint?: string, min = 0) => <NumberField label={label} value={value.finance[key]} onChange={next => updateFinance({ [key]: next })} unit={unit} min={min} max={max} step={step} hint={hint} />
  const effectiveClimateSource = getEffectiveClimateSource(site, installation)
  const climateName = effectiveClimateSource === 'regional-demo-2001-2020' ? c.nasa : effectiveClimateSource === 'custom' ? c.custom : c.illustrative
  const dailyYMax = Math.max(1, ...daily.samples.map(sample => sample.clearSkyPowerKw), ...daily.samples.map(sample => sample.powerKw)) * 1.1
  const monthlyMax = Math.max(1, ...annual.monthly.map(item => item.kwh))
  const cashPoints = [{ x: 0, y: -finance.netInvestment }, ...finance.cashflows.filter(item => item.year > 0).map(item => ({ x: item.year, y: item.cumulativeCashflow }))]
  const cashMin = Math.min(0, ...cashPoints.map(point => point.y))
  const cashMax = Math.max(1, ...cashPoints.map(point => point.y))
  const coverage = value.finance.annualConsumptionKwh > 0 ? finance.selfConsumedKwh / value.finance.annualConsumptionKwh * 100 : 0
  return <section className="energy-workbench" aria-labelledby={`${id}-title`}>
    <header className="energy-header"><div><span className="eyebrow">{c.eyebrow}</span><h2 id={`${id}-title`}>{c.title}</h2><p>{c.intro}</p></div><span className="energy-estimate">{c.hypothesis}</span></header>
    <p className="energy-site">{formatNumber(site.latitude, 4)}°, {formatNumber(site.longitude, 4)}° <span>·</span> {site.timeZone}</p>
    {readOnly && <p className="energy-readonly">{c.readonly}</p>}
    <div className="energy-kpis" aria-label={c.tabs}>
      <Metric label={c.installed} value={formatNumber(annual.capacityKwp, 2)} unit="kWp" />
      <Metric label={c.generation} value={formatNumber(annual.annualKwh)} unit="kWh" />
      <Metric label={c.savings} value={money(finance.annualNetSavings)} />
      <Metric label={c.payback} value={payback} />
    </div>
    {installation.panelCount === 0 && <p className="energy-note">{c.zero}</p>}
    {installedPanelCount !== undefined && installedPanelCount < value.installation.panelCount && <p className="energy-note" role="status">{c.capacityLimited}</p>}
    <div className="energy-tabs" role="tablist" aria-label={c.tabs}>{studyTabs.map(item => <button key={item} id={`${id}-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`${id}-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={navigateTabs}>{c[item]}</button>)}</div>
    <div className="energy-panel" id={`${id}-panel-${tab}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}>
      <div className="energy-panel-heading"><h3>{title}</h3><p>{intro}</p></div>
      {tab === 'day' && <>
        <div className="energy-day-controls">
          {onDateChange && <div className="energy-field"><label htmlFor={`${id}-date`}>{c.date}</label><input type="date" id={`${id}-date`} value={date} min="1900-01-01" max="2100-12-31" onChange={event => { if (event.target.validity.valid && /^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDateChange(event.target.value) }} /></div>}
          <div className="energy-clock"><label htmlFor={`${id}-time`}>{c.time} <strong>{clockLabel(minutes)}</strong></label>{onTimeChange ? <input id={`${id}-time`} type="range" min={0} max={1439} value={minutes} onChange={event => onTimeChange(Number(event.target.value))} aria-valuetext={clockLabel(minutes)} /> : <p>{site.timeZone}</p>}</div>
        </div>
        <div className="energy-inline-metrics"><Metric label={c.dayEnergy} value={formatNumber(daily.kwh, 1)} unit="kWh" /><Metric label={c.currentPower} value={formatNumber(current?.powerKw ?? 0, 2)} unit="kW" /><Metric label={c.clearSky} value={formatNumber(daily.clearSkyKwh, 1)} unit="kWh" /></div>
        <div className="energy-legend"><span><i />{c.scenario}</span><span><i className="energy-legend-clear" />{c.clearSky}</span><span>kW</span></div>
        <LineChart points={daily.samples.map(sample => ({ x: sample.minutes, y: sample.powerKw }))} reference={daily.samples.map(sample => ({ x: sample.minutes, y: sample.clearSkyPowerKw }))} marker={minutes} xMax={1440} yMax={dailyYMax} xTicks={[0, 360, 720, 1080, 1440].map(value => ({ value, label: clockLabel(value) }))} formatY={value => formatNumber(value, 1)} area />
        <p className="energy-chart-note">{c.climateLimits}</p>
        <DataTable title={c.chartData} headers={[c.hour, `${c.scenario} (kW)`, `${c.clearSky} (kW)`]} rows={daily.samples.map(sample => [clockLabel(sample.minutes), formatNumber(sample.powerKw, 2), formatNumber(sample.clearSkyPowerKw, 2)])} />
      </>}
      {tab === 'year' && <>
        <div className="energy-inline-metrics"><Metric label={c.generation} value={formatNumber(annual.annualKwh)} unit="kWh" /><Metric label={c.specificYield} value={formatNumber(annual.specificYieldKwhPerKwp)} unit="kWh/kWp" /></div>
        <div className="energy-monthly-chart" aria-hidden="true">{annual.monthly.map(item => <div className="energy-monthly-column" key={item.month}><span>{formatNumber(item.kwh)}</span><div className="energy-monthly-track"><i style={{ height: `${Math.max(item.kwh > 0 ? 1 : 0, item.kwh / monthlyMax * 100)}%` }} /></div><small>{month(item.month)}</small></div>)}</div>
        <p className="energy-chart-note">kWh · {climateName}</p>
        <DataTable title={c.chartData} headers={[c.month, `${c.scenario} (kWh)`, `${c.clearSky} (kWh)`]} rows={annual.monthly.map(item => [month(item.month, 'long'), formatNumber(item.kwh, 1), formatNumber(item.clearSkyKwh, 1)])} />
        <details className="energy-assumptions"><summary>{c.climate}</summary><p>{c.climateIntro}</p><p className="energy-source">{effectiveClimateSource === 'regional-demo-2001-2020' ? <a href={REGIONAL_DEMO_CLIMATE.sourceUrl} target="_blank" rel="noreferrer">{climateName}</a> : climateName}</p><fieldset disabled={readOnly} className="energy-fields energy-month-inputs"><legend className="sr-only">{c.climate}</legend>{value.installation.monthlyTransmission.map((factor, index) => <NumberField key={index} label={month(index + 1, 'long')} value={Math.round(factor * 1000) / 10} min={0} max={100} step={0.1} unit="%" onChange={next => updateInstallation({ monthlyTransmission: value.installation.monthlyTransmission.map((item, position) => position === index ? next / 100 : item), climateSource: 'custom' })} />)}</fieldset></details>
      </>}
      {tab === 'panels' && <>
        {installedPanelCount !== undefined && <div className="energy-roof-summary"><span>{c.requested}<strong>{formatNumber(value.installation.panelCount)}</strong></span><span>{c.fitted}<strong>{formatNumber(installedPanelCount)}</strong></span>{panelCapacity !== undefined && <span>{c.capacity}<strong>{formatNumber(panelCapacity)}</strong></span>}</div>}
        <fieldset disabled={readOnly} className="energy-fields"><legend className="sr-only">{c.panelsTitle}</legend>
          <NumberField label={c.count} value={value.installation.panelCount} max={1000} onChange={panelCount => updateInstallation({ panelCount })} />
          <NumberField label={c.panelPower} value={value.installation.panelWattPeak} min={1} max={1000} unit="Wp" onChange={panelWattPeak => updateInstallation({ panelWattPeak })} />
          <NumberField label={c.tilt} value={value.installation.tiltDeg} max={90} unit="°" onChange={tiltDeg => updateInstallation({ tiltDeg })} />
          <NumberField label={c.azimuth} value={value.installation.azimuthDeg} max={360} unit="°" hint={c.azimuthHelp} onChange={azimuthDeg => updateInstallation({ azimuthDeg })} />
          <NumberField label={c.inverter} value={value.installation.inverterKw} min={0} max={1000} step={0.1} unit="kW" onChange={inverterKw => updateInstallation({ inverterKw })} />
          <NumberField label={c.losses} value={value.installation.systemLossPct} max={100} step={0.1} unit="%" hint={c.lossesHelp} onChange={systemLossPct => updateInstallation({ systemLossPct })} />
          <NumberField label={c.shade} value={value.installation.shadingLossPct} max={100} step={0.1} unit="%" hint={c.shadeHelp} onChange={shadingLossPct => updateInstallation({ shadingLossPct })} />
        </fieldset><p className="energy-chart-note">{c.capacityNote}</p>
      </>}
      {tab === 'bill' && <div className="energy-two-column">
        <fieldset disabled={readOnly} className="energy-fields"><legend className="sr-only">{c.billTitle}</legend>
          {field('annualConsumptionKwh', c.annualConsumption, 'kWh', 100000000)}
          {field('selfConsumptionPct', c.selfConsumption, '%', 100, 1, c.selfConsumptionHelp)}
          {field('importTariffPerKwh', c.importTariff, `${value.currency}/kWh`, 10000, 0.001)}
          {field('exportTariffPerKwh', c.exportTariff, `${value.currency}/kWh`, 10000, 0.001)}
          <div className="energy-field"><label htmlFor={`${id}-currency`}>{c.currency}</label><select id={`${id}-currency`} value={value.currency} onChange={event => onChange({ ...value, currency: event.target.value as BuildingEnergy['currency'] })}>{['EUR', 'USD', 'ARS', 'GBP'].map(currency => <option key={currency}>{currency}</option>)}</select><small>{c.monetary}</small></div>
        </fieldset>
        <div className="energy-balance"><h4>{c.allocation}</h4><div className="energy-energy-bar" aria-hidden="true"><span style={{ width: `${annual.annualKwh > 0 ? finance.selfConsumedKwh / annual.annualKwh * 100 : 0}%` }} /></div><dl><div><dt>{c.usedOnSite}</dt><dd>{formatNumber(finance.selfConsumedKwh)} kWh</dd></div><div><dt>{c.exported}</dt><dd>{formatNumber(finance.exportedKwh)} kWh</dd></div><div><dt>{c.imported}</dt><dd>{formatNumber(finance.importedKwh)} kWh</dd></div><div><dt>{c.consumptionCoverage}</dt><dd>{formatNumber(coverage, 1)}%</dd></div><div><dt>{c.avoidedCost}</dt><dd>{money(finance.avoidedImportCost)}</dd></div><div><dt>{c.exportIncome}</dt><dd>{money(finance.exportRevenue)}</dd></div></dl><p>{c.buildingScope}</p></div>
      </div>}
      {tab === 'investment' && <>
        <fieldset disabled={readOnly} className="energy-fields energy-investment-fields"><legend className="sr-only">{c.investmentTitle}</legend>
          {field('capex', c.capex, value.currency, 1000000000)}
          {field('incentive', c.incentive, value.currency, 1000000000)}
          {field('annualMaintenance', c.maintenance, value.currency, 1000000000)}
          {field('degradationPct', c.degradation, '%', 100, 0.1)}
          {field('discountRatePct', c.discount, '%', 100, 0.1)}
          {field('horizonYears', c.horizon, c.years, 50, 1, undefined, 1)}
        </fieldset>
        <div className="energy-inline-metrics energy-financial-metrics"><Metric label={c.netInvestment} value={money(finance.netInvestment)} /><Metric label={c.npv} value={money(finance.npv)} /><Metric label={c.netReturn} value={money(finance.totalNetSavings)} /></div>
        <h4 className="energy-chart-title">{c.cashflow} <span>({value.currency})</span></h4>
        <LineChart points={cashPoints} xMax={value.finance.horizonYears} yMin={cashMin * 1.08} yMax={cashMax * 1.08} xTicks={Array.from({ length: 6 }, (_, index) => Math.round(value.finance.horizonYears * index / 5)).filter((item, index, items) => items.indexOf(item) === index).map(item => ({ value: item, label: String(item) }))} formatY={value => new Intl.NumberFormat(formattingLocales[locale], { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
        <p className="energy-chart-note">{c.investmentHelp}</p>
        <DataTable title={c.chartData} headers={[c.studyYear, c.annualCash, c.cumulativeCash, c.discountedCash]} rows={[[0, money(-finance.netInvestment), money(-finance.netInvestment), money(-finance.netInvestment)], ...finance.cashflows.filter(item => item.year > 0).map(item => [item.year, money(item.netCashflow), money(item.cumulativeCashflow), money(item.discountedCashflow)])]} />
      </>}
    </div>
    <details className="energy-methodology"><summary>{c.assumptions}</summary><p>{c.methodology}</p><p>{c.climateLimits}</p><p>{c.limits}</p></details>
  </section>
}
