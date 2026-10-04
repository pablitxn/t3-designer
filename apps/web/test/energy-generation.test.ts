import assert from 'node:assert/strict'
import test from 'node:test'
import { SolarInstallationSchema } from '../src/energy/model.ts'
import { createDefaultBuildingEnergy, getEffectiveClimateSource, REGIONAL_DEMO_CLIMATE, REGIONAL_DEMO_MONTHLY_TRANSMISSION } from '../src/energy/model.ts'
import { clearSkyHorizontalIrradiance, erbsDiffuseFraction, getAnnualGeneration, getDailyGeneration, panelNormal } from '../src/energy/generation.ts'

const site = { latitude: REGIONAL_DEMO_CLIMATE.latitude, longitude: REGIONAL_DEMO_CLIMATE.longitude, timeZone: 'Europe/Paris' }
const defaults = createDefaultBuildingEnergy('building', site.latitude, site.longitude).installation
const clear = { ...defaults, monthlyTransmission: Array<number>(12).fill(1), climateSource: 'custom' as const }
const close = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} should be within ${tolerance} of ${b}`)

test('Haurwitz horizontal radiation agrees with its published equation and is zero below the horizon', () => {
  close(clearSkyHorizontalIrradiance(90), 1098 * Math.exp(-0.059))
  close(clearSkyHorizontalIrradiance(30), 549 * Math.exp(-0.118))
  assert.equal(clearSkyHorizontalIrradiance(0), 0)
  assert.equal(clearSkyHorizontalIrradiance(-30), 0)
  assert.throws(() => clearSkyHorizontalIrradiance(NaN), RangeError)
})

test('panel normals use the same true-north site axes as the existing solar model', () => {
  close(panelNormal(90, 90)[0], 1)
  close(panelNormal(90, 180)[2], 1)
  close(panelNormal(90, 0)[2], -1)
  close(panelNormal(0, 67)[1], 1)
  close(Math.hypot(...panelNormal(34, 172)), 1)
  assert.throws(() => panelNormal(91, 180), RangeError)
})

test('Erbs increases the diffuse share under cloudy skies instead of retaining clear-sky tilt gain', () => {
  close(erbsDiffuseFraction(0.1), 0.991)
  close(erbsDiffuseFraction(0.5), 0.65915)
  close(erbsDiffuseFraction(0.9), 0.165)
  assert.ok(erbsDiffuseFraction(0.4) > erbsDiffuseFraction(0.7))
  assert.throws(() => erbsDiffuseFraction(NaN), RangeError)
})

test('cloud scenario, shading and aggregate loss are applied once before inverter clipping', () => {
  const unclipped = { ...clear, tiltDeg: 0, inverterKw: 1000, systemLossPct: 0, shadingLossPct: 0 }
  const baseline = getDailyGeneration(site, unclipped, '2026-06-21')
  const half = getDailyGeneration(site, { ...unclipped, monthlyTransmission: Array<number>(12).fill(0.5) }, '2026-06-21')
  close(half.kwh, baseline.kwh / 2)
  const losses = getDailyGeneration(site, { ...unclipped, systemLossPct: 20, shadingLossPct: 25 }, '2026-06-21')
  close(losses.kwh, baseline.kwh * 0.8 * 0.75)
  const clipped = getDailyGeneration(site, { ...unclipped, inverterKw: 1, monthlyTransmission: Array<number>(12).fill(0.5) }, '2026-06-21')
  assert.ok(clipped.samples.every(sample => sample.powerKw <= 1))
  const noon = clipped.samples.find(sample => sample.minutes === 840)!
  assert.equal(noon.powerKw, 1, 'cloudy power can still clip; do not halve already-clipped clear AC power')
  assert.equal(noon.clearSkyPowerKw, 1)
})

test('zero panels, zero inverter, full system loss and full manual shading yield zero without NaN', () => {
  for (const installation of [{ ...defaults, panelCount: 0 }, { ...defaults, inverterKw: 0 }, { ...defaults, systemLossPct: 100 }, { ...defaults, shadingLossPct: 100 }]) {
    const year = getAnnualGeneration(site, installation)
    assert.equal(year.annualKwh, 0)
    assert.equal(year.clearSkyAnnualKwh, 0)
    assert.ok(Number.isFinite(year.specificYieldKwhPerKwp))
    assert.equal(getDailyGeneration(site, installation, '2026-06-21').kwh, 0)
  }
})

test('Northern and Southern hemisphere seasons reverse, with equator-facing tilt favored', () => {
  const north = getAnnualGeneration({ latitude: 48, longitude: 0, timeZone: 'UTC' }, clear)
  const northAway = getAnnualGeneration({ latitude: 48, longitude: 0, timeZone: 'UTC' }, { ...clear, azimuthDeg: 0 })
  const southSite = { latitude: -36, longitude: -60, timeZone: 'America/Argentina/Buenos_Aires' }
  const south = getAnnualGeneration(southSite, { ...clear, azimuthDeg: 0 })
  const southAway = getAnnualGeneration(southSite, { ...clear, azimuthDeg: 180 })
  assert.ok(north.monthly[5].kwh > north.monthly[11].kwh)
  assert.ok(south.monthly[11].kwh > south.monthly[5].kwh)
  assert.ok(north.annualKwh > northAway.annualKwh)
  assert.ok(south.annualKwh > southAway.annualKwh)
  assert.equal(createDefaultBuildingEnergy('southern', -36, -60).installation.azimuthDeg, 0)
})

test('horizontal panels ignore azimuth; clear and scenario totals reconcile by month', () => {
  const a = getAnnualGeneration(site, { ...defaults, tiltDeg: 0, azimuthDeg: 0 })
  const b = getAnnualGeneration(site, { ...defaults, tiltDeg: 0, azimuthDeg: 174 })
  close(a.annualKwh, b.annualKwh)
  close(a.annualKwh, a.monthly.reduce((sum, month) => sum + month.kwh, 0))
  close(a.clearSkyAnnualKwh, a.monthly.reduce((sum, month) => sum + month.clearSkyKwh, 0))
  assert.ok(a.monthly.every(month => month.kwh <= month.clearSkyKwh))
  assert.equal(a.monthly.length, 12)
  assert.deepEqual(a.monthly.map(month => month.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('local civil daily curves retain actual instants across DST and zero power at night', () => {
  const spring = getDailyGeneration(site, defaults, '2026-03-29')
  const autumn = getDailyGeneration(site, defaults, '2026-10-25')
  assert.equal(spring.samples.length, 138)
  assert.equal(autumn.samples.length, 150)
  assert.equal(spring.samples.filter(sample => sample.minutes >= 120 && sample.minutes < 180).length, 0)
  assert.equal(autumn.samples.filter(sample => sample.minutes === 150).length, 2)
  assert.ok(autumn.samples.filter(sample => sample.altitudeDeg <= 0).every(sample => sample.powerKw === 0))
  for (let index = 1; index < autumn.samples.length; index++) {
    assert.equal(Date.parse(autumn.samples[index].date) - Date.parse(autumn.samples[index - 1].date), 600_000)
  }
})

test('polar nights produce zero and polar daylight stays finite without fabricated sunrise', () => {
  const polar = { latitude: 80, longitude: 0, timeZone: 'UTC' }
  assert.equal(getDailyGeneration(polar, clear, '2026-12-21').kwh, 0)
  const summer = getDailyGeneration(polar, clear, '2026-06-21')
  assert.equal(summer.samples.length, 144)
  assert.ok(summer.kwh > 0 && Number.isFinite(summer.kwh))
  const annual = getAnnualGeneration(polar, clear)
  assert.ok(annual.monthly.every(month => Number.isFinite(month.kwh)))
})

test('annual model handles leap years, supported boundary years, and timezone-independent physical integration', () => {
  const equator = { latitude: 0, longitude: 0, timeZone: 'UTC' }
  const leap = getAnnualGeneration(equator, clear, 2024)
  const ordinary = getAnnualGeneration(equator, clear, 2025)
  assert.ok(leap.monthly[1].kwh > ordinary.monthly[1].kwh)
  const alternateClock = getAnnualGeneration({ ...equator, timeZone: 'Europe/Paris' }, clear, 2024)
  close(leap.annualKwh, alternateClock.annualKwh)
  assert.ok(getAnnualGeneration(equator, clear, 2100).annualKwh > 0)
  assert.ok(getAnnualGeneration(equator, clear, 1900).annualKwh > 0)
})

test('regional demo label requires unchanged example factors and the approximate demo origin', () => {
  assert.equal(getEffectiveClimateSource(site, defaults), 'regional-demo-2001-2020')
  assert.equal(getEffectiveClimateSource({ ...site, latitude: -36 }, defaults), 'custom')
  assert.equal(getEffectiveClimateSource(site, { ...defaults, monthlyTransmission: Array<number>(12).fill(0.65) }), 'custom')
  assert.equal(createDefaultBuildingEnergy('elsewhere', -36, -60).installation.climateSource, 'illustrative')
  REGIONAL_DEMO_MONTHLY_TRANSMISSION.forEach((value, index) => close(value, REGIONAL_DEMO_CLIMATE.allSkyKwhPerM2Day[index] / REGIONAL_DEMO_CLIMATE.clearSkyKwhPerM2Day[index]))
})

test('invalid finite ranges never enter the physics model', () => {
  for (const installation of [{ ...defaults, panelCount: -1 }, { ...defaults, panelCount: 2.5 }, { ...defaults, panelWattPeak: NaN }, { ...defaults, monthlyTransmission: [0.7] }, { ...defaults, monthlyTransmission: Array<number>(12).fill(1.1) }, { ...defaults, shadingLossPct: 101 }]) {
    assert.throws(() => getAnnualGeneration(site, installation))
  }
  assert.throws(() => getAnnualGeneration({ ...site, latitude: 91 }, defaults), RangeError)
  assert.throws(() => getAnnualGeneration({ ...site, timeZone: 'invalid/timezone' }, defaults), RangeError)
  assert.throws(() => getAnnualGeneration(site, defaults, 2101), RangeError)
  assert.throws(() => getDailyGeneration(site, defaults, '2026-02-30'), RangeError)
})

test('legacy climate scenarios keep their numeric inputs without claiming generalized demo provenance', () => {
  const migrated = SolarInstallationSchema.parse({ ...defaults, climateSource: 'nasa-power-quimper-2001-2020' })
  assert.equal(migrated.climateSource, 'custom')
  assert.deepEqual(migrated.monthlyTransmission, defaults.monthlyTransmission)
  assert.equal(getEffectiveClimateSource(site, migrated), 'custom')
  assert.throws(() => SolarInstallationSchema.parse({ ...defaults, climateSource: 'unknown-provider' }))
})
