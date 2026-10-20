import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import clsx from 'clsx'
import { GripVertical, Pencil, Plus, RotateCcw, Search, UtensilsCrossed } from 'lucide-react'
import type { Category } from '../types'
import { useApp } from '../store/useApp'
import { allRecipesColor, colorFor, favoritesColor, prefersLightText } from '../lib/colors'
import { ALL_RECIPES_VIEW, FAVORITES_VIEW, sortRecipesForView } from '../lib/recipeOrder'
import { ColorPicker } from './ui/ColorPicker'
import { Modal } from './ui/Modal'
import { RecipeCard } from './RecipeCard'

/** Grid of every recipe inside the selected category (a category's top level). */
export function CategoryPage({
  category,
  favoritesOnly,
  onEditCategory,
  onNewRecipe,
  onImport,
}: {
  category: Category | null
  favoritesOnly?: boolean
  onEditCategory?: () => void
  onNewRecipe: () => void
  onImport: () => void
}) {
  const recipes = useApp((s) => s.recipes)
  const recipeOrders = useApp((s) => s.recipeOrders)
  const reorderRecipes = useApp((s) => s.reorderRecipes)
  const resetRecipeOrder = useApp((s) => s.resetRecipeOrder)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const [query, setQuery] = useState('')
  const [colorOpen, setColorOpen] = useState(false)

  // Drag state. Mirrors the sidebar's category reorder: a press is tracked, the
  // drag activates once the pointer has moved, and the grid reorders live.
  const [dragId, setDragId] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<string[] | null>(null)
  const previewRef = useRef<string[] | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{
    pointerId: number
    id: string
    startX: number
    startY: number
    tile: HTMLElement
    active: boolean
    order: string[]
  } | null>(null)

  /** Which stored arrangement this grid is showing. */
  const viewId = favoritesOnly ? FAVORITES_VIEW : category ? category.id : ALL_RECIPES_VIEW

  useEffect(() => {
    setQuery('')
    setColorOpen(false)
  }, [category?.id, favoritesOnly])

  /** "All recipes" and "Favorites" are virtual views, not categories, so their
   * color is a setting the user can change right here. */
  const virtual = favoritesOnly || !category
  const hex = favoritesOnly
    ? favoritesColor(settings)
    : category
      ? colorFor(category.colorName, category.colorSet)
      : allRecipesColor(settings)

  const shown = useMemo(() => {
    const inCategory = favoritesOnly
      ? recipes.filter((r) => r.favorite)
      : category
        ? recipes.filter((r) => r.categoryIds.includes(category.id))
        : recipes
    const q = query.trim().toLowerCase()
    const searched = q
      ? inCategory.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
        )
      : inCategory

    // Hand-placed positions apply to the unfiltered view. While the user is
    // searching, results stay in the app's usual order — a saved position says
    // nothing useful about which search hit matters more.
    if (q) return searched
    const ordered = sortRecipesForView(searched, recipeOrders, viewId)
    if (!previewIds) return ordered
    // A live preview while dragging, so tiles slide out of the way.
    const byId = new Map(ordered.map((r) => [r.id, r]))
    return previewIds.flatMap((id) => {
      const recipe = byId.get(id)
      return recipe ? [recipe] : []
    })
  }, [recipes, recipeOrders, viewId, category, favoritesOnly, query, previewIds])

  const hasCustomOrder = useMemo(
    () => recipeOrders.some((order) => order.viewId === viewId),
    [recipeOrders, viewId],
  )

  /** Starts tracking a press; the drag only activates once the pointer moves. */
  function beginDrag(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return
    const tile = (e.currentTarget as HTMLElement).closest('[data-recipe-id]') as HTMLElement | null
    if (!tile) return
    dragRef.current = {
      pointerId: e.pointerId,
      id,
      startX: e.clientX,
      startY: e.clientY,
      tile,
      active: false,
      order: shown.map((recipe) => recipe.id),
    }
  }

  function moveDrag(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return
      drag.active = true
      previewRef.current = drag.order
      setPreviewIds(drag.order)
      setDragId(drag.id)
      try {
        drag.tile.setPointerCapture(e.pointerId)
      } catch {
        // pointer capture is only a convenience; dragging still works without it
      }
      window.getSelection()?.removeAllRanges()
    }

    const target = (
      document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    )?.closest('[data-recipe-id]') as HTMLElement | null
    const overId = target?.dataset.recipeId
    if (!overId || overId === drag.id) return

    const ids = previewRef.current ?? drag.order
    const from = ids.indexOf(drag.id)
    const to = ids.indexOf(overId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, drag.id)
    previewRef.current = next
    setPreviewIds(next)
  }

  function finishDrag(e: ReactPointerEvent<HTMLElement>, commit: boolean) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    if (!drag.active) return

    const ids = previewRef.current ?? drag.order
    previewRef.current = null
    setPreviewIds(null)
    setDragId(null)
    // A drag ends with a click; don't let it also open the recipe.
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)

    if (!commit) return
    void reorderRecipes(viewId, ids)
  }

  return (
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto w-full">
      <div
        className="rounded-2xl p-5 mb-5 border"
        style={{ backgroundColor: `${hex}14`, borderColor: `${hex}33` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-12 w-12 rounded-2xl shrink-0"
            style={{ backgroundColor: hex }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate">
              {favoritesOnly ? '★ Favorites' : category ? category.name : 'All recipes'}
            </h2>
            <p className="text-sm text-content-muted">
              {shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Virtual views ("All recipes", "Favorites") get their own color,
                shown as a swatch button in the title box, left of Import. */}
            {virtual && (
              <button
                type="button"
                onClick={() => setColorOpen(true)}
                title={`Change the ${favoritesOnly ? 'Favorites' : 'All recipes'} color`}
                aria-label={`Change the ${favoritesOnly ? 'Favorites' : 'All recipes'} color`}
                className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-content ring-offset-2 ring-offset-surface"
                style={{ backgroundColor: hex }}
              >
                <Pencil
                  size={14}
                  color={prefersLightText(hex) ? '#ffffff' : '#111827'}
                  className="opacity-70"
                />
              </button>
            )}
            <div className="hidden sm:flex gap-2">
              <button className="btn-soft" onClick={onImport}>
                Import
              </button>
              <button
                className="btn bg-white text-black border border-black hover:bg-surface-3"
                onClick={onNewRecipe}
              >
                <Plus size={16} /> New
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit-category selector, below the title box */}
      {category && onEditCategory && (
        <div className="-mt-3 mb-4">
          <button
            className="btn-ghost !py-1.5 text-sm text-content-muted"
            onClick={onEditCategory}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colorFor(category.colorName, category.colorSet) }}
            />
            Edit “{category.name}”
            <Pencil size={13} />
          </button>
        </div>
      )}

      <div className="relative mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search these recipes…"
            className="w-full pl-9"
          />
        </div>
        {hasCustomOrder && !query && (
          <button
            className="btn-ghost !py-1.5 text-xs text-content-muted shrink-0"
            onClick={() => void resetRecipeOrder(viewId)}
            title="Put these recipes back in automatically sorted order"
          >
            <RotateCcw size={13} /> Reset order
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-16">
          <div
            className="mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: `${hex}22` }}
          >
            <UtensilsCrossed size={26} style={{ color: hex }} />
          </div>
          <h3 className="font-semibold">
            {favoritesOnly ? 'No favorites yet' : 'Nothing here yet'}
          </h3>
          <p className="text-sm text-content-muted mt-1 mb-5">
            {favoritesOnly
              ? 'Tap the heart on a recipe to save it here.'
              : 'Add a recipe by hand, paste a link, or scan a photo.'}
          </p>
          <div className="flex justify-center gap-2">
            <button className="btn-soft" onClick={onImport}>
              Import
            </button>
            <button className="btn-primary" onClick={onNewRecipe}>
              <Plus size={16} /> New recipe
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {shown.map((recipe, index) => (
            <div
              key={recipe.id}
              data-recipe-id={recipe.id}
              className={clsx(
                'relative touch-pan-y select-none',
                dragId === recipe.id && 'opacity-60 z-10',
              )}
              onPointerDown={(e) => beginDrag(e, recipe.id)}
              onPointerMove={moveDrag}
              onPointerUp={(e) => finishDrag(e, true)}
              onPointerCancel={(e) => finishDrag(e, false)}
              onClickCapture={(e) => {
                // The click that ends a drag must not also open the recipe.
                if (suppressClickRef.current) {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
            >
              {/* Purely a visual handle: the tile itself carries the drag
                  handlers, so a press on the grip works without the event
                  bubbling through a second set of handlers. */}
              <span
                aria-hidden
                className="absolute top-2 right-2 z-10 rounded-lg p-1 opacity-0 group-hover:opacity-100 bg-black/35 text-white cursor-grab active:cursor-grabbing transition-opacity pointer-events-none"
              >
                <GripVertical size={15} />
              </span>
              {/* Dragging is the natural gesture, but it is mouse-only. This
                  gives the same result from the keyboard, which is also the
                  only way to reorder on a touch device without dragging. */}
              {index > 0 && (
                <button
                  type="button"
                  aria-label={`Move “${recipe.title}” to the top`}
                  title="Move to the top"
                  tabIndex={0}
                  className="absolute bottom-2 right-2 z-10 rounded-lg px-2 py-1 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/35 text-white hover:bg-black/55 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const ids = shown.map((r) => r.id)
                    const from = ids.indexOf(recipe.id)
                    if (from < 1) return
                    ids.splice(from, 1)
                    ids.unshift(recipe.id)
                    void reorderRecipes(viewId, ids)
                  }}
                >
                  Move to top
                </button>
              )}
              <RecipeCard recipe={recipe} color={hex} />
            </div>
          ))}
        </div>
      )}

      {/* floating add button on phones */}
      <button
        onClick={onNewRecipe}
        className="sm:hidden fixed bottom-5 right-5 h-14 w-14 rounded-full bg-brand text-white shadow-xl flex items-center justify-center z-20 safe-bottom"
        aria-label="New recipe"
      >
        <Plus size={24} />
      </button>

      {virtual && (
        <Modal
          open={colorOpen}
          onClose={() => setColorOpen(false)}
          title={favoritesOnly ? 'Favorites color' : 'All recipes color'}
          size="sm"
          footer={
            <button className="btn-primary" onClick={() => setColorOpen(false)}>
              Done
            </button>
          }
        >
          <ColorPicker
            colorSet={favoritesOnly ? settings.favoritesColorSet : settings.allRecipesColorSet}
            colorName={favoritesOnly ? settings.favoritesColorName : settings.allRecipesColorName}
            onChange={(next) =>
              updateSettings(
                favoritesOnly
                  ? { favoritesColorName: next.colorName, favoritesColorSet: next.colorSet }
                  : { allRecipesColorName: next.colorName, allRecipesColorSet: next.colorSet },
              )
            }
          />
        </Modal>
      )}
    </div>
  )
}
