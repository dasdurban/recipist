import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, Heart, Plus, List, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../store/useApp'
import { allRecipesColor, colorFor, favoritesColor } from '../lib/colors'
import { FAVORITES_ID } from '../lib/nav'
import { TomatoLogo } from './TomatoLogo'

/**
 * The left navigation pane: every category is a "top level" that groups all of
 * its recipes. Docked on large screens, a drawer on phones.
 *
 * The top input is a global recipe search (by title, tag, or ingredient name).
 * Categories are identified by colour alone — no icon artwork in the nav.
 */
export function Sidebar() {
  const categories = useApp((s) => s.categories)
  const recipes = useApp((s) => s.recipes)
  const shoppingLists = useApp((s) => s.shoppingLists)
  const events = useApp((s) => s.events)
  const activeCategoryId = useApp((s) => s.activeCategoryId)
  const settings = useApp((s) => s.settings)
  const sidebarOpen = useApp((s) => s.sidebarOpen)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const openRecipe = useApp((s) => s.openRecipe)
  const [filter, setFilter] = useState('')

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of recipes) map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1)
    return map
  }, [recipes])

  const searchResults = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return []
    return recipes.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q)) ||
      r.ingredients.some((i) => i.name.toLowerCase().includes(q))
    )
  }, [recipes, filter])

  const favorites = recipes.filter((r) => r.favorite).length

  function goHome() {
    setFilter('')
    window.dispatchEvent(new CustomEvent('recipist:home'))
  }

  function selectFavorites() {
    setFilter('')
    window.dispatchEvent(new CustomEvent('recipist:select-category', { detail: { id: FAVORITES_ID } }))
  }

  function selectCategory(id: string) {
    setFilter('')
    window.dispatchEvent(new CustomEvent('recipist:select-category', { detail: { id } }))
  }

  const nav = (
    <nav className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search all recipes…"
          className="w-full !py-1.5 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {/* Search results */}
        {filter.trim() ? (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Search results
            </div>
            {searchResults.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => {
                  setFilter('')
                  openRecipe(recipe.id)
                }}
                className={clsx(
                  'w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-left transition-colors hover:bg-surface-3',
                )}
              >
                <span className="flex-1 min-w-0 truncate">{recipe.title}</span>
                <span className="text-xs text-content-muted tabular-nums">
                  {recipe.ingredients.length} ingr.
                </span>
              </button>
            ))}
            {searchResults.length === 0 && (
              <p className="px-3 py-4 text-sm text-content-muted">No recipes match.</p>
            )}
          </>
        ) : (
          <>
            <NavRow
              label="All recipes"
              count={recipes.length}
              active={activeCategoryId === null}
              color={allRecipesColor(settings)}
              onClick={() => {
                selectCategory('')
                goHome()
              }}
            />
            {favorites > 0 && (
              <NavRow
                label="Favorites"
                count={favorites}
                active={activeCategoryId === FAVORITES_ID}
                color={favoritesColor(settings)}
                onClick={selectFavorites}
                /* the same heart the recipe cards use to mark a favourite */
                trailing={
                  <Heart
                    size={14}
                    className="shrink-0 fill-rose-500 text-rose-500"
                    aria-hidden
                  />
                }
              />
            )}

            <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Categories
            </div>

            {categories.map((category) => {
              const hex = colorFor(category.colorName, category.colorSet)
              const active = activeCategoryId === category.id
              return (
                <button
                  key={category.id}
                  onClick={() => selectCategory(category.id)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-left transition-colors',
                    active ? 'font-semibold' : 'hover:bg-surface-3',
                  )}
                  style={active ? { backgroundColor: `${hex}22` } : undefined}
                >
                  <span
                    className="h-7 w-7 shrink-0 rounded-lg"
                    style={{ backgroundColor: hex }}
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0 truncate">{category.name}</span>
                  <span className="text-xs text-content-muted tabular-nums">{counts.get(category.id) ?? 0}</span>
                  {active && <ChevronRight size={14} className="text-content-muted" />}
                </button>
              )
            })}

            <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Event planner
            </div>

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('recipist:event-planner'))}
              className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-left transition-colors hover:bg-surface-2"
            >
              <CalendarDays className="h-5 w-5 shrink-0" />
              <span className="flex-1 min-w-0 truncate">Event planner</span>
              {events.length > 0 && (
                <span className="text-xs text-content-muted tabular-nums">{events.length}</span>
              )}
            </button>

            <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Shopping lists
            </div>

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('recipist:shopping-lists'))}
              className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-left transition-colors hover:bg-surface-2"
            >
              <List className="h-5 w-5 shrink-0" />
              <span className="flex-1 min-w-0 truncate">Shopping lists</span>
              <span className="text-xs text-content-muted tabular-nums">
                {shoppingLists.length}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Pinned to the bottom of the sidebar — always visible while the list above scrolls */}
      <div className="shrink-0 border-t border-line p-2">
        <button
          className="btn-ghost w-full justify-start text-sm"
          onClick={() => window.dispatchEvent(new CustomEvent('recipist:new-category'))}
        >
          <Plus size={16} /> New category
        </button>
      </div>
    </nav>
  )

  const brand = (
    <a
      href="./"
      onClick={(e) => {
        e.preventDefault()
        goHome()
      }}
      aria-label="The Recipe App — home"
      className="h-14 flex items-center gap-2 px-4 border-b border-line shrink-0 text-content no-underline cursor-pointer"
    >
      <TomatoLogo className="h-7 w-7 shrink-0" />
      <span className="font-bold tracking-tight truncate">The Recipe App</span>
    </a>
  )

  return (
    <>
      {/* docked pane (tablet / desktop) */}
      <aside className="hidden md:flex md:w-64 shrink-0 border-r border-line bg-surface-2 flex-col print-hidden">
        {brand}
        {nav}
      </aside>

      {/* drawer (phone) */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 print-hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => toggleSidebar(false)} />
          <div className="absolute inset-y-0 left-0 w-[17rem] max-w-[82vw] bg-surface-2 border-r border-line flex flex-col animate-slide-in safe-top safe-bottom">
            {brand}
            {nav}
          </div>
        </div>
      )}
    </>
  )
}

function NavRow({
  label,
  count,
  active,
  color,
  onClick,
  trailing,
}: {
  label: string
  count: number
  active: boolean
  color: string
  onClick: () => void
  /** optional icon shown between the label and the count */
  trailing?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-left transition-colors',
        active ? 'bg-surface-3 font-semibold' : 'hover:bg-surface-3',
      )}
    >
      <span className="h-7 w-7 shrink-0 rounded-lg" style={{ backgroundColor: color, opacity: 0.9 }} aria-hidden />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {trailing}
      <span className="text-xs text-content-muted tabular-nums">{count}</span>
    </button>
  )
}
