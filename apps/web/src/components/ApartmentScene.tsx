import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3, PerspectiveCamera } from 'three'
import { apartmentBounds, polygonBounds, polygonCentroid } from '@t3-designer/geometry'
import type { Apartment as ApartmentData, Fixture, Point2D } from '@t3-designer/scene-schema'
import { Apartment } from './Apartment'
import { InteriorSunlight } from './InteriorSunlight'
import { BuildingContext } from './BuildingContext'
import { APARTMENT_PLACEMENT } from '../data/apartment-placement'
import type { SolarPosition } from '../lib/solar'
import { advanceCameraTransition, type CameraTransition } from '../lib/camera-transition'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/useLocale'
import { roomLabel } from '../i18n/workspace-labels'
import { WebGLGuard } from './WebGLGuard'

type ViewRequest = { mode: '3d' | 'top'; revision: number }

type ApartmentSceneProps = {
  apartment: ApartmentData
  cutaway: boolean
  showLabels: boolean
  showFixtures?: boolean
  focusRoomId?: string
  view: ViewRequest
  sun: SolarPosition
  showContext: boolean
  fixtures?: Fixture[]
}

type RoomLabel = {
  id: string
  area: number
  position: Point2D
  extra: boolean
}

function LabelProjection({ labels, elements, enabled }: { labels: RoomLabel[]; elements: RefObject<Map<string, HTMLDivElement>>; enabled: boolean }) {
  const projected = useMemo(() => new Vector3(), [])
  const invalidate = useThree(state => state.invalidate)
  // Labels mount outside Canvas; toggling them must request a projection frame.
  useEffect(() => { invalidate() }, [enabled, labels, invalidate])

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    for (const label of labels) {
      const element = elements.current.get(label.id)
      if (!element) continue
      projected.set(label.position[0], 0.035, label.position[1]).project(camera)
      const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.15 && Math.abs(projected.y) <= 1.15
      element.style.visibility = visible ? 'visible' : 'hidden'
      element.style.transform = `translate3d(${((projected.x + 1) * size.width) / 2}px, ${((1 - projected.y) * size.height) / 2}px, 0) translate(-50%, -50%)`
    }
  })

  return null
}

function SceneCamera({ apartment, view, focusRoomId, showContext }: Pick<ApartmentSceneProps, 'apartment' | 'view' | 'focusRoomId' | 'showContext'>) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const transition = useRef<CameraTransition | null>(null)
  const initialized = useRef(false)
  const { width, height } = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !(camera instanceof PerspectiveCamera)) return
    const focusRoom = apartment.rooms.find((room) => room.id === focusRoomId)
    const bounds = focusRoom ? polygonBounds(focusRoom.polygon) : apartmentBounds(apartment)
    const [x, z] = focusRoom ? polygonCentroid(focusRoom.polygon) : bounds.center
    const aspect = Math.max(width, 1) / Math.max(height, 1)
    const span = Math.max(bounds.width, bounds.depth, bounds.width / aspect) * (showContext && !focusRoom ? 1.4 : 1)
    // Flush any remaining drag momentum before applying a deliberate view reset.
    controls.enableDamping = false
    controls.update()
    camera.up.set(0, 1, 0)
    const target = new Vector3(x, focusRoom && view.mode !== 'top' ? 0.35 : 0, z)
    const position = new Vector3()
    if (view.mode === 'top') {
      // A tiny southward offset avoids the OrbitControls pole singularity.
      // North (-Z) remains at the top of the screen with the conventional Y-up camera.
      position.set(x, (span * 0.63) / Math.tan((camera.fov * Math.PI) / 360), z + 0.02)
    } else if (focusRoomId === 'kitchen') {
      // View through the actual east-side passage so the fridge does not hide the run.
      position.set(x + span * 1.45, Math.max(3.5, span * 1.48), z + span * 0.10)
    } else {
      position.set(x + span * 0.82, Math.max(3.1, span * 1.38), z + span * 1.13)
    }
    if (!initialized.current) {
      camera.position.copy(position)
      controls.target.copy(target)
      initialized.current = true
    } else {
      transition.current = { position, target }
    }
    camera.lookAt(x, 0, z)
    camera.updateProjectionMatrix()
    controls.update()
    controls.enableDamping = true
    invalidate()
  }, [camera, apartment, view, width, height, focusRoomId, showContext, invalidate])

  useFrame((_, delta) => {
    const goal = transition.current
    const controls = controlsRef.current
    if (!goal || !controls) return
    const arrived = advanceCameraTransition(camera.position, controls.target, goal, delta)
    controls.update()
    if (arrived) transition.current = null
    else invalidate()
  })

  return (
      <OrbitControls
        ref={controlsRef}
        camera={camera}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={100}
        minPolarAngle={0.001}
        maxPolarAngle={Math.PI / 2.05}
        enablePan
        enableZoom
        onStart={() => { transition.current = null }}
      />
  )
}

export function ApartmentScene({ apartment, cutaway, showLabels, showFixtures = true, focusRoomId, view, sun, showContext, fixtures }: ApartmentSceneProps) {
  const { t } = useTranslation('workspace')
  const { formatNumber } = useLocale()
  const bounds = apartmentBounds(apartment)
  const [x, z] = bounds.center
  // Canvas owns one explicit camera; controls and labels always use that same instance.
  const camera = useMemo(() => {
    const perspective = new PerspectiveCamera(42, 1, 0.1, 500)
    perspective.position.set(13, 16, 16)
    return perspective
  }, [])
  const labelElements = useRef(new Map<string, HTMLDivElement>())
  const labels = useMemo<RoomLabel[]>(() => [
    ...apartment.rooms.map((room) => ({ id: room.id, area: room.reportedArea, position: polygonCentroid(room.polygon), extra: false })),
    ...(apartment.balcony ? [{ id: apartment.balcony.id, area: apartment.balcony.reportedArea, position: polygonCentroid(apartment.balcony.polygon), extra: true }] : []),
  ], [apartment])

  return (
    <div className="scene-surface">
    <WebGLGuard fallback={<div className="canvas-fallback">{t('apartment.canvasFallback')}</div>}>
    <Canvas
      frameloop="demand"
      camera={camera}
      shadows="percentage"
      dpr={[1, 2]}
      fallback={<div className="canvas-fallback">{t('apartment.canvasFallback')}</div>}
      aria-label={t('apartment.canvasAria')}
    >
      <color attach="background" args={[sun.isDaylight ? '#e8eae4' : '#687684']} />
      <InteriorSunlight apartment={apartment} sun={sun} />
      <group rotation={[0, -APARTMENT_PLACEMENT.rotationY, 0]}>
        <group position={APARTMENT_PLACEMENT.position.map(value => -value) as [number, number, number]}>
          <BuildingContext visible={showContext} cutaway="floor" showNeighbors />
        </group>
      </group>
      <mesh position={[x, showContext ? -APARTMENT_PLACEMENT.position[1] - .15 : -.155, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={showContext}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#e8eae4" roughness={1} />
      </mesh>
      {!showContext && <gridHelper position={[x, -0.15, z]} args={[30, 30, '#dce0d6', '#e1e5db']} />}
      <Apartment apartment={apartment} fixtures={fixtures} cutaway={cutaway} showFixtures={showFixtures} solarStudy />
      <SceneCamera apartment={apartment} view={view} focusRoomId={focusRoomId} showContext={showContext} />
      <LabelProjection labels={labels} elements={labelElements} enabled={showLabels} />
    </Canvas>
    </WebGLGuard>
    {showLabels && (
      <div className="labels-overlay" aria-label={t('apartment.roomLabelsAria')}>
        {labels.map((label) => (
          <div
            key={label.id}
            ref={(element) => {
              if (element) labelElements.current.set(label.id, element)
              else labelElements.current.delete(label.id)
            }}
            className={`room-label${label.area < 1.5 ? ' room-label-small' : ''}`}
            style={{ visibility: 'hidden' }}
          >
            <span>{roomLabel(t, label.id)}</span>
            <small>{label.extra ? t('apartment.extraArea', { area: formatNumber(label.area, 2) }) : t('apartment.reportedArea', { area: formatNumber(label.area, 2) })}</small>
          </div>
        ))}
      </div>
    )}
    </div>
  )
}
