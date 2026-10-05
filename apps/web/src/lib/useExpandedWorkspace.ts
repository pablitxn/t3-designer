import { useEffect, useRef, useState } from 'react'

/** Expand the existing canvas in place, preserving its camera and WebGL context. */
export function useExpandedWorkspace() {
  const [expanded, setExpanded] = useState(false)
  const container = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!expanded || !container.current) return
    const element = container.current
    const previousOverflow = document.body.style.overflow
    const siblings: { element: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement = element
    while (branch.parentElement && branch !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      branch = branch.parentElement
    }
    document.body.style.overflow = 'hidden'
    function keys(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); return }
      if (event.key !== 'Tab') return
      const controls = [...element.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', keys)
    trigger.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      for (const sibling of siblings) sibling.element.inert = sibling.inert
      document.removeEventListener('keydown', keys)
      trigger.current?.focus()
    }
  }, [expanded])
  return { expanded, setExpanded, container, trigger }
}
