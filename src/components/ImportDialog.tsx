import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Link2, Loader2, ScanText } from 'lucide-react'
import clsx from 'clsx'
import type { Recipe } from '../types'
import { useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import { CategoryPicker, effectiveCategoryIds } from './ui/CategoryPicker'
import { importFromUrl, toRecipe, type ImportedRecipe } from '../lib/importRecipe'
import { imageFileToDataUrl, ocrImage, parseOcrText, remoteImageToDataUrl } from '../lib/ocr'

type Tab = 'link' | 'photo'

export function ImportDialog({
  open,
  defaultCategoryId,
  onClose,
  onImported,
}: {
  open: boolean
  defaultCategoryId: string | null
  onClose: () => void
  onImported: (recipe: Recipe, review: boolean) => void
}) {
  const categories = useApp((s) => s.categories)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)

  const [tab, setTab] = useState<Tab>('link')
  const [categoryIds, setCategoryIds] = useState<string[]>(defaultCategoryId ? [defaultCategoryId] : [])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [scannedPhoto, setScannedPhoto] = useState<string | undefined>()
  const photoInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  // Re-sync the target categories every time the dialog opens: a real category
  // id (imported from a category page) preselects it; no context (homepage /
  // favorites) starts from the default first category.
  useEffect(() => {
    if (!open) return
    const valid =
      defaultCategoryId && useApp.getState().categories.some((c) => c.id === defaultCategoryId)
    setCategoryIds(valid ? [defaultCategoryId!] : [])
  }, [open, defaultCategoryId])

  function reset() {
    setUrl('')
    setPreview(null)
    setStatus('')
    setBusy(false)
    setScannedPhoto(undefined)
  }

  function close() {
    reset()
    onClose()
  }

  async function fetchLink() {
    const trimmed = url.trim()
    if (!trimmed) return
    setBusy(true)
    setStatus('Fetching the page…')
    try {
      const result = await importFromUrl(trimmed, settings.importProxy)
      setPreview(result)
      setStatus('')
      toast(`Found "${result.title}".`, 'success')
    } catch (error) {
      setStatus('')
      toast(error instanceof Error ? error.message : 'Import failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handlePhoto(file: File | undefined | null) {
    if (!file) return
    setBusy(true)
    setStatus('Reading the photo…')
    try {
      const dataUrl = await imageFileToDataUrl(file, 1600)
      setScannedPhoto(dataUrl)
      setStatus('Scanning text…')
      const text = await ocrImage(file, (p) => {
        const pct = Math.round((p.progress ?? 0) * 100)
        setStatus(`${p.status}… ${pct}%`)
      })
      const parsed = parseOcrText(text)
      if (!parsed.ingredients.length && !parsed.instructions.length) {
        toast('Could not read any recipe text. Try a clearer photo.', 'error')
      } else {
        setPreview(parsed)
        toast(`Scanned "${parsed.title}".`, 'success')
      }
    } catch {
      toast('Scanning failed. Try again with a clearer photo.', 'error')
    } finally {
      setStatus('')
      setBusy(false)
    }
  }

  async function finish(review: boolean) {
    const targetCategoryIds = effectiveCategoryIds(categoryIds, categories)
    if (!preview || targetCategoryIds.length === 0) return
    setBusy(true)
    try {
      const recipe = toRecipe(preview, targetCategoryIds)
      if (scannedPhoto) {
        recipe.photo = scannedPhoto
      } else if (recipe.photo && /^https?:/i.test(recipe.photo)) {
        // Inline remote images so the recipe still looks right offline.
        setStatus('Saving the photo…')
        const inlined = await remoteImageToDataUrl(recipe.photo, settings.importProxy)
        if (inlined) recipe.photo = inlined
      }
      onImported(recipe, review)
      close()
    } finally {
      setBusy(false)
    }
  }

  const canFinish = Boolean(preview && effectiveCategoryIds(categoryIds, categories).length)

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a recipe"
      size="lg"
      footer={
        <>
          <button className="btn-soft" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn-soft" onClick={() => finish(true)} disabled={!canFinish || busy}>
            Save &amp; review
          </button>
          <button className="btn-primary" onClick={() => finish(false)} disabled={!canFinish || busy}>
            Add recipe
          </button>
        </>
      }
    >
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl mb-4">
        <TabButton active={tab === 'link'} onClick={() => { setTab('link'); setPreview(null) }}>
          <Link2 size={15} /> From a link
        </TabButton>
        <TabButton active={tab === 'photo'} onClick={() => { setTab('photo'); setPreview(null) }}>
          <Camera size={15} /> From a photo
        </TabButton>
      </div>

      {tab === 'link' ? (
        <div className="space-y-3">
          <div>
            <label className="field-label">Recipe URL</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && fetchLink()}
                placeholder="https://www.example.com/best-brownies"
                className="flex-1"
                type="url"
                inputMode="url"
              />
              <button className="btn-primary shrink-0" onClick={fetchLink} disabled={busy || !url.trim()}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : 'Fetch'}
              </button>
            </div>
          </div>
          <p className="text-xs text-content-muted leading-relaxed">
            The Recipe App reads the structured recipe data that most food sites publish (schema.org). If a
            site blocks it, try another link or add the recipe by hand.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-soft py-6 flex-col !gap-2"
              onClick={() => cameraInput.current?.click()}
              disabled={busy}
            >
              <Camera size={22} />
              Take a photo
            </button>
            <button
              className="btn-soft py-6 flex-col !gap-2"
              onClick={() => photoInput.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={22} />
              Choose image
            </button>
          </div>
          <p className="text-xs text-content-muted leading-relaxed">
            Point the camera at a recipe card, cookbook page, or screenshot. The Recipe App will read the
            text on-device — nothing is uploaded.
          </p>
        </div>
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handlePhoto(e.target.files?.[0])}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handlePhoto(e.target.files?.[0])}
      />

      {busy && status && (
        <div className="mt-4 flex items-center gap-2 text-sm text-content-muted">
          <Loader2 size={15} className="animate-spin" />
          {status}
        </div>
      )}

      {scannedPhoto && (
        <img
          src={scannedPhoto}
          alt="Scanned recipe"
          className="mt-4 rounded-xl border border-line max-h-48 w-full object-cover"
        />
      )}

      <div className="mt-4">
        <CategoryPicker categories={categories} value={categoryIds} onChange={setCategoryIds} />
      </div>

      {preview && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-muted mb-2">
              <ScanText size={13} /> Found
            </div>
            <p className="font-semibold">{preview.title}</p>
            <p className="text-sm text-content-muted mt-1">
              {preview.ingredients.length} ingredients · {preview.instructions.length} steps
              {preview.servings ? ` · serves ${preview.servings}` : ''}
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors',
        active ? 'bg-surface shadow-sm' : 'text-content-muted hover:text-content',
      )}
    >
      {children}
    </button>
  )
}
