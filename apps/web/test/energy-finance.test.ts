import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultBuildingEnergy, type FinanceAssumptions } from '../src/energy/model.ts'
import { calculateFinance } from '../src/energy/finance.ts'

const base: FinanceAssumptions = {
  ...createDefaultBuildingEnergy('building').finance,
  annualConsumptionKwh: 1000, selfConsumptionPct: 100,
  importTariffPerKwh: 1, exportTariffPerKwh: 0.5,
  capex: 5000, incentive: 500, annualMaintenance: 100,
  degradationPct: 0, discountRatePct: 0, horizonYears: 10,
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} should equal ${b}`)

test('energy allocation is capped by production and demand with no duplicated benefits', () => {
  const result = calculateFinance(2000, base)
  assert.equal(result.selfConsumedKwh, 1000)
  assert.equal(result.exportedKwh, 1000)
  assert.equal(result.importedKwh, 0)
  assert.equal(result.avoidedImportCost, 1000)
  assert.equal(result.exportRevenue, 500)
  assert.equal(result.annualNetSavings, 1400)
  assert.equal(result.selfConsumedKwh + result.exportedKwh, 2000)
  assert.equal(result.selfConsumedKwh + result.importedKwh, base.annualConsumptionKwh)
  const limited = calculateFinance(100, { ...base, selfConsumptionPct: 60 })
  assert.equal(limited.selfConsumedKwh, 60)
  assert.equal(limited.exportedKwh, 40)
  assert.equal(limited.importedKwh, 940)
})

test('simple payback and NPV match independently calculated constant-cashflow values', () => {
  const result = calculateFinance(2000, base)
  assert.equal(result.netInvestment, 4500)
  close(result.paybackYears!, 4500 / 1400)
  assert.equal(result.npv, 9500)
  assert.equal(result.totalNetSavings, 9500)
  assert.equal(result.cashflows.length, 11)
  assert.equal(result.cashflows[0].netCashflow, -4500)
  assert.equal(result.cashflows[0].discountedCashflow, -4500)
  const discounted = calculateFinance(2000, { ...base, discountRatePct: 5 })
  close(discounted.npv, -4500 + 1400 * (1 - 1.05 ** -10) / 0.05)
  close(discounted.paybackYears!, result.paybackYears!)
})

test('degradation compounds from year two and benefit allocation is recomputed per year', () => {
  const result = calculateFinance(2000, { ...base, degradationPct: 50, horizonYears: 3 })
  assert.deepEqual(result.cashflows.map(row => row.generationKwh), [0, 2000, 1000, 500])
  assert.deepEqual(result.cashflows.map(row => row.selfConsumedKwh), [0, 1000, 1000, 500])
  assert.deepEqual(result.cashflows.map(row => row.exportedKwh), [0, 1000, 0, 0])
  assert.deepEqual(result.cashflows.map(row => row.netCashflow), [-4500, 1400, 900, 400])
  assert.equal(result.paybackYears, null)
})

test('unrecovered investment returns null and never projects a crossing beyond the selected horizon', () => {
  assert.equal(calculateFinance(2000, { ...base, horizonYears: 3 }).paybackYears, null)
  assert.equal(calculateFinance(2000, { ...base, annualMaintenance: 1600 }).paybackYears, null)
  assert.equal(calculateFinance(2000, { ...base, importTariffPerKwh: 0, exportTariffPerKwh: 0 }).paybackYears, null)
})

test('zero generation retains explicitly entered installation and maintenance costs', () => {
  const result = calculateFinance(0, base)
  assert.equal(result.netInvestment, 4500)
  assert.equal(result.annualNetSavings, -100)
  assert.equal(result.npv, -5500)
  assert.equal(result.paybackYears, null)
  assert.equal(result.selfConsumedKwh, 0)
  assert.equal(result.exportedKwh, 0)
  assert.equal(result.importedKwh, 1000)
})

test('zero demand exports all output and incentives are limited to the installation cost', () => {
  const result = calculateFinance(2000, { ...base, annualConsumptionKwh: 0, incentive: 9000 })
  assert.equal(result.selfConsumedKwh, 0)
  assert.equal(result.exportedKwh, 2000)
  assert.equal(result.avoidedImportCost, 0)
  assert.equal(result.exportRevenue, 1000)
  assert.equal(result.netInvestment, 0)
  assert.equal(result.paybackYears, 0)
})

test('invalid generation and financial assumptions are rejected before cashflow arithmetic', () => {
  for (const value of [-1, NaN, Infinity, 100_000_001]) assert.throws(() => calculateFinance(value, base), RangeError)
  for (const assumptions of [{ ...base, horizonYears: 0 }, { ...base, horizonYears: 2.5 }, { ...base, degradationPct: 101 }, { ...base, selfConsumptionPct: -1 }, { ...base, importTariffPerKwh: -1 }, { ...base, discountRatePct: Infinity }]) {
    assert.throws(() => calculateFinance(1000, assumptions))
  }
})
