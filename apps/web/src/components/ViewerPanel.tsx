import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './viewer-controls.css'

/** A dialog contained by the viewer. Keep the scene available for live editing. */
export function ViewerPanel({ title, onClose, children, className = '', id, hideTitle = false, headerActions }: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  id?: string
  hideTitle?: boolean
  headerActions?: ReactNode
}) {
  const titleId = useId()
  const { t } = useTranslation('common')
  const close = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const latestClose = useRef(onClose)
  useLayoutEffect(() => { latestClose.current = onClose }, [onClose])
  useLayoutEffect(() => {
    const opener = document.activeElement
    const element = panel.current
    close.current?.focus({ preventScroll: true })
    function escape(event: KeyboardEvent) {
      // An application-level dialog owns Escape while it is open.
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
      event.preventDefault()
      event.stopPropagation()
      latestClose.current()
    }
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('keydown', escape, true)
      // Switching tools has already focused the next trigger. Do not steal it
      // before the next panel records where it should return keyboard focus.
      if (element?.contains(document.activeElement) && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return <section ref={panel} id={id} className={`viewer-panel ${className}`} role="dialog" aria-labelledby={titleId}>
    <header className="viewer-panel-header">
      <h2 id={titleId} className={hideTitle ? 'sr-only' : undefined}>{title}</h2>
      {headerActions && <div className="viewer-panel-header-actions">{headerActions}</div>}
      <button ref={close} type="button" className="viewer-panel-close" aria-label={t('settings.close')} onClick={onClose}><ViewerIcon kind="close" /></button>
    </header>
    <div className="viewer-panel-body">{children}</div>
  </section>
}

export function ViewerIcon({ kind }: { kind: 'settings' | 'sun' | 'furniture' | 'expand' | 'collapse' | 'panels' | 'close' | 'undo' | 'redo' | 'reset' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'settings' && <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="2.5" fill="currentColor" /><circle cx="16" cy="17" r="2.5" fill="currentColor" /></>}
    {kind === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
    {kind === 'furniture' && <><path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 10a2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 4 0v6H2v-6a2 2 0 0 1 2-2Zm0 8v2m16-2v2" /></>}
    {kind === 'expand' && <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />}
    {kind === 'collapse' && <path d="M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5" />}
    {kind === 'panels' && <><path d="m5 4-3 13h20L19 4ZM4 10h16M10 4 9 17m5-13 1 13M12 17v4m-4 0h8" /></>}
    {kind === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {kind === 'undo' && <><path d="M9 5 4 10l5 5" /><path d="M4 10h10a6 6 0 0 1 6 6v3" /></>}
    {kind === 'redo' && <><path d="m15 5 5 5-5 5" /><path d="M20 10H10a6 6 0 0 0-6 6v3" /></>}
    {kind === 'reset' && <><path d="M3 10a9 9 0 1 1 2 8" /><path d="M3 4v6h6" /></>}
  </svg>
}
