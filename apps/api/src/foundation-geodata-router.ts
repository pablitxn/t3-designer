import type { ProjectFoundations } from '@t3-designer/scene-schema'
import { acquireFrenchFoundationGeodata, type FoundationGeodataOptions } from './foundation-geodata.ts'
import { acquireArgentineFoundationGeodata } from './argentina-geodata.ts'

export function acquireFoundationGeodata(input: ProjectFoundations['building'], options: FoundationGeodataOptions) {
  return input.countryCode === 'AR' ? acquireArgentineFoundationGeodata(input, options) : acquireFrenchFoundationGeodata(input, options)
}
