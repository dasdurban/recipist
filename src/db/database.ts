import Dexie, { type Table } from 'dexie'
import type {
  Category,
  EventIngredientCheck,
  EventPlan,
  EventRecipeLink,
  EventShoppingItem,
  EventTodo,
  MealPlan,
  MealPlanEntry,
  MealPlanIngredientCheck,
  MealPlanShoppingItem,
  MealPlanTodo,
  Recipe,
  RecipeOrder,
  Settings,
  ShoppingList,
} from '../types'

/**
 * Local-first store. IndexedDB via Dexie so the same code runs in the browser,
 * in Capacitor (iOS/Android/iPadOS) and in Tauri (desktop) without changes.
 */
export class RecipistDB extends Dexie {
  categories!: Table<Category, string>
  recipes!: Table<Recipe, string>
  shoppingLists!: Table<ShoppingList, string>
  settings!: Table<Settings, string>
  events!: Table<EventPlan, string>
  eventRecipes!: Table<EventRecipeLink, string>
  eventShoppingItems!: Table<EventShoppingItem, string>
  eventIngredientChecks!: Table<EventIngredientCheck, string>
  eventTodos!: Table<EventTodo, string>
  recipeOrders!: Table<RecipeOrder, string>
  mealPlans!: Table<MealPlan, string>
  mealPlanEntries!: Table<MealPlanEntry, string>
  mealPlanShoppingItems!: Table<MealPlanShoppingItem, string>
  mealPlanIngredientChecks!: Table<MealPlanIngredientCheck, string>
  mealPlanTodos!: Table<MealPlanTodo, string>

  constructor() {
    super('recipist')
    this.version(1).stores({
      categories: 'id, name, order, createdAt',
      recipes: 'id, categoryId, title, updatedAt, favorite, *tags',
      settings: 'id',
    })
    this.version(2).stores({
      categories: 'id, name, order, createdAt',
      recipes: 'id, categoryId, title, updatedAt, favorite, *tags',
      settings: 'id',
      shoppingLists: 'id, recipeId, createdAt, updatedAt',
    })
    this.version(3).stores({
      categories: 'id, name, order, createdAt',
      recipes: 'id, categoryId, title, updatedAt, favorite, *tags',
      settings: 'id',
      shoppingLists: 'id, recipeId, createdAt, updatedAt',
      events: 'id, name, createdAt',
      eventRecipes: 'id, eventId, recipeId, [eventId+recipeId]',
      eventShoppingItems: 'id, eventId, manual, checked, [eventId+key]',
      eventIngredientChecks: 'id, eventId, [eventId+key]',
      eventTodos: 'id, eventId, checked',
    })
    // Recipes can live in up to three categories at once, and the unused tag
    // field is gone. Existing records keep their original category as the first
    // entry of `categoryIds`.
    this.version(4)
      .stores({
        categories: 'id, name, order, createdAt',
        recipes: 'id, *categoryIds, title, updatedAt, favorite',
        settings: 'id',
        shoppingLists: 'id, recipeId, createdAt, updatedAt',
        events: 'id, name, createdAt',
        eventRecipes: 'id, eventId, recipeId, [eventId+recipeId]',
        eventShoppingItems: 'id, eventId, manual, checked, [eventId+key]',
        eventIngredientChecks: 'id, eventId, [eventId+key]',
        eventTodos: 'id, eventId, checked',
      })
      .upgrade((tx) =>
        tx
          .table('recipes')
          .toCollection()
          .modify((recipe: Record<string, unknown>) => {
            const existing = Array.isArray(recipe.categoryIds)
              ? recipe.categoryIds.filter((id): id is string => typeof id === 'string' && id !== '')
              : []
            const primary = typeof recipe.categoryId === 'string' ? recipe.categoryId : ''
            recipe.categoryIds = (existing.length ? existing : primary ? [primary] : []).slice(0, 3)
            delete recipe.categoryId
            delete recipe.tags
          }),
      )
    // Hand-placed recipe positions. Kept in their own table rather than on the
    // recipe itself, because a position only means something inside one view
    // and the homepage, Favorites and every category each have their own.
    this.version(5).stores({
      categories: 'id, name, order, createdAt',
      recipes: 'id, *categoryIds, title, updatedAt, favorite',
      settings: 'id',
      shoppingLists: 'id, recipeId, createdAt, updatedAt',
      events: 'id, name, createdAt',
      eventRecipes: 'id, eventId, recipeId, [eventId+recipeId]',
      eventShoppingItems: 'id, eventId, manual, checked, [eventId+key]',
      eventIngredientChecks: 'id, eventId, [eventId+key]',
      eventTodos: 'id, eventId, checked',
      recipeOrders: 'id, viewId, recipeId, [viewId+recipeId], [viewId+position]',
    })
    // Meal Planner: weekly meal plans with day/slot assignment, mirroring the
    // Event Planner's shopping list, pantry checks and to-do list.
    this.version(6).stores({
      categories: 'id, name, order, createdAt',
      recipes: 'id, *categoryIds, title, updatedAt, favorite',
      settings: 'id',
      shoppingLists: 'id, recipeId, createdAt, updatedAt',
      events: 'id, name, createdAt',
      eventRecipes: 'id, eventId, recipeId, [eventId+recipeId]',
      eventShoppingItems: 'id, eventId, manual, checked, [eventId+key]',
      eventIngredientChecks: 'id, eventId, [eventId+key]',
      eventTodos: 'id, eventId, checked',
      recipeOrders: 'id, viewId, recipeId, [viewId+recipeId], [viewId+position]',
      mealPlans: 'id, name, weekStart, createdAt',
      mealPlanEntries: 'id, mealPlanId, recipeId, [mealPlanId+recipeId], [mealPlanId+day], [mealPlanId+slot]',
      mealPlanShoppingItems: 'id, mealPlanId, manual, checked, [mealPlanId+key]',
      mealPlanIngredientChecks: 'id, mealPlanId, [mealPlanId+key]',
      mealPlanTodos: 'id, mealPlanId, checked',
    })
  }
}

export const db = new RecipistDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'system',
  defaultColorSet: 'vivid',
  allRecipesColorName: 'grey',
  allRecipesColorSet: 'vivid',
  favoritesColorName: 'red',
  favoritesColorSet: 'vivid',
  plannerColorName: 'purple',
  plannerColorSet: 'vivid',
  mealPlannerColorName: 'blue',
  mealPlannerColorSet: 'vivid',
  plannerView: 'cards',
  lastEventId: null,
  lastMealPlanId: null,
  shoppingView: 'cards',
  sidebarCollapsed: false,
  importProxy: 'https://api.allorigins.win/raw?url=',
  syncProvider: 'none',
  webdav: { url: '', username: '', password: '', directory: '/the-recipe-app' },
  oauth: {},
  autoSync: false,
}

export async function loadSettings(): Promise<Settings> {
  const existing = await db.settings.get('settings')
  if (existing) return { ...DEFAULT_SETTINGS, ...existing }
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put(settings)
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}${rand}`
}
