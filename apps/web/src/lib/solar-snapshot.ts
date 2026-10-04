import { SolarSnapshotSchema, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { getLocalDate, getLocalMinutes, getSolarDay, getSolarPosition, localDateTimeToDate } from './solar.ts'

export type SolarSelection = { date: string; minutes: number; disambiguation?: 'reject' | 'earlier' | 'later' }

/** No wall-clock time, filesystem, browser state or Blender connection is read.
 * The same inputs always produce the same serialized payload. */
export function buildSiteSolarSnapshot(
  { latitude, longitude, timeZone }: Pick<ProjectSnapshot['site'], 'latitude' | 'longitude' | 'timeZone'>,
  { date, minutes, disambiguation = 'reject' }: SolarSelection,
) {
  const selected = localDateTimeToDate(date, minutes, timeZone, disambiguation)
  const day = getSolarDay(date, latitude, longitude, timeZone)
  const first = day.path[0].date.getTime()
  const samples = []
  // Walk real instants, preserving a missing/repeated civil hour. Do not assume
  // 96 frames or obtain instants by converting each local clock quarter-hour.
  for (let timestamp = first; getLocalDate(new Date(timestamp), timeZone) === date; timestamp += 15 * 60_000) {
    const instant = new Date(timestamp)
    const clockMinutes = getLocalMinutes(instant, timeZone)
    samples.push({
      frame: samples.length + 1,
      minutes: clockMinutes,
      localTime: `${String(Math.floor(clockMinutes / 60)).padStart(2, '0')}:${String(clockMinutes % 60).padStart(2, '0')}`,
      utc: instant.toISOString(),
      elapsedMinutes: (timestamp - first) / 60_000,
      ...getSolarPosition(instant, latitude, longitude),
    })
  }
  const nearest = samples.reduce((best, sample) =>
    Math.abs(Date.parse(sample.utc) - selected.getTime()) < Math.abs(Date.parse(best.utc) - selected.getTime()) ? sample : best)
  return SolarSnapshotSchema.parse({
    date, timeZone, source: 'apps/web/src/lib/solar.ts NOAA/Meeus',
    selected: { minutes, disambiguation, utc: selected.toISOString(), ...getSolarPosition(selected, latitude, longitude) },
    sampleIntervalMinutes: 15,
    // Compatibility for timeline adapters. Exact non-quarter-hour selection is
    // retained above; the default timeline frame is the closest existing sample.
    defaultFrame: nearest.frame,
    samples,
    sunrise: day.sunrise?.toISOString() ?? null,
    sunset: day.sunset?.toISOString() ?? null,
    solarNoon: day.solarNoon.toISOString(),
    daylightMinutes: day.daylightMinutes,
  })
}

