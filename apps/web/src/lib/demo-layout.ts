import { isFixtureMovable, pointInEditorPolygon, type Fixture } from '@t3-designer/scene-schema'
import { currentFixtures } from '../data/current-state.ts'
import { demoAssets, demoFixtures } from '../data/demo-catalog.ts'
import { t3Apartment } from '../data/t3.ts'

export const DEMO_LAYOUT_KEY = 't3-designer.demo-layout.v1'
const fullTurn = Math.PI * 2
const assets = new Map(demoAssets.map(asset => [asset.id, asset]))
const originals = new Map(currentFixtures.map(fixture => [fixture.id, fixture]))
const catalog = new Map(demoFixtures.map(fixture => [fixture.id, fixture]))
const generated = new Set(demoFixtures.filter(fixture => !originals.has(fixture.id)).map(fixture => fixture.id))
export type DemoLayoutStatus = 'original' | 'saved' | 'unavailable' | 'recovered'
type Placement = { id: string; position: Fixture['position']; rotation: number; baseline: { position: Fixture['position']; rotation: number } }

export function originalDemoFixtures(): Fixture[] { return structuredClone(currentFixtures) }
export function movableDemoFixture(fixture: Fixture): boolean {
  const original = catalog.get(fixture.id)
  return !!original && isFixtureMovable(original, assets.get(original.assetId))
}

/** Presence is independent from mobility: even installed objects can be hidden. */
export function toggleDemoFixture(fixtures: Fixture[], id: string, present: boolean): Fixture[] {
  const canonical = catalog.get(id)
  if (!canonical) throw new Error('Unknown object')
  const existing = fixtures.find(fixture => fixture.id === id)
  if (present === !!existing) return fixtures
  if (!present) return fixtures.filter(fixture => fixture.id !== id)
  const active = new Map(fixtures.map(fixture => [fixture.id, fixture]))
  active.set(id, structuredClone(canonical))
  return demoFixtures.flatMap(fixture => active.has(fixture.id) ? [active.get(fixture.id)!] : [])
}

/** Only placement changes to the published movable instances are accepted. */
export function moveDemoFixture(fixtures: Fixture[], id: string, patch: { position?: Fixture['position']; rotation?: number }): Fixture[] {
  const original = catalog.get(id), current = fixtures.find(item => item.id === id)
  if (!original || !current || !movableDemoFixture(original)) throw new Error('Fixed or unknown object')
  const position = patch.position ?? current.position, rotation = patch.rotation ?? current.rotation
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(rotation)) throw new Error('Invalid placement')
  // Public rearrangement is horizontal: mounted height and source geometry stay canonical.
  if (position[1] !== original.position[1] || !pointInEditorPolygon([position[0], position[2]], t3Apartment.perimeter)) throw new Error('Invalid placement')
  const roomId = t3Apartment.rooms.find(room => pointInEditorPolygon([position[0], position[2]], room.polygon))?.id
  if (!roomId) throw new Error('Object must be inside a room')
  return fixtures.map(fixture => fixture.id === id ? { ...original, roomId, position: [...position], rotation: ((rotation % fullTurn) + fullTurn) % fullTurn } : fixture)
}

function changed(fixture: Fixture, original: Fixture) {
  return fixture.position.some((value, axis) => Math.abs(value - original.position[axis]) > 1e-6)
    || Math.abs(Math.sin((fixture.rotation - original.rotation) / 2)) > 1e-6
}

/** A compact allowlist, never a project snapshot, model URL or free-text payload. */
export function encodeDemoLayout(fixtures: Fixture[]): string | null {
  const active = new Map(fixtures.map(fixture => [fixture.id, fixture]))
  const hidden = currentFixtures.filter(fixture => !active.has(fixture.id)).map(fixture => fixture.id)
  const added = [...generated].filter(id => active.has(id))
  const placements: Placement[] = []
  for (const original of demoFixtures) {
    const fixture = active.get(original.id)
    if (!fixture || !movableDemoFixture(original)) continue
    const checked = moveDemoFixture([original], original.id, fixture)[0]
    if (!changed(checked, original)) continue
    placements.push({ id: original.id, position: checked.position, rotation: checked.rotation, baseline: { position: original.position, rotation: original.rotation } })
  }
  return hidden.length || added.length || placements.length ? JSON.stringify({ version: 2, apartmentId: t3Apartment.id, hidden, added, placements }) : null
}

export function decodeDemoLayout(raw: string | null): { fixtures: Fixture[]; status: DemoLayoutStatus } {
  let fixtures = originalDemoFixtures()
  if (!raw) return { fixtures, status: 'original' }
  try {
    if (raw.length > 32_000) throw new Error('Oversized layout')
    const data = JSON.parse(raw)
    if ((data.version !== 1 && data.version !== 2) || data.apartmentId !== t3Apartment.id || !Array.isArray(data.placements) || data.placements.length > (data.version === 1 ? currentFixtures.length : demoFixtures.length)) throw new Error('Unsupported layout')
    let recovered = false
    if (data.version === 2) {
      if (!Array.isArray(data.hidden) || data.hidden.length > originals.size || !Array.isArray(data.added) || data.added.length > generated.size) throw new Error('Unsupported membership')
      const hidden = new Set<string>(), added = new Set<string>()
      for (const id of data.hidden) {
        if (typeof id !== 'string' || !originals.has(id) || hidden.has(id)) recovered = true
        else hidden.add(id)
      }
      for (const id of data.added) {
        if (typeof id !== 'string' || !generated.has(id) || added.has(id)) recovered = true
        else added.add(id)
      }
      fixtures = structuredClone(demoFixtures.filter(fixture => originals.has(fixture.id) ? !hidden.has(fixture.id) : added.has(fixture.id)))
    }
    const seen = new Set<string>()
    for (const placement of data.placements) {
      try {
        if (!placement || !Array.isArray(placement.position) || typeof placement.rotation !== 'number') throw new Error('Incomplete placement')
        const original = (data.version === 1 ? originals : catalog).get(placement.id)
        if (!original || seen.has(placement.id) || !placement.baseline || JSON.stringify(placement.baseline.position) !== JSON.stringify(original.position) || placement.baseline.rotation !== original.rotation) throw new Error('Changed baseline')
        seen.add(placement.id)
        fixtures = moveDemoFixture(fixtures, placement.id, { position: placement.position, rotation: placement.rotation })
      } catch { recovered = true }
    }
    return { fixtures, status: recovered ? 'recovered' : encodeDemoLayout(fixtures) ? 'saved' : 'original' }
  } catch { return { fixtures, status: 'recovered' } }
}

export function readDemoLayout(storage: Pick<Storage, 'getItem'>) {
  try { return decodeDemoLayout(storage.getItem(DEMO_LAYOUT_KEY)) }
  catch { return { fixtures: originalDemoFixtures(), status: 'unavailable' as const } }
}

export function saveDemoLayout(storage: Pick<Storage, 'setItem' | 'removeItem'>, fixtures: Fixture[]): DemoLayoutStatus {
  try {
    const value = encodeDemoLayout(fixtures)
    if (value) storage.setItem(DEMO_LAYOUT_KEY, value)
    else storage.removeItem(DEMO_LAYOUT_KEY)
    return value ? 'saved' : 'original'
  } catch { return 'unavailable' }
}
