import { useState, type ReactNode } from 'react'

function supportsWebGL2() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** R3F's Canvas fallback handles missing canvas support, not a failed GL context. */
export function WebGLGuard({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [available] = useState(supportsWebGL2)
  return available ? children : fallback
}
