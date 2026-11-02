import type { BackupFile } from '../types'
import { DEFAULT_SETTINGS, db } from '../db/database'

/**
 * Fills an empty database from the seed shipped inside the app.
 *
 * This is how a Store build, an Apple build, a Linux package or a future mobile
 * build starts with the same content: the seed is plain JSON bundled with the
 * frontend, so every platform reads it the same way. Copying IndexedDB files
 * only ever worked on Chromium (WebView2); WKWebView and Android's WebView
 * store them differently and would ignore the copy.
 *
 * The JSON is loaded with a dynamic import rather than fetched. On macOS the
 * webview refuses `fetch()` on the `tauri://` scheme, which is why earlier
 * builds seeded only the sample recipe on a fresh Mac. Module loading is the
 * same path the rest of the app uses, so it works on macOS, Windows and Linux.
 * The import is lazy, so an install that already has content never reads or
 * parses the 6 MB seed.
 *
 * It is deliberately a no-op once there is any content. Seeding only decides
 * what a *fresh* install starts with; it must never overwrite what a person has
 * since added, and it must not resurrect recipes they deleted.
 *
 * Returns true when the seed was applied.
 */
export async function seedFromBundledBackup(): Promise<boolean> {
  // Checked before the import on purpose: an install that has been used must
  // not pay to read and parse a 6 MB seed on every launch just to throw it away.
  const [existingCategories, existingRecipes] = await Promise.all([
    db.categories.count(),
    db.recipes.count(),
  ])
  if (existingCategories > 0 || existingRecipes > 0) return false

  let seed: Partial<BackupFile>
  try {
    const { default: raw } = await import('../assets/preseed.json?raw')
    seed = JSON.parse(raw) as Partial<BackupFile>
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
      db.mealPlanTemplates,
      db.mealPlanTemplateEntries,
      db.mealPlanTemplateTodos,
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
      if (seed.mealPlanTemplates?.length) await db.mealPlanTemplates.bulkPut(seed.mealPlanTemplates)
      if (seed.mealPlanTemplateEntries?.length) {
        await db.mealPlanTemplateEntries.bulkPut(seed.mealPlanTemplateEntries)
      }
      if (seed.mealPlanTemplateTodos?.length) {
        await db.mealPlanTemplateTodos.bulkPut(seed.mealPlanTemplateTodos)
      }
      if (seed.settings) {
        await db.settings.put({ ...DEFAULT_SETTINGS, ...seed.settings, id: 'settings' })
      }
    },
  )

  return true
}
