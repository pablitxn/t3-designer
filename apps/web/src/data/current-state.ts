import { AssetSchema, FixtureSchema, type Asset, type Fixture, type Mobility } from '@t3-designer/scene-schema'
import { t3Apartment } from './t3.ts'

// Visual replicas, never manufacturer-verified dimensions. Individual GLBs remain
// replaceable while the architectural source of truth stays in t3.ts.
const catalog: [string, string, [number, number, number], string, Mobility][] = [
  ['fridge-freezer', 'Heladera / freezer', [0.60, 1.85, 0.64], 'P06 / P11 · acero inoxidable, dos puertas', 'movable'],
  ['washing-machine', 'Lavarropas frontal', [0.60, 0.85, 0.60], 'P02 · frontal blanco bajo mesada', 'fixed'],
  ['oven-cooktop', 'Horno y placa', [0.60, 0.88, 0.60], 'P08 / V02 · horno negro y placa de cuatro zonas', 'fixed'],
  ['microwave', 'Microondas', [0.48, 0.29, 0.38], 'P08 / P11 · negro, sobre mesada', 'movable'],
  ['extractor-hood', 'Campana extractora', [0.60, 0.65, 0.48], 'P08 · campana y chimenea de acero', 'fixed'],
  ['boiler', 'Caldera mural', [0.40, 0.75, 0.30], 'P06 / P11 · carcasa blanca', 'fixed'],
  ['base-cabinet', 'Mueble bajo de cocina', [0.60, 0.90, 0.60], 'P06 / P08 / V02 · roble, frentes enmarcados', 'fixed'],
  ['sink-cabinet', 'Mueble con pileta y escurridor', [0.90, 1.05, 0.60], 'P06 / P11 · una pileta de acero', 'fixed'],
  ['wall-cabinet', 'Alacena', [0.80, 0.70, 0.32], 'P06 / P11 · roble, dos hojas', 'fixed'],
  ['bathroom-vanity', 'Vanitory y lavabo', [0.60, 0.88, 0.50], 'P02 · un lavabo circular de acero; el segundo es un reflejo', 'fixed'],
  ['toilet', 'Inodoro', [0.38, 0.78, 0.65], 'P03 / V04 · cerámica blanca', 'fixed'],
  ['radiator', 'Radiador', [0.90, 0.60, 0.10], 'P07 / P10 / V04 · panel blanco', 'fixed'],
  ['towel-rail', 'Toallero radiador', [0.45, 0.70, 0.10], 'P02 · blanco, visible en espejo', 'fixed'],
  ['glass-block-screen', 'Mampara de ladrillos de vidrio', [0.80, 2.10, 0.08], 'P02 / V04 · bloques translúcidos', 'fixed'],
  ['shower-tray', 'Receptor de ducha', [0.80, 0.12, 0.80], 'V04 03s · receptor elevado blanco', 'fixed'],
  ['electrical-panel', 'Tablero eléctrico', [0.38, 0.52, 0.09], 'P04 · sobre paso entrada–living', 'fixed'],
  ['low-table', 'Mesa baja de madera', [0.65, 0.48, 0.65], 'V04 44s · junto al acceso al balcón', 'movable'],
  ['wall-mirror', 'Espejo de baño', [1.20, 1.00, 0.035], 'P02 · sobre lavabo y lavarropas', 'fixed'],
]
export const assetCatalog: Asset[] = catalog.map(([id, label, dimensions, evidence, mobility]) => AssetSchema.parse({
  id, label, dimensions, evidence, mobility, url: `/models/current/${id}.glb`, dimensionalStatus: 'estimated',
}))

function bounds(id: string) {
  const room = t3Apartment.rooms.find(room => room.id === id)!
  return {
    west: Math.min(...room.polygon.map(p => p[0])), east: Math.max(...room.polygon.map(p => p[0])),
    north: Math.min(...room.polygon.map(p => p[1])), south: Math.max(...room.polygon.map(p => p[1])),
  }
}
const k = bounds('kitchen'), b = bounds('bathroom'), wc = bounds('wc'), living = bounds('living')
const halfTurn = Math.PI, quarterTurn = Math.PI / 2
const raw: Omit<Fixture, 'placementStatus' | 'evidence' | 'label'>[] = [
  { id: 'k-fridge', assetId: 'fridge-freezer', roomId: 'kitchen', position: [k.east - 0.43, 0.015, k.south - 0.43], rotation: halfTurn },
  { id: 'k-sink', assetId: 'sink-cabinet', roomId: 'kitchen', position: [k.west + 0.40, 0.015, (k.north + k.south) / 2], rotation: quarterTurn },
  { id: 'k-oven', assetId: 'oven-cooktop', roomId: 'kitchen', position: [k.west + 1.06, 0.015, k.north + 0.36], rotation: 0 },
  { id: 'k-drawers', assetId: 'base-cabinet', roomId: 'kitchen', position: [k.west + 1.67, 0.015, k.north + 0.36], rotation: 0 },
  { id: 'k-south-cabinet', assetId: 'base-cabinet', roomId: 'kitchen', position: [k.west + 1.02, 0.015, k.south - 0.39], rotation: halfTurn },
  { id: 'k-microwave', assetId: 'microwave', roomId: 'kitchen', position: [k.west + 1.67, 0.925, k.north + 0.36], rotation: 0 },
  { id: 'k-hood', assetId: 'extractor-hood', roomId: 'kitchen', position: [k.west + 1.06, 1.52, k.north + 0.30], rotation: 0 },
  { id: 'k-boiler', assetId: 'boiler', roomId: 'kitchen', position: [k.west + 0.49, 1.20, k.north + 0.22], rotation: 0 },
  { id: 'k-upper', assetId: 'wall-cabinet', roomId: 'kitchen', position: [k.west + 0.25, 1.48, (k.north + k.south) / 2], rotation: quarterTurn },
  { id: 'b-washer', assetId: 'washing-machine', roomId: 'bathroom', position: [wc.east + 0.36, 0.015, b.north + 0.45], rotation: quarterTurn },
  { id: 'b-vanity', assetId: 'bathroom-vanity', roomId: 'bathroom', position: [wc.east + 0.31, 0.015, b.north + 1.06], rotation: quarterTurn },
  { id: 'b-shower', assetId: 'shower-tray', roomId: 'bathroom', position: [b.east - 0.47, 0.015, b.south - 0.47], rotation: 0 },
  { id: 'b-glass', assetId: 'glass-block-screen', roomId: 'bathroom', position: [0.90, 0.015, b.south - 0.24], rotation: 0 },
  { id: 'b-towel', assetId: 'towel-rail', roomId: 'bathroom', position: [b.east - 0.11, 0.50, b.north + 0.53], rotation: -quarterTurn },
  { id: 'b-mirror', assetId: 'wall-mirror', roomId: 'bathroom', position: [wc.east + 0.075, 0.98, b.north + 0.755], rotation: quarterTurn },
  { id: 'wc-toilet', assetId: 'toilet', roomId: 'wc', position: [(wc.west + wc.east) / 2, 0.015, wc.south - 0.405], rotation: halfTurn },
  { id: 'living-radiator', assetId: 'radiator', roomId: 'living', position: [living.west + 0.11, 0.18, 5.53], rotation: quarterTurn },
  { id: 'living-table', assetId: 'low-table', roomId: 'living', position: [living.east - 0.50, 0.015, living.south - 0.60], rotation: 0 },
  { id: 'entry-electrics', assetId: 'electrical-panel', roomId: 'entrance', position: [living.west - 0.13, 2.07, 4.04], rotation: -quarterTurn },
  ...t3Apartment.windows.filter(w => w.id.startsWith('bedroom')).map((window, i) => ({
    id: `bedroom-${i + 1}-radiator`, assetId: 'radiator', roomId: `bedroom-${i + 1}`,
    position: [t3Apartment.walls[0].from[0] + window.offset + window.width / 2, 0.14, 0.16] as [number, number, number], rotation: 0,
  })),
]
export const currentFixtures: Fixture[] = raw.map(fixture => {
  const asset = assetCatalog.find(a => a.id === fixture.assetId)!
  return FixtureSchema.parse({ ...fixture, label: asset.label, evidence: asset.evidence, mobility: asset.mobility, placementStatus: 'estimated' })
})

export const reconstructionNotes = [
  'Pisos, colores, aberturas y equipamiento reconstruidos con 11 fotos y 4 videos.',
  'Las superficies provienen del plano. Medidas lineales, alturas y posiciones son estimaciones.',
  'Cocina en U, acceso al balcón y separación entre dormitorios ajustados según los videos.',
  'La distribución precisa de la ducha y la mampara queda pendiente de un plano medido del baño.',
  'Desgaste representativo; esta base todavía no reproduce cada rotura o irregularidad.',
]
