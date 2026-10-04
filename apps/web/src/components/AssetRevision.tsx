import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, ReferenceImage, RevisionInput } from '@t3-designer/asset-schema'
import { ReferenceImagePicker } from './ReferenceImages'

export interface RevisionDraft { feedback: string; references: ReferenceImage[] }

export function AssetRevision({ asset, draft, disabled, onChange, onSubmit }: {
  asset: Asset; draft: RevisionDraft; disabled: boolean; onChange: (draft: RevisionDraft) => void; onSubmit: (input: RevisionInput) => Promise<void>;
}) {
  const { t } = useTranslation('assets')
  const [uploading, setUploading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || uploading || !draft.feedback.trim()) return
    await onSubmit({ feedback: draft.feedback.trim(), ...(draft.references.length ? { referenceImageIds: draft.references.map(image => image.id) } : {}) })
  }
  return <form className="workshop-revision" onSubmit={event => { void submit(event) }}>
    <div><span className="eyebrow">{t('revision.eyebrow')}</span><h4>{t('revision.title')}</h4><p>{t('revision.help')}</p></div>
    <label htmlFor={`revision-feedback-${asset.id}`}>{t('revision.feedback')}</label>
    <textarea id={`revision-feedback-${asset.id}`} value={draft.feedback} maxLength={12000} rows={4} required placeholder={t('revision.placeholder')} onChange={event => onChange({ ...draft, feedback: event.target.value })} />
    <ReferenceImagePicker id={`revision-photos-${asset.id}`} values={draft.references} disabled={disabled} onUploading={setUploading} onChange={references => onChange({ ...draft, references })} />
    <button className="workshop-primary" type="submit" disabled={disabled || uploading || !draft.feedback.trim()}>{t('revision.submit')} ↗</button>
    <p className="workshop-footnote">{t('revision.preserved', { count: asset.revision ?? 1 })}</p>
  </form>
}
