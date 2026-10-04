/** Solar geometry: NOAA/Meeus equations, with east-positive longitude.
 * See docs/model/solar-model.md for sources, coordinate conventions and limitations.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Paris'

const RAD = Math.PI / 180
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const APPARENT_HORIZON = -0.833
const modulo = (value: number, period: number) => ((value % period) + period) % period

export type SolarPosition = {
  /** Geometric elevation of the sun's centre above a level horizon, in degrees. */
  altitude: number
  /** Clockwise from true north, in degrees: N=0, E=90, S=180, W=270. */
  azimuth: number
  /** Unit vector pointing TO the sun: x=east, y=up, z=south. */
  direction: [number, number, number]
  /** Direct light is off when the sun's centre is below the geometric horizon. */
  isDaylight: boolean
}

export type LocalDateTimeResolution = {
  status: 'exact' | 'ambiguous' | 'nonexistent'
  /** UTC instants in ascending order. Empty during the spring clock-change gap. */
  instants: Date[]
}

export type SolarPathPoint = SolarPosition & { date: Date; minutes: number }

export type SolarDay = {
  sunrise: Date | null
  sunset: Date | null
  solarNoon: Date
  /** Duration between apparent horizon crossings, including atmospheric allowance. */
  daylightMinutes: number
  /** Samples in chronological order; clock minutes may repeat on the autumn change. */
  path: SolarPathPoint[]
}

function validateCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError('Latitude must be in [-90, 90] and longitude in [-180, 180].')
  }
}

function validateInstant(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date.')
}

/** The declination and equation of time vary with the actual UTC instant. */
function solarCoordinates(timestamp: number) {
  const century = (timestamp / DAY_MS + 2440587.5 - 2451545) / 36525
  const meanLongitude = modulo(280.46646 + century * (36000.76983 + century * 0.0003032), 360) * RAD
  const meanAnomaly = (357.52911 + century * (35999.05029 - century * 0.0001537)) * RAD
  const eccentricity = 0.016708634 - century * (0.000042037 + century * 0.0000001267)
  const centre = Math.sin(meanAnomaly) * (1.914602 - century * (0.004817 + century * 0.000014))
    + Math.sin(2 * meanAnomaly) * (0.019993 - century * 0.000101)
    + Math.sin(3 * meanAnomaly) * 0.000289
  const omega = (125.04 - 1934.136 * century) * RAD
  const apparentLongitude = meanLongitude + (centre - 0.00569 - 0.00478 * Math.sin(omega)) * RAD
  const obliquitySeconds = 21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))
  const obliquity = (23 + (26 + obliquitySeconds / 60) / 60 + 0.00256 * Math.cos(omega)) * RAD
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude))
  const y = Math.tan(obliquity / 2) ** 2
  const equationOfTime = 4 / RAD * (y * Math.sin(2 * meanLongitude)
    - 2 * eccentricity * Math.sin(meanAnomaly)
    + 4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * meanLongitude)
    - 0.5 * y * y * Math.sin(4 * meanLongitude)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly))
  return { declination, equationOfTime }
}

export function getSolarPosition(date: Date, latitude: number, longitude: number): SolarPosition {
  validateInstant(date)
  validateCoordinates(latitude, longitude)
  const timestamp = date.getTime()
  const { declination, equationOfTime } = solarCoordinates(timestamp)
  const utcMinutes = modulo(timestamp, DAY_MS) / MINUTE_MS
  const solarMinutes = modulo(utcMinutes + 4 * longitude + equationOfTime, 1440)
  const hourAngle = (solarMinutes / 4 - 180) * RAD
  const lat = latitude * RAD
  // Resolving the horizontal vector directly avoids an acos quadrant ambiguity.
  const east = -Math.cos(declination) * Math.sin(hourAngle)
  const up = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  const south = Math.sin(lat) * Math.cos(declination) * Math.cos(hourAngle) - Math.cos(lat) * Math.sin(declination)
  const altitude = Math.asin(Math.max(-1, Math.min(1, up))) / RAD
  const azimuth = modulo(Math.atan2(east, -south) / RAD, 360)
  return { altitude, azimuth, direction: [east, up, south], isDaylight: altitude > 0 }
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const dayOffsets = new Map<string, number[]>()

function dateFormatter(timeZone: string) {
  let formatter = dateFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    dateFormatters.set(timeZone, formatter)
  }
  return formatter
}

function localParts(date: Date, timeZone: string) {
  const parts = dateFormatter(timeZone).formatToParts(date)
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === name)!.value)
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

function civilDateTimestamp(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Use a date in YYYY-MM-DD format.')
  const timestamp = new Date(`${date}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid calendar date.')
  }
  // These bounds cover the intended contemporary planning use, including leap years.
  if (date < '1900-01-01' || date > '2100-12-31') throw new RangeError('Choose a year from 1900 through 2100.')
  return timestamp
}

export function getLocalDate(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  validateInstant(date)
  const parts = localParts(date, timeZone)
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`
}

export function getLocalMinutes(date: Date, timeZone = DEFAULT_TIME_ZONE): number {
  validateInstant(date)
  const parts = localParts(date, timeZone)
  return parts.hour * 60 + parts.minute
}

/** Resolve a wall-clock selection without silently changing a missing/repeated time. */
function resolveWallTime(dateTimestamp: number, minutes: number, timeZone: string): LocalDateTimeResolution {
  const date = new Date(dateTimestamp).toISOString().slice(0, 10)
  const key = `${timeZone}/${date}`
  let offsets = dayOffsets.get(key)
  if (!offsets) {
    const candidates = new Set<number>()
    // Collect offsets on both sides of a transition. Intl provides the browser's
    // IANA rules, including historic changes; there is no hard-coded CET offset.
    for (let hours = -36; hours <= 36; hours += 6) {
      const timestamp = dateTimestamp + hours * 60 * MINUTE_MS
      const parts = localParts(new Date(timestamp), timeZone)
      candidates.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp)
    }
    offsets = [...candidates]
    if (dayOffsets.size >= 64) dayOffsets.delete(dayOffsets.keys().next().value!)
    dayOffsets.set(key, offsets)
  }
  const wallTimestamp = dateTimestamp + minutes * MINUTE_MS
  const instants = offsets.map(offset => new Date(wallTimestamp - offset))
    .filter(instant => getLocalDate(instant, timeZone) === date && getLocalMinutes(instant, timeZone) === minutes)
    .sort((a, b) => a.getTime() - b.getTime())
  return { status: instants.length === 0 ? 'nonexistent' : instants.length === 1 ? 'exact' : 'ambiguous', instants }
}

export function resolveLocalDateTime(date: string, minutes: number, timeZone = DEFAULT_TIME_ZONE): LocalDateTimeResolution {
  const dateTimestamp = civilDateTimestamp(date)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) {
    throw new RangeError('Clock minutes must be an integer from 0 through 1439.')
  }
  return resolveWallTime(dateTimestamp, minutes, timeZone)
}

export function localDateTimeToDate(
  date: string,
  minutes: number,
  timeZone = DEFAULT_TIME_ZONE,
  disambiguation: 'earlier' | 'later' | 'reject' = 'reject',
): Date {
  const resolution = resolveLocalDateTime(date, minutes, timeZone)
  if (resolution.status === 'nonexistent') throw new RangeError('This local time does not exist because the clocks move forward.')
  if (resolution.status === 'ambiguous' && disambiguation === 'reject') {
    throw new RangeError('This local time occurs twice; choose the earlier or later occurrence.')
  }
  return resolution.instants[disambiguation === 'later' ? resolution.instants.length - 1 : 0]
}

function refineHorizonCrossing(start: number, end: number, latitude: number, longitude: number) {
  const startAbove = getSolarPosition(new Date(start), latitude, longitude).altitude > APPARENT_HORIZON
  while (end - start > 500) {
    const middle = (start + end) / 2
    const middleAbove = getSolarPosition(new Date(middle), latitude, longitude).altitude > APPARENT_HORIZON
    if (middleAbove === startAbove) start = middle
    else end = middle
  }
  return new Date((start + end) / 2)
}

function startOfCivilDay(civilTimestamp: number, timeZone: string): number {
  // Historical transitions can remove midnight or the last hour of a day.
  // Resolve the next day's first valid instant instead of assuming 23:59 exists.
  // The internal resolver also permits the boundary immediately after 2100-12-31.
  for (let minute = 0; minute < 1440; minute++) {
    const first = resolveWallTime(civilTimestamp, minute, timeZone).instants[0]
    if (first) return first.getTime()
  }
  throw new RangeError('This calendar day does not exist in the selected time zone.')
}

/** Daily events use a level, unobstructed horizon; buildings only affect rendered shadows. */
export function getSolarDay(date: string, latitude: number, longitude: number, timeZone = DEFAULT_TIME_ZONE): SolarDay {
  validateCoordinates(latitude, longitude)
  const civilTimestamp = civilDateTimestamp(date)
  const start = startOfCivilDay(civilTimestamp, timeZone)
  const end = startOfCivilDay(civilTimestamp + DAY_MS, timeZone)
  let sunrise: Date | null = null
  let sunset: Date | null = null
  let above = getSolarPosition(new Date(start), latitude, longitude).altitude > APPARENT_HORIZON
  let daylightStart = above ? start : null
  let daylightDuration = 0

  for (let timestamp = start + 5 * MINUTE_MS; timestamp <= end; timestamp = Math.min(timestamp + 5 * MINUTE_MS, end)) {
    const nextAbove = getSolarPosition(new Date(timestamp), latitude, longitude).altitude > APPARENT_HORIZON
    if (nextAbove !== above) {
      const crossing = refineHorizonCrossing(timestamp - 5 * MINUTE_MS, timestamp, latitude, longitude)
      if (nextAbove) {
        sunrise = crossing
        daylightStart = crossing.getTime()
      } else {
        sunset = crossing
        daylightDuration += crossing.getTime() - (daylightStart ?? start)
        daylightStart = null
      }
      above = nextAbove
    }
    if (timestamp === end) break
  }
  if (daylightStart !== null) daylightDuration += end - daylightStart

  // At solar noon, the local hour angle is zero. Iterate as the equation of
  // time itself changes slightly during the day, then align to the civil day.
  let noonBase = civilTimestamp
  let solarNoonTimestamp = noonBase + 12 * 60 * MINUTE_MS
  for (let iteration = 0; iteration < 5; iteration++) {
    solarNoonTimestamp = noonBase + (720 - 4 * longitude - solarCoordinates(solarNoonTimestamp).equationOfTime) * MINUTE_MS
    if (solarNoonTimestamp < start) noonBase += DAY_MS
    else if (solarNoonTimestamp >= end) noonBase -= DAY_MS
  }

  const path: SolarPathPoint[] = []
  for (let timestamp = start; timestamp < end; timestamp += 10 * MINUTE_MS) {
    const instant = new Date(timestamp)
    path.push({ date: instant, minutes: getLocalMinutes(instant, timeZone), ...getSolarPosition(instant, latitude, longitude) })
  }
  return { sunrise, sunset, solarNoon: new Date(solarNoonTimestamp), daylightMinutes: daylightDuration / MINUTE_MS, path }
}
