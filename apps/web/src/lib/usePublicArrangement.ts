import { useState, type KeyboardEvent } from 'react'
import type { Fixture } from '@t3-designer/scene-schema'
import { moveDemoFixture, movableDemoFixture } from './demo-layout'
import type { DemoLayout } from './useDemoLayout'

/** Editing changes the existing apartment scene, without replacing its renderer. */
export function usePublicArrangement(layout: DemoLayout, enabled: boolean) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const selected = layout.fixtures.find(fixture => fixture.id === selectedId)
  function move(id: string, patch: { position?: Fixture['position']; rotation?: number }) {
    try { layout.change(moveDemoFixture(layout.fixtures, id, patch)); setError(false) }
    catch { setError(true) }
  }
  function onRotate(direction: 'left' | 'right') {
    if (!enabled || !selected || !movableDemoFixture(selected)) return
    // Positive Y rotation turns counterclockwise when viewed from above.
    move(selected.id, { rotation: selected.rotation + (direction === 'left' ? 1 : -1) * Math.PI / 2 })
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (!enabled) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      setError(false)
      if (event.shiftKey) layout.redo(); else layout.undo()
      return
    }
    if (target.closest('button, a, summary') || !selected || !movableDemoFixture(selected) || event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault()
      onRotate('left')
      return
    }
    const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 0 : event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 2 : null
    if (axis !== null) {
      event.preventDefault()
      const position: Fixture['position'] = [...selected.position]
      position[axis] = Number((position[axis] + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? .5 : .1)).toFixed(4))
      move(selected.id, { position })
    }
  }
  return {
    selectedId, selected, error, keyDown, onRotate,
    onSelect: (id: string | null) => { setSelectedId(id); setError(false) },
    onMove: (id: string, position: Fixture['position']) => move(id, { position }),
    onClearError: () => setError(false),
  }
}
