import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalDate, getLocalMinutes, getSolarDay, getSolarPosition, localDateTimeToDate, resolveLocalDateTime } from '../src/lib/solar.ts'

const REGIONAL_DEMO = { latitude: 48, longitude: -4 }
const closeTo = (actual: number, expected: number, tolerance: number) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be within ${tolerance} of ${expected}`)

test('solar direction agrees with the published NREL SPA example', () => {
  // Independent reference: https://midcdmz.nlr.gov/spa/spa_tester.c
  // The reference includes atmospheric refraction and observer elevation;
  // this geometric NOAA model intentionally omits them (comparison tolerance 0.1°).
  const position = getSolarPosition(new Date('2003-10-17T19:30:30Z'), 39.742476, -105.1786)
  closeTo(position.azimuth, 194.340241, 0.1)
  closeTo(position.altitude, 90 - 50.111622, 0.1)
  closeTo(Math.hypot(...position.direction), 1, 1e-12)
  assert.ok(position.direction[0] < 0, 'afternoon sunlight comes from west')
  assert.ok(position.direction[2] > 0, 'the sun is south of this northern observer')
})

test('sunrise and sunset agree with the independent NREL example within two minutes', () => {
  const day = getSolarDay('2003-10-17', 39.742476, -105.1786, 'Etc/GMT+7')
  assert.ok(day.sunrise && day.sunset)
  closeTo(day.sunrise.getTime(), new Date('2003-10-17T13:12:43Z').getTime(), 120_000)
  closeTo(day.sunset.getTime(), new Date('2003-10-18T00:20:19Z').getTime(), 120_000)
})

test('Paris winter and summer clock selections resolve independently of the host timezone', () => {
  assert.equal(localDateTimeToDate('2026-01-15', 12 * 60).toISOString(), '2026-01-15T11:00:00.000Z')
  assert.equal(localDateTimeToDate('2026-07-15', 12 * 60).toISOString(), '2026-07-15T10:00:00.000Z')
  assert.equal(getLocalDate(new Date('2026-07-14T22:30:00Z')), '2026-07-15')
  assert.equal(getLocalMinutes(new Date('2026-07-14T22:30:00Z')), 30)
  assert.equal(localDateTimeToDate('2024-02-29', 0).toISOString(), '2024-02-28T23:00:00.000Z')
})

test('spring clock-change gaps are rejected instead of silently changing the selected time', () => {
  assert.deepEqual(resolveLocalDateTime('2026-03-29', 150), { status: 'nonexistent', instants: [] })
  assert.throws(() => localDateTimeToDate('2026-03-29', 150), /does not exist/)
  assert.equal(localDateTimeToDate('2026-03-29', 119).toISOString(), '2026-03-29T00:59:00.000Z')
  assert.equal(localDateTimeToDate('2026-03-29', 180).toISOString(), '2026-03-29T01:00:00.000Z')
})

test('autumn repeated times expose both instants and require a deliberate choice', () => {
  const resolution = resolveLocalDateTime('2026-10-25', 150)
  assert.equal(resolution.status, 'ambiguous')
  assert.deepEqual(resolution.instants.map(date => date.toISOString()), ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
  assert.throws(() => localDateTimeToDate('2026-10-25', 150), /occurs twice/)
  assert.equal(localDateTimeToDate('2026-10-25', 150, 'Europe/Paris', 'later').toISOString(), '2026-10-25T01:30:00.000Z')
})

test('daily paths preserve the real 23 and 25 hour days around DST', () => {
  const spring = getSolarDay('2026-03-29', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const autumn = getSolarDay('2026-10-25', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  assert.equal(spring.path.length, 23 * 6)
  assert.equal(autumn.path.length, 25 * 6)
  assert.equal(spring.path.filter(point => point.minutes >= 120 && point.minutes < 180).length, 0)
  assert.equal(autumn.path.filter(point => point.minutes === 150).length, 2)
})

test('Regional demo seasons produce longer summer days and a higher midday sun', () => {
  const summer = getSolarDay('2026-06-21', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const winter = getSolarDay('2026-12-21', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const summerNoon = getSolarPosition(summer.solarNoon, REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const winterNoon = getSolarPosition(winter.solarNoon, REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  closeTo(summerNoon.altitude, 65.44, 0.15)
  closeTo(winterNoon.altitude, 18.56, 0.15)
  closeTo(summerNoon.azimuth, 180, 0.01)
  assert.ok(summer.daylightMinutes > 960 && summer.daylightMinutes < 1000)
  assert.ok(winter.daylightMinutes > 480 && winter.daylightMinutes < 520)
  assert.ok(summer.sunrise && summer.sunset && winter.sunrise && winter.sunset)
  const morning = getSolarPosition(localDateTimeToDate('2026-06-21', 9 * 60), REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const evening = getSolarPosition(localDateTimeToDate('2026-06-21', 19 * 60), REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  const night = getSolarPosition(localDateTimeToDate('2026-06-21', 2 * 60), REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  assert.ok(morning.direction[0] > 0 && evening.direction[0] < 0)
  assert.equal(night.isDaylight, false)
  assert.ok(night.direction[1] < 0)
})

test('polar days and nights have no fabricated rise or set events', () => {
  const summer = getSolarDay('2026-06-21', 80, 0, 'UTC')
  const winter = getSolarDay('2026-12-21', 80, 0, 'UTC')
  assert.equal(summer.sunrise, null)
  assert.equal(summer.sunset, null)
  assert.equal(summer.daylightMinutes, 1440)
  assert.equal(winter.sunrise, null)
  assert.equal(winter.sunset, null)
  assert.equal(winter.daylightMinutes, 0)
})

test('the last supported calendar day can compute its complete local path', () => {
  const day = getSolarDay('2100-12-31', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  assert.equal(day.path.length, 144)
  assert.equal(getLocalDate(day.path.at(-1)!.date), '2100-12-31')
  assert.ok(day.sunrise && day.sunset)
})

test('historical French transitions at the end of the day do not fabricate 23:59', () => {
  const day = getSolarDay('1916-06-14', REGIONAL_DEMO.latitude, REGIONAL_DEMO.longitude)
  assert.equal(resolveLocalDateTime('1916-06-14', 1439).status, 'nonexistent')
  assert.equal(day.path.length, 138)
  assert.equal(getLocalMinutes(day.path.at(-1)!.date), 22 * 60 + 50)
  assert.ok(day.sunrise && day.sunset)
})

test('invalid dates, clock values and coordinates never yield misleading NaN geometry', () => {
  assert.throws(() => localDateTimeToDate('2026-02-30', 720), /Invalid calendar date/)
  assert.throws(() => localDateTimeToDate('2026-02-15', 1440), /Clock minutes/)
  assert.throws(() => localDateTimeToDate('2026-02-15', 2.5), /Clock minutes/)
  assert.throws(() => getSolarPosition(new Date('invalid'), 48, -4), /Invalid date/)
  assert.throws(() => getSolarPosition(new Date(), 91, -4), /Latitude/)
  assert.throws(() => getSolarPosition(new Date(), 48, NaN), /Latitude/)
})
