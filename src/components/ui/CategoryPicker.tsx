import { Plus, X } from 'lucide-react'
import type { Category } from '../../types'

/**
 * Resolves the category selectors actually shown. Recipes always have at least
 * one category when any exist, falling back to the first one so a new or old
 * recipe can be saved without extra clicks.
 */
export function effectiveCategoryIds(value: string[], categories: Category[]): string[] {
  const valid = value.filter((id) => categories.some((category) => category.id === id))
  if (valid.length) return Array.from(new Set(valid)).slice(0, 3)
  return categories[0] ? [categories[0].id] : []
}

/**
 * One to three category selectors. A recipe is stored once and appears in every
 * category picked here; the first one is its primary (colour) category.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[]
  value: string[]
  onChange: (categoryIds: string[]) => void
}) {
  const selected = effectiveCategoryIds(value, categories)

  function setAt(index: number, id: string) {
    const next = [...selected]
    next[index] = id
    onChange(next.filter(Boolean))
  }

  function add() {
    if (selected.length >= 3) return
    const used = new Set(selected)
    const extra = categories.find((category) => !used.has(category.id))
    if (extra) onChange([...selected, extra.id])
  }

  function removeAt(index: number) {
    if (index === 0) return
    onChange(selected.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="field-label">Categories</label>
        <span className="text-[11px] text-content-muted mb-1.5">Up to 3</span>
      </div>
      <div className="space-y-2">
        {selected.map((categoryId, index) => (
          <div key={index} className="flex items-center gap-2">
            <select
              value={categoryId}
              onChange={(e) => setAt(index, e.target.value)}
              className="w-full"
              aria-label={index === 0 ? 'Primary category' : `Category ${index + 1}`}
            >
              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={category.id !== categoryId && selected.includes(category.id)}
                >
                  {category.name}
                </option>
              ))}
            </select>
            {index > 0 && (
              <button
                type="button"
                className="btn-ghost !p-2 text-content-muted hover:text-red-600 shrink-0"
                onClick={() => removeAt(index)}
                aria-label="Remove category"
                title="Remove category"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {selected.length < 3 && categories.length > selected.length && (
        <button
          type="button"
          className="btn-ghost !px-2 !py-1 text-xs mt-2"
          onClick={add}
        >
          <Plus size={13} /> Add another category
        </button>
      )}
      <p className="text-[11px] text-content-muted mt-1.5">
        Stored once and shown in every category you pick. The first one sets the recipe&apos;s
        colour.
      </p>
    </div>
  )
}
