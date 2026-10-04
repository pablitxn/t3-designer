import { polygonCentroid, segmentWall, wallLength, wallRotation } from '@t3-designer/geometry'
import { DesignCustomizationSchema, LightSourceSchema, ProjectSnapshotSchema, WallSchema, defaultDesignCustomization, getAssetMobility, isFixtureMovable, pointInEditorPolygon, type ArchitectureVariant, type DesignCustomization, type FixedLight, type Fixture, type FurnitureLayout, type LightSource, type Point2D, type ProjectEditor, type ProjectSnapshot, type Wall } from '@t3-designer/scene-schema'

export type EditorSnapshot = ProjectSnapshot & { editor: ProjectEditor }
export type FixtureEdit = Partial<Pick<Fixture, 'position' | 'rotation' | 'roomId' | 'label'>>
export type PartitionInput = Pick<Wall, 'id' | 'from' | 'to' | 'height' | 'thickness'>
const epsilon = 1e-8
const fullTurn = Math.PI * 2

function requireId(id: string) {
  if (!id.trim() || id.length > 128) throw new Error('Invalid ID')
  return id
}
function requireName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error('Name must contain 1–80 characters')
  return trimmed
}
function validated(snapshot: EditorSnapshot): EditorSnapshot {
  // Validate without replacing unchanged object references, which lets the
  // renderer retain loaded models and geometry between furniture operations.
  ProjectSnapshotSchema.parse(snapshot)
  return snapshot
}

export function ensureEditor(snapshot: ProjectSnapshot): EditorSnapshot {
  if (snapshot.editor) return snapshot as EditorSnapshot
  return validated({ ...snapshot, editor: {
    schemaVersion: 1, activeArchitectureId: 'architecture-original',
    architectures: [{ id: 'architecture-original', name: 'Original', apartment: snapshot.apartment, partitionWallIds: [], activeLayoutId: 'layout-original', layouts: [{ id: 'layout-original', name: 'Original', fixtures: snapshot.fixtures, ...(snapshot.customization ? { customization: snapshot.customization } : {}) }] }],
  } })
}
export function getActiveArchitecture(snapshot: ProjectSnapshot): ArchitectureVariant {
  const editor = ensureEditor(snapshot).editor
  const architecture = editor.architectures.find(item => item.id === editor.activeArchitectureId)
  if (!architecture) throw new Error('Unknown architecture')
  return architecture
}
export function getActiveLayout(snapshot: ProjectSnapshot): FurnitureLayout {
  const architecture = getActiveArchitecture(snapshot)
  const layout = architecture.layouts.find(item => item.id === architecture.activeLayoutId)
  if (!layout) throw new Error('Unknown layout')
  return layout
}

/** Rebuild renderer-neutral solids, retaining context and evidence metadata. */
export function rebuildApartmentGeometry(snapshot: ProjectSnapshot): ProjectSnapshot['geometry'] {
  const { apartment, geometry } = snapshot
  return { ...geometry,
    floor: { ...geometry.floor, polygon: apartment.perimeter },
    ceiling: { ...geometry.ceiling, polygon: apartment.perimeter },
    walls: apartment.walls.map(wall => {
      const length = wallLength(wall)
      const ux = (wall.to[0] - wall.from[0]) / length, uz = (wall.to[1] - wall.from[1]) / length
      return { wallId: wall.id, solids: segmentWall(wall, [...apartment.doors, ...apartment.windows]).map(segment => ({
        position: [wall.from[0] + ux * (segment.offset + segment.length / 2), segment.bottom + segment.height / 2, wall.from[1] + uz * (segment.offset + segment.length / 2)] as [number, number, number],
        scale: [segment.length, segment.height, wall.thickness] as [number, number, number],
        rotationY: wallRotation(wall) || 0,
      })) }
    }),
  }
}

function materialize(snapshot: EditorSnapshot): EditorSnapshot {
  const architecture = getActiveArchitecture(snapshot), layout = getActiveLayout(snapshot)
  const next = { ...snapshot, apartment: architecture.apartment, fixtures: layout.fixtures }
  if (layout.customization) next.customization = layout.customization
  else delete next.customization
  if (snapshot.apartment !== architecture.apartment) next.geometry = rebuildApartmentGeometry(next)
  return validated(next)
}
function replaceArchitecture(snapshot: EditorSnapshot, architecture: ArchitectureVariant): EditorSnapshot {
  return materialize({ ...snapshot, editor: { ...snapshot.editor, architectures: snapshot.editor.architectures.map(item => item.id === architecture.id ? architecture : item) } })
}
function replaceFixtures(snapshot: ProjectSnapshot, fixtures: Fixture[]): EditorSnapshot {
  const editorSnapshot = ensureEditor(snapshot), architecture = getActiveArchitecture(editorSnapshot)
  return replaceArchitecture(editorSnapshot, { ...architecture, layouts: architecture.layouts.map(layout => layout.id === architecture.activeLayoutId ? { ...layout, fixtures } : layout) })
}

/** Adapter for an existing scene control which edits the materialized root. */
export function syncActiveScene(snapshot: ProjectSnapshot): EditorSnapshot {
  const editorSnapshot = ensureEditor(snapshot), architecture = getActiveArchitecture(editorSnapshot)
  const previousFixtures = getActiveLayout(editorSnapshot).fixtures
  for (const original of previousFixtures) {
    if (isFixtureMovable(original, snapshot.assets.find(asset => asset.id === original.assetId))) continue
    const candidate = snapshot.fixtures.find(fixture => fixture.id === original.id)
    if (!candidate || candidate.assetId !== original.assetId || candidate.roomId !== original.roomId
      || candidate.rotation !== original.rotation || candidate.position.some((value, axis) => value !== original.position[axis])
      || isFixtureMovable(candidate, snapshot.assets.find(asset => asset.id === candidate.assetId))) throw new Error('Fixed objects cannot be rearranged')
  }
  for (const candidate of snapshot.fixtures) {
    if (!previousFixtures.some(fixture => fixture.id === candidate.id)
      && !isFixtureMovable(candidate, snapshot.assets.find(asset => asset.id === candidate.assetId))) throw new Error('Fixed objects cannot be added as furniture')
  }
  const next = snapshot.apartment === architecture.apartment ? editorSnapshot : { ...editorSnapshot, geometry: rebuildApartmentGeometry(snapshot) }
  return replaceArchitecture(next, { ...architecture, apartment: snapshot.apartment, layouts: architecture.layouts.map(layout => {
    if (layout.id !== architecture.activeLayoutId) return layout
    const updated = { ...layout, fixtures: snapshot.fixtures }
    if (snapshot.customization) updated.customization = snapshot.customization
    else delete updated.customization
    return updated
  }) })
}

/** Appearance and lighting belong to the active furniture/design alternative. */
export function updateCustomization(snapshot: ProjectSnapshot, customization: DesignCustomization): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  const parsed = DesignCustomizationSchema.parse(customization)
  return replaceArchitecture(next, { ...architecture, layouts: architecture.layouts.map(layout => layout.id === architecture.activeLayoutId ? { ...layout, customization: parsed } : layout) })
}

export function setFixtureLight(snapshot: ProjectSnapshot, id: string, light: LightSource | undefined): EditorSnapshot {
  const next = ensureEditor(snapshot), fixture = next.fixtures.find(item => item.id === id)
  if (!fixture) throw new Error('Unknown object')
  const updated = { ...fixture }
  if (light) updated.light = LightSourceSchema.parse(light)
  else delete updated.light
  return replaceFixtures(next, next.fixtures.map(item => item.id === id ? updated : item))
}

export function addFixedLight(snapshot: ProjectSnapshot, roomId: string, id: string): EditorSnapshot {
  const next = ensureEditor(snapshot), room = next.apartment.rooms.find(item => item.id === roomId)
  requireId(id)
  if (!room) throw new Error('Unknown room')
  const customization = next.customization ?? defaultDesignCustomization()
  if (customization.lighting.lights.some(light => light.id === id)) throw new Error('Light ID already exists')
  const [x, z] = polygonCentroid(room.polygon)
  const light: FixedLight = { id, roomId, name: room.name, position: [x, Math.max(0, next.geometry.ceiling.elevation - .15), z], enabled: true, kelvin: 2700, lumens: 800 }
  return updateCustomization(next, { ...customization, lighting: { ...customization.lighting, lights: [...customization.lighting.lights, light] } })
}

export function updateFixedLight(snapshot: ProjectSnapshot, id: string, patch: Partial<FixedLight>): EditorSnapshot {
  const next = ensureEditor(snapshot), customization = next.customization ?? defaultDesignCustomization()
  const original = customization.lighting.lights.find(light => light.id === id)
  if (!original) throw new Error('Unknown light')
  const updated = { ...original, ...patch, ...(patch.name !== undefined ? { name: requireName(patch.name) } : {}) }
  return updateCustomization(next, { ...customization, lighting: { ...customization.lighting, lights: customization.lighting.lights.map(light => light.id === id ? updated : light) } })
}

export function removeFixedLight(snapshot: ProjectSnapshot, id: string): EditorSnapshot {
  const next = ensureEditor(snapshot), customization = next.customization ?? defaultDesignCustomization()
  if (!customization.lighting.lights.some(light => light.id === id)) throw new Error('Unknown light')
  return updateCustomization(next, { ...customization, lighting: { ...customization.lighting, lights: customization.lighting.lights.filter(light => light.id !== id) } })
}

export function selectArchitecture(snapshot: ProjectSnapshot, id: string): EditorSnapshot {
  const next = ensureEditor(snapshot)
  if (!next.editor.architectures.some(item => item.id === id)) throw new Error('Unknown architecture')
  return materialize({ ...next, editor: { ...next.editor, activeArchitectureId: id } })
}
export function duplicateArchitecture(snapshot: ProjectSnapshot, id: string, name: string): EditorSnapshot {
  const next = ensureEditor(snapshot)
  requireId(id)
  if (next.editor.architectures.some(item => item.id === id)) throw new Error('Architecture ID already exists')
  const architecture = { ...structuredClone(getActiveArchitecture(next)), id, name: requireName(name) }
  return materialize({ ...next, editor: { ...next.editor, activeArchitectureId: id, architectures: [...next.editor.architectures, architecture] } })
}
export function renameArchitecture(snapshot: ProjectSnapshot, id: string, name: string): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = next.editor.architectures.find(item => item.id === id)
  if (!architecture) throw new Error('Unknown architecture')
  return replaceArchitecture(next, { ...architecture, name: requireName(name) })
}
export function selectLayout(snapshot: ProjectSnapshot, id: string): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  if (!architecture.layouts.some(item => item.id === id)) throw new Error('Unknown layout')
  return replaceArchitecture(next, { ...architecture, activeLayoutId: id })
}
export function duplicateLayout(snapshot: ProjectSnapshot, id: string, name: string): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  requireId(id)
  if (architecture.layouts.some(item => item.id === id)) throw new Error('Layout ID already exists')
  const layout = { ...structuredClone(getActiveLayout(next)), id, name: requireName(name) }
  return replaceArchitecture(next, { ...architecture, activeLayoutId: id, layouts: [...architecture.layouts, layout] })
}
export function renameLayout(snapshot: ProjectSnapshot, id: string, name: string): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  if (!architecture.layouts.some(item => item.id === id)) throw new Error('Unknown layout')
  return replaceArchitecture(next, { ...architecture, layouts: architecture.layouts.map(item => item.id === id ? { ...item, name: requireName(name) } : item) })
}

/** Inclusive polygon containment for concave rooms and the stepped perimeter. */
export const pointInPolygon = pointInEditorPolygon

function validatePosition(snapshot: ProjectSnapshot, position: Fixture['position'], assetId: string) {
  if (position.length !== 3 || !position.every(Number.isFinite) || position[1] < 0) throw new Error('Invalid position')
  if (!pointInPolygon([position[0], position[2]], snapshot.apartment.perimeter)) throw new Error('Object must stay inside the apartment')
  const asset = snapshot.assets.find(item => item.id === assetId)
  if (!asset) throw new Error('Unknown asset')
  if (position[1] + asset.dimensions[1] > snapshot.geometry.ceiling.elevation + epsilon) throw new Error('Object extends above the ceiling')
}

function requireMovable(snapshot: ProjectSnapshot, fixture: Fixture) {
  if (!isFixtureMovable(fixture, snapshot.assets.find(asset => asset.id === fixture.assetId))) throw new Error('Fixed objects cannot be rearranged')
}

export function updateFixture(snapshot: ProjectSnapshot, id: string, patch: FixtureEdit): EditorSnapshot {
  const next = ensureEditor(snapshot), original = next.fixtures.find(item => item.id === id)
  if (!original) throw new Error('Unknown object')
  if (patch.position !== undefined || patch.rotation !== undefined || patch.roomId !== undefined) requireMovable(next, original)
  if (patch.rotation !== undefined && !Number.isFinite(patch.rotation)) throw new Error('Invalid rotation')
  let roomId = patch.roomId ?? original.roomId
  if (patch.position) {
    validatePosition(next, patch.position, original.assetId)
    if (patch.roomId === undefined) roomId = next.apartment.rooms.find(room => pointInPolygon([patch.position![0], patch.position![2]], room.polygon))?.id ?? roomId
  }
  if (!next.apartment.rooms.some(room => room.id === roomId)) throw new Error('Unknown room')
  const updated: Fixture = { ...original, ...patch, roomId,
    ...(patch.label !== undefined ? { label: requireName(patch.label) } : {}),
    ...(patch.position ? { position: [...patch.position] as Fixture['position'] } : {}),
    ...(patch.rotation !== undefined ? { rotation: ((patch.rotation % fullTurn) + fullTurn) % fullTurn } : {}),
  }
  return replaceFixtures(next, next.fixtures.map(item => item.id === id ? updated : item))
}
export function addFixture(snapshot: ProjectSnapshot, assetId: string, id: string, roomId = snapshot.apartment.rooms[0].id, position?: Fixture['position']): EditorSnapshot {
  const next = ensureEditor(snapshot), asset = next.assets.find(item => item.id === assetId), room = next.apartment.rooms.find(item => item.id === roomId)
  requireId(id)
  if (!asset || !room || next.fixtures.some(item => item.id === id)) throw new Error('Invalid object instance')
  if (getAssetMobility(asset) !== 'movable') throw new Error('Fixed objects cannot be added as furniture')
  const [x, z] = polygonCentroid(room.polygon)
  const placement: Fixture['position'] = position ? [...position] : [x, 0, z]
  validatePosition(next, placement, assetId)
  const fixture: Fixture = { id, assetId, roomId, label: asset.label, position: placement, rotation: 0, evidence: asset.evidence, placementStatus: 'estimated', mobility: getAssetMobility(asset), ...(asset.light ? { light: structuredClone(asset.light) } : {}) }
  return replaceFixtures(next, [...next.fixtures, fixture])
}
export function removeFixture(snapshot: ProjectSnapshot, id: string): EditorSnapshot {
  const fixture = snapshot.fixtures.find(item => item.id === id)
  if (!fixture) throw new Error('Unknown object')
  requireMovable(snapshot, fixture)
  return replaceFixtures(snapshot, snapshot.fixtures.filter(item => item.id !== id))
}
export function duplicateFixture(snapshot: ProjectSnapshot, sourceId: string, id: string): EditorSnapshot {
  const original = snapshot.fixtures.find(item => item.id === sourceId)
  requireId(id)
  if (!original || snapshot.fixtures.some(item => item.id === id)) throw new Error('Invalid object instance')
  requireMovable(snapshot, original)
  // Preserve the valid position. The selected duplicate can immediately be
  // dragged; blindly offsetting it could place it outside the stepped plan.
  return replaceFixtures(snapshot, [...snapshot.fixtures, { ...structuredClone(original), id }])
}
export function rotateFixture(snapshot: ProjectSnapshot, id: string, radians: number): EditorSnapshot {
  const fixture = snapshot.fixtures.find(item => item.id === id)
  if (!fixture) throw new Error('Unknown object')
  return updateFixture(snapshot, id, { rotation: fixture.rotation + radians })
}

function segmentInsidePolygon(from: Point2D, to: Point2D, polygon: Point2D[]) {
  if (!pointInPolygon(from, polygon) || !pointInPolygon(to, polygon)) return false
  const dx = to[0] - from[0], dz = to[1] - from[1]
  const cuts = [0, 1]
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length], ex = b[0] - a[0], ez = b[1] - a[1]
    const denominator = dx * ez - dz * ex
    if (Math.abs(denominator) < epsilon) return
    const ax = a[0] - from[0], az = a[1] - from[1]
    const t = (ax * ez - az * ex) / denominator, u = (ax * dz - az * dx) / denominator
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
  })
  cuts.sort((a, b) => a - b)
  return cuts.slice(1).every((cut, index) => {
    const midpoint = (cuts[index] + cut) / 2
    return pointInPolygon([from[0] + midpoint * dx, from[1] + midpoint * dz], polygon)
  })
}
export function addPartition(snapshot: ProjectSnapshot, input: PartitionInput): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  requireId(input.id)
  const wall = WallSchema.parse({ ...input, kind: 'interior', estimated: true })
  if (wallLength(wall) < .2 || wall.thickness < .05 || wall.thickness > .5 || wall.height > next.geometry.ceiling.elevation) throw new Error('Invalid partition dimensions')
  if (!segmentInsidePolygon(wall.from, wall.to, next.apartment.perimeter)) throw new Error('Partition must stay inside the apartment')
  return replaceArchitecture(next, { ...architecture, partitionWallIds: [...architecture.partitionWallIds, wall.id], apartment: { ...architecture.apartment, walls: [...architecture.apartment.walls, wall] } })
}
export function removePartition(snapshot: ProjectSnapshot, id: string): EditorSnapshot {
  const next = ensureEditor(snapshot), architecture = getActiveArchitecture(next)
  if (!architecture.partitionWallIds.includes(id)) throw new Error('Only editor partitions can be removed')
  if ([...next.apartment.doors, ...next.apartment.windows].some(opening => opening.wallId === id)) throw new Error('Partition has openings')
  return replaceArchitecture(next, { ...architecture, partitionWallIds: architecture.partitionWallIds.filter(item => item !== id), apartment: { ...architecture.apartment, walls: architecture.apartment.walls.filter(item => item.id !== id) }, layouts: architecture.layouts.map(layout => {
    if (!layout.customization || !(id in layout.customization.wallColors)) return layout
    const wallColors = { ...layout.customization.wallColors }
    delete wallColors[id]
    return { ...layout, customization: { ...layout.customization, wallColors } }
  }) })
}
