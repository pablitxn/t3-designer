import type { Asset } from '@t3-designer/asset-schema'

export function assetFamilyId(asset: Asset, assets: readonly Asset[]): string {
  const seen = new Set<string>()
  let current = asset
  while (current.parentAssetId && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = assets.find(item => item.id === current.parentAssetId)
    if (!parent) return current.parentAssetId
    current = parent
  }
  return current.id
}

export function assetFamilies(assets: readonly Asset[]): Asset[][] {
  const groups = new Map<string, Asset[]>()
  for (const asset of assets) {
    const root = assetFamilyId(asset, assets)
    const family = groups.get(root) ?? []
    family.push(asset)
    groups.set(root, family)
  }
  return [...groups.values()].map(family => family.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.revision ?? 1) - (a.revision ?? 1)))
}
