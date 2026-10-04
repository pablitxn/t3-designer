import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SettingsSection {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  content: ReactNode
}

export function SettingsIcon({ close = false }: { close?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {close ? <path d="m6 6 12 12M6 18 18 6" /> : <>
      <path d="M9.5 3h5l.6 2.4 2 .9 2.2-.7 2.5 4.3-1.7 1.8v2.3l1.7 1.8-2.5 4.3-2.2-.7-2 .9-.6 2.4h-5l-.6-2.4-2-.9-2.2.7-2.5-4.3 1.7-1.8v-2.3L1.8 9.9l2.5-4.3 2.2.7 2-.9Z" transform="translate(1 0) scale(.92)" />
      <circle cx="12" cy="12" r="3" />
    </>}
  </svg>
}

/** Adapted from denicheur-breizh's shared settings. Mount only while open. */
export function SettingsDialog({ title, closeLabel, sections, onClose }: {
  title: string
  closeLabel: string
  sections: readonly SettingsSection[]
  onClose: () => void
}) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeId, setActiveId] = useState(sections[0]?.id)
  const active = sections.find(section => section.id === activeId) ?? sections[0]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(<dialog
    className="settings-dialog"
    ref={dialogRef}
    aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}
  >
    <div className="settings-layout">
      <header className="settings-header">
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" className="settings-close" aria-label={closeLabel} onClick={onClose} autoFocus><SettingsIcon close /></button>
      </header>
      <nav className="settings-nav" aria-label={title}>
        {sections.map(section => <button
          key={section.id}
          type="button"
          aria-current={section.id === active?.id ? 'page' : undefined}
          aria-controls={`${id}-content`}
          onClick={() => setActiveId(section.id)}
        >{section.icon}<span>{section.label}</span></button>)}
      </nav>
      <section className="settings-content" id={`${id}-content`} aria-labelledby={`${id}-section`}>
        <div className="settings-section-heading">
          <h3 id={`${id}-section`}>{active?.label}</h3>
          {active?.description && <p>{active.description}</p>}
        </div>
        {sections.map(section => <div key={section.id} hidden={section.id !== active?.id}>
          <VisitedSection active={section.id === active?.id}>{section.content}</VisitedSection>
        </div>)}
      </section>
    </div>
  </dialog>, document.body)
}

function VisitedSection({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active)
  useEffect(() => { if (active) setVisited(true) }, [active])
  return active || visited ? children : null
}

export function SettingsRow({ controlId, label, description, children }: {
  controlId: string
  label: string
  description: string
  children: ReactNode
}) {
  return <div className="settings-row">
    <div className="settings-row-copy">
      <label htmlFor={controlId}>{label}</label>
      <p id={`${controlId}-description`}>{description}</p>
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
}
