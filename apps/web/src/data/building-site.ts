/**
 * Generalized demonstration dataset. Source geometry retained from open-data
 * research (2026-09-26); direct identifiers, addresses and geolocation removed.
 * Units: metres. x = east, z = south, y = up in a local illustrative frame.
 * The separate regional solar origin is approximate and does not locate these
 * footprints. Geometry is intentionally preserved, not guaranteed anonymous.
 * Attribution and transformations: docs/research/building-research.md.
 */
export type SitePoint = [number, number];

export interface BuildingFootprint {
  id: string;
  rnbId: string | null;
  isTarget: boolean;
  label: string;
  footprint: SitePoint[];
  holes?: SitePoint[][];
  /** IGN hauteur: eaves/perimeter height above lowest ground; not ridge height. */
  height: number;
  /** Range between IGN maximum and minimum roof elevation, not roof shape. */
  roofHeight: number;
  groundAltitude: number | null;
  groundOffset: number;
  floors: number | null;
  planarAccuracy: number | null;
  verticalAccuracy: number | null;
  source: 'ign-bdtopo' | 'estimated' | 'generalized-demo';
}

export interface SiteRoad {
  id: string;
  name: string;
  points: SitePoint[];
  width: number;
  isPath: boolean;
}

export const BUILDING_SITE = {
  "latitude": 48.0,
  "longitude": -4.0,
  "timeZone": "Europe/Paris",
  "address": "T3 · Demonstration apartment",
  "officialAddress": "Generalized demonstration site · no postal address",
  "targetId": "demo-building-001",
  "rnbId": "demo-reference-001",
  "groundAltitude": 8.8,
  "retrievedAt": "2026-09-26",
  "radiusMeters": 95,
  "attribution": "Adapted from © IGN · BD TOPO / BAN · DGFiP cadastre · RNB — Licence Ouverte 2.0; local geometry retained, identifiers and geolocation generalized",
  "rnbUrl": "https://rnb.beta.gouv.fr/",
  "mapUrl": "https://geoservices.ign.fr/bdtopo",
  "datasetKind": "generalized-demo",
  "geolocationNote": "Approximate regional solar origin only. This is not a surveyed location or an official property record."
} as const;

export const SITE_BUILDINGS: BuildingFootprint[] = [
  {"id":"demo-building-001","rnbId":"demo-reference-001","isTarget":true,"label":"Edificio de demostración","footprint":[[-11.608,-13.256],[-15.538,-15.615],[-21.713,-7.221],[14.6,14.418],[16.817,17.835],[25.373,12.441],[21.988,7.221],[-12.052,-12.614]],"height":15.5,"roofHeight":0.8,"groundAltitude":8.8,"groundOffset":0,"floors":5,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-002","rnbId":"demo-reference-002","isTarget":false,"label":"Anexo","footprint":[[-5.46,18.137],[-2.775,13.374],[-4.369,12.412],[-5.319,11.895],[-8.004,16.658]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-003","rnbId":"demo-reference-003","isTarget":false,"label":"Anexo","footprint":[[-10.341,15.262],[-7.547,10.59],[-9.983,9.202],[-10.101,9.012],[-12.885,13.784]],"height":3.2,"roofHeight":0.3,"groundAltitude":7.3,"groundOffset":-1.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-004","rnbId":"demo-reference-004","isTarget":false,"label":"Anexo","footprint":[[-10.341,15.262],[-9.489,15.788],[-8.004,16.658],[-5.319,11.895],[-5.854,11.541],[-7.547,10.59]],"height":2.7,"roofHeight":0.2,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-005","rnbId":"demo-reference-005","isTarget":false,"label":"Anexo","footprint":[[-2.775,13.374],[-5.46,18.137],[-3.023,19.525],[-0.33,14.862],[-1.498,14.163]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-006","rnbId":"demo-reference-006","isTarget":false,"label":"Anexo","footprint":[[-12.885,13.784],[-10.101,9.012],[-12.537,7.624],[-15.43,12.305],[-12.994,13.693]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-007","rnbId":"demo-reference-007","isTarget":false,"label":"Anexo","footprint":[[-15.43,12.305],[-12.537,7.624],[-15.181,6.154],[-17.866,10.918]],"height":3.2,"roofHeight":0.3,"groundAltitude":7.3,"groundOffset":-1.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-008","rnbId":"demo-reference-008","isTarget":false,"label":"Anexo","footprint":[[-0.33,14.862],[-3.023,19.525],[-1.43,20.486],[-0.796,20.83],[1.998,16.158]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-009","rnbId":"demo-reference-009","isTarget":false,"label":"Anexo","footprint":[[-17.866,10.918],[-15.181,6.154],[-17.309,4.84],[-20.093,9.612]],"height":3.2,"roofHeight":0.3,"groundAltitude":7.3,"groundOffset":-1.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-010","rnbId":"demo-reference-010","isTarget":false,"label":"Anexo","footprint":[[-0.796,20.83],[1.857,22.4],[4.551,17.736],[1.998,16.158]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-011","rnbId":"demo-reference-011","isTarget":false,"label":"Anexo","footprint":[[-17.309,4.84],[-19.854,3.361],[-22.638,8.134],[-22.104,8.487],[-20.093,9.612]],"height":3,"roofHeight":0.1,"groundAltitude":7.5,"groundOffset":-1.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-012","rnbId":"demo-reference-012","isTarget":false,"label":"Anexo","footprint":[[4.551,17.736],[1.857,22.4],[5.887,24.749],[11.017,21.473]],"height":2.7,"roofHeight":0.3,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-013","rnbId":"demo-reference-013","isTarget":false,"label":"Anexo","footprint":[[-19.854,3.361],[-22.19,1.965],[-24.974,6.737],[-22.638,8.134]],"height":3,"roofHeight":0,"groundAltitude":7.5,"groundOffset":-1.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-014","rnbId":"demo-reference-014","isTarget":false,"label":"Edificio vecino","footprint":[[22.009,-23.725],[14.379,-21.429],[15.03,-19.78],[8.057,-23.571],[3.498,-20.648],[9.421,-17.365],[18.513,-12.358],[19.818,-12.376],[23.532,-13.514],[24.802,-15.035]],"height":6.9,"roofHeight":3,"groundAltitude":10,"groundOffset":1.2,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-015","rnbId":"demo-reference-015","isTarget":false,"label":"Anexo","footprint":[[-17.537,-19.955],[-13.892,-25.207],[-10.913,-23.367],[-12.953,-20.369],[-13.941,-19.074],[-14.749,-17.996]],"height":2.7,"roofHeight":0.2,"groundAltitude":7.7,"groundOffset":-1.1,"floors":1,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-016","rnbId":"demo-reference-016","isTarget":false,"label":"Anexo","footprint":[[-11.718,30.055],[-9.051,25.092],[-11.388,23.696],[-14.263,28.577]],"height":4.1,"roofHeight":0,"groundAltitude":6.2,"groundOffset":-2.6,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-017","rnbId":"demo-reference-017","isTarget":false,"label":"Anexo","footprint":[[-21.788,24.233],[-19.013,19.36],[-19.972,18.743],[-21.349,17.964],[-24.124,22.836]],"height":3.6,"roofHeight":0,"groundAltitude":6.7,"groundOffset":-2.1,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-018","rnbId":"demo-reference-018","isTarget":false,"label":"Anexo","footprint":[[-9.051,25.092],[-11.718,30.055],[-10.767,30.572],[-9.5,31.261],[-6.615,26.48],[-8.418,25.437]],"height":4.1,"roofHeight":0,"groundAltitude":6.2,"groundOffset":-2.6,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-019","rnbId":"demo-reference-019","isTarget":false,"label":"Anexo","footprint":[[-16.577,20.748],[-19.252,25.612],[-17.441,26.753],[-16.699,27.189],[-13.823,22.308]],"height":3.8,"roofHeight":0,"groundAltitude":6.5,"groundOffset":-2.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-020","rnbId":"demo-reference-020","isTarget":false,"label":"Edificio vecino","footprint":[[-36.079,-9.441],[-29.923,-18.034],[-23.466,-13.292],[-23.82,-12.757],[-22.208,-11.597],[-27.911,-3.547]],"height":9.5,"roofHeight":2.8,"groundAltitude":7.2,"groundOffset":-1.6,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-021","rnbId":"demo-reference-021","isTarget":false,"label":"Anexo","footprint":[[-14.263,28.577],[-11.388,23.696],[-13.823,22.308],[-16.699,27.189],[-15.856,27.615],[-15.431,27.879]],"height":3.8,"roofHeight":0,"groundAltitude":6.5,"groundOffset":-2.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-022","rnbId":"demo-reference-022","isTarget":false,"label":"Anexo","footprint":[[-19.013,19.36],[-21.788,24.233],[-20.095,25.185],[-19.252,25.612],[-16.577,20.748]],"height":4,"roofHeight":0,"groundAltitude":6.3,"groundOffset":-2.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-023","rnbId":"demo-reference-023","isTarget":false,"label":"Anexo","footprint":[[-6.615,26.48],[-9.5,31.261],[-6.955,32.74],[-1.635,29.345]],"height":4.2,"roofHeight":0,"groundAltitude":6.1,"groundOffset":-2.7,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-024","rnbId":"demo-reference-024","isTarget":false,"label":"Edificio vecino","footprint":[[10.684,-36.768],[7.368,-35.665],[-2.4,-32.573],[-0.574,-26.811],[1.383,-27.39],[3.498,-20.648],[8.057,-23.571],[12.616,-26.495],[11.395,-30.001],[11.884,-30.146],[11.432,-31.813],[12.212,-32.084]],"height":6.9,"roofHeight":2,"groundAltitude":10,"groundOffset":1.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-025","rnbId":"demo-reference-025","isTarget":false,"label":"Anexo","footprint":[[-23.894,16.485],[-26.669,21.357],[-26.135,21.711],[-24.124,22.836],[-21.349,17.964],[-22.834,17.093]],"height":3.8,"roofHeight":0,"groundAltitude":6.5,"groundOffset":-2.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-026","rnbId":"demo-reference-026","isTarget":false,"label":"Edificio vecino","footprint":[[14.379,-21.429],[12.616,-26.495],[19.549,-30.938],[20.498,-28.21],[22.009,-23.725]],"height":9.1,"roofHeight":2.4,"groundAltitude":8.6,"groundOffset":-0.2,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-027","rnbId":"demo-reference-027","isTarget":false,"label":"Anexo","footprint":[[-26.221,15.189],[-28.997,20.061],[-26.986,21.185],[-26.669,21.357],[-23.894,16.485]],"height":3.8,"roofHeight":0,"groundAltitude":6.5,"groundOffset":-2.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-028","rnbId":"demo-reference-028","isTarget":false,"label":"Anexo","footprint":[[-28.766,13.71],[-31.541,18.582],[-31.224,18.754],[-28.997,20.061],[-26.221,15.189],[-26.964,14.753],[-27.814,14.227]],"height":4,"roofHeight":0,"groundAltitude":6.3,"groundOffset":-2.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-029","rnbId":"demo-reference-029","isTarget":false,"label":"Anexo","footprint":[[34.504,13.426],[29.683,14.564],[28.654,9.835],[33.022,7.029]],"height":2.4,"roofHeight":0.4,"groundAltitude":7.8,"groundOffset":-1,"floors":1,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-030","rnbId":"demo-reference-030","isTarget":false,"label":"Anexo","footprint":[[-31.541,18.582],[-28.766,13.71],[-31.202,12.322],[-34.086,17.104]],"height":4,"roofHeight":0,"groundAltitude":6.3,"groundOffset":-2.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-031","rnbId":"demo-reference-031","isTarget":false,"label":"Anexo","footprint":[[34.294,15.554],[34.312,15.753],[34.139,16.07],[34.474,17.548],[31.529,18.315],[31.068,16.548]],"height":2.6,"roofHeight":0.3,"groundAltitude":7.6,"groundOffset":-1.2,"floors":0,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-032","rnbId":"demo-reference-032","isTarget":false,"label":"Edificio vecino","footprint":[[34.763,17.421],[34.474,17.548],[34.139,16.07],[34.312,15.753]],"height":2,"roofHeight":0.2,"groundAltitude":7.7,"groundOffset":-1.1,"floors":null,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-033","rnbId":"demo-reference-033","isTarget":false,"label":"Edificio vecino","footprint":[[4.754,-43.468],[7.368,-35.665],[10.684,-36.768],[15.94,-38.65],[13.335,-46.351],[12.755,-46.098],[10.408,-45.384]],"height":6.8,"roofHeight":3.4,"groundAltitude":10,"groundOffset":1.2,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-034","rnbId":"demo-reference-034","isTarget":false,"label":"Edificio vecino","footprint":[[-26.675,-24.355],[-34.265,-13.824],[-43.138,-19.754],[-42.513,-20.615],[-44.433,-21.848],[-42.465,-24.538],[-37.36,-31.428],[-36.816,-32.08],[-36.372,-32.723],[-26.05,-25.215]],"height":6.7,"roofHeight":3.4,"groundAltitude":7.3,"groundOffset":-1.5,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-035","rnbId":"demo-reference-035","isTarget":false,"label":"Anexo","footprint":[[-45.674,20.059],[-43.733,17.07],[-41.397,18.468],[-43.528,21.573]],"height":3,"roofHeight":0.5,"groundAltitude":5.6,"groundOffset":-3.2,"floors":1,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-036","rnbId":"demo-reference-036","isTarget":false,"label":"Edificio vecino","footprint":[[-15.935,36.765],[-14.241,37.717],[-19.638,46.944],[-22.4,45.286],[-23.261,46.87],[-26.766,44.775],[-27.627,46.36],[-29.738,45.244],[-33.034,43.231],[-32.281,41.555],[-35.785,39.46],[-34.842,37.668],[-38.88,35.219],[-33.937,26.534],[-27.68,30.189],[-27.236,29.547],[-23.324,31.705],[-23.668,32.339]],"height":11.5,"roofHeight":4.6,"groundAltitude":5.6,"groundOffset":-3.2,"floors":4,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-037","rnbId":"demo-reference-037","isTarget":false,"label":"Edificio vecino","footprint":[[39.065,-34.005],[38.965,-33.995],[32.551,-33.819],[32.981,-26.825],[33.295,-22.231],[42.998,-22.705],[42.405,-31.494],[44.109,-31.547],[43.975,-34.147]],"height":7,"roofHeight":2.4,"groundAltitude":9.9,"groundOffset":1.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-038","rnbId":"demo-reference-038","isTarget":false,"label":"Edificio vecino","footprint":[[4.754,-43.468],[10.408,-45.384],[9.197,-48.792],[12.124,-49.759],[10.614,-54.243],[10.423,-54.126],[9.384,-56.745],[2.071,-54.277],[0.802,-53.861],[3.217,-47.146],[3.008,-46.123],[3.93,-43.695]],"height":7.3,"roofHeight":2.9,"groundAltitude":10.2,"groundOffset":1.4,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-039","rnbId":"demo-reference-039","isTarget":false,"label":"Edificio vecino","footprint":[[30.849,60.874],[39.738,55.853],[42.203,55.329],[41.616,52.167],[40.239,52.493],[39.58,48.533],[38.394,48.74],[35.721,35.821],[36.609,35.64],[35.363,29.624],[35.951,29.47],[34.596,23.363],[31.344,24.059],[30.674,23.315],[24.55,24.471],[22.691,26.146],[15.922,27.962],[15.687,27.582],[-5.754,39.362],[1.185,52.802],[3.903,52.858],[15.403,46.697],[19.725,45.602],[19.463,43.818],[24.564,42.454],[27.134,47.546],[26.473,48.009],[27.34,49.839],[25.429,50.915]],"height":10.1,"roofHeight":22.3,"groundAltitude":6.8,"groundOffset":-2,"floors":null,"planarAccuracy":2.5,"verticalAccuracy":1.5,"source":"generalized-demo"},
  {"id":"demo-building-040","rnbId":"demo-reference-040","isTarget":false,"label":"Edificio vecino","footprint":[[-37.36,-31.428],[-42.465,-24.538],[-50.325,-30.358],[-44.576,-37.91],[-36.816,-32.08]],"height":9.4,"roofHeight":2.5,"groundAltitude":7.1,"groundOffset":-1.7,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-041","rnbId":"demo-reference-041","isTarget":false,"label":"Edificio vecino","footprint":[[48.794,7.013],[48.284,-1.984],[56.682,-2.441],[57.092,6.565]],"height":7.5,"roofHeight":2.3,"groundAltitude":8.2,"groundOffset":-0.6,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-042","rnbId":"demo-reference-042","isTarget":false,"label":"Edificio vecino","footprint":[[-8.875,-50.877],[-13.36,-49.367],[-14.307,-55.411],[-14.434,-55.701],[-10.61,-56.749]],"height":3.1,"roofHeight":2,"groundAltitude":8.8,"groundOffset":0,"floors":null,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-043","rnbId":"demo-reference-043","isTarget":false,"label":"Edificio vecino","footprint":[[33.863,-45.994],[29.369,-44.583],[32.262,-34.797],[37.064,-36.135],[35.699,-41.236],[41.615,-41.368],[41.655,-46.495],[37.841,-46.453],[33.828,-46.392]],"height":8.2,"roofHeight":2.6,"groundAltitude":10,"groundOffset":1.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-044","rnbId":"demo-reference-044","isTarget":false,"label":"Edificio vecino","footprint":[[-29.437,-53.844],[-26.191,-57.955],[-17.417,-50.911],[-22.64,-44.21],[-25.556,-46.459],[-24.93,-47.318],[-27.981,-49.957],[-26.82,-51.569]],"height":7.4,"roofHeight":1.7,"groundAltitude":7.9,"groundOffset":-0.9,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-045","rnbId":"demo-reference-045","isTarget":false,"label":"Anexo","footprint":[[56.893,-20.141],[57.33,-10.838],[52.556,-10.306],[51.974,-20.1]],"height":2,"roofHeight":1.4,"groundAltitude":9.1,"groundOffset":0.3,"floors":1,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-046","rnbId":"demo-reference-046","isTarget":false,"label":"Anexo","footprint":[[0.313,-53.716],[-2.716,-62.786],[6.463,-65.725],[9.384,-56.745],[2.071,-54.277],[0.802,-53.861]],"height":10.4,"roofHeight":2.7,"groundAltitude":9.6,"groundOffset":0.8,"floors":1,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-047","rnbId":"demo-reference-047","isTarget":false,"label":"Edificio vecino","footprint":[[52.9,16.89],[52.624,9.379],[59.029,9.103],[61.729,8.96],[62.031,17.874],[53.433,18.349],[53.398,16.844]],"height":8,"roofHeight":2.2,"groundAltitude":8,"groundOffset":-0.8,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-048","rnbId":"demo-reference-048","isTarget":false,"label":"Edificio vecino","footprint":[[-30.797,-52.214],[-27.981,-49.957],[-26.82,-51.569],[-29.437,-53.844]],"height":4.4,"roofHeight":1.4,"groundAltitude":9.7,"groundOffset":0.9,"floors":null,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-049","rnbId":"demo-reference-049","isTarget":false,"label":"Edificio vecino","footprint":[[23.308,-57.197],[34.849,-57.335],[37.658,-57.388],[37.836,-52.078],[30.108,-51.984],[30.114,-46.359],[24.895,-46.29],[23.69,-46.281],[21.71,-52.633],[22.915,-52.641],[24.618,-52.694]],"height":4.3,"roofHeight":3.5,"groundAltitude":9.5,"groundOffset":0.7,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-050","rnbId":"demo-reference-050","isTarget":false,"label":"Edificio vecino","footprint":[[56.491,-30.153],[46.146,-30.123],[46.168,-22.087],[55.209,-22.099],[55.358,-28.241],[56.572,-28.15],[56.528,-29.753]],"height":7,"roofHeight":1,"groundAltitude":10,"groundOffset":1.2,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-051","rnbId":"demo-reference-051","isTarget":false,"label":"Anexo","footprint":[[58.028,-10.9],[57.561,-16.083],[60.958,-16.288],[61.426,-11.107]],"height":2.6,"roofHeight":0.6,"groundAltitude":8.7,"groundOffset":-0.1,"floors":1,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-052","rnbId":"demo-reference-052","isTarget":false,"label":"Edificio vecino","footprint":[[58.352,19.412],[61.949,19.187],[62.207,26.499],[57.695,26.604],[57.876,27.492],[55.865,27.473],[55.883,26.567],[53.084,26.719],[52.745,19.616]],"height":9.5,"roofHeight":1.9,"groundAltitude":8,"groundOffset":-0.8,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-053","rnbId":"demo-reference-053","isTarget":false,"label":"Edificio vecino","footprint":[[59.802,5.416],[59.572,-2.701],[68.794,-2.93],[69.124,5.178]],"height":10.3,"roofHeight":1.3,"groundAltitude":8.4,"groundOffset":-0.4,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-054","rnbId":"demo-reference-054","isTarget":false,"label":"Edificio vecino","footprint":[[-40.994,-58.327],[-31.785,-50.92],[-35.303,-46.483],[-44.511,-53.891]],"height":7.7,"roofHeight":1.4,"groundAltitude":7.1,"groundOffset":-1.7,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-055","rnbId":"demo-reference-055","isTarget":false,"label":"Edificio vecino","footprint":[[-9.727,-63.661],[-15.39,-61.843],[-16.411,-65.368],[-10.739,-67.086]],"height":2.2,"roofHeight":1,"groundAltitude":9.3,"groundOffset":0.5,"floors":null,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-056","rnbId":"demo-reference-056","isTarget":false,"label":"Edificio vecino","footprint":[[-19.861,70.073],[-19.787,67.555],[-22.007,67.454],[-21.785,61.003],[-19.674,61.013],[-19.536,56.983],[-17.724,57.019],[-17.695,54.003],[-7.132,54.155],[-7.119,62.091],[-7.148,65.107],[-6.342,65.135],[-6.354,69.456],[-7.16,69.429],[-7.145,75.155],[-17.817,74.912],[-17.905,71.704],[-19.826,71.576]],"height":11,"roofHeight":5.2,"groundAltitude":5.7,"groundOffset":-3.1,"floors":4,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-057","rnbId":"demo-reference-057","isTarget":false,"label":"Edificio vecino","footprint":[[47.203,-52.924],[47.217,-47.198],[42.715,-46.994],[42.278,-57.402],[46.998,-57.427]],"height":4.9,"roofHeight":1.4,"groundAltitude":12.6,"groundOffset":3.8,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-058","rnbId":"demo-reference-058","isTarget":false,"label":"Edificio vecino","footprint":[[-4.83,-70.633],[-2.895,-64.78],[4.435,-67.048],[4.725,-67.175],[3.224,-71.561],[2.545,-71.299],[2.011,-72.757]],"height":7.8,"roofHeight":2.4,"groundAltitude":10.2,"groundOffset":1.4,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-059","rnbId":"demo-reference-059","isTarget":false,"label":"Edificio vecino","footprint":[[57.12,45.845],[50.556,41.012],[56.024,33.687],[60.216,36.725],[59.853,37.16],[62.343,39.144]],"height":9.8,"roofHeight":2.2,"groundAltitude":7.9,"groundOffset":-0.9,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-060","rnbId":"demo-reference-060","isTarget":false,"label":"Edificio vecino","footprint":[[32.541,-59.538],[31.414,-68.679],[24.565,-67.759],[25.682,-58.717]],"height":9.1,"roofHeight":2.9,"groundAltitude":10.3,"groundOffset":1.5,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-061","rnbId":"demo-reference-061","isTarget":false,"label":"Edificio vecino","footprint":[[57.997,-31.292],[65.787,-31.795],[65.393,-38.39],[57.602,-37.888]],"height":10.9,"roofHeight":1.8,"groundAltitude":10.3,"groundOffset":1.5,"floors":3,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-062","rnbId":"demo-reference-062","isTarget":false,"label":"Edificio vecino","footprint":[[56.021,-43.171],[61.981,-43.909],[61.99,-43.81],[62.025,-40.095],[56.063,-39.357],[56.056,-41.666]],"height":3.4,"roofHeight":0.4,"groundAltitude":12.5,"groundOffset":3.7,"floors":null,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-063","rnbId":"demo-reference-063","isTarget":false,"label":"Edificio vecino","footprint":[[-61.516,-54.164],[-51.595,-41.094],[-47.787,-45.658],[-55.445,-55.918]],"height":4.7,"roofHeight":2.4,"groundAltitude":8.6,"groundOffset":-0.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-064","rnbId":"demo-reference-064","isTarget":false,"label":"Edificio vecino","footprint":[[32.66,60.912],[41.177,58.436],[43.889,67.333],[35.48,69.901],[34.947,68.442],[32.41,69.274],[30.684,63.502],[33.23,62.77]],"height":11.2,"roofHeight":3.1,"groundAltitude":7.1,"groundOffset":-1.7,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-065","rnbId":"demo-reference-065","isTarget":false,"label":"Edificio vecino","footprint":[[47.203,-52.924],[46.998,-57.427],[52.315,-57.504],[52.412,-53.092]],"height":4.2,"roofHeight":0.4,"groundAltitude":12.6,"groundOffset":3.8,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-066","rnbId":"demo-reference-066","isTarget":false,"label":"Edificio vecino","footprint":[[2.011,-72.757],[5.636,-73.787],[3.312,-80.611],[-3.322,-78.405],[-2.625,-76.257],[-6.132,-75.037],[-4.83,-70.633]],"height":7.5,"roofHeight":2.7,"groundAltitude":10.2,"groundOffset":1.4,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-067","rnbId":"demo-reference-067","isTarget":false,"label":"Edificio vecino","footprint":[[46.998,-57.427],[46.863,-60.026],[52.281,-60.114],[52.315,-57.504]],"height":3.7,"roofHeight":0.4,"groundAltitude":12.8,"groundOffset":4,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-068","rnbId":"demo-reference-068","isTarget":false,"label":"Edificio vecino","footprint":[[80.642,-0.784],[80.854,7.133],[73.643,7.382],[73.431,-0.536]],"height":10,"roofHeight":1.3,"groundAltitude":8.6,"groundOffset":-0.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-069","rnbId":"demo-reference-069","isTarget":false,"label":"Edificio vecino","footprint":[[-40.994,-58.327],[-44.511,-53.891],[-51.981,-59.847],[-51.175,-60.925],[-52.143,-61.641],[-54.516,-63.436],[-51.161,-67.456],[-49.015,-65.942],[-47.764,-67.663],[-46.035,-66.312],[-43.653,-64.416],[-43.291,-64.851],[-38.654,-61.352]],"height":6.5,"roofHeight":2.5,"groundAltitude":7.3,"groundOffset":-1.5,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-070","rnbId":"demo-reference-070","isTarget":false,"label":"Edificio vecino","footprint":[[61.073,-53.975],[61.472,-54.011],[61.632,-50.007],[61.776,-48.412],[55.852,-48.38],[55.838,-54.105]],"height":9.2,"roofHeight":0.1,"groundAltitude":12.7,"groundOffset":3.9,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-071","rnbId":"demo-reference-071","isTarget":false,"label":"Edificio vecino","footprint":[[34.076,-65.906],[41.576,-64.07],[42.738,-68.998],[43.055,-68.826],[43.273,-69.75],[40.909,-70.34],[40.691,-69.416],[35.148,-70.724]],"height":10.1,"roofHeight":1.3,"groundAltitude":10.9,"groundOffset":2.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-072","rnbId":"demo-reference-072","isTarget":false,"label":"Edificio vecino","footprint":[[62.343,39.144],[69.143,44.358],[69.25,46.66],[69.365,50.166],[68.16,50.173],[67.091,51.677],[63.107,48.721],[62.399,49.79],[57.12,45.845]],"height":9.5,"roofHeight":2.8,"groundAltitude":8,"groundOffset":-0.8,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-073","rnbId":"demo-reference-073","isTarget":false,"label":"Edificio vecino","footprint":[[43.055,-68.826],[42.738,-68.998],[41.576,-64.07],[49.9,-62.009],[50.636,-64.989],[49.712,-65.207],[50.23,-67.262]],"height":10.1,"roofHeight":1.3,"groundAltitude":10.9,"groundOffset":2.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-074","rnbId":"demo-reference-074","isTarget":false,"label":"Edificio vecino","footprint":[[-70.58,-45.509],[-64.244,-51.004],[-61.647,-47.823],[-67.892,-42.437]],"height":2.5,"roofHeight":1.2,"groundAltitude":7.1,"groundOffset":-1.7,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-075","rnbId":"demo-reference-075","isTarget":false,"label":"Edificio vecino","footprint":[[31.302,-76.606],[31.283,-75.701],[27.741,-75.983]],"height":1.2,"roofHeight":0.4,"groundAltitude":10.6,"groundOffset":1.8,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-076","rnbId":"demo-reference-076","isTarget":false,"label":"Edificio vecino","footprint":[[16.54,-84.316],[16.753,-77.503],[27.57,-77.877],[27.679,-76.681],[31.284,-76.806],[32.19,-76.787],[32.066,-80.392],[32.012,-82.095],[31.913,-82.086],[31.713,-82.069],[22.799,-81.766],[22.918,-83.786]],"height":1.7,"roofHeight":2.5,"groundAltitude":10.3,"groundOffset":1.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-077","rnbId":"demo-reference-077","isTarget":false,"label":"Edificio vecino","footprint":[[55.838,-54.105],[55.718,-65.447],[58.934,-65.436],[58.789,-64.82],[60.791,-64.9],[61.073,-53.975]],"height":7.3,"roofHeight":1.1,"groundAltitude":12.8,"groundOffset":4,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-078","rnbId":"demo-reference-078","isTarget":false,"label":"Edificio vecino","footprint":[[80.563,-32.827],[72.274,-32.28],[71.844,-39.274],[80.143,-39.721],[80.233,-38.724]],"height":9.4,"roofHeight":1.4,"groundAltitude":12,"groundOffset":3.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-079","rnbId":"demo-reference-079","isTarget":false,"label":"Edificio vecino","footprint":[[67.795,-52.973],[67.666,-49.948],[66.76,-49.967],[66.731,-46.95],[67.636,-46.931],[67.5,-45.111],[72.645,-44.872],[72.838,-48.304],[74.043,-48.313],[74.236,-52.851],[71.618,-52.917]],"height":9.2,"roofHeight":2.6,"groundAltitude":10.7,"groundOffset":1.9,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-080","rnbId":"demo-reference-080","isTarget":false,"label":"Edificio vecino","footprint":[[-67.892,-42.437],[-74.699,-36.598],[-80.664,-43.695],[-73.939,-49.325],[-70.58,-45.509]],"height":8.9,"roofHeight":1.6,"groundAltitude":5.9,"groundOffset":-2.9,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-081","rnbId":"demo-reference-081","isTarget":false,"label":"Edificio vecino","footprint":[[41.388,81.926],[45.42,80.96],[43.317,69.898],[35.416,71.414],[32.951,71.938],[34.135,77.256],[36.599,76.732],[37.845,82.748]],"height":7.2,"roofHeight":3.3,"groundAltitude":7.6,"groundOffset":-1.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-082","rnbId":"demo-reference-082","isTarget":false,"label":"Edificio vecino","footprint":[[92.655,-1.265],[93.038,8.546],[81.931,9.045],[81.798,4.235],[81.63,-0.974]],"height":9.2,"roofHeight":1.7,"groundAltitude":8.9,"groundOffset":0.1,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-083","rnbId":"demo-reference-083","isTarget":false,"label":"Edificio vecino","footprint":[[-60.749,-63.476],[-60.205,-64.128],[-57.344,-60.267],[-62.402,-56.193],[-65.362,-60.046],[-64.709,-60.607]],"height":4.7,"roofHeight":3.9,"groundAltitude":7.5,"groundOffset":-1.3,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-084","rnbId":"demo-reference-084","isTarget":false,"label":"Edificio vecino","footprint":[[67.795,-52.973],[71.618,-52.917],[72.167,-61.305],[67.919,-61.625],[67.928,-62.63],[64.893,-62.859],[64.629,-60.223],[61.911,-60.28],[61.34,-59.926],[61.518,-54.618],[64.543,-54.489],[64.47,-53.076]],"height":9,"roofHeight":3.2,"groundAltitude":10.9,"groundOffset":2.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-085","rnbId":"demo-reference-085","isTarget":false,"label":"Edificio vecino","footprint":[[80.233,-38.724],[87.544,-38.982],[87.919,-31.481],[83.117,-31.249],[83.072,-31.747],[80.572,-31.621],[80.563,-32.827]],"height":8.9,"roofHeight":1.1,"groundAltitude":11.8,"groundOffset":3,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-086","rnbId":"demo-reference-086","isTarget":false,"label":"Edificio vecino","footprint":[[83.248,43.689],[83.364,46.089],[83.577,52.902],[73.458,53.212],[73.306,50.413],[72.708,50.467],[72.55,43.147],[83.276,42.883]],"height":7.9,"roofHeight":2.3,"groundAltitude":8.1,"groundOffset":-0.7,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-087","rnbId":"demo-reference-087","isTarget":false,"label":"Anexo","footprint":[[-13.725,92.426],[-16.66,93.293],[-18.288,88.618],[-15.696,87.279]],"height":3.1,"roofHeight":2.4,"groundAltitude":3.9,"groundOffset":-4.9,"floors":1,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-088","rnbId":"demo-reference-088","isTarget":false,"label":"Edificio vecino","footprint":[[8.632,93.021],[7.838,89.776],[-5.536,92.993],[-5.03,95.258],[1.757,93.641],[2.045,94.62]],"height":3,"roofHeight":1.2,"groundAltitude":6.2,"groundOffset":-2.6,"floors":null,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-089","rnbId":"demo-reference-089","isTarget":false,"label":"Edificio vecino","footprint":[[59.139,74.899],[59.236,79.311],[60.948,79.358],[61.945,79.268],[67.96,79.126],[67.727,74.325],[66.613,74.225],[66.321,64.305],[64.319,64.385],[61.511,64.437],[61.583,65.234],[61.021,65.688],[60.567,66.23],[60.531,66.938],[60.593,67.635],[60.756,68.323],[61.191,68.686],[61.825,69.03],[62.02,74.539]],"height":4.8,"roofHeight":4.6,"groundAltitude":8.8,"groundOffset":0,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-090","rnbId":"demo-reference-090","isTarget":false,"label":"Edificio vecino","footprint":[[-64.709,-60.607],[-60.749,-63.476],[-61.88,-64.881],[-64.64,-68.751],[-63.979,-69.213],[-66.378,-72.413],[-66.939,-73.064],[-73.618,-69.147],[-71.102,-65.757],[-69.498,-66.907],[-68.484,-65.691]],"height":4.3,"roofHeight":2.2,"groundAltitude":9.5,"groundOffset":0.7,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-091","rnbId":"demo-reference-091","isTarget":false,"label":"Anexo","footprint":[[80.064,-43.934],[80.113,-50.067],[84.733,-50.081],[84.633,-48.967],[84.651,-48.768],[84.485,-43.93]],"height":3.2,"roofHeight":0.2,"groundAltitude":12.3,"groundOffset":3.5,"floors":1,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-092","rnbId":"demo-reference-092","isTarget":false,"label":"Edificio vecino","footprint":[[41.388,81.926],[37.845,82.748],[30.86,84.383],[31.99,87.998],[33.857,87.529],[36.215,95.856],[36.242,96.155],[44.651,93.588],[44.623,93.289]],"height":8.7,"roofHeight":2.6,"groundAltitude":7.6,"groundOffset":-1.2,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-093","rnbId":"demo-reference-093","isTarget":false,"label":"Edificio vecino","footprint":[[31.111,88.28],[31.99,87.998],[33.857,87.529],[36.215,95.856],[33.669,96.588]],"height":6,"roofHeight":2.3,"groundAltitude":7.1,"groundOffset":-1.7,"floors":null,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-094","rnbId":"demo-reference-094","isTarget":false,"label":"Edificio vecino","footprint":[[99.448,-26.192],[99.831,-17.486],[89.929,-16.994],[89.528,-25.9]],"height":10.2,"roofHeight":2,"groundAltitude":9.2,"groundOffset":0.4,"floors":3,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-095","rnbId":"demo-reference-095","isTarget":false,"label":"Edificio vecino","footprint":[[-85.441,-39.848],[-87.58,-37.947],[-91.691,-41.193],[-89.452,-43.103]],"height":2.9,"roofHeight":0.1,"groundAltitude":4.2,"groundOffset":-4.6,"floors":null,"planarAccuracy":5,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-096","rnbId":"demo-reference-096","isTarget":false,"label":"Edificio vecino","footprint":[[83.248,43.689],[83.276,42.883],[83.177,41.786],[83.008,36.577],[92.638,36.411],[92.47,31.202],[96.972,30.996],[97.283,40.011],[95.081,40.109],[95.179,43.415],[90.568,43.53],[90.64,44.327],[89.598,45.024],[87.894,45.078],[86.935,44.46],[86.763,43.673]],"height":6.4,"roofHeight":2.9,"groundAltitude":8.5,"groundOffset":-0.3,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-097","rnbId":"demo-reference-097","isTarget":false,"label":"Edificio vecino","footprint":[[-8.315,-102.569],[-8.085,-94.452],[-16.619,-94.384],[-17.049,-102.483]],"height":6.1,"roofHeight":2,"groundAltitude":8.9,"groundOffset":0.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":1,"source":"generalized-demo"},
  {"id":"demo-building-098","rnbId":"demo-reference-098","isTarget":false,"label":"Edificio vecino","footprint":[[66.321,64.305],[66.613,74.225],[67.727,74.325],[69.331,74.281],[72.04,74.237],[72.059,73.331],[75.664,73.208],[75.594,70.2],[75.585,68.995],[75.435,63.984]],"height":4.8,"roofHeight":1.8,"groundAltitude":8.9,"groundOffset":0.1,"floors":2,"planarAccuracy":3,"verticalAccuracy":2.5,"source":"generalized-demo"},
  {"id":"demo-building-099","rnbId":"demo-reference-099","isTarget":false,"label":"Edificio vecino","footprint":[[-99.501,2.513],[-113.284,8.981],[-114.725,9.714],[-127.908,-16.122],[-166.086,2.796],[-175.682,7.782],[-174.072,11.153],[-185.517,16.807],[-182.206,23.441],[-211.62,38.153],[-196.99,67.776],[-189.497,63.986],[-183.38,76.092],[-141.387,54.92],[-103.037,35.685],[-95.735,49.794],[-79.768,41.923]],"height":15.2,"roofHeight":0,"groundAltitude":5,"groundOffset":-3.8,"floors":3,"planarAccuracy":2.5,"verticalAccuracy":1.5,"source":"generalized-demo","holes":[[[-190.709,47.216],[-174.362,39.109],[-170.923,46.033],[-187.271,54.14]]]}
];

export const SITE_ROADS: SiteRoad[] = [
  {
    "id": "demo-road-001",
    "name": "Vía de demostración",
    "points": [
      [
        40.726,
        -94.636
      ],
      [
        19.9,
        -96.073
      ],
      [
        4.382,
        -96.581
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-002",
    "name": "Vía de demostración",
    "points": [
      [
        -109.739,
        -108.685
      ],
      [
        -105.445,
        -108.973
      ],
      [
        -103.107,
        -109.786
      ],
      [
        -102.761,
        -110
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-003",
    "name": "Vía de demostración",
    "points": [
      [
        -110,
        -108.747
      ],
      [
        -109.739,
        -108.685
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-004",
    "name": "Vía de demostración",
    "points": [
      [
        -110,
        -106.26
      ],
      [
        -109.739,
        -108.685
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-005",
    "name": "Vía de demostración",
    "points": [
      [
        39.974,
        -106.324
      ],
      [
        40.035,
        -103.415
      ],
      [
        40.448,
        -98.832
      ],
      [
        40.726,
        -94.636
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-006",
    "name": "Vía de demostración",
    "points": [
      [
        45.044,
        -110
      ],
      [
        44.705,
        -109.564
      ],
      [
        39.974,
        -106.324
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-007",
    "name": "Vía de demostración",
    "points": [
      [
        15.395,
        -110
      ],
      [
        18.449,
        -107.697
      ],
      [
        24.011,
        -106.189
      ],
      [
        30.742,
        -106.194
      ],
      [
        39.974,
        -106.324
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-008",
    "name": "Vía de demostración",
    "points": [
      [
        4.382,
        -96.581
      ],
      [
        2.809,
        -101.764
      ],
      [
        -2.16,
        -108.951
      ],
      [
        -3.548,
        -110
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-009",
    "name": "Vía de demostración",
    "points": [
      [
        4.382,
        -96.581
      ],
      [
        6.714,
        -88.553
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-010",
    "name": "Vía de demostración",
    "points": [
      [
        49.204,
        58.315
      ],
      [
        55.695,
        91.285
      ],
      [
        60.652,
        110
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-011",
    "name": "Vía de demostración",
    "points": [
      [
        11.414,
        -73.204
      ],
      [
        19.741,
        -46.628
      ],
      [
        34.18,
        -4.629
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-012",
    "name": "Vía de demostración",
    "points": [
      [
        110,
        -8.574
      ],
      [
        109.438,
        -9.009
      ],
      [
        102.147,
        -11.867
      ],
      [
        34.18,
        -4.629
      ]
    ],
    "width": 3,
    "isPath": false
  },
  {
    "id": "demo-road-013",
    "name": "Vía de demostración",
    "points": [
      [
        11.414,
        -73.204
      ],
      [
        37.207,
        -74.628
      ],
      [
        99.309,
        -62.247
      ],
      [
        110,
        -56.463
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-014",
    "name": "Vía de demostración",
    "points": [
      [
        6.714,
        -88.553
      ],
      [
        8.45,
        -82.681
      ],
      [
        11.414,
        -73.204
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-015",
    "name": "Vía de demostración",
    "points": [
      [
        49.204,
        58.315
      ],
      [
        93.232,
        56.351
      ],
      [
        110,
        55.984
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-016",
    "name": "Vía de demostración",
    "points": [
      [
        34.18,
        -4.629
      ],
      [
        43.136,
        27.818
      ],
      [
        49.204,
        58.315
      ]
    ],
    "width": 5,
    "isPath": false
  },
  {
    "id": "demo-road-017",
    "name": "Vía de demostración",
    "points": [
      [
        -60.012,
        -67.562
      ],
      [
        -48.064,
        -53.168
      ],
      [
        -30.752,
        -38.354
      ],
      [
        13.421,
        -10.893
      ],
      [
        24.098,
        -6.131
      ],
      [
        34.18,
        -4.629
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-018",
    "name": "Vía de demostración",
    "points": [
      [
        110,
        -74.763
      ],
      [
        86.151,
        -83.364
      ],
      [
        53.154,
        -91.639
      ],
      [
        40.726,
        -94.636
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-019",
    "name": "Sendero de demostración",
    "points": [
      [
        -36.564,
        95.391
      ],
      [
        -19.174,
        85.483
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-020",
    "name": "Sendero de demostración",
    "points": [
      [
        -43.434,
        99.427
      ],
      [
        -36.564,
        95.391
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-021",
    "name": "Sendero de demostración",
    "points": [
      [
        -64.823,
        110
      ],
      [
        -71.361,
        97.226
      ],
      [
        -72.918,
        94.453
      ],
      [
        -82.002,
        78.394
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-022",
    "name": "Sendero de demostración",
    "points": [
      [
        -110,
        -29.93
      ],
      [
        -102.122,
        -20.962
      ],
      [
        -96.762,
        -16.12
      ],
      [
        -93.676,
        -11.979
      ],
      [
        -79.939,
        11.096
      ],
      [
        -77.253,
        17.483
      ],
      [
        -75.074,
        24.922
      ],
      [
        -68.76,
        52.584
      ],
      [
        -66.581,
        60.023
      ],
      [
        -62.175,
        68.768
      ],
      [
        -52.936,
        84.31
      ],
      [
        -43.434,
        99.427
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-023",
    "name": "Sendero de demostración",
    "points": [
      [
        -38.385,
        110
      ],
      [
        -43.434,
        99.427
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-024",
    "name": "Vía de demostración",
    "points": [
      [
        -84.981,
        110
      ],
      [
        -88.485,
        101.183
      ],
      [
        -92.465,
        91.595
      ],
      [
        -97.187,
        81.574
      ],
      [
        -104.253,
        66.739
      ],
      [
        -104.669,
        66.575
      ],
      [
        -105.575,
        66.556
      ],
      [
        -107.406,
        67.426
      ],
      [
        -110,
        68.77
      ]
    ],
    "width": 4,
    "isPath": false
  },
  {
    "id": "demo-road-025",
    "name": "Vía de demostración",
    "points": [
      [
        6.714,
        -88.553
      ],
      [
        -18.888,
        -88.353
      ],
      [
        -45.886,
        -85.816
      ],
      [
        -72.705,
        -80.181
      ],
      [
        -77.824,
        -79.014
      ],
      [
        -92.675,
        -75.464
      ],
      [
        -109.113,
        -68.354
      ]
    ],
    "width": 3,
    "isPath": false
  },
  {
    "id": "demo-road-026",
    "name": "Sendero de demostración",
    "points": [
      [
        110,
        -68.199
      ],
      [
        103.039,
        -71.023
      ],
      [
        75.503,
        -78.886
      ],
      [
        47.08,
        -85.464
      ],
      [
        16.734,
        -88.855
      ],
      [
        6.714,
        -88.553
      ]
    ],
    "width": 1.8,
    "isPath": true
  },
  {
    "id": "demo-road-027",
    "name": "Vía de demostración",
    "points": [
      [
        -109.113,
        -68.354
      ],
      [
        -110,
        -67.958
      ]
    ],
    "width": 3,
    "isPath": false
  }
];

export const SITE_PARCEL: { id: string; label: string; area: number; footprint: SitePoint[] } = {
  "id": "demo-parcel-001",
  "label": "DEMO 001",
  "area": 1192,
  "footprint": [
    [
      9.981,
      21.566
    ],
    [
      3.583,
      17.814
    ],
    [
      0.941,
      16.254
    ],
    [
      -1.307,
      14.939
    ],
    [
      -3.758,
      13.503
    ],
    [
      -5.423,
      12.528
    ],
    [
      -6.305,
      11.994
    ],
    [
      -6.868,
      11.664
    ],
    [
      -8.521,
      10.708
    ],
    [
      -10.963,
      9.25
    ],
    [
      -11.144,
      9.146
    ],
    [
      -13.509,
      7.762
    ],
    [
      -13.594,
      7.71
    ],
    [
      -16.161,
      6.213
    ],
    [
      -18.304,
      4.949
    ],
    [
      -20.851,
      3.451
    ],
    [
      -23.175,
      2.074
    ],
    [
      -27.556,
      -0.495
    ],
    [
      -22.68,
      -7.144
    ],
    [
      -16.544,
      -15.513
    ],
    [
      -14.745,
      -17.957
    ],
    [
      -12.946,
      -20.41
    ],
    [
      22.546,
      0.489
    ],
    [
      33.473,
      6.797
    ],
    [
      33.016,
      7.069
    ],
    [
      28.625,
      9.847
    ],
    [
      24.383,
      12.5
    ],
    [
      15.798,
      17.907
    ]
  ]
};
