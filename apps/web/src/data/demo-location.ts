/** Public city-centre example, deliberately unrelated to the reconstructed building.
 * Place Saint-Corentin, Quimper: OpenStreetMap way 38739148, representative point
 * returned by Nominatim on 2026-10-05: https://www.openstreetmap.org/way/38739148
 * The municipal archive identifies the square as a public city landmark:
 * https://www.quimper.bzh/1112-petite-histoire-de-la-statue-laennec-sur-la-place-saint-corentin.htm
 * Keep this presentation location separate from BUILDING_SITE's solar reference.
 */
export const DEMO_LOCATION = {
  latitude: 47.9958202,
  longitude: -4.1029211,
  city: 'Quimper',
  label: 'Place Saint-Corentin',
} as const

export const DEMO_GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${DEMO_LOCATION.latitude},${DEMO_LOCATION.longitude}`)}`
