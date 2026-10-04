import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  isWalkPositionFree,
  moveWalkPosition,
  roomAtPosition,
  WALK_CROUCH_HEIGHT,
  WALK_EYE_HEIGHT,
  stepWalkVertical,
  type WalkVerticalState,
  type WalkWorld,
} from './navigation'

export type WalkInput = {
  forward: number
  right: number
  /** Positive values turn right; look deltas are consumed after each frame. */
  turn: number
  lookX: number
  lookY: number
  fast: boolean
  crouch: boolean
  /** One-shot request, consumed by the next active frame. */
  jump: boolean
  /** One-shot use action, consumed by the next active frame. */
  interact: boolean
}

export type WalkPose = { x: number; z: number; yaw: number; pitch: number; eyeHeight: number; feetOffset: number; grounded: boolean; roomId?: string }

type WalkControllerProps = {
  world: WalkWorld
  /** Door leaves can change without resetting the visit's spawn or orientation. */
  collisionWorld: WalkWorld
  active: boolean
  input: RefObject<WalkInput>
  spawn: { position: [number, number]; yaw: number } | null
  resetKey: number
  eyeHeight: number
  sensitivity: number
  onPose: (pose: WalkPose) => void
  onPause: () => void
  onInteract: (pose: WalkPose) => void
}

const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'KeyE', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC',
  'Space',
])
const MAX_PITCH = Math.PI * .46
const WALK_SPEED = 1.45
const FAST_SPEED = 2.6
const CROUCH_SPEED = .8
const TURN_SPEED = 1.65

function isEditing(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

/** Raise only into free space, including the body and clearance above the eyes. */
function safeHeight(world: WalkWorld, position: [number, number], current: number, desired: number, feetOffset: number): number {
  if (desired <= current || isWalkPositionFree(world, position, desired, feetOffset)) return desired
  let low = current
  let high = desired
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const middle = (low + high) / 2
    if (isWalkPositionFree(world, position, middle, feetOffset)) low = middle
    else high = middle
  }
  return low
}

export function WalkController({ world, collisionWorld, active, input, spawn, resetKey, eyeHeight, sensitivity, onPose, onPause, onInteract }: WalkControllerProps) {
  const { camera, gl, invalidate } = useThree()
  const keys = useRef(new Set<string>())
  const look = useRef({ x: 0, y: 0 })
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const edgeLook = useRef({ x: 0, y: 0 })
  const jumpQueued = useRef(false)
  const interactQueued = useRef(false)
  const vertical = useRef<WalkVerticalState>({ offset: 0, velocity: 0, grounded: true })
  const hadPointerLock = useRef(false)
  const pauseRequested = useRef(false)
  const callbacks = useRef({ onPose, onPause, onInteract })
  const position = useRef<[number, number] | null>(null)
  const orientation = useRef({ yaw: 0, pitch: 0, height: WALK_EYE_HEIGHT })
  const poseElapsed = useRef(0)
  const lastPose = useRef<WalkPose | null>(null)
  const spawnX = spawn?.position[0]
  const spawnZ = spawn?.position[1]
  const spawnYaw = spawn?.yaw
  const standingHeight = clamp(finite(eyeHeight, WALK_EYE_HEIGHT), WALK_CROUCH_HEIGHT, 2.1)

  useEffect(() => { callbacks.current = { onPose, onPause, onInteract } }, [onPose, onPause, onInteract])

  useEffect(() => {
    if (spawnX === undefined || spawnZ === undefined || spawnYaw === undefined) {
      position.current = null
      return
    }
    position.current = [spawnX, spawnZ]
    // Navigation selected this point with the requested standing clearance.
    orientation.current = { yaw: spawnYaw, pitch: 0, height: Math.min(standingHeight, WALK_EYE_HEIGHT) }
    look.current = { x: 0, y: 0 }
    vertical.current = { offset: 0, velocity: 0, grounded: true }
    jumpQueued.current = false
    interactQueued.current = false
    poseElapsed.current = .1
    lastPose.current = null
    camera.position.set(spawnX, world.floorElevation + orientation.current.height, spawnZ)
    camera.rotation.set(0, spawnYaw, 0, 'YXZ')
    invalidate()
    // Eye-height changes animate in place instead of resetting the walk.
  }, [world, spawnX, spawnZ, spawnYaw, resetKey, camera, invalidate])

  useEffect(() => {
    const canvas = gl.domElement
    const oldTouchAction = canvas.style.touchAction
    const oldTabIndex = canvas.getAttribute('tabindex')
    canvas.style.touchAction = 'none'
    if (oldTabIndex === null) canvas.tabIndex = 0
    pauseRequested.current = false

    const releaseDrag = () => {
      const pointer = drag.current
      drag.current = null
      if (pointer && canvas.hasPointerCapture(pointer.pointerId)) canvas.releasePointerCapture(pointer.pointerId)
    }
    const clearInput = () => {
      keys.current.clear()
      look.current = { x: 0, y: 0 }
      hover.current = null
      edgeLook.current = { x: 0, y: 0 }
      jumpQueued.current = false
      interactQueued.current = false
      Object.assign(input.current, { forward: 0, right: 0, turn: 0, lookX: 0, lookY: 0, fast: false, crouch: false, jump: false, interact: false })
      releaseDrag()
    }
    const pause = () => {
      clearInput()
      if (!active || pauseRequested.current) return
      pauseRequested.current = true
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      callbacks.current.onPause()
    }
    const keyDown = (event: KeyboardEvent) => {
      if (!active || pauseRequested.current || event.defaultPrevented || isEditing(event.target) || isEditing(document.activeElement)) return
      if (event.code === 'Escape') {
        event.preventDefault()
        pause()
        return
      }
      if (event.metaKey || event.altKey || !MOVEMENT_KEYS.has(event.code)) return
      // Focused HUD buttons keep Space/Enter activation instead of jumping twice.
      if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button')) return
      event.preventDefault()
      if (event.code === 'Space' && !event.repeat && !keys.current.has('Space')) jumpQueued.current = true
      if (event.code === 'KeyE' && !event.repeat && !keys.current.has('KeyE')) interactQueued.current = true
      keys.current.add(event.code)
      invalidate()
    }
    const keyUp = (event: KeyboardEvent) => { keys.current.delete(event.code) }
    const focusIn = (event: FocusEvent) => { if (isEditing(event.target)) clearInput() }
    const visibilityChange = () => { if (document.hidden) pause() }
    const pointerLockChange = () => {
      const ownsLock = document.pointerLockElement === canvas
      const lostLock = hadPointerLock.current && !ownsLock
      hadPointerLock.current = ownsLock
      hover.current = null
      edgeLook.current = { x: 0, y: 0 }
      if (ownsLock) releaseDrag()
      if (lostLock) pause()
    }
    const mouseMove = (event: MouseEvent) => {
      if (!active || pauseRequested.current || document.pointerLockElement !== canvas) return
      look.current.x += finite(event.movementX)
      look.current.y += finite(event.movementY)
      invalidate()
    }
    const pointerDown = (event: PointerEvent) => {
      if (!active || pauseRequested.current || document.pointerLockElement === canvas || drag.current || event.button !== 0) return
      event.preventDefault()
      canvas.focus({ preventScroll: true })
      // Mouse look works on hover when capture is unavailable. Only touch/pen
      // need an explicit drag; avoid applying both hover and drag deltas.
      if (event.pointerType === 'mouse') return
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      if (!active || pauseRequested.current || document.pointerLockElement === canvas) return
      if (event.pointerType === 'mouse') {
        const previous = hover.current
        hover.current = { x: event.clientX, y: event.clientY }
        if (previous) {
          look.current.x += clamp(event.clientX - previous.x, -120, 120)
          look.current.y += clamp(event.clientY - previous.y, -120, 120)
        }
        const rect = canvas.getBoundingClientRect()
        const edge = 24
        // Edge turning permits a complete rotation even without Pointer Lock;
        // entering/leaving UI resets it, so controls never steer the camera.
        const edgeAxis = (position: number, size: number) => position < edge ? -(1 - Math.max(0, position) / edge)
          : position > size - edge ? 1 - Math.max(0, size - position) / edge : 0
        edgeLook.current = { x: edgeAxis(event.clientX - rect.left, rect.width), y: edgeAxis(event.clientY - rect.top, rect.height) }
        invalidate()
        return
      }
      const pointer = drag.current
      if (!pointer || event.pointerId !== pointer.pointerId) return
      look.current.x += event.clientX - pointer.x
      look.current.y += event.clientY - pointer.y
      pointer.x = event.clientX
      pointer.y = event.clientY
      invalidate()
    }
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) releaseDrag()
    }
    const lostPointerCapture = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) drag.current = null
    }
    const pointerEnter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') hover.current = { x: event.clientX, y: event.clientY }
    }
    const pointerLeave = () => { hover.current = null; edgeLook.current = { x: 0, y: 0 } }

    hadPointerLock.current = document.pointerLockElement === canvas
    if (!active) {
      clearInput()
      if (hadPointerLock.current) document.exitPointerLock()
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', pause)
    document.addEventListener('focusin', focusIn)
    document.addEventListener('visibilitychange', visibilityChange)
    document.addEventListener('pointerlockchange', pointerLockChange)
    document.addEventListener('mousemove', mouseMove)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerenter', pointerEnter)
    canvas.addEventListener('pointerleave', pointerLeave)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
    canvas.addEventListener('lostpointercapture', lostPointerCapture)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', pause)
      document.removeEventListener('focusin', focusIn)
      document.removeEventListener('visibilitychange', visibilityChange)
      document.removeEventListener('pointerlockchange', pointerLockChange)
      document.removeEventListener('mousemove', mouseMove)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerenter', pointerEnter)
      canvas.removeEventListener('pointerleave', pointerLeave)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('lostpointercapture', lostPointerCapture)
      clearInput()
      if (active && document.pointerLockElement === canvas) document.exitPointerLock()
      canvas.style.touchAction = oldTouchAction
      if (oldTabIndex === null) canvas.removeAttribute('tabindex')
    }
  }, [active, gl, input, invalidate])

  useFrame((_, elapsed) => {
    const currentPosition = position.current
    if (!currentPosition) return
    const delta = clamp(finite(elapsed), 0, .05)
    const current = orientation.current
    const controls = input.current
    if (active && !pauseRequested.current && !isEditing(document.activeElement)) {
      const held = (...codes: string[]) => Number(codes.some(code => keys.current.has(code)))
      const forward = clamp(finite(controls.forward) + held('KeyW') - held('KeyS'), -1, 1)
      const right = clamp(finite(controls.right) + held('KeyD') - held('KeyA'), -1, 1)
      const turn = clamp(finite(controls.turn) + held('ArrowRight') - held('ArrowLeft'), -1, 1)
      const tilt = held('ArrowUp') - held('ArrowDown')
      const lookSensitivity = .0022 * clamp(finite(sensitivity, 1), .2, 3)
      current.yaw -= (look.current.x + finite(controls.lookX)) * lookSensitivity + (turn + edgeLook.current.x) * TURN_SPEED * delta
      current.yaw = Math.atan2(Math.sin(current.yaw), Math.cos(current.yaw))
      current.pitch = clamp(current.pitch - (look.current.y + finite(controls.lookY)) * lookSensitivity + (tilt - edgeLook.current.y) * TURN_SPEED * delta, -MAX_PITCH, MAX_PITCH)
      look.current.x = 0
      look.current.y = 0
      controls.lookX = 0
      controls.lookY = 0

      const crouching = controls.crouch || Boolean(held('KeyC', 'ControlLeft', 'ControlRight'))
      const targetHeight = crouching ? Math.min(standingHeight, WALK_CROUCH_HEIGHT) : standingHeight
      const height = Math.abs(targetHeight - current.height) < .001
        ? targetHeight
        : current.height + (targetHeight - current.height) * (1 - Math.exp(-12 * delta))
      current.height = safeHeight(collisionWorld, currentPosition, current.height, height, vertical.current.offset)
      const speed = crouching || current.height < standingHeight - .12
        ? CROUCH_SPEED
        : controls.fast || held('ShiftLeft', 'ShiftRight') ? FAST_SPEED : WALK_SPEED
      const magnitude = Math.max(1, Math.hypot(forward, right))
      const distance = speed * delta / magnitude
      if (forward !== 0 || right !== 0) {
        position.current = moveWalkPosition(collisionWorld, currentPosition, [
          (-Math.sin(current.yaw) * forward + Math.cos(current.yaw) * right) * distance,
          (-Math.cos(current.yaw) * forward - Math.sin(current.yaw) * right) * distance,
        ], current.height, vertical.current.offset)
      }
      vertical.current = stepWalkVertical(collisionWorld, position.current ?? currentPosition, current.height, vertical.current, delta, jumpQueued.current || controls.jump)
      jumpQueued.current = false
      controls.jump = false
      if (interactQueued.current || controls.interact) {
        const [x, z] = position.current ?? currentPosition
        callbacks.current.onInteract({ x, z, yaw: current.yaw, pitch: current.pitch, eyeHeight: current.height,
          feetOffset: vertical.current.offset, grounded: vertical.current.grounded, roomId: roomAtPosition(world, [x, z])?.id })
      }
      interactQueued.current = false
      controls.interact = false
      // Also supports demand-rendered canvases without frame-dependent speed.
      invalidate()
    }

    const [x, z] = position.current ?? currentPosition
    camera.position.set(x, world.floorElevation + vertical.current.offset + current.height, z)
    camera.rotation.set(current.pitch, current.yaw, 0, 'YXZ')
    poseElapsed.current += delta
    if (poseElapsed.current < .1) return
    poseElapsed.current = 0
    const previous = lastPose.current
    const roomId = roomAtPosition(world, [x, z])?.id
    if (previous && previous.x === x && previous.z === z && previous.yaw === current.yaw && previous.pitch === current.pitch && Math.abs(previous.eyeHeight - current.height) < .001 && Math.abs(previous.feetOffset - vertical.current.offset) < .001 && previous.grounded === vertical.current.grounded && previous.roomId === roomId) return
    const pose: WalkPose = { x, z, yaw: current.yaw, pitch: current.pitch, eyeHeight: current.height, feetOffset: vertical.current.offset, grounded: vertical.current.grounded, roomId }
    lastPose.current = pose
    callbacks.current.onPose(pose)
  })

  return null
}
