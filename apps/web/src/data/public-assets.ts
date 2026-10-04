export type PublicAssetId = 'strandmon' | 'dyvlinge' | 'fagelfjallet'
export type PublicAssetRevision = {
  id: 'strandmon-v1' | 'dyvlinge-v1' | 'dyvlinge-v2' | 'fagelfjallet-v1'
  version: number
  createdAt: string
  needsCorrection: boolean
}
export type PublicAsset = {
  id: PublicAssetId
  name: string
  dimensions: [number, number, number]
  sourceUrl: string
  revisions: PublicAssetRevision[]
}

/** Deliberately curated demo records, independent of private workshop APIs and IDs.
 * Files and dimension evidence are archived in public/demo-assets/catalog.json.
 * A revision is a saved asset version, not an internal generation attempt.
 */
export const publicAssets: PublicAsset[] = [
  {
    id: 'strandmon', name: 'STRANDMON', dimensions: [.82, 1.01, .96],
    sourceUrl: 'https://www.ikea.com/es/es/p/strandmon-sillon-orejero-nordvalla-gris-oscuro-20343224/',
    revisions: [{ id: 'strandmon-v1', version: 1, createdAt: '2026-10-03T20:01:43.363Z', needsCorrection: false }],
  },
  {
    id: 'dyvlinge', name: 'DYVLINGE', dimensions: [.63, .68, .75],
    sourceUrl: 'https://www.ikea.com/es/en/p/dyvlinge-swivel-easy-chair-kelinge-beige-00623862/',
    revisions: [
      { id: 'dyvlinge-v2', version: 2, createdAt: '2026-10-03T21:15:27.417Z', needsCorrection: true },
      { id: 'dyvlinge-v1', version: 1, createdAt: '2026-10-03T20:45:40.210Z', needsCorrection: false },
    ],
  },
  {
    id: 'fagelfjallet', name: 'FÅGELFJÄLLET', dimensions: [1.52, 1.01, 2.07],
    sourceUrl: 'https://www.ikea.com/es/en/p/fagelfjallet-bed-frame-off-white-20607154/',
    revisions: [{ id: 'fagelfjallet-v1', version: 1, createdAt: '2026-10-03T20:20:35.317Z', needsCorrection: false }],
  },
]

export function publicAssetFile(revision: PublicAssetRevision, file: 'preview.png' | 'front.png' | 'side.png' | 'model.glb') {
  return `/demo-assets/${revision.id}/${file}`
}
