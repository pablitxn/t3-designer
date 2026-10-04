import { cloneElement, isValidElement, useId, type ReactNode } from 'react'
export const panel = 'tw:rounded-2xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)]'
export const button = 'tw:inline-flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-[color:var(--settings-text)] tw:no-underline tw:transition-colors tw:hover:bg-[var(--settings-surface)] tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-4 tw:focus-visible:outline-[var(--settings-accent)]'
export const primary = `${button} tw:border-transparent! tw:bg-[var(--settings-accent)]! tw:text-[color:var(--settings-bg)]! tw:hover:opacity-90`
export const input = 'tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-3 tw:text-sm tw:text-[color:var(--settings-text)] tw:disabled:opacity-60 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-[var(--settings-accent)]'
export const muted = 'tw:text-[color:var(--settings-muted)]'
export function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const helpId = useId()
  const field = help && isValidElement<{ 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], helpId].filter(Boolean).join(' ') })
    : children
  return <div className="tw:flex tw:flex-col tw:gap-2"><label className="tw:flex tw:flex-col tw:gap-2 tw:text-sm tw:font-medium">{label}{field}</label>{help && <span id={helpId} className={`${muted} tw:text-xs tw:font-normal tw:leading-relaxed`}>{help}</span>}</div>
}
export function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null
  return <p role={error ? 'alert' : 'status'} className={`tw:rounded-lg tw:border tw:border-solid tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed ${error ? 'tw:border-red-500/30 tw:bg-red-500/10 tw:text-red-700 tw:dark:text-red-300' : 'tw:border-[var(--settings-border)] tw:bg-[var(--settings-accent-soft)] tw:text-[color:var(--settings-text)]'}`}>{message}</p>
}
export function PlanMark({ large = false }: { large?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 160 110" className={large ? 'tw:h-44 tw:w-full' : 'tw:h-28 tw:w-full'} fill="none">
    <path d="M25 18h110v73H25z" fill="currentColor" opacity=".06"/><path d="M25 18h110v73H25V18Zm69 0v40H25m69 0h41M65 58v33" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/>
    <path d="M51 18h27M135 30v18M135 68v12M37 91h17" stroke="var(--settings-bg)" strokeWidth="4"/>
    <path d="M51 18h27M135 30v18M135 68v12M37 91h17" stroke="currentColor" strokeWidth="1"/>
    <rect x="36" y="30" width="28" height="16" rx="2" stroke="currentColor" opacity=".35"/><rect x="103" y="29" width="21" height="14" rx="2" stroke="currentColor" opacity=".35"/><circle cx="104" cy="75" r="8" stroke="currentColor" opacity=".35"/>
  </svg>
}
