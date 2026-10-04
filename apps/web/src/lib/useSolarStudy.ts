import { useEffect, useMemo, useState } from 'react'
import { BUILDING_SITE } from '../data/building-site'
import { getLocalDate, getSolarDay, getSolarPosition, resolveLocalDateTime } from './solar'
import { useLocale } from '../i18n/useLocale'

const { latitude, longitude, timeZone } = BUILDING_SITE
type Moment = { date: string; minutes: number; adjusted: boolean }

function clockValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function validMoment(date: string, minutes: number): Moment {
  const requested = Math.min(1439, Math.max(0, Math.round(minutes)))
  let validMinutes = requested
  // Prefer the next valid minute after a clock jump. Some historical French
  // transitions removed the end of the day, so fall back within this same date.
  while (validMinutes < 1440 && resolveLocalDateTime(date, validMinutes, timeZone).status === 'nonexistent') validMinutes++
  if (validMinutes === 1440) {
    validMinutes = requested
    while (validMinutes > 0 && resolveLocalDateTime(date, validMinutes, timeZone).status === 'nonexistent') validMinutes--
  }
  return { date, minutes: validMinutes, adjusted: validMinutes !== requested }
}

export function useSolarStudy() {
  const { locale, compass } = useLocale()
  const [moment, setMoment] = useState<Moment>(() => ({ date: getLocalDate(new Date(), timeZone), minutes: 14 * 60, adjusted: false }))
  const [playing, setPlaying] = useState(false)
  const resolution = useMemo(() => resolveLocalDateTime(moment.date, moment.minutes, timeZone), [moment.date, moment.minutes])
  const instant = resolution.instants[0]
  const sun = useMemo(() => getSolarPosition(instant, latitude, longitude), [instant])
  const day = useMemo(() => getSolarDay(moment.date, latitude, longitude, timeZone), [moment.date])
  const time = clockValue(moment.minutes)
  const zone = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(instant).find(part => part.type === 'timeZoneName')?.value
  const bearing = compass(sun.azimuth)
  const daylightMinutes = Math.round(day.daylightMinutes)
  const daylightHours = Math.floor(daylightMinutes / 60)
  const daylightRemainder = daylightMinutes % 60

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setMoment(previous => {
        const requested = (previous.minutes + 12) % 1440
        const next = validMoment(previous.date, requested)
        // A historical clock jump may remove the day's final hour. Loop from
        // its last valid instant rather than getting stuck on the fallback.
        return requested > previous.minutes && next.minutes <= previous.minutes
          ? validMoment(previous.date, 0)
          : next
      })
    }, 200)
    return () => window.clearInterval(timer)
  }, [playing])

  function changeDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    setPlaying(false)
    setMoment(previous => validMoment(date, previous.minutes))
  }

  function changeTime(minutes: number) {
    setPlaying(false)
    setMoment(previous => validMoment(previous.date, minutes))
  }

  return { moment, playing, setPlaying, resolution, instant, sun, day, time, zone, bearing, daylightHours, daylightRemainder, changeDate, changeTime }
}

export type SolarStudy = ReturnType<typeof useSolarStudy>
