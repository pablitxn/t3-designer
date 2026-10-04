import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReferenceImage } from '@t3-designer/asset-schema'
import { assetApi, AssetApiError } from '../lib/asset-api'

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image read failed'))
    reader.onerror = () => reject(new Error('Image read failed'))
    reader.readAsDataURL(file)
  })
}

export function ReferenceImagePicker({ id, values, onChange, onUploading, disabled = false }: {
  id: string; values: ReferenceImage[]; onChange: (images: ReferenceImage[]) => void; onUploading: (value: boolean) => void; disabled?: boolean;
}) {
  const { t } = useTranslation('assets')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const callbacks = useRef({ onChange, onUploading })
  useEffect(() => { callbacks.current = { onChange, onUploading } }, [onChange, onUploading])
  useEffect(() => () => { operation.current?.abort() }, [])
  async function upload(files: File[]) {
    if (!files.length || operation.current || disabled) return
    if (files.length + values.length > 4) { setError(t('references.tooMany')); return }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) {
      setError(t('references.invalid')); return
    }
    const controller = new AbortController()
    operation.current = controller
    setError('')
    setUploading(true)
    onUploading(true)
    const uploaded = [...values]
    try {
      for (const file of files) {
        const dataUrl = await fileDataUrl(file)
        if (controller.signal.aborted) return
        const { reference } = await assetApi.uploadReference(file.name, dataUrl, controller.signal)
        if (controller.signal.aborted) return
        uploaded.push(reference)
        callbacks.current.onChange([...uploaded])
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof AssetApiError ? failure.message : t('references.failed'))
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null
        setUploading(false)
        callbacks.current.onUploading(false)
        if (input.current) input.current.value = ''
      }
    }
  }
  return <div className="workshop-reference-picker">
    <label htmlFor={id}>{t('references.title')}</label>
    <p>{t('references.help')}</p>
    <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled || uploading || values.length >= 4} onChange={event => { void upload(Array.from(event.target.files ?? [])) }} />
    {uploading && <p role="status">{t('references.uploading')}</p>}
    {error && <p className="workshop-error" role="alert">{error}</p>}
    {values.length > 0 && <ul className="workshop-reference-thumbnails">{values.map(reference => <li key={reference.id}><img src={reference.url} alt={reference.name} /><span title={reference.name}>{reference.name}</span><button type="button" disabled={disabled || uploading} aria-label={t('references.remove', { name: reference.name })} onClick={() => onChange(values.filter(value => value.id !== reference.id))}>×</button></li>)}</ul>}
  </div>
}

export function ReferenceComparison({ referenceIds, references = [], preview, label }: { referenceIds: string[]; references?: ReferenceImage[]; preview: string; label: string }) {
  const { t } = useTranslation('assets')
  const [images, setImages] = useState<ReferenceImage[]>([])
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const ids = referenceIds.filter(id => !references.some(reference => reference.id === id)).join(',')
  useEffect(() => {
    const controller = new AbortController()
    setImages([])
    setFailed(false)
    if (!ids) return () => controller.abort()
    void Promise.allSettled(ids.split(',').map(id => assetApi.reference(id, controller.signal))).then(results => {
      if (controller.signal.aborted) return
      setImages(results.flatMap(result => result.status === 'fulfilled' ? [result.value.reference] : []))
      setFailed(results.some(result => result.status === 'rejected'))
    })
    return () => controller.abort()
  }, [ids])
  const allImages = [...references, ...images]
  const image = allImages.find(item => item.id === selected) ?? allImages[0]
  return <section className="workshop-comparison" aria-label={t('references.compare')}>
    <h4>{t('references.compare')}</h4>
    {image ? <>
      <div className="workshop-comparison-grid"><figure><img src={image.url} alt={image.name} /><figcaption>{t('references.original')}</figcaption></figure><figure><img src={preview} alt={label} /><figcaption>{t('references.generated')}</figcaption></figure></div>
      {allImages.length > 1 && <div className="workshop-comparison-options">{allImages.map((item, index) => <button key={item.id} type="button" aria-pressed={item.id === image.id} onClick={() => setSelected(item.id)}>{t('references.photo', { count: index + 1 })}</button>)}</div>}
    </> : <p>{t(referenceIds.length ? failed ? 'references.unavailable' : 'references.loading' : 'references.none')}</p>}
    {image && failed && <p className="workshop-reference-warning">{t('references.someUnavailable')}</p>}
  </section>
}
