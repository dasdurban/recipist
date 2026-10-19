import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, UtensilsCrossed } from 'lucide-react'
import type { Category } from '../types'
import { useApp } from '../store/useApp'
import { allRecipesColor, colorFor, favoritesColor, prefersLightText } from '../lib/colors'
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
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const [query, setQuery] = useState('')
  const [colorOpen, setColorOpen] = useState(false)

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
    return searched
  }, [recipes, category, favoritesOnly, query])

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

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search these recipes…"
          className="w-full pl-9"
        />
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
          {shown.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} color={hex} />
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
