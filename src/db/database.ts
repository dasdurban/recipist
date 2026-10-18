import Dexie, { type Table } from 'dexie'
import type {
  Category,
  EventIngredientCheck,
  EventPlan,
  EventRecipeLink,
  EventShoppingItem,
  EventTodo,
  Recipe,
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
