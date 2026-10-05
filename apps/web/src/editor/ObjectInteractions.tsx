import { useEffect, useLayoutEffect, useRef, type ComponentRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { OrbitControls } from '@react-three/drei'
import { isFixtureMovable, type Asset, type Fixture } from '@t3-designer/scene-schema'
import { Group, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three'

export type ObjectInteractionProps = {
  scene: { fixtures: Fixture[]; assets: Asset[] }
  onSelect: (id: string | null) => void
  onMove: (id: string, position: [number, number, number]) => void
  mode: '3d' | 'top'
  editable: boolean
  snap: number
  objects: RefObject<Map<string, Group>>
  controls: RefObject<ComponentRef<typeof OrbitControls> | null>
  onDragStart?: () => void
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
export function ObjectInteractions(props: ObjectInteractionProps) {
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
      latest.current.onDragStart?.()
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
