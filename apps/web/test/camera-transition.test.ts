import assert from 'node:assert/strict'
import test from 'node:test'
import { Vector3 } from 'three'
import { advanceCameraTransition } from '../src/lib/camera-transition.ts'

test('a demand-rendered camera resumes smoothly after a long idle', () => {
  const position = new Vector3(0, 0, 0), target = new Vector3()
  const goal = { position: new Vector3(20, 10, 10), target: new Vector3(5, 1, 2) }
  assert.equal(advanceCameraTransition(position, target, goal, 45), false)
  assert.ok(position.x > 0 && position.x < 10, 'first frame must not jump to the requested view')
  assert.ok(target.x > 0 && target.x < 2.5)
})

test('a camera already at its position keeps moving an unfinished orbit target', () => {
  const goal = { position: new Vector3(20, 10, 10), target: new Vector3(5, 1, 2) }
  const position = goal.position.clone(), target = new Vector3()
  assert.equal(advanceCameraTransition(position, target, goal, 1 / 60), false)
  assert.ok(target.distanceTo(goal.target) > 0.005)
})

test('the transition eventually settles both vectors exactly and does not alter the goal', () => {
  const position = new Vector3(20, 10, 10), target = new Vector3()
  const goal = { position: new Vector3(-8, 5, 1), target: new Vector3(3, 1, 2) }
  let settled = false
  for (let frame = 0; frame < 180 && !settled; frame++) settled = advanceCameraTransition(position, target, goal, 1 / 60)
  assert.equal(settled, true)
  assert.deepEqual(position.toArray(), [-8, 5, 1])
  assert.deepEqual(target.toArray(), [3, 1, 2])
  assert.deepEqual(goal.position.toArray(), [-8, 5, 1])
  assert.deepEqual(goal.target.toArray(), [3, 1, 2])
})
