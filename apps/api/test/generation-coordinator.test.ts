import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GenerationCoordinator } from '../src/generation-coordinator.ts'

test('workshops serialize, an aborted waiter does not block, and release is idempotent', async () => {
  const coordinator = new GenerationCoordinator()
  const first = await coordinator.acquire(new AbortController().signal)
  const aborted = new AbortController()
  const waiting = coordinator.acquire(aborted.signal)
  const rejected = assert.rejects(waiting, { name: 'AbortError' })
  let thirdStarted = false
  const third = coordinator.acquire(new AbortController().signal).then(release => { thirdStarted = true; return release })
  aborted.abort()
  await rejected
  assert.equal(thirdStarted, false)
  first()
  const releaseThird = await third
  first()
  let fourthStarted = false
  const fourth = coordinator.acquire(new AbortController().signal).then(release => { fourthStarted = true; return release })
  await Promise.resolve()
  assert.equal(fourthStarted, false)
  releaseThird()
  ;(await fourth)()
})

test('already aborted callers cannot claim a slot', async () => {
  const coordinator = new GenerationCoordinator()
  const aborted = AbortSignal.abort()
  assert.throws(() => coordinator.acquire(aborted), { name: 'AbortError' })
  ;(await coordinator.acquire(new AbortController().signal))()
})
