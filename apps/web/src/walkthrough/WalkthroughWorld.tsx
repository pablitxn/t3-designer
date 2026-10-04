import { Component, Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { apartmentBounds } from '@t3-designer/geometry'
import { defaultDesignCustomization, fixtureLightPosition, type DesignCustomization, type Fixture, type Point2D, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { Color, DirectionalLight, DoubleSide, Mesh, Object3D, Path, PMREMGenerator, Shape, Vector3 } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ArchitecturalDetails } from '../components/ArchitecturalDetails'
import { Floor } from '../components/Floor'
import { Wall } from '../components/Wall'
import type { SolarPosition } from '../lib/solar'
import { kelvinColor, lumensToCandela } from '../lib/design-lighting'
import { roomFinish } from '../materials/surfaces'
import { projectModelUrl, siteDirectionInProject } from '../private/project-scene'
import { resolveWalkDoorOpenness } from './navigation'

type SceneAsset = ProjectSnapshot['assets'][number]

type WalkthroughWorldProps = {
  snapshot: ProjectSnapshot
  sun: SolarPosition
  /** Temporary master switch, initialized by the tour from the saved master setting. */
  artificialLights: boolean
  /** Transient opening fractions, shared with the tour's collision world. */
  doorStates: Record<string, number>
}

function footprintShape(points: Point2D[], holes: Point2D[][] = []): Shape {
  const shape = new Shape()
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.map(points => {
    const path = new Path()
    points.forEach(([x, z], index) => index ? path.lineTo(x, -z) : path.moveTo(x, -z))
    path.closePath()
    return path
  })
  return shape
}

function Volume({ polygon, holes, base, height, color }: {
  polygon: Point2D[]; holes?: Point2D[][]; base: number; height: number; color: string
}) {
  const shape = useMemo(() => footprintShape(polygon, holes), [polygon, holes])
  if (height <= 0 || polygon.length < 3) return null
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, base, 0]} castShadow receiveShadow>
    <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} />
    {/* The bottom face points down after rotation, so the ceiling is visible inside. */}
    <meshStandardMaterial color={color} roughness={.94} side={DoubleSide} />
  </mesh>
}

/** Entire context remains in the persisted site frame, including its vertical datum. */
function SiteContext({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { placement, geometry } = snapshot
  const sections = geometry.contextSections
  return <group rotation={[0, -placement.rotationY, 0]}>
    <group position={[-placement.position[0], -placement.position[1], -placement.position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.1, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} /><meshStandardMaterial color="#bcc7b3" roughness={1} />
      </mesh>
      <Floor polygon={snapshot.parcel.footprint} elevation={-.04} color="#ccd3b9" />
      {snapshot.roads.flatMap(road => road.points.slice(1).map((end, index) => {
        const start = road.points[index]
        const length = Math.hypot(end[0] - start[0], end[1] - start[1])
        return <mesh key={`${road.id}-${index}`} position={[(start[0] + end[0]) / 2, -.025, (start[1] + end[1]) / 2]}
          rotation={[0, Math.atan2(end[0] - start[0], end[1] - start[1]), 0]} receiveShadow>
          <boxGeometry args={[road.width, .02, length]} /><meshStandardMaterial color={road.isPath ? '#c8c5b5' : '#969e97'} roughness={1} />
        </mesh>
      }))}
      {snapshot.buildings.map(building => building.isTarget ? <group key={building.id}>
        <Volume polygon={building.footprint} holes={building.holes} base={building.groundOffset}
          height={sections.belowTop - building.groundOffset} color="#d4ceb9" />
        {[sections.before, sections.after].map((polygon, index) => <Volume key={index} polygon={polygon}
          base={sections.belowTop} height={building.groundOffset + building.height - sections.belowTop} color="#d4ceb9" />)}
        <Volume polygon={sections.apartmentBand} base={sections.ceilingBase}
          height={building.groundOffset + building.height - sections.ceilingBase} color="#d4ceb9" />
      </group> : <Volume key={building.id} polygon={building.footprint} holes={building.holes}
        base={building.groundOffset} height={building.height} color="#bac5bd" />)}
    </group>
  </group>
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const { gl, invalidate } = useThree()
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true } })
    return clone
  }, [scene])
  useLayoutEffect(() => {
    // A loaded mesh replaces its placeholder after the static shadow pass.
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, model])
  return <primitive object={model} dispose={null} />
}

function ModelPlaceholder({ asset, failed = false }: { asset: SceneAsset; failed?: boolean }) {
  return <group name={failed ? 'unavailable-model-placeholder' : 'loading-model-placeholder'}>
    <mesh position={[0, asset.dimensions[1] / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={asset.dimensions} />
      <meshStandardMaterial color={failed ? '#b88d65' : '#a0a995'} roughness={.9} transparent opacity={.7} />
    </mesh>
    <mesh position={[0, asset.dimensions[1] / 2, 0]}>
      <boxGeometry args={asset.dimensions.map(value => value + .002) as [number, number, number]} />
      <meshBasicMaterial color={failed ? '#815329' : '#dce5d2'} wireframe />
    </mesh>
  </group>
}

function PlacedObject({ fixture, asset, projectId }: { fixture: Fixture; asset: SceneAsset; projectId: string }) {
  const url = projectModelUrl(asset.url, projectId)
  const fallback = <ModelPlaceholder asset={asset} failed />
  return <group name={fixture.id} position={fixture.position} rotation={[0, fixture.rotation, 0]}>
    {url ? <ModelBoundary key={url} fallback={fallback}>
      <Suspense fallback={<ModelPlaceholder asset={asset} />}><Model url={url} /></Suspense>
    </ModelBoundary> : fallback}
  </group>
}

function ArtificialLighting({ snapshot, enabled }: { snapshot: ProjectSnapshot; enabled: boolean }) {
  const lighting = snapshot.customization?.lighting
  const lights = useMemo(() => [
    ...(lighting?.lights ?? []).filter(light => light.enabled && light.lumens > 0).map(light => ({ ...light, fixture: false })),
    ...snapshot.fixtures.flatMap(fixture => {
      const position = fixtureLightPosition(fixture)
      return fixture.light?.enabled && fixture.light.lumens > 0 && position ? [{ ...fixture.light, id: fixture.id, position, fixture: true }] : []
    }),
  ].slice(0, 8), [lighting, snapshot.fixtures])
  if (!enabled) return null
  return <group name="saved-design-lights">
    {lights.map(light => <group key={`${light.fixture ? 'fixture' : 'fixed'}-${light.id}`} position={light.position}>
      <pointLight color={kelvinColor(light.kelvin)} intensity={lumensToCandela(light.lumens)} distance={18} decay={2}
        castShadow shadow-mapSize={[256, 256]} shadow-camera-near={.04} shadow-camera-far={18} shadow-bias={-.0001} shadow-normalBias={.015} />
      {!light.fixture && <mesh>
        <sphereGeometry args={[.045, 12, 8]} /><meshBasicMaterial color={kelvinColor(light.kelvin)} />
      </mesh>}
    </group>)}
  </group>
}

function NaturalLighting({ snapshot, sun }: Pick<WalkthroughWorldProps, 'snapshot' | 'sun'>) {
  const light = useRef<DirectionalLight>(null)
  const { gl, scene, invalidate } = useThree()
  const bounds = useMemo(() => apartmentBounds(snapshot.apartment), [snapshot.apartment])
  const daylight = sun.isDaylight && snapshot.customization?.lighting.naturalEnabled !== false
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(bounds.center[0], snapshot.geometry.floor.elevation + 1, bounds.center[1])
    return object
  }, [bounds, snapshot.geometry.floor.elevation])
  const direction = siteDirectionInProject(snapshot, sun.direction)

  useEffect(() => {
    const environment = new RoomEnvironment()
    const generator = new PMREMGenerator(gl)
    const output = generator.fromScene(environment, .04)
    const previous = scene.environment
    scene.environment = output.texture
    environment.dispose()
    generator.dispose()
    invalidate()
    return () => { scene.environment = previous; output.dispose() }
  }, [gl, scene, invalidate])

  useLayoutEffect(() => {
    const previous = scene.environmentIntensity
    scene.environmentIntensity = daylight ? .12 : .012
    invalidate()
    return () => { scene.environmentIntensity = previous }
  }, [daylight, scene, invalidate])

  useLayoutEffect(() => {
    const source = light.current
    if (!source) return
    source.updateMatrixWorld(true)
    target.updateMatrixWorld(true)
    source.shadow.updateMatrices(source)
    const camera = source.shadow.camera
    const corners: Vector3[] = []
    for (const x of [bounds.min[0], bounds.max[0]]) for (const z of [bounds.min[1], bounds.max[1]]) {
      for (const y of [snapshot.geometry.floor.elevation, snapshot.geometry.ceiling.elevation + .3]) {
        corners.push(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
      }
    }
    // Shadow resolution belongs to the receiving apartment; upstream buildings
    // still cast into this frustum, even though they are outside the plan bounds.
    camera.left = Math.min(...corners.map(point => point.x)) - 1.5
    camera.right = Math.max(...corners.map(point => point.x)) + 1.5
    camera.bottom = Math.min(...corners.map(point => point.y)) - 1.5
    camera.top = Math.max(...corners.map(point => point.y)) + 1.5
    camera.updateProjectionMatrix()
    source.shadow.needsUpdate = true
    invalidate()
  }, [bounds, snapshot, sun, target, invalidate])

  const color = new Color('#ffce8e').lerp(new Color('#fff7e5'), Math.min(1, Math.max(0, sun.altitude / 22)))
  return <>
    <primitive object={target} />
    <ambientLight intensity={daylight ? .17 : .025} />
    <hemisphereLight args={['#dce8ff', '#bdb39b', daylight ? .3 : .035]} />
    <directionalLight ref={light} target={target} position={[target.position.x + direction[0] * 300, target.position.y + direction[1] * 300, target.position.z + direction[2] * 300]}
      intensity={daylight ? 3.4 * Math.min(1, sun.altitude / 8) : 0} color={color} castShadow={daylight}
      shadow-mapSize={[2048, 2048]} shadow-camera-near={.1} shadow-camera-far={700}
      shadow-bias={-.000015} shadow-normalBias={.006} shadow-radius={1} />
  </>
}

/** Camera motion does not change this static world's shadow casters or lights. */
function useStaticShadows({ snapshot, sun, artificialLights, doorStates }: WalkthroughWorldProps) {
  const { gl, invalidate } = useThree()
  useLayoutEffect(() => {
    const previous = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    invalidate()
    return () => { gl.shadowMap.autoUpdate = previous; gl.shadowMap.needsUpdate = true }
  }, [gl, invalidate])
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, snapshot, sun, artificialLights, doorStates])
}

// Pose/minimap updates occur ten times per second in the parent. Stable scene
// inputs should not rebuild the entire apartment's React mesh tree each time.
export const WalkthroughWorld = memo(function WalkthroughWorld({ snapshot, sun, artificialLights, doorStates }: WalkthroughWorldProps) {
  useStaticShadows({ snapshot, sun, artificialLights, doorStates })
  const { apartment, geometry, customization } = snapshot
  const assetMap = useMemo(() => new Map(snapshot.assets.map(asset => [asset.id, asset])), [snapshot.assets])
  const touringCustomization = useMemo<DesignCustomization>(() => ({
    ...(customization ?? defaultDesignCustomization()),
    // Door interactions apply immediately to both geometry and collision. Never
    // mutate the saved version or animate beyond its current collision state.
    doors: Object.fromEntries(apartment.doors.map(door => [door.id, {
      style: door.appearance ?? 'panel',
      color: door.finish === 'blue-gray' ? '#d0d5ca' : '#b7c0b6',
      ...customization?.doors[door.id],
      openness: resolveWalkDoorOpenness(doorStates, door.id, customization?.doors[door.id]?.openness ?? 1),
    }])),
  }), [apartment.doors, customization, doorStates])
  // Preserve finishes for previously saved copies of the original template.
  const canonicalFinishes = apartment.id === 'demo-t3' || apartment.id === 'quimper-t3'
  return <>
    <color attach="background" args={[sun.isDaylight ? '#dbe7eb' : '#101a2b']} />
    <fog attach="fog" args={[sun.isDaylight ? '#dbe7eb' : '#101a2b', 100, 400]} />
    <NaturalLighting snapshot={snapshot} sun={sun} />
    <ArtificialLighting snapshot={snapshot} enabled={artificialLights} />
    <SiteContext snapshot={snapshot} />
    <Floor polygon={geometry.floor.polygon} color="#c5c6b9" elevation={geometry.floor.elevation} thickness={geometry.floor.thickness} />
    {apartment.rooms.map(room => {
      const finish = customization?.floors[room.id]
      return <Floor key={room.id} polygon={room.polygon} color={room.color} elevation={geometry.floor.elevation + .006}
        finish={finish ? (finish.material === 'concrete' ? undefined : finish.material) : canonicalFinishes ? roomFinish(room.id) : undefined} tint={finish?.color} />
    })}
    {apartment.balcony && <Floor polygon={apartment.balcony.polygon} color="#c1c3b6" elevation={geometry.floor.elevation}
      thickness={geometry.floor.thickness} finish="balcony" />}
    {apartment.walls.map(wall => <Wall key={wall.id} wall={wall} doors={apartment.doors.filter(door => door.wallId === wall.id)}
      windows={apartment.windows.filter(window => window.wallId === wall.id)} cutaway={false} customization={touringCustomization} />)}
    <Volume polygon={geometry.ceiling.polygon} base={geometry.ceiling.elevation} height={geometry.ceiling.thickness} color="#ecebe2" />
    <ArchitecturalDetails apartment={apartment} cutaway={false} />
    {snapshot.fixtures.map(fixture => {
      const asset = assetMap.get(fixture.assetId)
      return asset ? <PlacedObject key={fixture.id} fixture={fixture} asset={asset} projectId={snapshot.project.id} /> : null
    })}
  </>
})
