import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useTranslation } from 'react-i18next'

export type BuildingLabelAnchor = {
  id: string
  position: [number, number, number]
}

export type BuildingLabel = BuildingLabelAnchor & {
  text: string
  subtitle?: string
  kind: 'building' | 'cardinal' | 'sun'
}

type LabelElements = RefObject<Map<string, HTMLDivElement>>

/** Runs inside Canvas; the DOM itself remains in the application's React root. */
export function BuildingLabelProjection({ labels, elements }: {
  labels: readonly BuildingLabelAnchor[]
  elements: LabelElements
}) {
  const projected = useMemo(() => new Vector3(), [])
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => { invalidate() }, [labels, invalidate])

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    for (const label of labels) {
      const element = elements.current.get(label.id)
      if (!element) continue
      projected.set(...label.position).project(camera)
      const visible = projected.z >= -1 && projected.z <= 1
        && Math.abs(projected.x) <= 1.15 && Math.abs(projected.y) <= 1.15
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) {
        const x = (projected.x + 1) * size.width / 2
        const y = (1 - projected.y) * size.height / 2
        element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      }
    }
  })

  return null
}

/** Mount as a sibling of Canvas in the same positioned scene container. */
export function BuildingLabelOverlay({ labels, elements }: {
  labels: readonly BuildingLabel[]
  elements: LabelElements
}) {
  const { t } = useTranslation('workspace')
  return <div className="labels-overlay building-labels-overlay"
    aria-label={t('building.labelOverlayAria')}
    style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 20 }}>
    {labels.map(label => {
      const className = label.kind === 'building' ? 'building-model-label'
        : label.kind === 'sun' ? 'sun-position-label'
          : `cardinal-label${label.text === 'N' ? ' cardinal-north' : ''}`
      return <div key={label.id}
        ref={element => {
          if (element) elements.current.set(label.id, element)
          else elements.current.delete(label.id)
        }}
        style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', userSelect: 'none' }}>
        <span className={className}>{label.text}{label.subtitle && <small>{label.subtitle}</small>}</span>
      </div>
    })}
  </div>
}
