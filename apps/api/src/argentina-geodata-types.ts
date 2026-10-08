import type { FoundationSource, Point2D } from '@t3-designer/scene-schema'
export type { OfficialFetchOptions } from './official-geodata-http.ts'

/** Geographic rings are WGS84 longitude/latitude, never metres. The first is
 * the exterior; subsequent rings are holes, not separate cadastral lots. */
export type ArgentineParcelRecord = {
  id: string; label: string; rings: Point2D[][]; publishedArea: number | null; sourceDate: string | null
  sourceUrl: string; provider: string; jurisdiction: string; attribution: string
}
export type ArgentineParcelLookup = {
  parcels: ArgentineParcelRecord[]; sources: FoundationSource[]; unknowns: string[]
}
