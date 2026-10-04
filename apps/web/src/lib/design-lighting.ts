import { MAX_DESIGN_LIGHTS, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'

/** Preview approximation to black-body RGB; materials and screens are not calibrated. */
export function kelvinColor(kelvin: number): string {
  const temperature = Math.min(6500, Math.max(1800, kelvin)) / 100
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -.1332047592
  const green = temperature <= 66 ? 99.4708025861 * Math.log(temperature) - 161.1195681661 : 288.1221695283 * (temperature - 60) ** -.0755148492
  const blue = temperature >= 66 ? 255 : temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307
  return `#${[red, green, blue].map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`
}

/** Isotropic point-source candela; no IES beam pattern or indirect light simulation. */
export function lumensToCandela(lumens: number): number {
  return Math.max(0, lumens) / (4 * Math.PI)
}

export function fixtureLight(fixture: Fixture) {
  return fixture.light
}

/** Defensive render budget even while an unvalidated in-memory draft is being edited. */
export function activeFixtureLightIds(scene: ProjectSnapshot): Set<string> {
  if (scene.customization?.lighting.artificialEnabled === false) return new Set()
  const fixedCount = scene.customization?.lighting.lights.filter(light => light.enabled && light.lumens > 0).length ?? 0
  const assets = new Map(scene.assets.map(asset => [asset.id, asset]))
  const candidates = scene.fixtures.filter(fixture => {
    const asset = assets.get(fixture.assetId)
    const light = asset && fixtureLight(fixture)
    return light?.enabled && light.lumens > 0
  })
  return new Set(candidates.slice(0, Math.max(0, MAX_DESIGN_LIGHTS - fixedCount)).map(fixture => fixture.id))
}
