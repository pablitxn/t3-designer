import { Component, Suspense, useEffect, useMemo, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { apartmentBounds } from '@t3-designer/geometry'
import { type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { Group, Mesh, PCFShadowMap, PerspectiveCamera } from 'three'
import { useTranslation } from 'react-i18next'
import { Floor } from '../components/Floor'
import { Wall } from '../components/Wall'
import { WebGLGuard } from '../components/WebGLGuard'
import { projectModelUrl } from '../private/project-scene'
import { sceneCopy } from '../private/scene-copy'
import { DesignEnvelope, DesignLighting, LightEmitter } from '../components/DesignLighting'
import { activeFixtureLightIds, fixtureLight } from '../lib/design-lighting'
import { roomFinish } from '../materials/surfaces'
import { ObjectInteractions } from './ObjectInteractions'

export type EditorSceneProps = {
  scene: ProjectSnapshot
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, position: [number, number, number]) => void
  mode: '3d' | 'top'
  editable: boolean
  /** Grid spacing in metres; zero turns snapping off. */
  snap: number
  projectId: string
  cutaway?: boolean
  /** Neutral object-editing light for the public layout; private projects retain their solar study. */
  lighting?: 'scene' | 'studio'
}

type SceneAsset = ProjectSnapshot['assets'][number]
type Controls = ComponentRef<typeof OrbitControls>
type ObjectMap = RefObject<Map<string, Group>>

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    // Instance transforms are independent; immutable model resources stay shared.
    const clone = scene.clone(true)
    clone.traverse(node => {
      if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true }
    })
    return clone
  }, [scene])
  return <primitive object={model} dispose={null} />
}

function Placeholder({ asset, label }: { asset: SceneAsset; label?: string }) {
  return <group>
    <mesh position={[0, asset.dimensions[1] / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={asset.dimensions} />
      <meshStandardMaterial color="#a4aa95" roughness={.85} transparent opacity={.8} />
    </mesh>
    {label && <Html center position={[0, asset.dimensions[1] + .12, 0]} style={{ pointerEvents: 'none' }}>
      <span className="tw:block tw:w-28 tw:rounded tw:bg-[var(--settings-bg)] tw:p-1 tw:text-center tw:text-xs tw:text-[color:var(--settings-text)]">{label}</span>
    </Html>}
  </group>
}

function PlacedObject({ fixture, asset, selected, projectId, objects, lightActive }: { fixture: Fixture; asset: SceneAsset; selected: boolean; projectId: string; objects: ObjectMap; lightActive: boolean }) {
  const { i18n } = useTranslation('common')
  const locale = i18n.resolvedLanguage === 'es' || i18n.resolvedLanguage === 'fr' ? i18n.resolvedLanguage : 'en'
  const url = projectModelUrl(asset.url, projectId)
  const fallback = <Placeholder asset={asset} label={sceneCopy[locale].modelUnavailable} />
  const light = fixtureLight(fixture)
  return <group ref={node => { if (node) objects.current.set(fixture.id, node); else objects.current.delete(fixture.id) }}
    name={fixture.id} position={fixture.position} rotation={[0, fixture.rotation, 0]} userData={{ fixtureId: fixture.id }}>
    {url ? <ModelBoundary key={url} fallback={fallback}>
      <Suspense fallback={<Placeholder asset={asset} />}><Model url={url} /></Suspense>
    </ModelBoundary> : fallback}
    {light && <LightEmitter source={{ ...light, enabled: lightActive }} position={light.offset} />}
    {/* A stable pick volume also makes thin legs and partially loaded models usable. */}
    <mesh position={[0, asset.dimensions[1] / 2, 0]}>
      <boxGeometry args={asset.dimensions} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    {selected && <mesh position={[0, asset.dimensions[1] / 2, 0]} renderOrder={10} raycast={() => {}}>
      <boxGeometry args={asset.dimensions.map(value => value + .035) as [number, number, number]} />
      <meshBasicMaterial color="#236747" wireframe depthTest={false} depthWrite={false} />
    </mesh>}
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .008, 0]} renderOrder={9} raycast={() => {}}>
      <planeGeometry args={[asset.dimensions[0] + .06, asset.dimensions[2] + .06]} />
      <meshBasicMaterial color="#5bbf84" transparent opacity={.25} depthWrite={false} />
    </mesh>}
  </group>
}

function SceneCamera({ scene, mode, controls, cutaway }: Pick<EditorSceneProps, 'scene' | 'mode' | 'cutaway'> & { controls: RefObject<Controls | null> }) {
  const { camera, gl, size, invalidate } = useThree()
  const bounds = useMemo(() => apartmentBounds(scene.apartment), [scene.apartment])
  const { width, depth, center: [centerX, centerZ] } = bounds
  const verticalFocus = cutaway === false ? Math.max(0, scene.geometry.ceiling.elevation - scene.geometry.floor.elevation) * .35 : 0
  useEffect(() => {
    const orbit = controls.current
    if (!(camera instanceof PerspectiveCamera) || !orbit) return
    const aspect = Math.max(size.width, 1) / Math.max(size.height, 1)
    const top = mode === 'top'
    // A rotated plan projects its depth onto screen width too. Give narrow
    // portrait canvases room for that diagonal without shrinking desktop views.
    const portraitPadding = !top && aspect < 1 ? 1 + Math.min(.5, (1 - aspect) * 1.5) : 1
    const span = Math.max(depth, width / aspect, 2) * portraitPadding
    // Clear inertia before a deliberate camera change.
    orbit.enableDamping = false
    orbit.update()
    camera.up.set(0, 1, 0)
    camera.position.set(centerX + (top ? 0 : span * .65), span * (top ? 1.6 : 1.2) + verticalFocus, centerZ + (top ? .01 : span * .85))
    orbit.target.set(centerX, scene.geometry.floor.elevation + verticalFocus, centerZ)
    camera.updateProjectionMatrix()
    orbit.update()
    orbit.enableDamping = true
    invalidate()
  }, [camera, centerX, centerZ, controls, depth, invalidate, mode, scene.geometry.floor.elevation, size.height, size.width, verticalFocus, width])
  return <OrbitControls ref={controls} domElement={gl.domElement} makeDefault enableDamping dampingFactor={.08}
    enableRotate={mode === '3d'} minDistance={1} maxDistance={120} minPolarAngle={.001} maxPolarAngle={Math.PI / 2.05} />
}


function EditorWorld(props: EditorSceneProps) {
  const { scene, selectedId, projectId } = props
  const controls = useRef<Controls>(null)
  const objects = useRef(new Map<string, Group>())
  const bounds = useMemo(() => apartmentBounds(scene.apartment), [scene.apartment])
  const assets = useMemo(() => new Map(scene.assets.map(asset => [asset.id, asset])), [scene.assets])
  const activeLights = useMemo(() => activeFixtureLightIds(scene), [scene])
  const cutaway = props.cutaway ?? true
  const floor = scene.geometry.floor
  const gridSize = Math.max(20, Math.ceil(Math.max(bounds.width, bounds.depth) * 2))
  return <>
    <color attach="background" args={['#e8ecdf']} />
    {props.lighting === 'studio' ? <>
      <ambientLight intensity={.7} />
      <hemisphereLight args={['#f4f8ff', '#c5bca4', 1.2]} />
      <directionalLight position={[bounds.center[0] + 4, 14, bounds.center[1] + 5]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-normalBias={.025} />
    </> : <><DesignLighting scene={scene} /><DesignEnvelope scene={scene} cutaway={cutaway} /></>}
    <SceneCamera scene={scene} mode={props.mode} controls={controls} cutaway={cutaway} />
    <gridHelper position={[bounds.center[0], floor.elevation - floor.thickness - .01, bounds.center[1]]} args={[gridSize, gridSize, '#bac8b4', '#d3dccb']} />
    <Floor polygon={floor.polygon} color="#c5c8b9" thickness={floor.thickness} elevation={floor.elevation} />
    {scene.apartment.rooms.map(room => {
      const finish = scene.customization?.floors[room.id]
      return <Floor key={room.id} polygon={room.polygon} elevation={floor.elevation + .005} color={room.color} tint={finish?.color ?? '#ffffff'} finish={finish?.material === 'concrete' ? undefined : finish?.material ?? roomFinish(room.id)} />
    })}
    {scene.apartment.balcony && <Floor polygon={scene.apartment.balcony.polygon} color="#c9c7ae" elevation={floor.elevation} thickness={floor.thickness} />}
    {scene.apartment.walls.map(wall => <Wall key={wall.id} wall={wall} doors={scene.apartment.doors.filter(door => door.wallId === wall.id)} windows={scene.apartment.windows.filter(window => window.wallId === wall.id)} cutaway={cutaway} customization={scene.customization} />)}
    {scene.fixtures.map(fixture => {
      const asset = assets.get(fixture.assetId)
      return asset ? <PlacedObject key={fixture.id} fixture={fixture} asset={asset} selected={selectedId === fixture.id} projectId={projectId} objects={objects} lightActive={activeLights.has(fixture.id)} /> : null
    })}
    <ObjectInteractions {...props} objects={objects} controls={controls} />
  </>
}

export function EditorScene(props: EditorSceneProps) {
  const { t } = useTranslation('workspace')
  const fallback = <div className="canvas-fallback">{t('apartment.canvasFallback')}</div>
  return <div className="editor-scene" style={{ height: '100%', minHeight: 420, position: 'relative' }}>
    <WebGLGuard fallback={fallback}>
      <Canvas shadows={{ type: PCFShadowMap }} frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 42, near: .05, far: 500 }}
        style={{ touchAction: 'none' }} fallback={fallback} aria-label={t('apartment.canvasAria')}>
        <EditorWorld {...props} />
      </Canvas>
    </WebGLGuard>
  </div>
}
