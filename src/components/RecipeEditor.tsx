import { useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { Ingredient, Recipe } from '../types'
import { uid } from '../db/database'
import { useApp } from '../store/useApp'
import { allRecipesColor, colorFor } from '../lib/colors'
import { ingredientFromRaw, estimateNutrition } from '../lib/nutrition'
import { imageFileToDataUrl } from '../lib/ocr'
import { HealthScore, MacroGrid } from './ui/NutritionBadge'

export function emptyRecipe(categoryId: string): Recipe {
  const now = Date.now()
  return {
    id: uid('rec_'),
    categoryId,
    title: '',
    ingredients: [ingredientFromRaw('')],
    instructions: [''],
    tags: [],
    servings: 4,
    createdAt: now,
    updatedAt: now,
  }
}

export function RecipeEditor({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: Recipe
  onClose: () => void
  onSaved: (r: Recipe) => void
}) {
  const categories = useApp((s) => s.categories)
  const settings = useApp((s) => s.settings)
  const saveRecipe = useApp((s) => s.saveRecipe)
  const toast = useApp((s) => s.toast)

  const [draft, setDraft] = useState<Recipe>(recipe)
  const [tagText, setTagText] = useState(recipe.tags.join(', '))
  const [busy, setBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  const category = categories.find((c) => c.id === draft.categoryId) ?? categories[0]
  const hex = category ? colorFor(category.colorName, category.colorSet) : allRecipesColor(settings)

  const nutrition = useMemo(
    () => estimateNutrition(draft.ingredients, draft.servings),
    [draft.ingredients, draft.servings],
  )

  function patch(next: Partial<Recipe>) {
    setDraft((d) => ({ ...d, ...next }))
  }

  function updateIngredient(id: string, raw: string) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((i) => (i.id === id ? { ...i, raw, name: i.name } : i)),
    }))
  }

  function addIngredient(afterId?: string) {
    const next: Ingredient = ingredientFromRaw('')
    setDraft((d) => {
      const items = [...d.ingredients]
      const idx = afterId ? items.findIndex((i) => i.id === afterId) : items.length - 1
      items.splice(idx + 1, 0, next)
      return { ...d, ingredients: items }
    })
  }

  function removeIngredient(id: string) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.length > 1 ? d.ingredients.filter((i) => i.id !== id) : d.ingredients,
    }))
  }

  function updateInstruction(index: number, value: string) {
    setDraft((d) => ({
      ...d,
      instructions: d.instructions.map((s, i) => (i === index ? value : s)),
    }))
  }

  async function handlePhoto(file: File | undefined | null) {
    if (!file) return
    try {
      const dataUrl = await imageFileToDataUrl(file, 1600)
      patch({ photo: dataUrl })
    } catch {
      toast('Could not read that image.', 'error')
    }
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      toast('Give the recipe a title first.', 'error')
      return
    }
    setBusy(true)
    try {
      const ingredients = draft.ingredients
        .map((i) => (i.raw.trim() ? ingredientFromRaw(i.raw, i.section) : i))
        .filter((i) => i.raw.trim().length > 0)
      const instructions = draft.instructions.map((s) => s.trim()).filter(Boolean)
      const tags = tagText
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean)

      const final: Recipe = {
        ...draft,
        ingredients,
        instructions,
        tags,
        nutrition: estimateNutrition(ingredients, draft.servings),
      }
      await saveRecipe(final)
      toast('Recipe saved.', 'success')
      onSaved(final)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-5 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{recipe.title ? 'Edit recipe' : 'New recipe'}</h2>
        <button className="btn-ghost !p-2 rounded-full" onClick={onClose} aria-label="Close editor">
          <X size={20} />
        </button>
      </div>

      {/* photo */}
      <div className="card overflow-hidden mb-5">
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          className="relative w-full aspect-[16/9] bg-surface-3 flex items-center justify-center group"
          style={draft.photo ? undefined : { background: `linear-gradient(135deg, ${hex}22, ${hex}0a)` }}
        >
          {draft.photo ? (
            <img src={draft.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-content-muted">
              <ImagePlus size={30} />
              <span className="text-sm">Add a photo of the finished dish</span>
            </span>
          )}
          {draft.photo && (
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 text-white text-sm font-medium">
              Change photo
            </span>
          )}
        </button>
        <div className="flex divide-x divide-line border-t border-line">
          <button
            className="flex-1 py-2.5 text-sm inline-flex items-center justify-center gap-2 hover:bg-surface-2"
            onClick={() => photoInput.current?.click()}
          >
            <ImagePlus size={15} /> Choose
          </button>
          <button
            className="flex-1 py-2.5 text-sm inline-flex items-center justify-center gap-2 hover:bg-surface-2"
            onClick={() => cameraInput.current?.click()}
          >
            <Camera size={15} /> Camera
          </button>
          {draft.photo && (
            <button
              className="flex-1 py-2.5 text-sm inline-flex items-center justify-center gap-2 hover:bg-surface-2 text-red-600"
              onClick={() => patch({ photo: undefined })}
            >
              <Trash2 size={15} /> Remove
            </button>
          )}
        </div>
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
      </div>

      {/* basics */}
      <div className="space-y-4">
        <div>
          <label className="field-label">Title</label>
          <input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="e.g. Lemon Garlic Chicken"
            className="w-full text-lg font-semibold"
          />
        </div>

        <div>
          <label className="field-label">Description</label>
          <textarea
            value={draft.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder="A short note about this recipe"
            className="w-full resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Category</label>
            <select
              value={draft.categoryId}
              onChange={(e) => patch({ categoryId: e.target.value })}
              className="w-full"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Servings</label>
            <input
              type="number"
              min={1}
              value={draft.servings ?? 1}
              onChange={(e) => patch({ servings: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Prep (min)</label>
            <input
              type="number"
              min={0}
              value={draft.prepMinutes ?? ''}
              onChange={(e) => patch({ prepMinutes: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label">Cook (min)</label>
            <input
              type="number"
              min={0}
              value={draft.cookMinutes ?? ''}
              onChange={(e) => patch({ cookMinutes: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label">Yield</label>
            <input
              value={draft.yieldText ?? ''}
              onChange={(e) => patch({ yieldText: e.target.value })}
              placeholder="1 pan"
              className="w-full"
            />
          </div>
        </div>

        <div>
          <label className="field-label">Tags</label>
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="dinner, spicy, 30-minute"
            className="w-full"
          />
        </div>
      </div>

      {/* ingredients */}
      <div className="mt-7">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Ingredients</h3>
          <button className="btn-ghost !py-1.5 text-sm" onClick={() => addIngredient()}>
            <Plus size={15} /> Add
          </button>
        </div>
        <div className="space-y-2">
          {draft.ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
              <input
                value={ing.raw}
                onChange={(e) => updateIngredient(ing.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addIngredient(ing.id)
                  }
                }}
                placeholder="1 1/2 cups all-purpose flour"
                className="flex-1"
              />
              <button
                className="btn-ghost !p-2 text-content-muted hover:text-red-600"
                onClick={() => removeIngredient(ing.id)}
                aria-label="Remove ingredient"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* instructions */}
      <div className="mt-7">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Instructions</h3>
          <button
            className="btn-ghost !py-1.5 text-sm"
            onClick={() => setDraft((d) => ({ ...d, instructions: [...d.instructions, ''] }))}
          >
            <Plus size={15} /> Add step
          </button>
        </div>
        <div className="space-y-2">
          {draft.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold mt-0.5"
                style={{ backgroundColor: `${hex}22`, color: hex }}
              >
                {i + 1}
              </span>
              <textarea
                value={step}
                onChange={(e) => updateInstruction(i, e.target.value)}
                rows={2}
                placeholder="Describe this step…"
                className="flex-1 resize-y"
              />
              <button
                className="btn-ghost !p-2 text-content-muted hover:text-red-600 mt-0.5"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    instructions:
                      d.instructions.length > 1 ? d.instructions.filter((_, idx) => idx !== i) : d.instructions,
                  }))
                }
                aria-label="Remove step"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* notes */}
      <div className="mt-7">
        <label className="field-label">Notes</label>
        <textarea
          value={draft.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          placeholder="Substitutions, serving ideas, where you found it…"
          className="w-full resize-y"
        />
      </div>

      {/* live nutrition */}
      <div className="mt-7 card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} style={{ color: hex }} />
          <h3 className="font-bold">Live nutrition estimate</h3>
        </div>
        {nutrition.matched === 0 ? (
          <p className="text-sm text-content-muted">
            Add a few ingredients and the calorie count and health score appear here automatically.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <HealthScore nutrition={nutrition} size={56} />
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {Math.round(nutrition.calories / (draft.servings || 1))}
                  <span className="text-sm font-normal text-content-muted ml-1">kcal</span>
                </div>
                <div className="text-xs text-content-muted">per serving</div>
              </div>
            </div>
            <MacroGrid nutrition={nutrition} servings={draft.servings} />
            {nutrition.matched < nutrition.total && (
              <p className="text-xs text-content-muted">
                {nutrition.total - nutrition.matched} ingredient
                {nutrition.total - nutrition.matched === 1 ? '' : 's'} not recognized yet.
              </p>
            )}
          </div>
        )}
      </div>

      {/* sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-line bg-surface/90 backdrop-blur safe-bottom z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex gap-2">
          <button className="btn-soft flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary flex-[2]" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </div>
    </div>
  )
}
