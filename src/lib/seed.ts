import type { Category, ColorName, ColorSet, Recipe } from '../types'
import { db } from '../db/database'
import { estimateNutrition, ingredientFromRaw } from './nutrition'

const DEFAULTS: Array<{ name: string; colorName: ColorName }> = [
  { name: 'Appetizers', colorName: 'orange' },
  { name: 'Breakfast', colorName: 'yellow' },
  { name: 'Lunch', colorName: 'green' },
  { name: 'Dinner', colorName: 'blue' },
  { name: 'Dessert', colorName: 'pink' },
]

// Single-flight guards: React StrictMode mounts effects twice in development,
// and two concurrent seeds would otherwise insert the samples twice.
let categoriesSeeded: Promise<void> | null = null
let sampleSeeded: Promise<void> | null = null

/** Creates the starter categories on a fresh install. */
export function seedIfEmpty(colorSet: ColorSet = 'vivid'): Promise<void> {
  categoriesSeeded ??= (async () => {
    const created = await db.transaction('rw', db.categories, async () => {
      const count = await db.categories.count()
      if (count > 0) return false
      const now = Date.now()
      const categories: Category[] = DEFAULTS.map((d, i) => ({
        // Deterministic ids keep this idempotent even if the guard is bypassed.
        id: `cat_seed_${d.name.toLowerCase()}`,
        name: d.name,
        colorName: d.colorName,
        colorSet,
        order: i,
        createdAt: now + i,
        updatedAt: now + i,
      }))
      await db.categories.bulkPut(categories)
      return true
    })
    void created
  })()
  return categoriesSeeded
}

/** A friendly sample so a brand new install is not an empty screen. */
export function seedSampleRecipeIfEmpty(): Promise<void> {
  sampleSeeded ??= (async () => {
    await db.transaction('rw', db.recipes, db.categories, async () => {
      const count = await db.recipes.count()
      if (count > 0) return
      const category = await db.categories.orderBy('order').first()
      if (!category) return
      await db.recipes.put(sampleRecipe(category.id))
    })
  })()
  return sampleSeeded
}

export function sampleRecipe(categoryId: string): Recipe {
  const now = Date.now()
  const raw = [
    '2 cups all-purpose flour',
    '1 tsp baking powder',
    '1/2 tsp salt',
    '2 large eggs',
    '1 1/2 cups whole milk',
    '2 tbsp butter, melted',
    '1 tbsp honey',
  ]
  const ingredients = raw.map((line) => ingredientFromRaw(line))
  const recipe: Recipe = {
    id: 'rec_seed_pancakes',
    categoryIds: categoryId ? [categoryId] : [],
    title: 'Everyday Pancakes',
    description: 'Fluffy, quick pancakes — a good place to start and easy to tweak.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    ingredients,
    instructions: [
      'Whisk the flour, baking powder and salt in a large bowl.',
      'In another bowl, beat the eggs, then stir in the milk, melted butter and honey.',
      'Pour the wet ingredients into the dry and stir until just combined — a few lumps are fine.',
      'Heat a lightly oiled pan over medium heat and pour 1/4 cup of batter per pancake.',
      'Cook until bubbles form, flip, and cook until golden. Serve warm.',
    ],
    createdAt: now,
    updatedAt: now,
  }
  recipe.nutrition = estimateNutrition(ingredients, recipe.servings)
  return recipe
}
