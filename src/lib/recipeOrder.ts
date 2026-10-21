/**
 * Hand-placed recipe order.
 *
 * A recipe can sit in several views at once (All recipes, Favorites, and up to
 * three categories), so a single position on the recipe would be wrong: pinning
 * something to the top of "Desserts" must not drag it to the top of the
 * homepage. Positions therefore live per view in their own table.
 *
 * Ordering is deliberately partial. Only recipes the user has actually moved
 * carry a position; everything else keeps the app's usual newest-first order and
 * sits below the placed ones. That keeps the list feeling alive — a new recipe
 * still appears at the top of the unplaced group — while the user's deliberate
 * choices stay put.
 */
import type { Recipe, RecipeOrder } from '../types'

/** The view id used by the homepage's "All recipes" grid. */
export const ALL_RECIPES_VIEW = 'all'

/** The view id used by the Favorites grid. */
export const FAVORITES_VIEW = 'favorites'

/** How far apart newly appended positions are placed when there is no neighbour. */
const STEP = 1000

/**
 * Sorts recipes for one view.
 *
 * Placed recipes come first in their saved order, then everything else in the
 * order it was handed in (the store keeps recipes newest-first). `orders` may
 * contain rows for other views; they are ignored.
 */
export function sortRecipesForView(
  recipes: Recipe[],
  orders: RecipeOrder[],
  viewId: string,
): Recipe[] {
  const positionFor = new Map<string, number>()
  for (const order of orders) {
    if (order.viewId === viewId) positionFor.set(order.recipeId, order.position)
  }
  if (positionFor.size === 0) return recipes

  const placed: Array<{ recipe: Recipe; position: number }> = []
  const rest: Recipe[] = []
  for (const recipe of recipes) {
    const position = positionFor.get(recipe.id)
    if (position === undefined) rest.push(recipe)
    else placed.push({ recipe, position })
  }
  placed.sort((a, b) => a.position - b.position || a.recipe.id.localeCompare(b.recipe.id))
  return [...placed.map((entry) => entry.recipe), ...rest]
}

/** The key for the table's rows, matching `[viewId+recipeId]` in the schema. */
export function orderId(viewId: string, recipeId: string): string {
  return `${viewId}:${recipeId}`
}

/**
 * The full set of rows to write when a view is reordered.
 *
 * Every recipe the user can see gets an explicit position. Writing the whole
 * view rather than just the moved recipe is what keeps the result stable: if
 * only the dragged one were pinned, the rest would keep reshuffling underneath
 * it as recipes were edited.
 *
 * Positions are assigned from `visible` order, one step apart, so the array the
 * caller hands in is what the view actually shows. An earlier version reused any
 * stored position and only filled in the missing ones, on the theory that a drop
 * should rewrite only what moved — but that made the argument meaningless:
 * recipes that already had positions kept them, so the new order was discarded
 * and the grid snapped back to what it was. Since this table exists purely to
 * express one view's order, the incoming order is the only sensible source.
 */
export function ordersForView(
  visible: Recipe[],
  orders: RecipeOrder[],
  viewId: string,
): RecipeOrder[] {
  // Nothing is carried over from `orders`; it is passed in only so callers do
  // not have to special-case the empty case, and so this signature stays
  // obviously symmetric with sortRecipesForView.
  void orders

  const now = Date.now()
  return visible.map((recipe, index) => ({
    id: orderId(viewId, recipe.id),
    viewId,
    recipeId: recipe.id,
    position: (index + 1) * STEP,
    updatedAt: now,
  }))
}
