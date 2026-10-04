import {
  ApartmentSchema,
  SCENE_SCHEMA_VERSION,
  type Point2D,
  type Wall,
} from '@t3-designer/scene-schema'

// The screenshot provides AREAS only. None of the lengths below are surveyed.
// These chosen dimensions reconcile the proportional drawing with the videos. All other
// boundaries are solved from the reported areas, retaining full precision so
// adjacent room polygons meet. Wall thickness is an overlay on these area zones;
// the resulting clear floor area must not be presented as a Carrez measurement.
const estimated = {
  bedroomDepth: 3.5,
  westStripWidth: 2.2,
  closetWidth: 1.1,
  wcWidth: 0.72,
  balconyWidth: 2.4,
  wallHeight: 2.7,
  exteriorThickness: 0.18,
  interiorThickness: 0.1,
}

// Values transcribed from the supplied image, not independently verified against
// the diagnostic report referenced in its footer. Areas are square meters.
const reported = {
  living: 16.39,
  kitchen: 4.26,
  bedroom1: 11.81,
  bedroom2: 9.32,
  bathroom: 3.21,
  entrance: 2.26,
  wc: 0.87,
  closet: 1.06,
  balcony: 1.26,
  basement: 8.54,
  carrez: 49.18,
}

// Plan coordinates are [X, Z]: right is +X, down is +Z. The schema's east/south
// labels are historical plan-axis labels, not surveyed compass bearings.
// The origin is the upper-left corner of the bounding rectangle, outside the
// stepped footprint; Y is height above its finished floor. The provisional
// true-north registration now lives in apartment-placement.ts.
const xService = estimated.westStripWidth
const zBedroomsSouth = estimated.bedroomDepth
const lowerDepth =
  (reported.entrance + reported.bathroom + reported.wc + reported.kitchen) /
  xService
const zSouth = zBedroomsSouth + lowerDepth
const xLivingEast = xService + reported.living / lowerDepth
const xEast = xLivingEast + estimated.closetWidth
const xBedroomsWest =
  xEast - (reported.bedroom1 + reported.bedroom2) / estimated.bedroomDepth
const xBedroomDivider = xBedroomsWest + reported.bedroom1 / estimated.bedroomDepth
const zEntranceSouth = zBedroomsSouth + reported.entrance / xService
const zBathroomSouth = zEntranceSouth + (reported.bathroom + reported.wc) / xService
const zWcSouth = zEntranceSouth + reported.wc / estimated.wcWidth
const zClosetSouth = zBedroomsSouth + reported.closet / estimated.closetWidth

function rectangle(west: number, north: number, east: number, south: number): Point2D[] {
  return [[west, north], [east, north], [east, south], [west, south]]
}

const perimeter: Point2D[] = [
  [xBedroomsWest, 0],
  [xEast, 0],
  [xEast, zClosetSouth],
  [xLivingEast, zClosetSouth],
  [xLivingEast, zSouth],
  [0, zSouth],
  [0, zBedroomsSouth],
  [xBedroomsWest, zBedroomsSouth],
]

function wall(id: string, from: Point2D, to: Point2D, kind: Wall['kind']): Wall {
  return {
    id, from, to, kind,
    height: estimated.wallHeight,
    thickness: kind === 'exterior' ? estimated.exteriorThickness : estimated.interiorThickness,
    estimated: true,
  }
}

const exteriorWallIds = [
  'exterior-north', 'exterior-east', 'exterior-closet-south',
  'exterior-living-east', 'exterior-south', 'exterior-west',
  'exterior-entrance-north', 'exterior-bedroom-west',
]

export const t3Apartment = ApartmentSchema.parse({
  schemaVersion: SCENE_SCHEMA_VERSION,
  id: 'demo-t3',
  name: 'T3 · Demonstration apartment',
  units: 'meters',
  coordinateSystem: { x: 'east', y: 'up', z: 'south' },
  perimeter,
  rooms: [
    {
      id: 'bedroom-1', name: 'Chambre 1', reportedArea: reported.bedroom1,
      polygon: rectangle(xBedroomsWest, 0, xBedroomDivider, zBedroomsSouth),
      color: '#dfc7bf',
    },
    {
      id: 'bedroom-2', name: 'Chambre 2', reportedArea: reported.bedroom2,
      polygon: rectangle(xBedroomDivider, 0, xEast, zBedroomsSouth),
      color: '#c9d2bd',
    },
    {
      id: 'living', name: 'Salon / séjour', reportedArea: reported.living,
      polygon: rectangle(xService, zBedroomsSouth, xLivingEast, zSouth),
      color: '#e3d5bd',
    },
    {
      id: 'entrance', name: 'Entrée', reportedArea: reported.entrance,
      polygon: rectangle(0, zBedroomsSouth, xService, zEntranceSouth),
      color: '#ded6c3',
    },
    {
      id: 'wc', name: 'WC', reportedArea: reported.wc,
      polygon: rectangle(0, zEntranceSouth, estimated.wcWidth, zWcSouth),
      color: '#c9dadb',
    },
    {
      id: 'bathroom', name: 'Salle d’eau', reportedArea: reported.bathroom,
      // L-shaped: the WC occupies the northwest corner of this service block.
      polygon: [
        [estimated.wcWidth, zEntranceSouth], [xService, zEntranceSouth],
        [xService, zBathroomSouth], [0, zBathroomSouth],
        [0, zWcSouth], [estimated.wcWidth, zWcSouth],
      ],
      color: '#c1d3d2',
    },
    {
      id: 'kitchen', name: 'Cuisine', reportedArea: reported.kitchen,
      polygon: rectangle(0, zBathroomSouth, xService, zSouth),
      color: '#cfbea3',
    },
    {
      id: 'closet', name: 'Placard', reportedArea: reported.closet,
      polygon: rectangle(xLivingEast, zBedroomsSouth, xEast, zClosetSouth),
      color: '#ccc9bc',
    },
  ],
  walls: [
    ...perimeter.map((from, index) => wall(
      exteriorWallIds[index], from, perimeter[(index + 1) % perimeter.length], 'exterior',
    )),
    wall('bedroom-divider', [xBedroomDivider, 0], [xBedroomDivider, zBedroomsSouth], 'interior'),
    wall('bedroom-1-south', [xBedroomsWest, zBedroomsSouth], [xBedroomDivider, zBedroomsSouth], 'interior'),
    wall('bedroom-2-south', [xBedroomDivider, zBedroomsSouth], [xEast, zBedroomsSouth], 'interior'),
    wall('service-spine', [xService, zBedroomsSouth], [xService, zBathroomSouth], 'interior'),
    wall('entrance-service', [0, zEntranceSouth], [xService, zEntranceSouth], 'interior'),
    wall('wc-east', [estimated.wcWidth, zEntranceSouth], [estimated.wcWidth, zWcSouth], 'interior'),
    wall('wc-south', [0, zWcSouth], [estimated.wcWidth, zWcSouth], 'interior'),
    wall('bathroom-south', [0, zBathroomSouth], [xService, zBathroomSouth], 'interior'),
    wall('kitchen-living', [xService, zBathroomSouth], [xService, zSouth], 'interior'),
    wall('closet-west', [xLivingEast, zBedroomsSouth], [xLivingEast, zClosetSouth], 'interior'),
    // Video V04 shows a cased kitchen opening, with short returns and a lintel.
  ],
  // The six visible door swings are schematic. Positions, widths, heights, and
  // the renderer's open angle are estimates. Offsets follow each wall's direction.
  doors: [
    {
      id: 'main-entry', appearance: 'panel', finish: 'blue-gray', wallId: 'exterior-west',
      // Leave room for both perpendicular wall thicknesses in this narrow zone.
      offset: zSouth - (zBedroomsSouth + 0.11 + 0.68), width: 0.68, height: 2.04,
      hinge: 'end', opensToward: 1, locationConfidence: 'schematic', estimated: true,
    },
    {
      id: 'entrance-living', appearance: 'passage', finish: 'blue-gray', wallId: 'service-spine',
      offset: 0.08, width: 0.68, height: 2.04,
      hinge: 'end', opensToward: 1, locationConfidence: 'schematic', estimated: true,
    },
    {
      id: 'bedroom-1-entry', appearance: 'passage', finish: 'gray', wallId: 'bedroom-1-south',
      offset: xService + 0.22 - xBedroomsWest, width: 0.73, height: 2.04,
      hinge: 'end', opensToward: -1, locationConfidence: 'schematic', estimated: true,
    },
    {
      id: 'bedroom-2-entry', appearance: 'passage', finish: 'gray', wallId: 'bedroom-2-south',
      offset: 0.38, width: 0.73, height: 2.04,
      hinge: 'start', opensToward: -1, locationConfidence: 'schematic', estimated: true,
    },
    {
      id: 'bathroom-entry', appearance: 'passage', finish: 'blue-gray', wallId: 'entrance-service',
      offset: xService - 0.14 - 0.68, width: 0.68, height: 2.04,
      hinge: 'end', opensToward: 1, locationConfidence: 'schematic', estimated: true,
    },
    {
      id: 'closet-entry', appearance: 'panel', finish: 'gray', condition: 'damaged-panel', wallId: 'closet-west',
      offset: 0.08, width: 0.73, height: 2.04,
      hinge: 'start', opensToward: 1, locationConfidence: 'schematic', estimated: true,
    },
    {
      // P03 confirms the separate WC door opening outward into the entrance.
      id: 'wc-entry', wallId: 'entrance-service',
      offset: 0.10, width: 0.55, height: 2.04,
      hinge: 'start', opensToward: -1, locationConfidence: 'observed', estimated: true,
      appearance: 'panel', finish: 'blue-gray', evidence: 'P03 and V04: separate WC opens from entrance; dimensions estimated.',
    },
    { id: 'kitchen-passage', wallId: 'kitchen-living', offset: 0.18, width: 1.55, height: 2.16,
      hinge: 'start', opensToward: 1, locationConfidence: 'observed', estimated: true,
      appearance: 'passage', finish: 'white', evidence: 'V04 40-44s: kitchen opening under lintel with short returns.' },
  ],
  // Presence is observed; exact placement/size is photo-aligned and estimated.
  windows: [
    { id: 'bedroom-1-window', wallId: 'exterior-north', offset: 0.78, width: 1.48, height: 1.36, sillHeight: 0.83, estimated: true, kind: 'casement', locationConfidence: 'observed', evidence: 'P07/P09/P10 and V04: two-leaf white window, radiator below.' },
    { id: 'bedroom-2-window', wallId: 'exterior-north', offset: xBedroomDivider - xBedroomsWest + 0.62, width: 1.40, height: 1.36, sillHeight: 0.83, estimated: true, kind: 'casement', locationConfidence: 'observed', evidence: 'P07 and V04: second bedroom window; exact room identity provisional.' },
    { id: 'kitchen-window', wallId: 'exterior-south', offset: xLivingEast - 1.66, width: 1.30, height: 1.12, sillHeight: 1.02, estimated: true, kind: 'casement', locationConfidence: 'observed', evidence: 'P06/P11 and V02: window along counter, partly obscured by fridge.' },
    { id: 'balcony-access', wallId: 'exterior-south', offset: 0.63, width: 1.46, height: 2.18, sillHeight: 0.02, estimated: true, kind: 'balcony-door', locationConfidence: 'observed', evidence: 'V04 40-44s: white double French door with opaque lower panels.' },
  ],
  balcony: {
    id: 'balcony', name: 'Balcon', reportedArea: reported.balcony,
    polygon: rectangle(
      xLivingEast - estimated.balconyWidth, zSouth,
      xLivingEast, zSouth + reported.balcony / estimated.balconyWidth,
    ),
  },
  metadata: {
    source: 'Generalized demonstration model. The public plan is rendered from this model; supplied reference documents and identifying metadata are not included.',
    description: 'Reusable authored apartment geometry with preserved illustrative area values and furnishings. Local dimensions and placements remain approximate; this demo is not a property diagnosis or survey.',
    reportedCarrezArea: reported.carrez,
    reportedBasementArea: reported.basement,
    assumptions: [
      'All polygon coordinates, wall lengths, thicknesses, heights, opening sizes, offsets, door swings, and balcony dimensions are estimated.',
      'Estimated anchors: bedroom depth 3.50 m, west strip width 2.20 m (revised for U kitchen), closet width 1.10 m, WC width 0.72 m, balcony width 2.40 m. Remaining dimensions follow from reported areas.',
      'Conceptual room polygons preserve the eight reported areas, totaling 49.18 m². Walls are centered on zone boundaries and overlap the floor polygons; wall thickness is not deducted. This is not a measured net-area or Carrez model.',
      'Wall height 2.70 m (estimated to accommodate observed utility recess above doors), exterior thickness 0.18 m, interior thickness 0.10 m, door height 2.04 m, and door widths 0.55–0.73 m are assumptions.',
      'Openings combine the schematic with visual evidence: bedroom portals widened apart, WC access confirmed, kitchen passage and balcony access observed. Unseen leaf swings remain estimates.',
      'The kitchen has a cased opening to the living room. Its reconstructed short dimension is 1.936 m, allowing two 0.60 m cabinet runs and a roughly 0.74 m conceptual aisle; real clear widths need measurement.',
      'Material colors and surface grain are visual approximations. Wear/damage is selectively represented, not a complete condition survey.',
      'Stored plan axes use the historical east/south labels: +X is drawing-right, +Z is drawing-down, +Y is up. The drawing arrow is not a surveyed compass alignment. The separate apartment-placement transform provisionally aligns the living/kitchen to the southwest courtyard and bedrooms to the northeast as an illustrative placement.',
    ],
    unresolved: [
      'Surveyed wall lengths, angles, thicknesses, ceiling heights, and true room shapes are unavailable.',
      'Window presence/type is visually observed, but exact positions, dimensions and sill heights require measurement.',
      'Balcony French door and metal railing are visible in V04; exact balcony proportions and rail spacing remain estimates.',
      'Door dimensions, exact offsets and hidden hinge details need measurement. Model is photo-aligned rather than surveyed.',
      'The 8.54 m² basement is an illustrative annex area outside the apartment total but has no plan, location, or level data; it is not reconstructed.',
    ],
  },
})
