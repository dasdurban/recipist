import type { Recipe } from '../types'

/** The minimum health score (0–100) for the "All healthy recipes" view. */
export const HEALTHY_SCORE = 60

/**
 * True when a recipe has a health score of 60 or more.
 *
 * A score is only meaningful when at least one ingredient matched the bundled
 * nutrition database. Recipes with no match would otherwise default to 50 and
 * never reach the healthy threshold, so they are excluded explicitly.
 */
export function isHealthyRecipe(recipe: Recipe): boolean {
  const nutrition = recipe.nutrition
  return Boolean(nutrition && nutrition.matched > 0 && nutrition.score >= HEALTHY_SCORE)
}
