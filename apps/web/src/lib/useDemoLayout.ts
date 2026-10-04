import { useEffect, useState } from 'react'
import type { Fixture } from '@t3-designer/scene-schema'
import { DEMO_LAYOUT_KEY, decodeDemoLayout, originalDemoFixtures, readDemoLayout, saveDemoLayout, type DemoLayoutStatus } from './demo-layout'

type State = { fixtures: Fixture[]; status: DemoLayoutStatus; past: Fixture[][]; future: Fixture[][] }
function initial(): State {
  try { return { ...readDemoLayout(window.localStorage), past: [], future: [] } }
  catch { return { fixtures: originalDemoFixtures(), status: 'unavailable', past: [], future: [] } }
}
function persist(fixtures: Fixture[]): DemoLayoutStatus {
  try { return saveDemoLayout(window.localStorage, fixtures) }
  catch { return 'unavailable' }
}

/** Public preferences only. The private editor never imports this hook. */
export function useDemoLayout() {
  const [state, setState] = useState(initial)
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      try { if (event.storageArea !== window.localStorage) return } catch { return }
      if (event.key !== DEMO_LAYOUT_KEY && event.key !== null) return
      setState({ ...decodeDemoLayout(event.newValue), past: [], future: [] })
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function change(fixtures: Fixture[]) {
    if (JSON.stringify(fixtures) === JSON.stringify(state.fixtures)) return
    setState({ fixtures, status: persist(fixtures), past: [...state.past.slice(-49), state.fixtures], future: [] })
  }
  function travel(direction: 'past' | 'future') {
    const source = state[direction], fixtures = source.at(-1)
    if (!fixtures) return
    setState({ fixtures, status: persist(fixtures),
      past: direction === 'past' ? source.slice(0, -1) : [...state.past, state.fixtures],
      future: direction === 'future' ? source.slice(0, -1) : [...state.future, state.fixtures] })
  }
  function reset() {
    const fixtures = originalDemoFixtures()
    const unchanged = JSON.stringify(fixtures) === JSON.stringify(state.fixtures)
    setState({ fixtures, status: persist(fixtures), past: unchanged ? state.past : [...state.past.slice(-49), state.fixtures], future: unchanged ? state.future : [] })
  }
  return { fixtures: state.fixtures, status: state.status, canUndo: state.past.length > 0, canRedo: state.future.length > 0, change, reset, undo: () => travel('past'), redo: () => travel('future') }
}
export type DemoLayout = ReturnType<typeof useDemoLayout>
