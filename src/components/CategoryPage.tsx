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

  // Reordering is "pick up, move, place": the first click lifts the tile out of
  // the grid and pins it to the cursor, and a second click drops it. A press and
  // drag would be the more obvious gesture, but a click would then have to be
  // told apart from a small drag, and a shaky click would reorder a recipe
  // instead of opening it. Two deliberate clicks remove that ambiguity.
  const [heldId, setHeldId] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<string[] | null>(null)
  const previewRef = useRef<string[] | null>(null)
  /** Where the cursor is, used to position the tile while it is held. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [tileSize, setTileSize] = useState<{ w: number; h: number } | null>(null)
  /** The order before the pick-up, so a cancel can restore it exactly. */
  const orderAtGrabRef = useRef<string[] | null>(null)

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

  /**
   * Lifts a tile, or resolves a press that arrives while one is already held.
   * Takes plain values rather than an event so it can be called from a timer.
   */
  function grabTile(id: string, tile: HTMLElement, x: number, y: number) {
    if (heldId === id) {
      // Pressing the held tile again means "never mind", so it goes back to
      // where it was lifted from rather than being dropped under the cursor.
      cancelHold()
      return
    }

    if (heldId) {
      // A press on a *different* tile places the held one, which is what the
      // second half of the gesture usually means.
      placeHeld()
      return
    }

    const rect = tile.getBoundingClientRect()
    setTileSize({ w: rect.width, h: rect.height })
    setPointer({ x, y })
    orderAtGrabRef.current = shown.map((recipe) => recipe.id)
    previewRef.current = shown.map((recipe) => recipe.id)
    setPreviewIds(previewRef.current)
    setHeldId(id)
  }

  /** Event-shaped entry point, for presses handled synchronously. */
  function grabOrPlace(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return
    const tile = (e.currentTarget as HTMLElement).closest('[data-recipe-id]') as HTMLElement | null
    if (!tile) return
    grabTile(id, tile, e.clientX, e.clientY)
  }

  /** Keeps the held tile under the cursor and recomputes which slot it is over. */
  function trackPointer(e: ReactPointerEvent<HTMLElement>) {
    if (!heldId) return
    setPointer({ x: e.clientX, y: e.clientY })
    moveHeldTo(e.clientX, e.clientY)
  }

  // A press starts a short timer; letting it run picks the tile up. This is how
  // a click can keep meaning "open the recipe" while a hold means "reorder" —
  // otherwise the two gestures would be the same click and one would have to
  // give way.
  const holdTimerRef = useRef<number | null>(null)
  function startHoldTimer(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0 || heldId) return
    clearHoldTimer()
    // Read everything off the event now. A React synthetic event's
    // `currentTarget` is cleared once the handler returns, so reading it from
    // the timer callback would find null and the grab would do nothing.
    const x = e.clientX
    const y = e.clientY
    const tile = (e.currentTarget as HTMLElement).closest('[data-recipe-id]') as HTMLElement | null
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      if (tile) grabTile(id, tile, x, y)
    }, 220)
  }
  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  /**
   * Works out the slot from the cursor's position against the *unheld* tiles.
   *
   * Deliberately not `elementFromPoint`: the grid reflows as the preview
   * changes, so whatever sits under the cursor moves as a consequence of the
   * move being decided from it. That feedback is what made the old drag jitter
   * in two dimensions. Comparing against tile centres is stable — the centres
   * are recomputed from the current preview, but a slot only changes when the
   * cursor genuinely crosses a midpoint.
   */
  function moveHeldTo(clientX: number, clientY: number) {
    const ids = previewRef.current
    if (!ids || !heldId) return

    const tiles = Array.from(
      document.querySelectorAll<HTMLElement>('[data-recipe-id]'),
    ).filter((el) => el.dataset.recipeId !== heldId)

    if (tiles.length === 0) return

    // Slot = the first tile the cursor comes before, reading in grid order.
    // "Comes before" means: in an earlier row, or the same row and to the left.
    // Rows are compared by their vertical band, so a cursor sitting inside a row
    // never counts as being before it — that was the bug that let a tile jump a
    // whole row too early.
    //
    // A cursor past the end of a row belongs after that row, not at the end of
    // the grid, so the last matching row is remembered and used when nothing
    // breaks the loop.
    const withoutHeld = ids.filter((id) => id !== heldId)
    let slot = withoutHeld.length
    let lastRowEnd = 0
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect()
      const cx = r.left + r.width / 2
      const sameRowAsCursor = clientY >= r.top && clientY <= r.bottom
      if (sameRowAsCursor) lastRowEnd = i + 1
      if (clientY < r.top) {
        // The cursor is above this tile's row: the recipe belongs here.
        slot = i
        break
      }
      if (sameRowAsCursor && clientX < cx) {
        // Same row, to the left of this tile's middle: belongs here.
        slot = i
        break
      }
    }
    // The loop fell through with the cursor still inside a row: it is to the
    // right of every tile in it, so the recipe goes at that row's end.
    if (slot === withoutHeld.length && lastRowEnd > 0) slot = lastRowEnd

    const from = ids.indexOf(heldId)
    if (from < 0) return
    const next = [...withoutHeld]
    next.splice(slot, 0, heldId)
    if (next.join() === ids.join()) return
    previewRef.current = next
    setPreviewIds(next)
  }

  function placeHeld() {
    const ids = previewRef.current
    const id = heldId
    setHeldId(null)
    setPointer(null)
    setTileSize(null)
    previewRef.current = null
    setPreviewIds(null)
    orderAtGrabRef.current = null
    if (ids && id) void reorderRecipes(viewId, ids)
  }

  function cancelHold() {
    const original = orderAtGrabRef.current
    setHeldId(null)
    setPointer(null)
    setTileSize(null)
    previewRef.current = null
    setPreviewIds(null)
    orderAtGrabRef.current = null
    // Nothing to undo if the tile never moved; only write when it did.
    if (original && original.join() !== shown.map((r) => r.id).join()) {
      void reorderRecipes(viewId, original)
    }
  }

  // Esc backs out of a pick-up. Registered only while a tile is held.
  useEffect(() => {
    if (!heldId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelHold()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [heldId, shown])

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
        <div
          className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
          onPointerMove={trackPointer}
        >
          {shown.map((recipe, index) => {
            const held = heldId === recipe.id
            return (
            <div
              key={recipe.id}
              data-recipe-id={recipe.id}
              className={clsx(
                'relative touch-pan-y select-none transition-transform duration-150',
                held && 'z-10',
              )}
              onClickCapture={(e) => {
                // While a tile is held the overlay below owns the click, so a
                // click reaching a tile here is always "open the recipe". The
                // only exception is the held tile itself, whose click must not
                // open it.
                if (heldId === recipe.id) {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
              onPointerDown={(e) => startHoldTimer(e, recipe.id)}
              onPointerUp={clearHoldTimer}
              onPointerLeave={clearHoldTimer}
              onPointerCancel={clearHoldTimer}
              onKeyDown={(e) => {
                if (heldId === recipe.id && e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  placeHeld()
                }
              }}
            >
              {held && (
                // The vacated slot. Kept in the flow so the grid stays put and
                // the other tiles visibly close in around it, which is the cue
                // for where the recipe will land.
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand/50 bg-brand/5"
                />
              )}
              <div className={clsx(held && 'invisible')}>
                {/* The grip is a shortcut: pressing it picks the tile up
                    immediately, with no hold, so there is always an unambiguous
                    way to grab without waiting. */}
                <span
                  aria-hidden
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    clearHoldTimer()
                    grabOrPlace(e, recipe.id)
                  }}
                  className={clsx(
                    'absolute top-2 right-2 z-10 rounded-lg p-1 bg-black/35 text-white transition-opacity',
                    held ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab',
                  )}
                >
                  <GripVertical size={15} />
                </span>
                {/* Reordering by hand is mouse-only; this gives the same result
                    from the keyboard, which is also the only way on a touch
                    device with no second click available. */}
                {index > 0 && !held && (
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
            </div>
            )
          })}
        </div>
      )}

      {/* The picked-up tile, pinned to the cursor and following it. Rendered
          outside the grid so it is not clipped by it, and above everything
          else so it reads as being carried. */}
      {heldId &&
        pointer &&
        tileSize &&
        (() => {
          const recipe = shown.find((r) => r.id === heldId)
          if (!recipe) return null
          return (
            <div
              aria-hidden
              className="fixed z-50 pointer-events-none"
              style={{
                left: pointer.x - tileSize.w / 2,
                top: pointer.y - tileSize.h / 2,
                width: tileSize.w,
                height: tileSize.h,
              }}
            >
              <div className="h-full w-full rotate-2 scale-[1.04] shadow-2xl rounded-2xl overflow-hidden ring-2 ring-brand/60 bg-surface">
                <RecipeCard recipe={recipe} color={hex} />
              </div>
            </div>
          )
        })()}

      {/* While a tile is held, this covers the page: it tracks the pointer, and
          a click on it places the recipe. It has to own the click because the
          tile under the cursor is not the one being carried — the user is
          aiming at a gap. */}
      {heldId && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 cursor-copy"
          onPointerMove={trackPointer}
          onPointerDown={(e) => {
            e.preventDefault()
            placeHeld()
          }}
        />
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
