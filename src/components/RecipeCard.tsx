import { Clock, Heart } from 'lucide-react'
import type { Recipe } from '../types'
import { useApp } from '../store/useApp'
import { HealthScore } from './ui/NutritionBadge'

export function RecipeCard({ recipe, color }: { recipe: Recipe; color: string }) {
  const openRecipe = useApp((s) => s.openRecipe)
  const toggleFavorite = useApp((s) => s.toggleFavorite)

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  const health =
    recipe.nutrition && recipe.nutrition.matched > 0 && Number.isFinite(recipe.nutrition.score)
      ? recipe.nutrition
      : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openRecipe(recipe.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openRecipe(recipe.id)
        }
      }}
      className="card overflow-hidden text-left group hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <div className="relative aspect-[4/3] bg-surface-3 overflow-hidden">
        {recipe.photo ? (
          <img
            src={recipe.photo}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: `linear-gradient(135deg, ${color}55, ${color}1a 70%, ${color}0d)` }}
            aria-hidden
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(recipe.id)
          }}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
          aria-label={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart
            size={16}
            className={recipe.favorite ? 'fill-rose-500 text-rose-500' : 'text-white'}
          />
        </button>

        {/* health index, bottom-right, over a soft scrim so it reads on any photo */}
        {health && (
          <div className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 backdrop-blur px-1 py-1">
            <HealthScore nutrition={health} size={38} showLabel={false} />
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{recipe.title}</h3>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-content-muted">
          {totalMinutes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {totalMinutes} min
            </span>
          )}
          {recipe.nutrition && recipe.nutrition.matched > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    recipe.nutrition.rating === 'excellent'
                      ? '#059669'
                      : recipe.nutrition.rating === 'good'
                        ? '#65a30d'
                        : recipe.nutrition.rating === 'fair'
                          ? '#d97706'
                          : '#e11d48',
                }}
              />
              {Math.round(recipe.nutrition.calories / (recipe.servings || 1))} kcal
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
