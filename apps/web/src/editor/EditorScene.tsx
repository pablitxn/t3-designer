import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { apartmentBounds } from '@t3-designer/geometry'
import { isFixtureMovable, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { Group, Mesh, PCFShadowMap, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three'
import { useTranslation } from 'react-i18next'
import { Floor } from '../components/Floor'
import { Wall } from '../components/Wall'
import { WebGLGuard } from '../components/WebGLGuard'
import { projectModelUrl } from '../private/project-scene'
import { sceneCopy } from '../private/scene-copy'
import { DesignEnvelope, DesignLighting, LightEmitter } from '../components/DesignLighting'
import { activeFixtureLightIds, fixtureLight } from '../lib/design-lighting'
import { roomFinish } from '../materials/surfaces'

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

type Drag = {
  id: string
  pointerId: number
  object: Group
  original: Vector3
  anchor: Vector3
  plane: Plane
  start: [number, number]
  moved: boolean
  previousCursor: string
  controlsEnabled: boolean
}

/** Dragging mutates only a Three group. The history/store receives one completed edit. */
function ObjectInteractions(props: EditorSceneProps & { objects: ObjectMap; controls: RefObject<Controls | null> }) {
  const { camera, gl, invalidate } = useThree()
  const latest = useRef(props)
  const cancel = useRef<(() => void) | null>(null)
  useLayoutEffect(() => { latest.current = props })
  // Loading another layout, changing permissions or switching view aborts a gesture.
  useLayoutEffect(() => { cancel.current?.() }, [props.scene, props.editable, props.mode])

  useEffect(() => {
    const canvas = gl.domElement
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const intersection = new Vector3()
    let drag: Drag | null = null
    let emptyClick: { pointerId: number; x: number; y: number } | null = null

    function ray(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      camera.updateMatrixWorld()
      raycaster.setFromCamera(pointer, camera)
      return true
    }

    function finish(commit: boolean) {
      const current = drag
      if (!current) return
      drag = null
      const position = current.object.position.toArray() as [number, number, number]
      const changed = current.moved && current.object.position.distanceToSquared(current.original) > 1e-10
      const persisted = latest.current.scene.fixtures.find(fixture => fixture.id === current.id)
      if (persisted) current.object.position.fromArray(persisted.position)
      else current.object.position.copy(current.original)
      canvas.style.cursor = current.previousCursor
      const controls = latest.current.controls.current
      if (controls) controls.enabled = current.controlsEnabled
      // Clear state first: releasePointerCapture itself can dispatch lostpointercapture.
      if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId)
      invalidate()
      const asset = latest.current.scene.assets.find(item => item.id === persisted?.assetId)
      if (commit && changed && latest.current.editable && persisted && isFixtureMovable(persisted, asset)) latest.current.onMove(current.id, position)
    }

    function down(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || drag || !ray(event)) return
      const { objects, editable, onSelect, controls } = latest.current
      const groups = [...objects.current.values()]
      groups.forEach(group => group.updateWorldMatrix(true, true))
      const hit = raycaster.intersectObjects(groups, true)[0]
      let object: Object3D | undefined = hit?.object
      while (object && !object.userData.fixtureId) object = object.parent ?? undefined
      const id = object?.userData.fixtureId as string | undefined
      if (!id) { emptyClick = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; return }
      emptyClick = null
      onSelect(id)
      // Native pointer capture prevents the browser's default focus change. Keep
      // the editor viewport focused so its documented keyboard shortcuts work.
      canvas.closest<HTMLElement>('[tabindex]')?.focus({ preventScroll: true })
      const fixture = latest.current.scene.fixtures.find(item => item.id === id)
      const asset = latest.current.scene.assets.find(item => item.id === fixture?.assetId)
      if (!editable || !fixture || !isFixtureMovable(fixture, asset)) return
      const group = objects.current.get(id)
      if (!group) return
      const plane = new Plane(new Vector3(0, 1, 0), -group.position.y)
      const anchor = raycaster.ray.intersectPlane(plane, new Vector3())
      if (!anchor) return
      // Capture-phase interception prevents OrbitControls seeing this pointerdown.
      event.preventDefault()
      event.stopImmediatePropagation()
      try { canvas.setPointerCapture(event.pointerId) } catch { return }
      drag = { id, pointerId: event.pointerId, object: group, original: group.position.clone(), anchor, plane,
        start: [event.clientX, event.clientY], moved: false, previousCursor: canvas.style.cursor,
        controlsEnabled: controls.current?.enabled ?? true }
      if (controls.current) controls.current.enabled = false
      canvas.style.cursor = 'grabbing'
    }

    function move(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.pointerId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!drag.moved && Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]) < 4) return
      if (!ray(event) || !raycaster.ray.intersectPlane(drag.plane, intersection)) return
      const step = latest.current.snap
      const round = (value: number) => Number((Number.isFinite(step) && step > 0 ? Math.round(value / step) * step : value).toFixed(4))
      const x = round(drag.original.x + intersection.x - drag.anchor.x)
      const z = round(drag.original.z + intersection.z - drag.anchor.z)
      if (!Number.isFinite(x) || !Number.isFinite(z)) return
      drag.moved = true
      drag.object.position.set(x, drag.original.y, z)
      invalidate()
    }

    function up(event: PointerEvent) {
      if (drag && event.pointerId === drag.pointerId) {
        move(event)
        event.stopImmediatePropagation()
        finish(true)
      } else if (emptyClick?.pointerId === event.pointerId) {
        if (Math.hypot(event.clientX - emptyClick.x, event.clientY - emptyClick.y) < 4) latest.current.onSelect(null)
      }
      emptyClick = null
    }
    function cancelled(event: PointerEvent) {
      if (drag?.pointerId === event.pointerId) finish(false)
      emptyClick = null
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopImmediatePropagation(); finish(false) }
    }
    function blur() { finish(false); emptyClick = null }
    cancel.current = blur
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', cancelled, true)
    canvas.addEventListener('lostpointercapture', cancelled, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    return () => {
      finish(false)
      cancel.current = null
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', cancelled, true)
      canvas.removeEventListener('lostpointercapture', cancelled, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
    }
  }, [camera, gl, invalidate])
  return null
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
