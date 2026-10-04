import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrivacyPath, PRIVACY_PATH } from '../src/lib/privacy-route.ts'

test('the privacy page has a real canonical path and accepts one trailing slash', () => {
  assert.equal(PRIVACY_PATH, '/privacy')
  assert.equal(isPrivacyPath('/privacy'), true)
  assert.equal(isPrivacyPath('/privacy/'), true)
})

test('only the dedicated privacy route suppresses workspace analytics', () => {
  for (const path of ['/', '', '/privacy-policy', '/private', '/privacy/other', '/privacy//', '/Privacy', '/apartment', '/documentation']) {
    assert.equal(isPrivacyPath(path), false, path)
  }
})
