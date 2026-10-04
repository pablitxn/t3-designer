import { getSolarDay, getSolarPosition, type SolarPosition } from '../lib/solar.ts'
import { SolarInstallationSchema, type EnergySite, type SolarInstallation } from './model.ts'

const RAD = Math.PI / 180
const HOUR_MS = 3_600_000
const ANNUAL_STEP_HOURS = 0.5
const GROUND_ALBEDO = 0.2

export type MonthlyGeneration = { month: number; kwh: number; clearSkyKwh: number }
export type AnnualGeneration = {
  year: number
  capacityKwp: number
  annualKwh: number
  clearSkyAnnualKwh: number
  specificYieldKwhPerKwp: number
  monthly: MonthlyGeneration[]
}
export type GenerationSample = {
  date: string
  minutes: number
  powerKw: number
  clearSkyPowerKw: number
  altitudeDeg: number
}
export type DailyGeneration = { date: string; kwh: number; clearSkyKwh: number; samples: GenerationSample[] }

function validateSite(site: EnergySite) {
  if (!Number.isFinite(site.latitude) || Math.abs(site.latitude) > 90
    || !Number.isFinite(site.longitude) || Math.abs(site.longitude) > 180) {
    throw new RangeError('Latitude must be in [-90, 90] and longitude in [-180, 180].')
  }
  if (!site.timeZone) throw new RangeError('An explicit site time zone is required.')
  // Validate even though annual integration uses local solar time.
  new Intl.DateTimeFormat('en', { timeZone: site.timeZone })
}

/** X east, Y up, Z south. A horizontal module has no directional preference. */
export function panelNormal(tiltDeg: number, azimuthDeg: number): [number, number, number] {
  if (!Number.isFinite(tiltDeg) || tiltDeg < 0 || tiltDeg > 90
    || !Number.isFinite(azimuthDeg) || azimuthDeg < 0 || azimuthDeg > 360) {
    throw new RangeError('Panel tilt must be in [0, 90] and azimuth in [0, 360].')
  }
  const tilt = tiltDeg * RAD
  const azimuth = azimuthDeg * RAD
  return [Math.sin(tilt) * Math.sin(azimuth), Math.cos(tilt), -Math.sin(tilt) * Math.cos(azimuth)]
}

/** Haurwitz clear-sky global horizontal radiation, W/m². Geometric altitude is
 * used consistently with the viewer; no atmospheric refraction is fabricated.
 */
export function clearSkyHorizontalIrradiance(altitudeDeg: number) {
  if (!Number.isFinite(altitudeDeg) || Math.abs(altitudeDeg) > 90) {
    throw new RangeError('Solar altitude must be in [-90, 90].')
  }
  const sineAltitude = Math.sin(altitudeDeg * RAD)
  return sineAltitude > 0 ? 1098 * sineAltitude * Math.exp(-0.059 / sineAltitude) : 0
}

/** Erbs hourly correlation (1982), GHI/extraterrestrial-horizontal clearness. */
export function erbsDiffuseFraction(clearnessIndex: number) {
  if (!Number.isFinite(clearnessIndex) || clearnessIndex < 0) throw new RangeError('Clearness index must be finite and nonnegative.')
  const kt = Math.min(1, clearnessIndex)
  if (kt <= 0.22) return 1 - 0.09 * kt
  if (kt <= 0.8) return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4
  return 0.165
}

function extraterrestrialNormal(date: Date) {
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
  const angle = 2 * Math.PI * (dayOfYear - 1) / 365
  // Spencer Earth-Sun-distance correction with the pvlib solar constant.
  return 1366.1 * (1.00011 + 0.034221 * Math.cos(angle) + 0.00128 * Math.sin(angle)
    + 0.000719 * Math.cos(2 * angle) + 0.000077 * Math.sin(2 * angle))
}

type IrradianceSun = SolarPosition & { extraterrestrialNormal: number }

function irradianceOnPanel(sun: IrradianceSun, normal: [number, number, number], tiltDeg: number, transmission: number) {
  if (!sun.isDaylight) return 0
  const horizontal = clearSkyHorizontalIrradiance(sun.altitude) * transmission
  const clearnessIndex = horizontal / (sun.extraterrestrialNormal * Math.max(0.065, sun.direction[1]))
  const diffuse = sun.altitude <= 3 ? horizontal : horizontal * erbsDiffuseFraction(clearnessIndex)
  const directNormal = (horizontal - diffuse) / sun.direction[1]
  const incidence = Math.max(0, sun.direction.reduce((sum, coordinate, index) => sum + coordinate * normal[index], 0))
  const cosineTilt = Math.cos(tiltDeg * RAD)
  return directNormal * incidence
    + diffuse * (1 + cosineTilt) / 2
    + horizontal * GROUND_ALBEDO * (1 - cosineTilt) / 2
}

function powerCalculator(installation: SolarInstallation) {
  const normal = panelNormal(installation.tiltDeg, installation.azimuthDeg)
  const capacityKwp = installation.panelCount * installation.panelWattPeak / 1000
  // Losses apply multiplicatively once. The aggregate system allowance includes
  // electrical/conversion losses; there is no second hidden inverter efficiency.
  const performance = (1 - installation.systemLossPct / 100) * (1 - installation.shadingLossPct / 100)
  return (sun: IrradianceSun, month: number) => {
    const unboundedClearPower = capacityKwp * irradianceOnPanel(sun, normal, installation.tiltDeg, 1) / 1000 * performance
    const unboundedPower = capacityKwp * irradianceOnPanel(sun, normal, installation.tiltDeg, installation.monthlyTransmission[month - 1]) / 1000 * performance
    return {
      clearSkyPowerKw: Math.min(installation.inverterKw, unboundedClearPower),
      // Attenuate irradiation BEFORE clipping. Multiplying already clipped AC
      // energy by the cloud factor would incorrectly lose usable cloudy energy.
      powerKw: Math.min(installation.inverterKw, unboundedPower),
    }
  }
}

type AnnualSolarGeometry = IrradianceSun[][]
const geometryCache = new Map<string, AnnualSolarGeometry>()

function annualSolarGeometry(site: EnergySite, year: number): AnnualSolarGeometry {
  const key = `${site.latitude}/${site.longitude}/${year}`
  const cached = geometryCache.get(key)
  if (cached) return cached
  const geometry: AnnualSolarGeometry = []
  for (let month = 0; month < 12; month++) {
    const positions: IrradianceSun[] = []
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let day = 1; day <= days; day++) {
      // Integrate each local mean solar day, independent of legal clock/DST.
      // Solar midnight is 00:00 UTC minus longitude/15; equation of time is
      // already applied by getSolarPosition. Midpoint integration uses all days.
      const midnight = Date.UTC(year, month, day) - site.longitude / 15 * HOUR_MS
      for (let hours = ANNUAL_STEP_HOURS / 2; hours < 24; hours += ANNUAL_STEP_HOURS) {
        const instant = new Date(midnight + hours * HOUR_MS)
        positions.push({ ...getSolarPosition(instant, site.latitude, site.longitude), extraterrestrialNormal: extraterrestrialNormal(instant) })
      }
    }
    geometry.push(positions)
  }
  if (geometryCache.size >= 3) geometryCache.delete(geometryCache.keys().next().value!)
  geometryCache.set(key, geometry)
  return geometry
}

/** Offline scenario, not a weather forecast or a surveyed rooftop yield.
 * Callers must pass the number actually fitted by the roof layout.
 */
export function getAnnualGeneration(site: EnergySite, input: SolarInstallation, year = 2026): AnnualGeneration {
  validateSite(site)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new RangeError('Choose a year from 1900 through 2100.')
  }
  const installation = SolarInstallationSchema.parse(input)
  const capacityKwp = installation.panelCount * installation.panelWattPeak / 1000
  const powerAt = powerCalculator(installation)
  const monthly = capacityKwp === 0 || installation.inverterKw === 0
    ? Array.from({ length: 12 }, (_, index) => ({ month: index + 1, kwh: 0, clearSkyKwh: 0 }))
    : annualSolarGeometry(site, year).map((positions, index) => {
      let kwh = 0
      let clearSkyKwh = 0
      for (const sun of positions) {
        const power = powerAt(sun, index + 1)
        kwh += power.powerKw * ANNUAL_STEP_HOURS
        clearSkyKwh += power.clearSkyPowerKw * ANNUAL_STEP_HOURS
      }
      return { month: index + 1, kwh, clearSkyKwh }
    })
  const annualKwh = monthly.reduce((sum, month) => sum + month.kwh, 0)
  return {
    year, capacityKwp, annualKwh, monthly,
    clearSkyAnnualKwh: monthly.reduce((sum, month) => sum + month.clearSkyKwh, 0),
    specificYieldKwhPerKwp: capacityKwp > 0 ? annualKwh / capacityKwp : 0,
  }
}

/** Ten-minute samples use actual local instants, retaining 23/25-hour DST days. */
export function getDailyGeneration(site: EnergySite, input: SolarInstallation, date: string): DailyGeneration {
  validateSite(site)
  const installation = SolarInstallationSchema.parse(input)
  const month = Number(date.slice(5, 7))
  const powerAt = powerCalculator(installation)
  const day = getSolarDay(date, site.latitude, site.longitude, site.timeZone)
  const samples = day.path.map(sun => ({
    date: sun.date.toISOString(), minutes: sun.minutes, altitudeDeg: sun.altitude,
    ...powerAt({ ...sun, extraterrestrialNormal: extraterrestrialNormal(sun.date) }, month),
  }))
  return {
    date, samples,
    kwh: samples.reduce((sum, sample) => sum + sample.powerKw / 6, 0),
    clearSkyKwh: samples.reduce((sum, sample) => sum + sample.clearSkyPowerKw / 6, 0),
  }
}
