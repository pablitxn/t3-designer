import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset } from '@t3-designer/asset-schema'
import { ApplicationSettings } from '../components/ApplicationSettings'
import { listenForThemeChanges } from '../lib/theme'
import { analytics } from '../lib/analytics'
import { getPrivateCopy, type PrivateCopy } from './copy'
import { goTo, mutate, PrivateApiError, request, type AccountUser, type Project, type ProjectMember, type ProjectSummary } from './api'
import { button, Field, Feedback, input, muted, panel, PlanMark, primary } from './ui'
import { energyIntegrationCopy } from '../energy/integration-copy'
import { useLocale } from '../i18n/useLocale'
import { CreditBadge, CreditWallet, People } from './AccountHub'
import { getAccountCopy } from './account-copy'
import type { InvitationMetadata } from './account-api'
import { getGenerationCopy } from './generation-copy'
const ProjectGenerator = lazy(() => import('./ProjectGenerator').then(module => ({ default: module.ProjectGenerator })))

const AssetsExplorer = lazy(() => import('../components/AssetsExplorer').then(module => ({ default: module.AssetsExplorer })))
const ProjectScene = lazy(() => import('./ProjectScene').then(module => ({ default: module.ProjectScene })))
const ApartmentEditor = lazy(() => import('../editor/ApartmentEditor').then(module => ({ default: module.ApartmentEditor })))
const ProjectEnergy = lazy(() => import('../energy/ProjectEnergy').then(module => ({ default: module.ProjectEnergy })))

function RouteLink({ href, children, className = button, current = false }: { href: string; children: ReactNode; className?: string; current?: boolean }) {
  return <a href={href} className={className} aria-current={current ? 'page' : undefined} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); goTo(href)
  }}>{children}</a>
}

function AccountForm({ invitation, recovery, token, c, language, onSignedIn, onRecovered }: { invitation: boolean; recovery: boolean; token: string; c: PrivateCopy; language: string; onSignedIn: (user: AccountUser) => void; onRecovered: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [metadata, setMetadata] = useState<InvitationMetadata | null>(null)
  const [checkingInvitation, setCheckingInvitation] = useState(invitation && !!token)
  const [invalidInvitation, setInvalidInvitation] = useState(false)
  const a = getAccountCopy(language)
  useEffect(() => {
    if (!invitation || !token) return
    const abort = new AbortController()
    void request<{ invitation: InvitationMetadata }>('/api/account/invitation', { method: 'POST', body: JSON.stringify({ token }), signal: abort.signal }, false).then(data => { setMetadata(data.invitation); setCheckingInvitation(false) }).catch(() => { if (!abort.signal.aborted) { setInvalidInvitation(true); setCheckingInvitation(false) } })
    return () => abort.abort()
  }, [invitation, token])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || checkingInvitation || invalidInvitation || ((invitation || recovery) && !token)) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      if (recovery) {
        await mutate('/api/account/reset-password', { token, password: String(data.get('password')) }, 'POST', false)
        onRecovered(); goTo('/login', true, true); return
      }
      const body = { email: String(data.get('email')).trim(), password: String(data.get('password')), ...(invitation ? { token, name: String(data.get('name')).trim() } : {}) }
      const { user } = await mutate<{ user: AccountUser }>(`/api/account/${invitation ? 'accept-invitation' : 'sign-in'}`, body, 'POST', false)
      onSignedIn(user); goTo('/app', true)
    } catch (reason) {
      setError(reason instanceof PrivateApiError && reason.status < 500 ? recovery ? c.recoveryFailed : invitation ? c.inviteFailed : c.loginFailed : c.serverUnavailable)
    } finally { setBusy(false) }
  }
  return <div className="tw:mx-auto tw:grid tw:w-full tw:max-w-5xl tw:gap-10 tw:px-5 tw:py-12 tw:md:grid-cols-2 tw:md:items-center tw:md:py-24">
    <div><p className={`${muted} tw:text-xs tw:font-semibold tw:uppercase tw:tracking-[.18em]`}>T3 Designer / {c.privateLabel}</p><h1 className="tw:my-6! tw:max-w-md tw:text-4xl! tw:font-medium! tw:leading-tight! tw:tracking-tight!">{recovery ? c.recoverTitle : invitation ? c.inviteTitle : c.loginTitle}</h1><p className={`${muted} tw:max-w-md tw:text-base tw:leading-7`}>{recovery ? c.recoverIntro : invitation ? c.inviteIntro : c.loginIntro}</p><div className="tw:mt-10 tw:hidden tw:max-w-72 tw:text-[color:var(--settings-accent)] tw:md:block"><PlanMark large /></div></div>
    <section className={`${panel} tw:p-6 tw:sm:p-8`} aria-label={recovery ? c.resetPassword : invitation ? c.acceptInvite : c.signIn}>
      {metadata && <div className="tw:mb-6 tw:rounded-lg tw:bg-[var(--settings-accent-soft)] tw:p-4 tw:text-sm tw:leading-6"><strong>{metadata.tier === 'premium' ? a.premium : `${metadata.trialCredits} ${a.creditUnit} · ${metadata.trialDays} ${language.startsWith('es') ? 'días' : language.startsWith('fr') ? 'jours' : 'days'}`}</strong><p className="tw:mb-0 tw:text-xs">{metadata.tier === 'premium' ? a.invitePremium : a.trialWelcome}</p><p className="tw:mb-0 tw:text-xs">{a.free}</p></div>}
      {checkingInvitation ? <p role="status" className={muted}>{c.loading}</p> : invalidInvitation || ((invitation || recovery) && !token) ? <Feedback message={recovery ? c.recoveryFailed : c.invalidInvite} error /> : <form onSubmit={event => { void submit(event) }} className="tw:flex tw:flex-col tw:gap-5" aria-busy={busy}>
        {invitation && <Field label={c.name}><input className={input} name="name" autoComplete="name" required maxLength={100} disabled={busy} /></Field>}
        {!recovery && <Field label={c.email}><input className={input} name="email" type="email" autoComplete="email" defaultValue={metadata?.email ?? ''} required maxLength={254} disabled={busy} /></Field>}
        <Field label={c.password} help={invitation || recovery ? c.passwordHelp : undefined}><input className={input} name="password" type="password" autoComplete={invitation || recovery ? 'new-password' : 'current-password'} minLength={invitation || recovery ? 12 : undefined} maxLength={128} required disabled={busy} /></Field>
        <Feedback message={error} error /><button type="submit" disabled={busy} className={primary}>{busy ? c.pending : recovery ? c.resetPassword : invitation ? c.acceptInvite : c.signIn} <span aria-hidden="true">→</span></button>
      </form>}
      <p className={`${muted} tw:mt-6 tw:text-xs tw:leading-6`}>{recovery ? c.recoveryHelp : c.invitedOnly}</p>{!invitation && !recovery && <p className={`${muted} tw:text-xs tw:leading-6`}>{c.recoveryHelp}</p>}<a className="tw:text-sm tw:text-[color:var(--settings-accent)] tw:underline tw:underline-offset-4" href="/#apartment">{c.exploreDemo}</a>
    </section>
  </div>
}

function Projects({ c, language }: { c: PrivateCopy; language: string }) {
  const g = getGenerationCopy(language)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    setError('')
    try { const data = await request<{ projects: ProjectSummary[] }>('/api/projects', { signal }); setProjects(data.projects) }
    catch { if (!signal?.aborted) setError(c.unavailable) }
  }, [c.unavailable])
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort() }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const name = String(new FormData(event.currentTarget).get('projectName')).trim(); if (!name) return
    setBusy(true); setError('')
    try { const { project } = await mutate<{ project: Project }>('/api/projects', { name }); goTo(`/app/projects/${project.id}`) }
    catch { setError(c.genericError) } finally { setBusy(false) }
  }
  async function duplicate(project: ProjectSummary) {
    if (busy) return; setBusy(true); setError('')
    try { const { project: copy } = await mutate<{ project: Project }>(`/api/projects/${project.id}/clone`, {}); goTo(`/app/projects/${copy.id}`) }
    catch { setError(c.genericError) } finally { setBusy(false) }
  }
  return <>
    <div className="tw:mb-8 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-5"><div><p className={`${muted} tw:mt-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest`}>{c.projects}</p><h1 className="tw:mt-0! tw:text-3xl! tw:font-medium! tw:leading-tight!">{c.projectsTitle}</h1><p className={`${muted} tw:mb-0 tw:max-w-xl tw:text-sm tw:leading-6`}>{c.projectsIntro}</p></div><div className="tw:flex tw:flex-wrap tw:gap-2"><RouteLink href="/app/generate">{g.title}</RouteLink><button className={primary} onClick={() => setCreating(true)} disabled={busy}>+ {c.newProject}</button></div></div>
    <Feedback message={error} error />
    {creating && <form onSubmit={event => { void create(event) }} className={`${panel} tw:mb-6 tw:flex tw:flex-wrap tw:items-end tw:gap-4 tw:p-5`}><div className="tw:min-w-48 tw:flex-1"><Field label={c.projectName}><input name="projectName" className={input} defaultValue={c.defaultProject} maxLength={120} required autoFocus disabled={busy} /></Field></div><button className={primary} disabled={busy}>{busy ? c.pending : c.create}</button><button type="button" className={button} disabled={busy} onClick={() => setCreating(false)}>{c.cancel}</button></form>}
    {projects === null ? error ? <button className={button} onClick={() => { void load() }}>{c.retry}</button> : <p role="status" className={muted}>{c.loading}</p> : projects.length === 0 ? <div className={`${panel} tw:px-6 tw:py-14 tw:text-center`}><div className="tw:mx-auto tw:max-w-60 tw:text-[color:var(--settings-accent)]"><PlanMark large /></div><h2 className="tw:text-xl tw:font-medium">{c.emptyTitle}</h2><p className={`${muted} tw:mx-auto tw:mb-7 tw:max-w-md tw:text-sm tw:leading-6`}>{c.emptyIntro}</p><button className={primary} onClick={() => setCreating(true)}>+ {c.newProject}</button></div> : <div className="tw:grid tw:gap-5 tw:md:grid-cols-2 tw:xl:grid-cols-3">{projects.map(project => <article key={project.id} className={`${panel} tw:flex tw:min-w-0 tw:flex-col tw:overflow-hidden`}>
      <RouteLink href={`/app/projects/${project.id}`} className="tw:block tw:bg-[var(--settings-surface)] tw:px-10 tw:py-5 tw:text-[color:var(--settings-accent)] tw:no-underline"><PlanMark /><span className="tw:sr-only">{c.open}: {project.name}</span></RouteLink>
      <div className="tw:flex tw:flex-1 tw:flex-col tw:p-5"><div className="tw:flex tw:items-start tw:justify-between tw:gap-3"><h2 className="tw:m-0 tw:break-words tw:text-lg tw:font-medium"><RouteLink href={`/app/projects/${project.id}`} className="tw:text-inherit tw:no-underline tw:hover:underline">{project.name}</RouteLink></h2><span className="tw:shrink-0 tw:rounded-full tw:bg-[var(--settings-accent-soft)] tw:px-2 tw:py-1 tw:text-[10px]">{c[project.role]}</span></div><p className={`${muted} tw:line-clamp-2 tw:min-h-10 tw:break-words tw:text-xs tw:leading-5`}>{project.notes || c.noNotes}</p><div className={`${muted} tw:mb-5 tw:mt-auto tw:text-xs`}>{c.updated} {new Date(project.updatedAt).toLocaleDateString(language)}</div><div className="tw:flex tw:flex-wrap tw:gap-2"><RouteLink href={`/app/projects/${project.id}`}>{c.open} →</RouteLink><button className={button} disabled={busy} onClick={() => { void duplicate(project) }}>{c.duplicate}</button></div></div>
    </article>)}</div>}
  </>
}

function Sharing({ project, c }: { project: Project; c: PrivateCopy }) {
  const [members, setMembers] = useState<ProjectMember[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const abort = new AbortController(); void request<{ members: ProjectMember[] }>(`/api/projects/${project.id}/members`, { signal: abort.signal }).then(data => setMembers(data.members)).catch(() => { if (!abort.signal.aborted) setError(c.shareFailed) }); return () => abort.abort() }, [project.id, c.shareFailed])
  async function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError('')
    try { await mutate(`/api/projects/${project.id}/members`, { email: String(data.get('email')).trim(), role: data.get('role') }); const response = await request<{ members: ProjectMember[] }>(`/api/projects/${project.id}/members`); setMembers(response.members); form.reset() }
    catch { setError(c.shareFailed) } finally { setBusy(false) }
  }
  async function remove(member: ProjectMember) {
    if (busy) return; setBusy(true); setError('')
    try { await mutate(`/api/projects/${project.id}/members/${member.userId}`, {}, 'DELETE'); setMembers(previous => previous?.filter(item => item.userId !== member.userId) ?? []) }
    catch { setError(c.shareFailed) } finally { setBusy(false) }
  }
  return <section className={`${panel} tw:p-5`}><h2 className="tw:mt-0 tw:text-lg tw:font-medium">{c.shared}</h2><p className={`${muted} tw:text-xs tw:leading-6`}>{c.shareIntro}</p><form className="tw:flex tw:flex-col tw:gap-4" onSubmit={event => { void share(event) }}><Field label={c.memberEmail}><input className={input} name="email" type="email" required maxLength={254} disabled={busy} /></Field><Field label={c.access}><select className={input} name="role" disabled={busy}><option value="viewer">{c.viewer}</option><option value="editor">{c.editor}</option></select></Field><button className={button} disabled={busy}>{busy ? c.pending : c.addMember}</button></form><Feedback message={error} error />{members?.length === 0 && <p className={`${muted} tw:text-xs tw:leading-5`}>{c.noMembers}</p>}{members?.map(member => <div key={member.userId} className="tw:mt-4 tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-4"><p className="tw:mb-1 tw:break-all tw:text-sm">{member.email}</p><p className={`${muted} tw:mt-0 tw:text-xs`}>{c[member.role]}</p><button className={button} disabled={busy} onClick={() => { void remove(member) }}>{c.remove}</button></div>)}</section>
}

function AssetPicker({ project, c, onChange, disabled, onBusyChange }: { project: Project; c: PrivateCopy; onChange: (project: Project) => void; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const { i18n } = useTranslation()
  const words = i18n.resolvedLanguage === 'es' ? { title: 'Agregar desde mis assets', add: 'Agregar al proyecto', empty: 'Tu biblioteca está vacía. Creá un asset en el taller para usarlo acá.', note: 'Se agregará el modelo al proyecto para compartirlo con sus miembros.' } : i18n.resolvedLanguage === 'fr' ? { title: 'Ajouter depuis mes assets', add: 'Ajouter au projet', empty: 'Votre bibliothèque est vide. Créez un asset dans l’atelier.', note: 'Le modèle sera ajouté au projet et partagé avec ses membres.' } : { title: 'Add from my assets', add: 'Add to project', empty: 'Your library is empty. Create an asset in the workshop to use it here.', note: 'The model will be added to this project and shared with its members.' }
  useEffect(() => { const abort = new AbortController(); void request<{ assets: Asset[] }>('/api/assets', { signal: abort.signal }).then(data => { setAssets(data.assets); setSelected(data.assets[0]?.id ?? '') }).catch(() => { if (!abort.signal.aborted) setError(c.unavailable) }); return () => abort.abort() }, [c.unavailable])
  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || disabled || !selected) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      const { asset } = await mutate<{ asset: { id: string; label: string; dimensions: [number, number, number]; url: string } }>(`/api/projects/${project.id}/assets`, { assetId: selected })
      const added = { id: asset.id, label: asset.label, dimensions: asset.dimensions, url: asset.url, repoPath: `private/${asset.id}/model.glb`, evidence: 'Imported from your library', dimensionalStatus: 'estimated' as const, mobility: 'movable' as const }
      onChange({ ...project, scene: { ...project.scene, assets: [...project.scene.assets, added] } })
    } catch { setError(c.genericError) } finally { setBusy(false); onBusyChange(false) }
  }
  return <section className={`${panel} tw:p-5`}><h2 className="tw:mt-0 tw:text-lg tw:font-medium">{words.title}</h2><p className={`${muted} tw:text-xs tw:leading-6`}>{words.note}</p>{assets?.length ? <form className="tw:flex tw:flex-col tw:gap-3" onSubmit={event => { void attach(event) }}><label className="tw:sr-only" htmlFor="attach-asset">{c.assets}</label><select id="attach-asset" className={input} value={selected} onChange={event => setSelected(event.target.value)} disabled={busy || disabled}>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select><button className={button} disabled={busy || disabled}>{busy ? c.pending : words.add}</button></form> : assets ? <p className={`${muted} tw:text-xs tw:leading-6`}>{words.empty}</p> : <p role="status" className={`${muted} tw:text-xs`}>{c.loading}</p>}<Feedback message={error} error /></section>
}

function ProjectEditor({ id, c }: { id: string; c: PrivateCopy }) {
  const { locale } = useLocale()
  const energyCopy = energyIntegrationCopy[locale]
  const copy = useRef(c)
  useEffect(() => { copy.current = c }, [c])
  const [project, setProject] = useState<Project | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [showEnergy, setShowEnergy] = useState(false)
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    setError(''); setNotice('')
    try { const { project } = await request<{ project: Project }>(`/api/projects/${id}`, { signal }); setProject(project); setDirty(false); setConflict(false) }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof PrivateApiError && [403, 404].includes(reason.status) ? copy.current.projectUnavailable : copy.current.unavailable) }
  }, [id])
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => { generation.current++; abort.abort() } }, [load])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const beforeNavigate = (event: Event) => { if (!window.confirm(copy.current.discard)) event.preventDefault() }
    const onHistoryNavigation = (event: PopStateEvent) => {
      // Programmatic navigation already ran the cancellable guard above.
      if (!event.isTrusted || window.location.pathname === `/app/projects/${id}`) return
      if (!window.confirm(copy.current.discard)) {
        window.history.pushState(null, '', `/app/projects/${id}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('t3:before-navigate', beforeNavigate)
    window.addEventListener('popstate', onHistoryNavigation)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('t3:before-navigate', beforeNavigate); window.removeEventListener('popstate', onHistoryNavigation) }
  }, [dirty, id])
  function change(next: Project) { if (busy || project?.role === 'viewer') return; setProject(next); setDirty(true); setNotice('') }
  async function save() {
    if (!project || busy || !dirty || !project.name.trim()) return
    setBusy(true); setError(''); setNotice(''); const version = generation.current
    try { const data = await mutate<{ project: Project }>(`/api/projects/${id}`, { revision: project.revision, name: project.name.trim(), notes: project.notes, scene: project.scene }, 'PUT'); if (generation.current === version) { setProject(data.project); setDirty(false); setConflict(false); setNotice(c.saved) } }
    catch (reason) { if (generation.current === version) { const stale = reason instanceof PrivateApiError && reason.status === 409; setConflict(stale); setError(stale ? c.conflict : c.genericError) } } finally { setBusy(false) }
  }
  async function duplicate() { if (busy) return; setBusy(true); setError(''); try { const data = await mutate<{ project: Project }>(`/api/projects/${id}/clone`, {}); goTo(`/app/projects/${data.project.id}`) } catch { setError(c.genericError) } finally { setBusy(false) } }
  if (!project) return <><Feedback message={error} error />{error ? <button className={button} onClick={() => { void load() }}>{c.retry}</button> : <p role="status" className={muted}>{c.loading}</p>}</>
  const editable = project.role !== 'viewer'
  return <>
    <RouteLink href="/app" className="tw:text-sm tw:text-[color:var(--settings-muted)] tw:no-underline tw:hover:underline">← {c.backProjects}</RouteLink>
    <div className="tw:mb-5 tw:mt-5 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4"><div><h1 className="tw:m-0! tw:break-words tw:text-2xl! tw:font-medium!">{project.name}</h1><p className={`${muted} tw:mb-0 tw:text-xs`}>{c[project.role]} · {c.revision} {project.revision}{dirty ? ` · ${c.unsaved}` : ''}</p></div><div className="tw:flex tw:gap-2"><button className={button} disabled={busy || dirty} title={dirty ? c.unsaved : undefined} onClick={() => { void duplicate() }}>{c.duplicate}</button>{editable && <button className={primary} disabled={busy || !dirty || conflict || !project.name.trim()} onClick={() => { void save() }}>{busy ? c.pending : c.save}</button>}</div></div>
    <Feedback message={error} error /><Feedback message={notice} />{conflict && <button className={`${button} tw:mb-5`} onClick={() => { void load() }}>{c.reload}</button>}{!editable && <Feedback message={c.readonly} />}
    <div className="tw:flex tw:flex-col tw:gap-5"><section className="tw:min-w-0" aria-label={c.scene}><Suspense fallback={<p className={muted} role="status">{c.loading}</p>}><ApartmentEditor snapshot={project.scene} readOnly={!editable || busy || conflict} onChange={scene => change({ ...project, scene })} /></Suspense></section><details className={`${panel} tw:p-5`} onToggle={event => setShowContext(event.currentTarget.open)}><summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.buildingContext}</summary>{showContext && <div className="tw:mt-5"><Suspense fallback={<p className={muted} role="status">{c.loading}</p>}><ProjectScene snapshot={project.scene} readOnly onChange={() => undefined} /></Suspense></div>}</details><details className={`${panel} tw:p-5`} onToggle={event => setShowEnergy(event.currentTarget.open)}><summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{energyCopy.privateTitle}</summary>{showEnergy && <div className="tw:mt-5"><Suspense fallback={<p className={muted} role="status">{c.loading}</p>}><ProjectEnergy snapshot={project.scene} readOnly={!editable || busy || conflict} onChange={scene => change({ ...project, scene })} /></Suspense></div>}</details><aside className="tw:grid tw:min-w-0 tw:items-start tw:gap-5 tw:md:grid-cols-2 tw:xl:grid-cols-3"><section className={`${panel} tw:p-5`}><h2 className="tw:mt-0 tw:text-lg tw:font-medium">{c.details}</h2><div className="tw:flex tw:flex-col tw:gap-5"><Field label={c.projectName}><input className={input} value={project.name} maxLength={120} required readOnly={!editable} disabled={busy || conflict} onChange={event => change({ ...project, name: event.target.value })} /></Field><Field label={c.notes} help={c.notesHelp}><textarea className={`${input} tw:min-h-36 tw:resize-y tw:font-[inherit]`} value={project.notes} maxLength={12000} placeholder={c.notesPlaceholder} readOnly={!editable} disabled={busy || conflict} onChange={event => change({ ...project, notes: event.target.value })} /></Field></div></section>{editable && <AssetPicker project={project} c={c} onChange={change} disabled={busy || conflict} onBusyChange={setBusy} />}{project.role === 'owner' && <Sharing project={project} c={c} />}</aside></div>
  </>
}

export default function PrivateApp() {
  const { i18n } = useTranslation('common')
  const language = i18n.resolvedLanguage || 'en'
  const c = getPrivateCopy(language)
  const a = getAccountCopy(language)
  const [path, setPath] = useState(window.location.pathname.replace(/\/$/, ''))
  const [user, setUser] = useState<AccountUser | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const invitation = path === '/invite'
  const recovery = path === '/recover'
  const accountPage = path === '/login' || invitation || recovery
  const projectId = /^\/app\/projects\/([a-zA-Z0-9-]+)\/?$/.exec(path)?.[1]
  const mounted = useRef(true)
  const sessionEpoch = useRef(0)
  const authenticated = useRef(false)
  const currentCopy = useRef(c)
  useEffect(() => { currentCopy.current = c }, [c])
  useEffect(listenForThemeChanges, [])
  useEffect(() => { analytics.view(null, false); if (/^\/(invite|recover)\/?$/.test(window.location.pathname) && window.location.hash) window.history.replaceState(null, '', window.location.pathname) }, [])
  useEffect(() => { const listener = () => setPath(window.location.pathname.replace(/\/$/, '')); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener) }, [])
  useEffect(() => { document.title = `${accountPage ? recovery ? c.resetPassword : invitation ? c.acceptInvite : c.signIn : c.workspace} · T3 Designer` }, [accountPage, invitation, recovery, c])
  const checkSession = useCallback(async (signal?: AbortSignal) => {
    const epoch = sessionEpoch.current
    try { const data = await request<{ user: AccountUser }>('/api/me', { signal }, false); if (!signal?.aborted && mounted.current && epoch === sessionEpoch.current) { authenticated.current = true; setUser(data.user); setStatus('ready') } }
    catch (reason) { if (signal?.aborted || !mounted.current || epoch !== sessionEpoch.current) return; if (reason instanceof PrivateApiError && reason.status === 401) { authenticated.current = false; setUser(null); setStatus('ready') } else if (authenticated.current) setError(currentCopy.current.unavailable); else setStatus('unavailable') }
  }, [])
  useEffect(() => { mounted.current = true; const abort = new AbortController(); void checkSession(abort.signal); return () => { mounted.current = false; abort.abort() } }, [checkSession])
  useEffect(() => { function expired() { sessionEpoch.current++; authenticated.current = false; setUser(null); setStatus('ready'); setError(c.expired); goTo('/login', true, true) } window.addEventListener('t3:session-expired', expired); return () => window.removeEventListener('t3:session-expired', expired) }, [c.expired])
  useEffect(() => { if (status === 'ready' && !user && !accountPage) goTo('/login', true, true) }, [status, user, accountPage])
  useEffect(() => { if (!user) return; const onFocus = () => { if (!document.hidden) void checkSession() }; window.addEventListener('focus', onFocus); const interval = setInterval(onFocus, 60_000); return () => { window.removeEventListener('focus', onFocus); clearInterval(interval) } }, [user, checkSession])
  async function signOut() { if (busy || !window.dispatchEvent(new CustomEvent('t3:before-navigate', { cancelable: true }))) return; setBusy(true); setError(''); try { await mutate('/api/account/sign-out', {}); sessionEpoch.current++; authenticated.current = false; setUser(null); goTo('/login', true, true) } catch { setError(c.genericError) } finally { setBusy(false) } }
  return <main className="tw:min-h-dvh tw:bg-[var(--settings-surface)] tw:text-[color:var(--settings-text)]"><header className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4 tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-5 tw:py-5 tw:md:px-8"><a className="tw:text-lg tw:font-semibold tw:tracking-tight tw:text-inherit tw:no-underline" href="/">T3 Designer <span className={`${muted} tw:ml-2 tw:text-xs tw:font-normal tw:tracking-normal`}>{c.workspace}</span></a><div className="tw:flex tw:items-center tw:gap-3"><a href="/#apartment" className={`${muted} tw:text-xs tw:no-underline tw:hover:underline`}>{c.demo} ↗</a><ApplicationSettings />{user && <button className={button} disabled={busy} onClick={() => { void signOut() }}>{busy ? c.pending : c.signOut}</button>}</div></header>
    {status === 'loading' ? <p className={`${muted} tw:p-10 tw:text-center`} role="status">{c.loading}</p> : status === 'unavailable' ? <div className="tw:mx-auto tw:max-w-lg tw:p-8"><Feedback message={c.unavailable} error /><button className={button} onClick={() => { setStatus('loading'); void checkSession() }}>{c.retry}</button></div> : accountPage ? <><div className="tw:mx-auto tw:max-w-5xl tw:px-5"><Feedback message={error} /></div><AccountForm key={path} invitation={invitation} recovery={recovery} token={token} c={c} language={language} onSignedIn={account => { sessionEpoch.current++; authenticated.current = true; setUser(account); setError('') }} onRecovered={() => { sessionEpoch.current++; authenticated.current = false; setUser(null); setError(c.recoveryDone) }} /></> : user ? <div className="tw:grid tw:min-h-[calc(100dvh-85px)] tw:lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:p-5 tw:lg:border-r tw:lg:border-b-0"><p className="tw:mb-1 tw:mt-1 tw:truncate tw:text-sm tw:font-medium">{user.name}</p><p className={`${muted} tw:mb-6 tw:mt-1 tw:truncate tw:text-xs`}>{user.email}</p><CreditBadge key={user.id} language={language} /><nav aria-label={c.workspace} className="tw:flex tw:flex-wrap tw:gap-2 tw:lg:flex-col">{([{ href: '/app', label: c.projects }, { href: '/app/assets', label: c.assets }, { href: '/app/generate', label: getGenerationCopy(language).title }, { href: '/app/credits', label: a.credits }, ...(user.role === 'admin' || user.canInvite ? [{ href: '/app/users', label: user.role === 'admin' ? c.users : a.invitations }] : [])]).map(item => <RouteLink key={item.href} href={item.href} current={path === item.href || (item.href === '/app' && !!projectId)} className={`tw:rounded-lg tw:px-3 tw:py-3 tw:text-sm tw:no-underline tw:transition-colors ${path === item.href || (item.href === '/app' && !!projectId) ? 'tw:bg-[var(--settings-accent-soft)] tw:font-medium tw:text-[color:var(--settings-accent)]' : `${muted} tw:hover:bg-[var(--settings-surface)]`}`}>{item.label}</RouteLink>)}</nav></aside><div className="tw:min-w-0 tw:px-5 tw:py-8 tw:md:px-8"><Feedback message={error} error />{projectId ? <ProjectEditor key={`${user.id}:${projectId}`} id={projectId} c={c} /> : path === '/app/assets' ? <Suspense fallback={<p role="status">{c.loading}</p>}><AssetsExplorer key={user.id} /></Suspense> : path === '/app/generate' ? <Suspense fallback={<p role="status">{c.loading}</p>}><ProjectGenerator key={user.id} c={c} language={language} /></Suspense> : path === '/app/credits' ? <CreditWallet key={user.id} c={c} language={language} /> : path === '/app/users' && (user.role === 'admin' || user.canInvite) ? <People key={user.id} c={c} user={user} language={language} /> : <Projects key={user.id} c={c} language={language} />}</div></div> : null}
  </main>
}
