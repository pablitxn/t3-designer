import { FinanceAssumptionsSchema, type FinanceAssumptions } from './model.ts'

export type EnergyCashflow = {
  year: number
  generationKwh: number
  selfConsumedKwh: number
  exportedKwh: number
  avoidedImportCost: number
  exportRevenue: number
  maintenance: number
  netCashflow: number
  cumulativeCashflow: number
  discountedCashflow: number
}
export type EnergyFinance = {
  selfConsumedKwh: number
  exportedKwh: number
  importedKwh: number
  avoidedImportCost: number
  exportRevenue: number
  annualNetSavings: number
  netInvestment: number
  paybackYears: number | null
  npv: number
  /** Sum of operating cashflows minus the initial net investment. */
  totalNetSavings: number
  cashflows: EnergyCashflow[]
}

/** Constant-currency cashflow scenario. No tax, loan, inflation, price growth,
 * battery or hourly self-consumption is inferred from an annual demand number.
 */
export function calculateFinance(annualKwh: number, input: FinanceAssumptions): EnergyFinance {
  if (!Number.isFinite(annualKwh) || annualKwh < 0 || annualKwh > 100_000_000) {
    throw new RangeError('Annual generation must be finite, nonnegative and at most 100,000,000 kWh.')
  }
  const assumptions = FinanceAssumptionsSchema.parse(input)
  const netInvestment = Math.max(0, assumptions.capex - assumptions.incentive)
  let cumulativeCashflow = -netInvestment
  let npv = -netInvestment
  let paybackYears: number | null = netInvestment === 0 ? 0 : null
  const cashflows: EnergyCashflow[] = [{
    year: 0, generationKwh: 0, selfConsumedKwh: 0, exportedKwh: 0,
    avoidedImportCost: 0, exportRevenue: 0, maintenance: 0,
    netCashflow: -netInvestment, cumulativeCashflow, discountedCashflow: -netInvestment,
  }]
  for (let year = 1; year <= assumptions.horizonYears; year++) {
    const generationKwh = annualKwh * (1 - assumptions.degradationPct / 100) ** (year - 1)
    const selfConsumedKwh = Math.min(generationKwh * assumptions.selfConsumptionPct / 100, assumptions.annualConsumptionKwh)
    const exportedKwh = generationKwh - selfConsumedKwh
    const avoidedImportCost = selfConsumedKwh * assumptions.importTariffPerKwh
    const exportRevenue = exportedKwh * assumptions.exportTariffPerKwh
    const netCashflow = avoidedImportCost + exportRevenue - assumptions.annualMaintenance
    const discountedCashflow = netCashflow / (1 + assumptions.discountRatePct / 100) ** year
    if (paybackYears === null && cumulativeCashflow < 0 && cumulativeCashflow + netCashflow >= 0) {
      // Fractional simple payback assumes the crossing year's net benefit
      // accrues uniformly. It is deliberately separate from discounted NPV.
      paybackYears = year - 1 + -cumulativeCashflow / netCashflow
    }
    cumulativeCashflow += netCashflow
    npv += discountedCashflow
    cashflows.push({
      year, generationKwh, selfConsumedKwh, exportedKwh, avoidedImportCost, exportRevenue,
      maintenance: assumptions.annualMaintenance, netCashflow, cumulativeCashflow, discountedCashflow,
    })
  }
  const first = cashflows[1]
  return {
    selfConsumedKwh: first.selfConsumedKwh,
    exportedKwh: first.exportedKwh,
    importedKwh: assumptions.annualConsumptionKwh - first.selfConsumedKwh,
    avoidedImportCost: first.avoidedImportCost,
    exportRevenue: first.exportRevenue,
    annualNetSavings: first.netCashflow,
    netInvestment, paybackYears, npv, totalNetSavings: cumulativeCashflow, cashflows,
  }
}
