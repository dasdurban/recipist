import { useMemo, useState } from 'react'
import {
  Clock,
  ExternalLink,
  Heart,
  List,
  Minus,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Users,
} from 'lucide-react'
import clsx from 'clsx'
import type { Recipe } from '../types'
import { useApp } from '../store/useApp'
import { allRecipesColor, colorFor } from '../lib/colors'
import { isTauri, openExternal } from '../lib/native'
import { HealthScore, MacroGrid } from './ui/NutritionBadge'

export function RecipeView({
  recipe,
  onEdit,
  onDelete,
  onGenerateShoppingList,
}: {
  recipe: Recipe
  onEdit: () => void
  onDelete: () => void
  onGenerateShoppingList: () => void
}) {
  const categories = useApp((s) => s.categories)
  const settings = useApp((s) => s.settings)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const [servings, setServings] = useState(recipe.servings ?? 1)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const category = categories.find((c) => c.id === recipe.categoryIds[0])
  const hex = category ? colorFor(category.colorName, category.colorSet) : allRecipesColor(settings)
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 1
  const factor = servings / baseServings

  const sections = useMemo(() => {
    const map = new Map<string, typeof recipe.ingredients>()
    for (const ing of recipe.ingredients) {
      const key = ing.section?.trim() || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ing)
    }
    return Array.from(map.entries())
  }, [recipe.ingredients])

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)

  function toggleIngredient(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <article className="max-w-3xl mx-auto w-full pb-24">
      {/* photo area */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-surface-3 overflow-hidden">
        {recipe.photo ? (
          <img src={recipe.photo} alt={recipe.title} className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full flex items-end justify-center pb-8"
            style={{ background: `linear-gradient(135deg, ${hex}44, ${hex}14 70%, ${hex}08)` }}
          >
            <span className="text-sm text-content-muted">No photo yet — tap Edit to add one</span>
          </div>
        )}

        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={() => toggleFavorite(recipe.id)}
            className="h-10 w-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
            aria-label="Favorite"
          >
            <Heart size={18} className={recipe.favorite ? 'fill-rose-500 text-rose-500' : 'text-white'} />
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 w-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
            aria-label="Print"
          >
            <Printer size={18} className="text-white" />
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        {/* title block */}
        <div className="pt-5">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{recipe.title}</h1>
          {recipe.description && (
            <p className="text-content-muted mt-2 leading-relaxed">{recipe.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm">
            {totalMinutes > 0 && (
              <span className="inline-flex items-center gap-1.5 text-content-muted">
                <Clock size={15} /> {totalMinutes} min
              </span>
            )}
            {recipe.yieldText && <span className="text-content-muted">{recipe.yieldText}</span>}
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                // The desktop webview has no new-window handler, so a plain
                // `target="_blank"` is a dead end there; give the OS the URL.
                onClick={(event) => {
                  const url = recipe.sourceUrl
                  if (url && isTauri()) {
                    event.preventDefault()
                    void openExternal(url)
                  }
                }}
                className="inline-flex items-center gap-1.5 text-brand hover:underline"
              >
                <ExternalLink size={14} /> Source
              </a>
            )}
          </div>

          {recipe.categoryIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {recipe.categoryIds.map((categoryId) => {
                const member = categories.find((c) => c.id === categoryId)
                if (!member) return null
                const memberHex = colorFor(member.colorName, member.colorSet)
                return (
                  <span
                    key={categoryId}
                    className="chip"
                    style={{ backgroundColor: `${memberHex}22`, color: memberHex }}
                  >
                    {member.name}
                  </span>
                )
              })}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button className="btn-soft flex-1 sm:flex-none" onClick={onEdit}>
              <Pencil size={15} /> Edit
            </button>
            <button
              className="btn-soft flex-1 sm:flex-none"
              onClick={onGenerateShoppingList}
            >
              <List size={15} /> Shopping list
            </button>
            <button
              className="btn-ghost text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={onDelete}
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>

        <hr className="border-line my-6" />

        {/* nutrition */}
        {recipe.nutrition && (
          <section className="mb-7">
            <SectionTitle color={hex}>Nutrition</SectionTitle>
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <HealthScore nutrition={recipe.nutrition} />
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {Math.round(recipe.nutrition.calories / (recipe.servings || 1))}
                    <span className="text-sm font-normal text-content-muted ml-1">kcal</span>
                  </div>
                  <div className="text-xs text-content-muted">per serving</div>
                </div>
              </div>
              <MacroGrid nutrition={recipe.nutrition} servings={recipe.servings} />
              {recipe.nutrition.matched < recipe.nutrition.total && (
                <p className="text-xs text-content-muted">
                  Estimated from {recipe.nutrition.matched} of {recipe.nutrition.total} ingredients
                  matched in the built-in nutrition database.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ingredients */}
        <section className="mb-7">
          <div className="flex items-center justify-between gap-3 mb-3">
            <SectionTitle color={hex} className="!mb-0">
              Ingredients
            </SectionTitle>
            <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-1">
              <button
                className="p-1.5 text-content-muted hover:text-content"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                aria-label="Fewer servings"
              >
                <Minus size={14} />
              </button>
              <span className="inline-flex items-center gap-1 px-1.5 text-sm font-medium tabular-nums min-w-[3.5rem] justify-center">
                <Users size={13} className="text-content-muted" />
                {servings}
              </span>
              <button
                className="p-1.5 text-content-muted hover:text-content"
                onClick={() => setServings((s) => s + 1)}
                aria-label="More servings"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="card divide-y divide-line overflow-hidden">
            {sections.map(([section, items]) => (
              <div key={section || '_default'}>
                {section && (
                  <div
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: `${hex}14`, color: hex }}
                  >
                    {section}
                  </div>
                )}
                <ul>
                  {items.map((ing) => {
                    const isChecked = checked.has(ing.id)
                    return (
                      <li key={ing.id}>
                        <label className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleIngredient(ing.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-current"
                            style={{ accentColor: hex }}
                          />
                          <span className={clsx('text-sm leading-relaxed', isChecked && 'line-through text-content-muted')}>
                            {ing.quantity !== undefined && (
                              <b className="font-semibold mr-1">
                                {formatQuantity(ing.quantity * factor)}
                              </b>
                            )}
                            {ing.unit && <span className="mr-1 text-content-muted">{ing.unit}</span>}
                            {ing.name}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {recipe.ingredients.length === 0 && (
              <p className="px-4 py-6 text-sm text-content-muted text-center">No ingredients added.</p>
            )}
          </div>
        </section>

        {/* instructions */}
        <section className="mb-7">
          <SectionTitle color={hex}>Instructions</SectionTitle>
          {recipe.instructions.length === 0 ? (
            <p className="text-sm text-content-muted">No steps added.</p>
          ) : (
            <ol className="space-y-3">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: `${hex}22`, color: hex }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed pt-0.5 whitespace-pre-wrap">{step}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {recipe.notes && (
          <section className="mb-7">
            <SectionTitle color={hex}>Notes</SectionTitle>
            <div className="card p-4 text-sm leading-relaxed whitespace-pre-wrap">{recipe.notes}</div>
          </section>
        )}
      </div>
    </article>
  )
}

function SectionTitle({
  children,
  color,
  className,
}: {
  children: React.ReactNode
  color: string
  className?: string
}) {
  return (
    <h2 className={clsx('text-lg font-bold mb-3 flex items-center gap-2', className)}>
      <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </h2>
  )
}

/** 1.5 -> "1 1/2", 0.25 -> "1/4", 2 -> "2" */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 100) / 100
  const whole = Math.floor(rounded)
  const frac = rounded - whole
  const table: Array<[number, string]> = [
    [0, ''],
    [1 / 8, '1/8'],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [3 / 8, '3/8'],
    [1 / 2, '1/2'],
    [5 / 8, '5/8'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
    [7 / 8, '7/8'],
    [1, ''],
  ]
  let best = table[0]
  for (const entry of table) {
    if (Math.abs(entry[0] - frac) < Math.abs(best[0] - frac)) best = entry
  }
  if (best[0] === 1) return String(whole + 1)
  if (best[0] === 0) return String(whole || rounded)
  return whole > 0 ? `${whole} ${best[1]}` : best[1]
}
