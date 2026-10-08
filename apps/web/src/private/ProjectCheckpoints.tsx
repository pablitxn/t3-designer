import { useCallback, useEffect, useRef, useState } from 'react'
import { PrivateApiError, request, type Project } from './api'
import { button, Feedback, muted, panel } from './ui'

type Checkpoint = { id: string; revision: number; createdAt: string; reason: 'dwelling' | 'building' | 'restore' }
const copies = {
  en: { title: 'Project recovery points', intro: 'Before replacing a modeled base or restoring a previous project, a checkpoint preserves its floors, furniture and layouts.', empty: 'No recovery points yet.', revision: 'Revision', dwelling: 'Before replacing the home', building: 'Before replacing the building', restore: 'Before a restore', action: 'Restore this project', confirm: 'Restore this complete project checkpoint? A new recovery point preserves the current project first.', dirty: 'Save your changes before restoring a project.', loading: 'Loading recovery points…', refresh: 'Refresh', error: 'We could not load or restore this checkpoint. Your current project is preserved.', conflict: 'The project changed in another session. Reload the latest version before restoring.', done: 'Project restored from its checkpoint.' },
  es: { title: 'Puntos de recuperación del proyecto', intro: 'Antes de reemplazar una base modelada o restaurar un proyecto anterior, se conserva un punto de recuperación con sus plantas, muebles y distribuciones.', empty: 'Todavía no hay puntos de recuperación.', revision: 'Revisión', dwelling: 'Antes de reemplazar la vivienda', building: 'Antes de reemplazar el edificio', restore: 'Antes de una restauración', action: 'Restaurar este proyecto', confirm: '¿Restaurar este punto de recuperación completo? Primero se conserva el proyecto actual en un nuevo punto de recuperación.', dirty: 'Guardá tus cambios antes de restaurar un proyecto.', loading: 'Cargando puntos de recuperación…', refresh: 'Actualizar', error: 'No pudimos cargar o restaurar este punto de recuperación. Tu proyecto actual se conserva.', conflict: 'El proyecto cambió en otra sesión. Cargá la última versión antes de restaurar.', done: 'Proyecto restaurado desde su punto de recuperación.' },
  fr: { title: 'Points de restauration du projet', intro: 'Avant de remplacer une base modélisée ou de restaurer un ancien projet, un point de restauration conserve ses niveaux, meubles et agencements.', empty: 'Aucun point de restauration pour le moment.', revision: 'Révision', dwelling: 'Avant le remplacement du logement', building: 'Avant le remplacement du bâtiment', restore: 'Avant une restauration', action: 'Restaurer ce projet', confirm: 'Restaurer ce point de restauration complet ? Le projet actuel est d’abord conservé dans un nouveau point de restauration.', dirty: 'Enregistrez vos modifications avant de restaurer un projet.', loading: 'Chargement des points de restauration…', refresh: 'Actualiser', error: 'Impossible de charger ou restaurer ce point. Votre projet actuel est conservé.', conflict: 'Le projet a changé dans une autre session. Rechargez sa dernière version avant de restaurer.', done: 'Projet restauré depuis son point de restauration.' },
}

export function ProjectCheckpoints({ projectId, revision, language, readOnly, dirty, onProjectUpdated, onBusyChange }: {
  projectId: string; revision: number; language: string; readOnly: boolean; dirty: boolean; onProjectUpdated: (project: Project) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const c = copies[language.startsWith('es') ? 'es' : language.startsWith('fr') ? 'fr' : 'en']
  const [open, setOpen] = useState(false)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const operation = useRef<AbortController | null>(null)
  const busyCallback = useRef(onBusyChange)
  const mounted = useRef(true)
  useEffect(() => { busyCallback.current = onBusyChange }, [onBusyChange])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort(); busyCallback.current?.(false) } }, [])
  const load = useCallback(async (signal: AbortSignal) => {
    try { const data = await request<{ checkpoints: Checkpoint[] }>(`/api/projects/${encodeURIComponent(projectId)}/checkpoints`, { signal }); if (!signal.aborted && mounted.current) { setCheckpoints(data.checkpoints); setError('') } }
    catch { if (!signal.aborted && mounted.current) setError(c.error) }
  }, [projectId, c.error])
  useEffect(() => {
    if (!open) return
    const abort = new AbortController(); void load(abort.signal)
    return () => abort.abort()
  }, [load, open, revision])
  async function restore(checkpoint: Checkpoint) {
    if (readOnly || dirty || operation.current || !window.confirm(c.confirm)) return
    const abort = new AbortController(); operation.current = abort
    setBusy(true); busyCallback.current?.(true); setError(''); setNotice('')
    try {
      const { project } = await request<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}/checkpoints/${encodeURIComponent(checkpoint.id)}/restore`, { method: 'POST', body: JSON.stringify({ revision }), signal: abort.signal })
      if (!abort.signal.aborted && mounted.current) { onProjectUpdated(project); setNotice(c.done) }
    } catch (reason) { if (!abort.signal.aborted && mounted.current) setError(reason instanceof PrivateApiError && reason.status === 409 ? c.conflict : c.error) }
    finally { if (operation.current === abort) operation.current = null; busyCallback.current?.(false); if (mounted.current) setBusy(false) }
  }
  return <details className={`${panel} tw:p-5`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.title}</summary>
    {open && <div aria-busy={busy}><p className={`${muted} tw:text-sm tw:leading-6`}>{c.intro}</p><Feedback message={error} error /><Feedback message={notice} />{dirty && <Feedback message={c.dirty} />}
      <button type="button" className={`${button} tw:mb-4`} disabled={busy} onClick={() => { const abort = new AbortController(); void load(abort.signal) }}>{c.refresh}</button>
      {checkpoints === null ? <p role="status" className={`${muted} tw:text-sm`}>{c.loading}</p> : checkpoints.length === 0 ? <p className={`${muted} tw:mb-0 tw:text-sm`}>{c.empty}</p> : <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-3 tw:p-0">{checkpoints.map(checkpoint => <li key={checkpoint.id} className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:rounded-lg tw:bg-[var(--settings-surface)] tw:p-4"><div><p className="tw:m-0 tw:text-sm tw:font-medium">{c.revision} {checkpoint.revision} · {c[checkpoint.reason]}</p><time dateTime={checkpoint.createdAt} className={`${muted} tw:text-xs`}>{new Date(checkpoint.createdAt).toLocaleString(language)}</time></div>{!readOnly && <button type="button" className={button} disabled={dirty || busy} onClick={() => { void restore(checkpoint) }}>{c.action}</button>}</li>)}</ul>}
    </div>}
  </details>
}
