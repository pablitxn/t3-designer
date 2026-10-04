import { useMemo } from 'react'
import { apartmentBounds } from '@t3-designer/geometry'
import { defaultDesignCustomization, MAX_DESIGN_LIGHTS, type DesignCustomization, type LightSource, type Point2D, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { DoubleSide, Object3D, Path, Shape } from 'three'
import { siteDirectionInProject } from '../private/project-scene'
import { kelvinColor, lumensToCandela } from '../lib/design-lighting'
import { ShadowOnly } from './ShadowOnly'
import { Wall } from './Wall'

export function LightEmitter({ source, position }: { source: Pick<LightSource, 'kelvin' | 'lumens' | 'enabled'>; position: [number, number, number] }) {
  const active = source.enabled && source.lumens > 0
  const color = kelvinColor(source.kelvin)
  return <group position={position}>
    <mesh raycast={() => {}}>
      <sphereGeometry args={[.045, 12, 8]} />
      <meshStandardMaterial color={active ? color : '#a4a496'} emissive={color} emissiveIntensity={active ? 2 : 0} roughness={.5} />
    </mesh>
    {active && <pointLight color={color} intensity={lumensToCandela(source.lumens)} decay={2} distance={20} castShadow
      shadow-mapSize={[512, 512]} shadow-camera-near={.03} shadow-camera-far={25} shadow-bias={-.0002} shadow-normalBias={.015} />}
  </group>
}

/** Shared editor/read-only lighting follows the persisted site and solar snapshot. */
export function DesignLighting({ scene }: { scene: ProjectSnapshot }) {
  const bounds = useMemo(() => apartmentBounds(scene.apartment), [scene.apartment])
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(bounds.center[0], scene.geometry.floor.elevation, bounds.center[1])
    return object
  }, [bounds, scene.geometry.floor.elevation])
  const sun = siteDirectionInProject(scene, scene.solar.selected.direction)
  const natural = scene.customization?.lighting.naturalEnabled !== false
  const artificial = scene.customization?.lighting.artificialEnabled !== false
  const daylight = natural && scene.solar.selected.isDaylight
  const span = Math.max(bounds.width, bounds.depth, 8)
  const sunDistance = Math.max(40, span * 3)
  const fixedLights = scene.customization?.lighting.lights ?? []
  const activeFixed = new Set(fixedLights.filter(light => light.enabled && light.lumens > 0).slice(0, MAX_DESIGN_LIGHTS).map(light => light.id))
  return <>
    {/* A small neutral editing fill keeps the unlit model navigable. */}
    <ambientLight intensity={.055} />
    {daylight && <hemisphereLight args={['#eef6ff', '#9d9985', .32]} />}
    <primitive object={target} />
    {daylight && <directionalLight target={target}
      position={[target.position.x + sun[0] * sunDistance, target.position.y + sun[1] * sunDistance, target.position.z + sun[2] * sunDistance]}
      intensity={2.5} color={sun[1] < .2 ? '#ffe2bd' : '#fff6e9'} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span}
      shadow-camera-near={.1} shadow-camera-far={sunDistance + span * 3} shadow-bias={-.0003} shadow-normalBias={.018} />}
    {fixedLights.map(light => <LightEmitter key={light.id} source={{ ...light, enabled: artificial && activeFixed.has(light.id) }} position={light.position} />)}
  </>
}

function polygonShape(points: Point2D[], holes: Point2D[][] = []) {
  const shape = new Shape()
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.filter(points => points.length >= 3).map(points => {
    const hole = new Path()
    points.forEach(([x, z], index) => index ? hole.lineTo(x, -z) : hole.moveTo(x, -z))
    hole.closePath()
    return hole
  })
  return shape
}

function OccludingVolume({ polygon, holes, elevation, thickness }: { polygon: Point2D[]; holes?: Point2D[][]; elevation: number; thickness: number }) {
  const shape = useMemo(() => thickness > 0 && polygon.length >= 3 ? polygonShape(polygon, holes) : null, [polygon, holes, thickness])
  if (!shape) return null
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation, 0]} castShadow raycast={() => {}}>
    <extrudeGeometry args={[shape, { depth: thickness, bevelEnabled: false }]} /><meshBasicMaterial side={DoubleSide} />
  </mesh>
}

/** Viewing cuts never remove the actual walls, coverings, ceiling or nearby buildings from shadows. */
export function DesignEnvelope({ scene, cutaway }: { scene: ProjectSnapshot; cutaway: boolean }) {
  const { apartment, geometry, placement, buildings } = scene
  // Physical shadow geometry changes with opening styles/positions and coverings,
  // never with paint, floor finish, light temperature or intensity. Stable children
  // prevent ShadowOnly from cloning/disposal of every material for those edits.
  const openingKey = JSON.stringify(scene.customization ? {
    ...defaultDesignCustomization(),
    doors: Object.fromEntries(Object.entries(scene.customization.doors).map(([id, door]) => [id, { ...door, color: '#ffffff' }])),
    windows: Object.fromEntries(Object.entries(scene.customization.windows).map(([id, window]) => [id, { ...window, frameColor: '#ffffff', coveringColor: '#ffffff' }])),
  } : null)
  const shadowDesign = useMemo(() => (JSON.parse(openingKey) ?? undefined) as DesignCustomization | undefined, [openingKey])
  const envelope = useMemo(() => <>
    {cutaway && apartment.walls.map(wall => <Wall key={wall.id} wall={wall}
      doors={apartment.doors.filter(door => door.wallId === wall.id)}
      windows={apartment.windows.filter(window => window.wallId === wall.id)} cutaway={false} customization={shadowDesign} />)}
    <OccludingVolume polygon={geometry.ceiling.polygon} elevation={geometry.ceiling.elevation} thickness={geometry.ceiling.thickness} />
    <group rotation={[0, -placement.rotationY, 0]}>
      <group position={[-placement.position[0], -placement.position[1], -placement.position[2]]}>
        {buildings.filter(building => !building.isTarget).map(building => <OccludingVolume key={building.id} polygon={building.footprint} holes={building.holes} elevation={building.groundOffset} thickness={building.height} />)}
        {buildings.filter(building => building.isTarget).map(building => <group key={building.id}>
          <OccludingVolume polygon={building.footprint} holes={building.holes} elevation={building.groundOffset} thickness={geometry.contextSections.belowTop - building.groundOffset} />
          <OccludingVolume polygon={building.footprint} holes={building.holes} elevation={geometry.contextSections.ceilingBase} thickness={building.groundOffset + building.height - geometry.contextSections.ceilingBase} />
        </group>)}
        {[geometry.contextSections.before, geometry.contextSections.after].map((polygon, index) => <OccludingVolume key={index} polygon={polygon} elevation={geometry.contextSections.belowTop} thickness={geometry.contextSections.ceilingBase - geometry.contextSections.belowTop} />)}
      </group>
    </group>
  </>, [apartment, buildings, cutaway, geometry, placement, shadowDesign])
  return <ShadowOnly>{envelope}</ShadowOnly>
}
