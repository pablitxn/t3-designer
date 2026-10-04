import { useState } from 'react'

/** Owned by App so switching workspaces does not discard apartment selections. */
export function useApartmentView() {
  const [cutaway, setCutaway] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [showFixtures, setShowFixtures] = useState(true)
  const [focusRoomId, setFocusRoomId] = useState<string>()
  const [panel, setPanel] = useState<'sun' | 'rooms' | 'assets'>('sun')
  const [showContext, setShowContext] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<string>()
  const [arranging, setArranging] = useState(false)
  const [view, setView] = useState<{ mode: '3d' | 'top'; revision: number }>({ mode: '3d', revision: 0 })

  function resetView(mode: '3d' | 'top') {
    setView(previous => ({ mode, revision: previous.revision + 1 }))
  }
  function focusRoom(id?: string) {
    setFocusRoomId(id)
    resetView(view.mode)
  }

  return {
    cutaway, setCutaway, showLabels, setShowLabels, showFixtures, setShowFixtures,
    focusRoomId, setFocusRoomId, panel, setPanel, showContext, setShowContext,
    selectedAsset, setSelectedAsset, view, resetView, focusRoom, arranging, setArranging,
  }
}

export type ApartmentView = ReturnType<typeof useApartmentView>
