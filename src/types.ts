/**
 * The Recipe App domain types.
 * Everything is stored locally in IndexedDB and can be exported as one JSON doc.
 */

export type ColorSet = 'vivid' | 'pastel'

export type ColorName =
  | 'black'
  | 'grey'
  | 'blue'
  | 'pink'
  | 'green'
  | 'yellow'
  | 'red'
  | 'orange'
  | 'turquoise'
  | 'purple'
  | 'brown'

export interface Category {
  id: string
  name: string
  colorName: ColorName
  colorSet: ColorSet
  /** smallest recipes-first ordering index */
  order: number
  createdAt: number
  updatedAt: number
}

export interface Ingredient {
  id: string
  /** the text exactly as written, e.g. "1 1/2 cups all-purpose flour" */
  raw: string
  /** parsed food name used for nutrition lookup, e.g. "all-purpose flour" */
  name: string
  quantity?: number
  unit?: string
  /** optional grouping header, e.g. "For the sauce" */
  section?: string
}

export interface NutritionEstimate {
  /** kcal for the whole recipe as entered */
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  /** how many ingredients matched the nutrition database */
  matched: number
  total: number
  /** 0 (unhealthy) .. 100 (very healthy) */
  score: number
  rating: 'excellent' | 'good' | 'fair' | 'poor'
  computedAt: number
}

export interface ShoppingListItem {
  id: string
  name: string
  quantity?: number
  unit?: string
  raw?: string
  section?: string
  checked: boolean
  checkedAt?: number
}

export interface ShoppingList {
  id: string
  name: string
  /** source recipe this was generated from, if any */
  recipeId?: string
  items: ShoppingListItem[]
  createdAt: number
  updatedAt: number
}

/** An event in the Event Planner (a dinner party, holiday meal, BBQ…). */
export interface EventPlan {
  id: string
  name: string
  /** optional ISO date (yyyy-mm-dd) the event takes place on */
  date?: string
  createdAt: number
  updatedAt: number
}

/** A recipe included in an event's recipe section. */
export interface EventRecipeLink {
  id: string
  eventId: string
  recipeId: string
  addedAt: number
}

/**
 * One row of an event's shopping list (Event Planner column 1).
 * Auto rows are derived from the event's recipes' ingredients (key = the
 * normalized ingredient name); manual rows are added by the user (key = '').
 */
export interface EventShoppingItem {
  id: string
  eventId: string
  /** normalized ingredient name for auto rows, '' for manual rows */
  key: string
  name: string
  quantity?: number
  unit?: string
  raw?: string
  manual: boolean
  checked: boolean
  createdAt: number
}

/** Pantry flag for one auto ingredient of an event (Event Planner column 2). */
export interface EventIngredientCheck {
  id: string // `${eventId}:${key}`
  eventId: string
  key: string
  /** user already has this in the pantry → hidden from the shopping list */
  pantry: boolean
}

/** A to-do item of an event (Event Planner column 3). */
export interface EventTodo {
  id: string
  eventId: string
  text: string
  checked: boolean
  createdAt: number
}

export interface Recipe {
  id: string
  categoryId: string
  title: string
  description?: string
  /** data URL of the finished-dish / chosen photo */
  photo?: string
  servings?: number
  prepMinutes?: number
  cookMinutes?: number
  /** e.g. "1 pan", "9x13 in" */
  yieldText?: string
  ingredients: Ingredient[]
  instructions: string[]
  notes?: string
  sourceUrl?: string
  tags: string[]
  favorite?: boolean
  nutrition?: NutritionEstimate
  createdAt: number
  updatedAt: number
}

export type ThemeMode = 'light' | 'dark' | 'system'

/** How a list of things is laid out — shared by the Event planner and Shopping lists pages. */
export type ViewMode = 'cards' | 'list' | 'preview'

/** Layout of the events list on the Event planner page. */
export type PlannerView = ViewMode

export type SyncProvider =
  | 'none'
  | 'webdav'
  | 'icloud'
  | 'onedrive'
  | 'googledrive'
  | 'dropbox'
  | 'owncloud'

export interface WebDavConfig {
  url: string
  username: string
  password: string
  /** remote folder, e.g. /the-recipe-app */
  directory: string
}

export interface OAuthClientConfig {
  clientId: string
  /** only needed by providers that use a confidential client */
  clientSecret?: string
}

export interface Settings {
  id: 'settings'
  theme: ThemeMode
  /** default palette applied to newly created categories */
  defaultColorSet: ColorSet
  /** color of the built-in "All recipes" view (not a real category) */
  allRecipesColorName: ColorName
  allRecipesColorSet: ColorSet
  /** color of the built-in "Favorites" view (not a real category) */
  favoritesColorName: ColorName
  favoritesColorSet: ColorSet
  /** color of the Event planner title box */
  plannerColorName: ColorName
  plannerColorSet: ColorSet
  /** how the events are laid out on the Event planner page */
  plannerView: PlannerView
  /** how the shopping lists are laid out on the Shopping lists page */
  shoppingView: ViewMode
  /** show the left nav as a drawer on small screens; on desktop it is docked */
  sidebarCollapsed: boolean
  /** CORS proxy used when importing recipes from the web */
  importProxy: string
  /** optional 3rd-party nutrition API key (unused by default, offline DB is used) */
  nutritionApiKey?: string
  syncProvider: SyncProvider
  webdav: WebDavConfig
  oauth: Partial<Record<'icloud' | 'onedrive' | 'googledrive' | 'dropbox', OAuthClientConfig>>
  autoSync: boolean
  lastSyncAt?: number
}

export interface BackupFile {
  app: 'recipist' | 'the-recipe-app'
  version: number
  exportedAt: number
  settings: Settings
  categories: Category[]
  recipes: Recipe[]
  shoppingLists: ShoppingList[]
  // Event Planner data (optional so older backups still load)
  events?: EventPlan[]
  eventRecipes?: EventRecipeLink[]
  eventShoppingItems?: EventShoppingItem[]
  eventIngredientChecks?: EventIngredientCheck[]
  eventTodos?: EventTodo[]
}
