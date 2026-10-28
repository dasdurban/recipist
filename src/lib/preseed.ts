import type { BackupFile } from '../types'
import { DEFAULT_SETTINGS, db } from '../db/database'

/**
 * Fills an empty database from the seed shipped beside the app.
 *
 * This is how a Store build, an Apple build, a Linux package or a future mobile
 * build starts with the same content: the seed is plain JSON served from the
 * app's own assets, so every platform reads it the same way. Copying IndexedDB
 * files only ever worked on Chromium (WebView2); WKWebView and Android's WebView
 * store them differently and would ignore the copy.
 *
 * The JSON is fetched rather than imported, so a 6 MB seed costs nothing at
 * startup on the installs that already have content - which is all of them
 * after the first run.
 *
 * It is deliberately a no-op once there is any content. Seeding only decides
 * what a *fresh* install starts with; it must never overwrite what a person has
 * since added, and it must not resurrect recipes they deleted.
 *
 * Returns true when the seed was applied.
 */
export async function seedFromBundledBackup(): Promise<boolean> {
  // Checked before the fetch on purpose: an install that has been used must not
  // pay to read and parse a 6 MB seed on every launch just to throw it away.
  const [existingCategories, existingRecipes] = await Promise.all([
    db.categories.count(),
    db.recipes.count(),
  ])
  if (existingCategories > 0 || existingRecipes > 0) return false

  let seed: Partial<BackupFile>
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}preseed.json`, { cache: 'no-store' })
    if (!response.ok) return false
    seed = (await response.json()) as Partial<BackupFile>
  } catch {
    // No seed shipped, or it could not be read. A fresh install then falls back
    // to the starter categories and sample recipe.
    return false
  }

  if (!seed || !Array.isArray(seed.categories) || !Array.isArray(seed.recipes)) return false

  await db.transaction(
    'rw',
    [
      db.categories,
      db.recipes,
      db.shoppingLists,
      db.settings,
      db.events,
      db.eventRecipes,
      db.eventShoppingItems,
      db.eventIngredientChecks,
      db.eventTodos,
      db.recipeOrders,
      db.mealPlans,
      db.mealPlanEntries,
      db.mealPlanShoppingItems,
      db.mealPlanIngredientChecks,
      db.mealPlanTodos,
    ],
    async () => {
      await db.categories.bulkPut(seed.categories ?? [])
      await db.recipes.bulkPut(seed.recipes ?? [])
      if (seed.shoppingLists?.length) await db.shoppingLists.bulkPut(seed.shoppingLists)
      if (seed.events?.length) await db.events.bulkPut(seed.events)
      if (seed.eventRecipes?.length) await db.eventRecipes.bulkPut(seed.eventRecipes)
      if (seed.eventShoppingItems?.length) {
        await db.eventShoppingItems.bulkPut(seed.eventShoppingItems)
      }
      if (seed.eventIngredientChecks?.length) {
        await db.eventIngredientChecks.bulkPut(seed.eventIngredientChecks)
      }
      if (seed.eventTodos?.length) await db.eventTodos.bulkPut(seed.eventTodos)
      if (seed.recipeOrders?.length) await db.recipeOrders.bulkPut(seed.recipeOrders)
      if (seed.mealPlans?.length) await db.mealPlans.bulkPut(seed.mealPlans)
      if (seed.mealPlanEntries?.length) await db.mealPlanEntries.bulkPut(seed.mealPlanEntries)
      if (seed.mealPlanShoppingItems?.length) {
        await db.mealPlanShoppingItems.bulkPut(seed.mealPlanShoppingItems)
      }
      if (seed.mealPlanIngredientChecks?.length) {
        await db.mealPlanIngredientChecks.bulkPut(seed.mealPlanIngredientChecks)
      }
      if (seed.mealPlanTodos?.length) await db.mealPlanTodos.bulkPut(seed.mealPlanTodos)
      if (seed.settings) {
        await db.settings.put({ ...DEFAULT_SETTINGS, ...seed.settings, id: 'settings' })
      }
    },
  )

  return true
}
