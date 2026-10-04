import type { Vector3 } from 'three'

export type CameraTransition = { position: Vector3; target: Vector3 }

/** Advance an orbit camera toward a deliberate view request. Demand rendering
 * can resume after a long idle, so cap the first delta to preserve animation.
 * Both the eye and its target must arrive before the transition stops. */
export function advanceCameraTransition(
  position: Vector3,
  target: Vector3,
  goal: CameraTransition,
  delta: number,
  tolerance = 0.005,
): boolean {
  const amount = 1 - Math.exp(-7 * Math.min(Math.max(0, delta), 1 / 15))
  position.lerp(goal.position, amount)
  target.lerp(goal.target, amount)
  const arrived = position.distanceTo(goal.position) < tolerance && target.distanceTo(goal.target) < tolerance
  if (arrived) {
    position.copy(goal.position)
    target.copy(goal.target)
  }
  return arrived
}
