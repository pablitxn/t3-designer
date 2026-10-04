import { z } from 'zod'

const finite = z.number().finite()
const percent = finite.min(0).max(100)
const amount = finite.min(0).max(1_000_000_000)

/** Building-level scenario inputs, independent of an apartment's fixtures. */
export const SolarInstallationSchema = z.object({
  panelCount: finite.int().min(0).max(1000),
  panelWattPeak: finite.min(1).max(1000),
  tiltDeg: finite.min(0).max(90),
  /** Clockwise from true north, matching the shared solar and site coordinates. */
  azimuthDeg: finite.min(0).max(360),
  inverterKw: finite.min(0).max(1000),
  systemLossPct: percent,
  shadingLossPct: percent,
  /** Monthly all-sky/clear-sky attenuation, January first. Not weather forecasts. */
  monthlyTransmission: z.array(finite.min(0).max(1)).length(12),
  // Legacy saved scenarios remain readable without transferring a location-specific
  // provenance claim to the generalized public demo.
  climateSource: z.preprocess(
    value => value === 'nasa-power-quimper-2001-2020' ? 'custom' : value,
    z.enum(['regional-demo-2001-2020', 'custom', 'illustrative']),
  ),
})

export const FinanceAssumptionsSchema = z.object({
  annualConsumptionKwh: finite.min(0).max(100_000_000),
  /** Assumed share of generation consumed locally, capped by annual demand. */
  selfConsumptionPct: percent,
  importTariffPerKwh: finite.min(0).max(10_000),
  exportTariffPerKwh: finite.min(0).max(10_000),
  capex: amount,
  incentive: amount,
  annualMaintenance: amount,
  degradationPct: percent,
  discountRatePct: percent,
  horizonYears: finite.int().min(1).max(50),
})

export const BuildingEnergySchema = z.object({
  buildingId: z.string().min(1),
  installation: SolarInstallationSchema,
  finance: FinanceAssumptionsSchema,
  currency: z.enum(['EUR', 'USD', 'ARS', 'GBP']),
})

export type SolarInstallation = z.infer<typeof SolarInstallationSchema>
export type FinanceAssumptions = z.infer<typeof FinanceAssumptionsSchema>
export type BuildingEnergy = z.infer<typeof BuildingEnergySchema>
