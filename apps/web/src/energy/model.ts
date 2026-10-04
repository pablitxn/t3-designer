import {
  BuildingEnergySchema,
  type BuildingEnergy,
  type SolarInstallation,
} from '../../../../packages/scene-schema/src/energy.ts'

export {
  BuildingEnergySchema, SolarInstallationSchema, FinanceAssumptionsSchema,
  type BuildingEnergy, type SolarInstallation, type FinanceAssumptions,
} from '../../../../packages/scene-schema/src/energy.ts'

export type EnergySite = { latitude: number; longitude: number; timeZone: string }

/** Generalized regional example based on NASA POWER SYN1DEG, 2001–2020.
 * Monthly values are retained from the original regional sample. The rounded
 * demo origin is illustrative, not the original query location or a new API
 * observation. See photovoltaic-model.md for provenance and limits.
 */
export const REGIONAL_DEMO_CLIMATE = {
  latitude: 48.0,
  longitude: -4.0,
  sourceUrl: 'https://power.larc.nasa.gov/docs/services/api/temporal/climatology/',
  allSkyKwhPerM2Day: [0.9648, 1.7486, 2.9585, 4.6762, 5.6323, 5.9856, 5.7314, 4.8588, 3.8275, 2.2524, 1.1983, 0.7985],
  clearSkyKwhPerM2Day: [1.7398, 2.8896, 4.5206, 6.3067, 7.6279, 8.1415, 7.7923, 6.6581, 5.0633, 3.3250, 2.0076, 1.4323],
} as const

export const REGIONAL_DEMO_MONTHLY_TRANSMISSION = REGIONAL_DEMO_CLIMATE.allSkyKwhPerM2Day.map(
  (value, index) => value / REGIONAL_DEMO_CLIMATE.clearSkyKwhPerM2Day[index],
)

export function isRegionalDemoClimateSite(site: Pick<EnergySite, 'latitude' | 'longitude'>) {
  return Math.abs(site.latitude - REGIONAL_DEMO_CLIMATE.latitude) < 0.05
    && Math.abs(site.longitude - REGIONAL_DEMO_CLIMATE.longitude) < 0.05
}

/** Provenance cannot follow a saved label after its coordinates/factors change. */
export function getEffectiveClimateSource(site: EnergySite, installation: SolarInstallation): SolarInstallation['climateSource'] {
  if (installation.climateSource !== 'regional-demo-2001-2020') return installation.climateSource
  const matchesSource = isRegionalDemoClimateSite(site)
    && installation.monthlyTransmission.length === 12
    && installation.monthlyTransmission.every((value, index) => Math.abs(value - REGIONAL_DEMO_MONTHLY_TRANSMISSION[index]) < 1e-10)
  return matchesSource ? 'regional-demo-2001-2020' : 'custom'
}

/** Illustrative installation and economics, never an installed-system record. */
export function createDefaultBuildingEnergy(
  buildingId: string,
  latitude: number = REGIONAL_DEMO_CLIMATE.latitude,
  longitude: number = REGIONAL_DEMO_CLIMATE.longitude,
): BuildingEnergy {
  const localClimate = isRegionalDemoClimateSite({ latitude, longitude })
  return BuildingEnergySchema.parse({
    buildingId,
    installation: {
      panelCount: 12, panelWattPeak: 450,
      tiltDeg: 30, azimuthDeg: latitude < 0 ? 0 : 180,
      inverterKw: 5, systemLossPct: 14, shadingLossPct: 0,
      monthlyTransmission: localClimate ? [...REGIONAL_DEMO_MONTHLY_TRANSMISSION] : Array<number>(12).fill(0.65),
      climateSource: localClimate ? 'regional-demo-2001-2020' : 'illustrative',
    },
    finance: {
      annualConsumptionKwh: 6000, selfConsumptionPct: 60,
      importTariffPerKwh: 0.25, exportTariffPerKwh: 0.08,
      capex: 9000, incentive: 0, annualMaintenance: 90,
      degradationPct: 0.5, discountRatePct: 4, horizonYears: 25,
    },
    currency: 'EUR',
  })
}
