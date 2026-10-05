import { AssetSchema, FixtureSchema, type Asset, type Fixture } from '@t3-designer/scene-schema'
import { assetCatalog, currentFixtures } from './current-state.ts'
import { publicAssetFile, publicAssets, type PublicAssetId } from './public-assets.ts'
import { t3Apartment } from './t3.ts'

type DemoCatalogEntry = { fixture: Fixture; asset: Asset; previewUrl: string; source: 'apartment' | 'generated' }

function roomBounds(id: string) {
  const room = t3Apartment.rooms.find(room => room.id === id)!
  return {
    west: Math.min(...room.polygon.map(point => point[0])), east: Math.max(...room.polygon.map(point => point[0])),
    north: Math.min(...room.polygon.map(point => point[1])), south: Math.max(...room.polygon.map(point => point[1])),
  }
}

const living = roomBounds('living'), bedroom = roomBounds('bedroom-1')
const seeds: Record<PublicAssetId, { roomId: string; position: Fixture['position']; rotation: number }> = {
  strandmon: { roomId: 'living', position: [living.west + .75, .015, living.north + 1.05], rotation: 0 },
  dyvlinge: { roomId: 'living', position: [living.east - .8, .015, living.north + 1.2], rotation: 0 },
  fagelfjallet: { roomId: 'bedroom-1', position: [(bedroom.west + bedroom.east) / 2, .015, (bedroom.north + bedroom.south) / 2], rotation: 0 },
}

const generated: DemoCatalogEntry[] = publicAssets.map(product => {
  const revision = [...product.revisions].sort((a, b) => b.version - a.version)[0]
  const asset = AssetSchema.parse({
    id: revision.id, label: product.name, url: publicAssetFile(revision, 'model.glb'),
    dimensions: product.dimensions, dimensionalStatus: 'estimated', mobility: 'movable',
    evidence: `Product-derived draft · ${product.sourceUrl} · visual fidelity unverified${revision.needsCorrection ? ' · correction pending' : ''}`,
  })
  const fixture = FixtureSchema.parse({
    id: `demo-${revision.id}`, assetId: asset.id, label: asset.label,
    ...seeds[product.id], evidence: asset.evidence, placementStatus: 'estimated', mobility: 'movable',
  })
  return { fixture, asset, previewUrl: publicAssetFile(revision, 'preview.png'), source: 'generated' }
})

/** Published choices only. Generated drafts are available without appearing by default. */
export const demoFixtureCatalog: DemoCatalogEntry[] = [
  ...currentFixtures.map(fixture => ({
    fixture, asset: assetCatalog.find(asset => asset.id === fixture.assetId)!,
    previewUrl: `/models/current/previews/${fixture.assetId}.png`, source: 'apartment' as const,
  })),
  ...generated,
]

export const demoAssets: Asset[] = [...assetCatalog, ...generated.map(entry => entry.asset)]
export const demoFixtures: Fixture[] = demoFixtureCatalog.map(entry => entry.fixture)
