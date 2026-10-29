import { create } from 'zustand'
import type {
  Category,
  ColorName,
  ColorSet,
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
  MealSlot,
  Recipe,
  RecipeOrder,
  ShoppingList,
  ShoppingListItem,
  Settings,
  ThemeMode,
} from '../types'
import { db, DEFAULT_SETTINGS, loadSettings, saveSettings, uid } from '../db/database'
import { pickColorForName } from '../lib/colors'
import { combineIngredients } from '../lib/combineIngredients'
import { ordersForView } from '../lib/recipeOrder'
import { remoteImageToDataUrl } from '../lib/ocr'
import { playTimerDing, primeTimerAudio } from '../lib/timerSound'
import { broadcastTimer, type TimerSnapshot } from '../lib/timerSync'
import { windowLabel } from '../lib/native'

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

function mondayOf(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function defaultMealPlanName(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'New meal plan'
  return `Week of ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

interface AppState {
  ready: boolean
  categories: Category[]
  recipes: Recipe[]
  /** Hand-placed positions, per view. Most recipes have no row here. */
  recipeOrders: RecipeOrder[]
  shoppingLists: ShoppingList[]
  settings: Settings

  // event planner
  events: EventPlan[]
  eventRecipes: EventRecipeLink[]
  eventShoppingItems: EventShoppingItem[]
  eventIngredientChecks: EventIngredientCheck[]
  eventTodos: EventTodo[]

  // meal planner (weekly)
  mealPlans: MealPlan[]
  mealPlanEntries: MealPlanEntry[]
  mealPlanShoppingItems: MealPlanShoppingItem[]
  mealPlanIngredientChecks: MealPlanIngredientCheck[]
  mealPlanTodos: MealPlanTodo[]

  // navigation
  activeCategoryId: string | null
  activeRecipeId: string | null
  activeShoppingListId: string | null
  activeEventId: string | null
  activeMealPlanId: string | null
  sidebarOpen: boolean
  settingsOpen: boolean

  toasts: Toast[]

  // kitchen timer — lives in the store so it keeps counting while the panel is closed
  timerDuration: number // seconds, last configured duration
  timerRemaining: number // seconds left on the countdown
  timerRunning: boolean
  timerEndsAt: number | null // epoch ms when running (authoritative for accuracy)
  timerDone: boolean // reached zero
  /** Window that last set the timer — only it rings, so a detached panel stays quiet. */
  timerOwner: string

  init: () => Promise<void>
  refresh: () => Promise<void>

  // categories
  setActiveCategory: (id: string | null) => void
  openRecipe: (id: string) => void
  closeRecipe: () => void
  toggleSidebar: (open?: boolean) => void
  setSettingsOpen: (open: boolean) => void

  // timer
  setTimerDuration: (seconds: number) => void
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void

  createCategory: (
    name: string,
    opts?: { colorSet?: ColorSet; colorName?: ColorName },
  ) => Promise<Category>
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>

  // recipes
  saveRecipe: (recipe: Recipe) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  /**
   * Records the arrangement of one view.
   *
   * `orderedIds` is the full visible order, not just the recipe that moved:
   * pinning every visible recipe is what stops the rest of the list reshuffling
   * underneath the one the user placed.
   */
  reorderRecipes: (viewId: string, orderedIds: string[]) => Promise<void>
  /** Clears every hand-placed position in one view, back to newest-first. */
  resetRecipeOrder: (viewId: string) => Promise<void>
  /** Copies every photo that still lives on a website into the app itself. */
  savePhotosLocally: () => Promise<void>

  // settings
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>

  // shopping lists
  setActiveShoppingList: (id: string | null) => void
  openShoppingList: (id: string) => void
  closeShoppingList: () => void
  createShoppingList: (name: string) => Promise<ShoppingList>
  generateShoppingListFromRecipe: (recipeId: string) => Promise<ShoppingList>
  updateShoppingList: (id: string, patch: Partial<ShoppingList>) => Promise<void>
  deleteShoppingList: (id: string) => Promise<void>
  toggleShoppingListItem: (listId: string, itemId: string) => Promise<void>
  /** Set several of one list's items at once — used by the combined "Everything
   *  needed" view, where one row stands for items in several lists. */
  setShoppingListItemsChecked: (listId: string, itemIds: string[], checked: boolean) => Promise<void>
  addShoppingListItem: (listId: string, item: Partial<ShoppingListItem>) => Promise<void>
  deleteShoppingListItem: (listId: string, itemId: string) => Promise<void>

  // event planner
  setActiveEvent: (id: string | null) => void
  createEvent: (name: string, date?: string) => Promise<EventPlan>
  updateEvent: (id: string, patch: Partial<EventPlan>) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  addEventRecipe: (eventId: string, recipeId: string) => Promise<void>
  removeEventRecipe: (linkId: string) => Promise<void>
  syncEventShoppingItems: (eventId: string) => Promise<void>
  toggleEventPantry: (eventId: string, key: string) => Promise<void>
  toggleEventShoppingItem: (itemId: string) => Promise<void>
  setEventShoppingItemsChecked: (itemIds: string[], checked: boolean) => Promise<void>
  addEventShoppingItem: (
    eventId: string,
    item: { name: string; quantity?: number; unit?: string; raw?: string },
  ) => Promise<void>
  deleteEventShoppingItem: (itemId: string) => Promise<void>
  addEventTodo: (eventId: string, text: string) => Promise<void>
  toggleEventTodo: (todoId: string) => Promise<void>
  deleteEventTodo: (todoId: string) => Promise<void>

  // meal planner (weekly)
  setActiveMealPlan: (id: string | null) => void
  createMealPlan: (name: string, weekStart: string) => Promise<MealPlan>
  updateMealPlan: (id: string, patch: Partial<MealPlan>) => Promise<void>
  deleteMealPlan: (id: string) => Promise<void>
  addMealPlanEntry: (mealPlanId: string, recipeId: string, day: number, slot: MealSlot) => Promise<void>
  removeMealPlanEntry: (entryId: string) => Promise<void>
  syncMealPlanShoppingItems: (mealPlanId: string) => Promise<void>
  toggleMealPlanPantry: (mealPlanId: string, key: string) => Promise<void>
  toggleMealPlanShoppingItem: (itemId: string) => Promise<void>
  setMealPlanShoppingItemsChecked: (itemIds: string[], checked: boolean) => Promise<void>
  addMealPlanShoppingItem: (
    mealPlanId: string,
    item: { name: string; quantity?: number; unit?: string; raw?: string },
  ) => Promise<void>
  deleteMealPlanShoppingItem: (itemId: string) => Promise<void>
  addMealPlanTodo: (mealPlanId: string, text: string) => Promise<void>
  toggleMealPlanTodo: (todoId: string) => Promise<void>
  deleteMealPlanTodo: (todoId: string) => Promise<void>

  importData: (data: {
    categories: Category[]
    recipes: Recipe[]
    shoppingLists?: ShoppingList[]
    settings?: Settings
    events?: EventPlan[]
    eventRecipes?: EventRecipeLink[]
    eventShoppingItems?: EventShoppingItem[]
    eventIngredientChecks?: EventIngredientCheck[]
    eventTodos?: EventTodo[]
    recipeOrders?: RecipeOrder[]
    mealPlans?: MealPlan[]
    mealPlanEntries?: MealPlanEntry[]
    mealPlanShoppingItems?: MealPlanShoppingItem[]
    mealPlanIngredientChecks?: MealPlanIngredientCheck[]
    mealPlanTodos?: MealPlanTodo[]
  }, mode: 'merge' | 'replace') => Promise<void>

  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

function sortCategories(cats: Category[]): Category[] {
  return [...cats].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

function sortLists(lists: ShoppingList[]): ShoppingList[] {
  return [...lists].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
}

// Singleton countdown ticker so the timer keeps running even when the panel is
// closed (state lives in the store; this interval only advances it). The timer
// can also live in its own window: both windows run this same ticker off the
// shared `endsAt` instant and post control changes to each other.
let timerHandle: ReturnType<typeof setInterval> | null = null
/** True once this window has dealt with the finish of the current run. */
let timerSettled = false

function stopTicker() {
  if (timerHandle !== null) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

/** Runs the countdown while the store says it is running. */
function armTicker() {
  stopTicker()
  const st = useApp.getState()
  if (!st.timerRunning || st.timerEndsAt === null) return
  const ends = st.timerEndsAt
  if (ends <= Date.now()) {
    settleTimer()
    return
  }
  timerHandle = setInterval(() => {
    const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
    if (left <= 0) settleTimer()
    else useApp.setState({ timerRemaining: left })
  }, 500)
}

/** Reached zero: mark it done, tell the other windows, and ring if it is ours. */
function settleTimer() {
  if (timerSettled) return
  timerSettled = true
  stopTicker()
  const st = useApp.getState()
  useApp.setState({ timerRunning: false, timerEndsAt: null, timerRemaining: 0, timerDone: true })
  if (st.timerOwner === windowLabel()) playTimerDing()
  st.toast('Timer finished — time’s up!', 'error')
  broadcastTimer()
}

/** The timer fields, as they are shared with the other windows. */
export function timerSnapshot(): TimerSnapshot {
  const s = useApp.getState()
  return {
    duration: s.timerDuration,
    remaining: s.timerRemaining,
    running: s.timerRunning,
    endsAt: s.timerEndsAt,
    done: s.timerDone,
    owner: s.timerOwner,
  }
}

/** Applies the timer state another window broadcast. */
export function applyTimerSnapshot(snapshot: TimerSnapshot): void {
  const wasRunning = useApp.getState().timerRunning
  stopTicker()
  useApp.setState({
    timerDuration: snapshot.duration,
    timerRemaining: snapshot.remaining,
    timerRunning: snapshot.running,
    timerEndsAt: snapshot.endsAt,
    timerDone: snapshot.done,
    timerOwner: snapshot.owner,
  })
  if (snapshot.running) {
    // A run is under way (possibly a fresh one), so arm the countdown again.
    timerSettled = false
    armTicker()
  } else if (snapshot.done && wasRunning) {
    // A run that was counting down has finished: settle it here too. This is a
    // no-op if this window has already dealt with it, so the alarm stays one
    // ring rather than a duet.
    settleTimer()
  }
}

/**
 * The photo sweep in flight, so the two calls at boot (React mounts effects
 * twice in development) share one run instead of racing each other. Cleared
 * when it finishes, so an import later in the session can start a fresh one.
 */
let photoSweep: Promise<void> | null = null

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  categories: [],
  recipes: [],
  recipeOrders: [],
  shoppingLists: [],
  settings: DEFAULT_SETTINGS,

  events: [],
  eventRecipes: [],
  eventShoppingItems: [],
  eventIngredientChecks: [],
  eventTodos: [],

  mealPlans: [],
  mealPlanEntries: [],
  mealPlanShoppingItems: [],
  mealPlanIngredientChecks: [],
  mealPlanTodos: [],

  activeCategoryId: null,
  activeRecipeId: null,
  activeShoppingListId: null,
  activeEventId: null,
  activeMealPlanId: null,
  sidebarOpen: false,
  settingsOpen: false,
  timerDuration: 0,
  timerRemaining: 0,
  timerRunning: false,
  timerEndsAt: null,
  timerDone: false,
  timerOwner: windowLabel(),
  toasts: [],

  async init() {
    const [settings, categories, recipes, orders, lists, events, eventRecipes, eventItems, eventChecks, eventTodos, mealPlans, mealPlanEntries, mealPlanItems, mealPlanChecks, mealPlanTodos] =
      await Promise.all([
        loadSettings(),
        db.categories.toArray(),
        db.recipes.toArray(),
        db.recipeOrders.toArray(),
        db.shoppingLists.toArray(),
        db.events.toArray(),
        db.eventRecipes.toArray(),
        db.eventShoppingItems.toArray(),
        db.eventIngredientChecks.toArray(),
        db.eventTodos.toArray(),
        db.mealPlans.toArray(),
        db.mealPlanEntries.toArray(),
        db.mealPlanShoppingItems.toArray(),
        db.mealPlanIngredientChecks.toArray(),
        db.mealPlanTodos.toArray(),
      ])
    set({
      settings,
      categories: sortCategories(categories),
      recipes: recipes.sort((a, b) => b.updatedAt - a.updatedAt),
      recipeOrders: orders,
      shoppingLists: sortLists(lists),
      events: events.sort((a, b) => b.createdAt - a.createdAt),
      eventRecipes,
      eventShoppingItems: eventItems,
      eventIngredientChecks: eventChecks,
      eventTodos,
      mealPlans: mealPlans.sort((a, b) => b.createdAt - a.createdAt),
      mealPlanEntries,
      mealPlanShoppingItems: mealPlanItems,
      mealPlanIngredientChecks: mealPlanChecks,
      mealPlanTodos,
      ready: true,
    })
    applyTheme(settings.theme)
  },

  async refresh() {
    const [categories, recipes, orders, lists, events, eventRecipes, eventItems, eventChecks, eventTodos, mealPlans, mealPlanEntries, mealPlanItems, mealPlanChecks, mealPlanTodos] =
      await Promise.all([
        db.categories.toArray(),
        db.recipes.toArray(),
        db.recipeOrders.toArray(),
        db.shoppingLists.toArray(),
        db.events.toArray(),
        db.eventRecipes.toArray(),
        db.eventShoppingItems.toArray(),
        db.eventIngredientChecks.toArray(),
        db.eventTodos.toArray(),
        db.mealPlans.toArray(),
        db.mealPlanEntries.toArray(),
        db.mealPlanShoppingItems.toArray(),
        db.mealPlanIngredientChecks.toArray(),
        db.mealPlanTodos.toArray(),
      ])
    set({
      categories: sortCategories(categories),
      recipes: recipes.sort((a, b) => b.updatedAt - a.updatedAt),
      recipeOrders: orders,
      shoppingLists: sortLists(lists),
      events: events.sort((a, b) => b.createdAt - a.createdAt),
      eventRecipes,
      eventShoppingItems: eventItems,
      eventIngredientChecks: eventChecks,
      eventTodos,
      mealPlans: mealPlans.sort((a, b) => b.createdAt - a.createdAt),
      mealPlanEntries,
      mealPlanShoppingItems: mealPlanItems,
      mealPlanIngredientChecks: mealPlanChecks,
      mealPlanTodos,
    })
  },

  setActiveCategory(id) {
    set({
      activeCategoryId: id,
      activeRecipeId: null,
      activeShoppingListId: null,
      activeEventId: null,
      activeMealPlanId: null,
      sidebarOpen: false,
    })
  },
  openRecipe(id) {
    set({ activeRecipeId: id, activeShoppingListId: null, activeEventId: null, activeMealPlanId: null, sidebarOpen: false })
  },
  closeRecipe() {
    set({ activeRecipeId: null })
  },
  setActiveShoppingList(id) {
    set({
      activeShoppingListId: id,
      activeCategoryId: null,
      activeRecipeId: null,
      activeEventId: null,
      sidebarOpen: false,
    })
  },
  setActiveEvent(id) {
    set({ activeEventId: id, sidebarOpen: false })
  },
  setActiveMealPlan(id) {
    set({ activeMealPlanId: id, sidebarOpen: false })
  },
  openShoppingList(id) {
    set({ activeShoppingListId: id, sidebarOpen: false })
  },
  closeShoppingList() {
    set({ activeShoppingListId: null })
  },
  toggleSidebar(open) {
    set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen }))
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open })
  },

  async createCategory(name, opts) {
    const now = Date.now()
    const set2 = opts?.colorSet ?? get().settings.defaultColorSet
    const category: Category = {
      id: uid('cat_'),
      name: name.trim(),
      colorSet: set2,
      colorName: opts?.colorName ?? pickColorForName(name, set2),
      order: get().categories.length,
      createdAt: now,
      updatedAt: now,
    }
    await db.categories.put(category)
    await get().refresh()
    return category
  },

  async updateCategory(id, patch) {
    await db.categories.update(id, { ...patch, updatedAt: Date.now() })
    await get().refresh()
  },

  async deleteCategory(id) {
    // A recipe can be in several categories, so deleting one only removes that
    // membership. Recipes left with no category at all are deleted, as before.
    const affected = (await db.recipes.where('categoryIds').equals(id).toArray()) as Recipe[]
    const remaining = new Map<string, string[]>()
    const orphanedIds: string[] = []
    for (const recipe of affected) {
      const otherIds = recipe.categoryIds.filter((cid) => cid !== id)
      if (otherIds.length) remaining.set(recipe.id, otherIds)
      else orphanedIds.push(recipe.id)
    }
    const listIds = orphanedIds.length
      ? ((await db.shoppingLists.where('recipeId').anyOf(orphanedIds).primaryKeys()) as string[])
      : []
    await db.transaction('rw', db.categories, db.recipes, db.shoppingLists, async () => {
      for (const [recipeId, categoryIds] of remaining) {
        await db.recipes.update(recipeId, { categoryIds, updatedAt: Date.now() })
      }
      if (orphanedIds.length) {
        await db.recipes.bulkDelete(orphanedIds)
        // derived shopping lists go with their recipes
        await db.shoppingLists.where('recipeId').anyOf(orphanedIds).delete()
      }
      await db.categories.delete(id)
    })
    set((s) => ({
      activeCategoryId: s.activeCategoryId === id ? null : s.activeCategoryId,
      activeRecipeId: orphanedIds.includes(s.activeRecipeId ?? '') ? null : s.activeRecipeId,
      activeShoppingListId:
        s.activeShoppingListId && listIds.includes(s.activeShoppingListId)
          ? null
          : s.activeShoppingListId,
    }))
    await get().refresh()
  },

  async reorderCategories(orderedIds) {
    await db.transaction('rw', db.categories, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.categories.update(orderedIds[i], { order: i })
      }
    })
    await get().refresh()
  },

  async saveRecipe(recipe) {
    const next = { ...recipe, updatedAt: Date.now() }
    await db.recipes.put(next)
    await get().refresh()
  },

  async reorderRecipes(viewId, orderedIds) {
    const byId = new Map(get().recipes.map((recipe) => [recipe.id, recipe]))
    const visible = orderedIds
      .map((id) => byId.get(id))
      .filter((recipe): recipe is Recipe => Boolean(recipe))
    if (visible.length === 0) return

    const rows = ordersForView(visible, get().recipeOrders, viewId)
    await db.transaction('rw', db.recipeOrders, async () => {
      await db.recipeOrders.bulkPut(rows)
    })
    await get().refresh()
  },

  async resetRecipeOrder(viewId) {
    await db.recipeOrders.where('viewId').equals(viewId).delete()
    await get().refresh()
  },

  async savePhotosLocally() {
    if (!get().recipes.some((r) => r.photo && /^https?:/i.test(r.photo))) return
    photoSweep ??= (async () => {
      let saved = 0
      for (const recipe of get().recipes) {
        const url = recipe.photo
        if (!url || !/^https?:/i.test(url)) continue
        const dataUrl = await remoteImageToDataUrl(url, get().settings.importProxy)
        if (!dataUrl) continue
        // The recipe may have been edited or deleted while the photo downloaded.
        if (get().recipes.find((r) => r.id === recipe.id)?.photo !== url) continue
        await db.recipes.update(recipe.id, { photo: dataUrl })
        set((s) => ({
          recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, photo: dataUrl } : r)),
        }))
        saved += 1
      }
      if (saved > 0) {
        get().toast(
          saved === 1 ? 'Saved 1 photo into the app.' : `Saved ${saved} photos into the app.`,
          'success',
        )
      }
    })().finally(() => {
      photoSweep = null
    })
    return photoSweep
  },

  async deleteRecipe(id) {
    const listIds = (await db.shoppingLists.where('recipeId').equals(id).primaryKeys()) as string[]
    // events that included this recipe (their shopping list needs a resync)
    const eventLinks = await db.eventRecipes.where('recipeId').equals(id).toArray()
    const eventIds = [...new Set(eventLinks.map((l) => l.eventId))]
    await db.transaction(
      'rw',
      db.recipes,
      db.shoppingLists,
      db.eventRecipes,
      db.eventShoppingItems,
      db.eventIngredientChecks,
      async () => {
        await db.recipes.delete(id)
        // Shopping lists generated from this recipe are derived data — remove them
        // too, so their ingredients don't linger in the combined ingredients view.
        await db.shoppingLists.where('recipeId').equals(id).delete()
        // same for the recipe's link in any event planner event
        await db.eventRecipes.where('recipeId').equals(id).delete()
      },
    )
    for (const eventId of eventIds) await get().syncEventShoppingItems(eventId)
    set((s) => ({
      activeRecipeId: s.activeRecipeId === id ? null : s.activeRecipeId,
      activeShoppingListId:
        s.activeShoppingListId && listIds.includes(s.activeShoppingListId)
          ? null
          : s.activeShoppingListId,
    }))
    await get().refresh()
  },

  async toggleFavorite(id) {
    const recipe = get().recipes.find((r) => r.id === id)
    if (!recipe) return
    await db.recipes.update(id, { favorite: !recipe.favorite })
    await get().refresh()
  },

  async updateSettings(patch) {
    const next = { ...get().settings, ...patch }
    await saveSettings(next)
    set({ settings: next })
    applyTheme(next.theme)
  },

  async setTheme(theme) {
    await get().updateSettings({ theme })
  },

  async createShoppingList(name) {
    const now = Date.now()
    const list: ShoppingList = {
      id: uid('shop_'),
      name: name.trim(),
      items: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.shoppingLists.put(list)
    await get().refresh()
    return list
  },

  async generateShoppingListFromRecipe(recipeId) {
    const recipe = get().recipes.find((r) => r.id === recipeId)
    if (!recipe) throw new Error('Recipe not found.')
    const now = Date.now()
    const items: ShoppingListItem[] = recipe.ingredients.map((ing) => ({
      id: uid('shopi_'),
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      raw: ing.raw,
      section: ing.section,
      checked: false,
    }))
    const list: ShoppingList = {
      id: uid('shop_'),
      name: recipe.title,
      recipeId: recipe.id,
      items,
      createdAt: now,
      updatedAt: now,
    }
    await db.shoppingLists.put(list)
    await get().refresh()
    get().toast(`Shopping list “${list.name}” created.`, 'success')
    return list
  },

  async updateShoppingList(id, patch) {
    await db.shoppingLists.update(id, { ...patch, updatedAt: Date.now() })
    await get().refresh()
  },

  async deleteShoppingList(id) {
    await db.shoppingLists.delete(id)
    set((s) => ({ activeShoppingListId: s.activeShoppingListId === id ? null : s.activeShoppingListId }))
    await get().refresh()
  },

  async toggleShoppingListItem(listId, itemId) {
    const list = get().shoppingLists.find((l) => l.id === listId)
    const item = list?.items.find((i) => i.id === itemId)
    if (!list || !item) return
    await db.transaction('rw', db.shoppingLists, async () => {
      await db.shoppingLists.update(listId, {
        items: list.items.map((i) => {
          if (i.id !== itemId) return i
          const next: ShoppingListItem = { ...i, checked: !i.checked }
          if (next.checked) next.checkedAt = Date.now()
          else next.checkedAt = undefined
          return next
        }),
        updatedAt: Date.now(),
      })
    })
    await get().refresh()
  },

  /**
   * Sets the checked state of several items of one list in a single write —
   * used by the combined \"Everything needed\" list, where one row can stand for
   * the same ingredient in several lists at once.
   */
  async setShoppingListItemsChecked(listId, itemIds, checked) {
    const list = get().shoppingLists.find((l) => l.id === listId)
    if (!list) return
    const ids = new Set(itemIds)
    if (!list.items.some((i) => ids.has(i.id) && i.checked !== checked)) return
    const now = Date.now()
    await db.shoppingLists.update(listId, {
      items: list.items.map((i) => {
        if (!ids.has(i.id) || i.checked === checked) return i
        return { ...i, checked, checkedAt: checked ? now : undefined }
      }),
      updatedAt: now,
    })
    await get().refresh()
  },

  async addShoppingListItem(listId, item) {
    const list = get().shoppingLists.find((l) => l.id === listId)
    if (!list) return
    const now = Date.now()
    const next: ShoppingListItem = {
      id: uid('shopi_'),
      name: item.name ?? '',
      quantity: item.quantity,
      unit: item.unit,
      raw: item.raw,
      section: item.section,
      checked: false,
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
    }
    await db.shoppingLists.update(listId, {
      items: [...list.items, next],
      updatedAt: now,
    })
    await get().refresh()
  },

  async deleteShoppingListItem(listId, itemId) {
    const list = get().shoppingLists.find((l) => l.id === listId)
    if (!list) return
    await db.shoppingLists.update(listId, {
      items: list.items.filter((i) => i.id !== itemId),
      updatedAt: Date.now(),
    })
    await get().refresh()
  },

  // --------------------------------------------------------- event planner

  async createEvent(name, date) {
    const now = Date.now()
    const event: EventPlan = {
      id: uid('evt_'),
      name: name.trim() || 'New event',
      date: date || undefined,
      createdAt: now,
      updatedAt: now,
    }
    await db.events.put(event)
    set({ activeEventId: event.id })
    await get().refresh()
    return event
  },

  async updateEvent(id, patch) {
    await db.events.update(id, { ...patch, updatedAt: Date.now() })
    await get().refresh()
  },

  async deleteEvent(id) {
    await db.transaction(
      'rw',
      db.events,
      db.eventRecipes,
      db.eventShoppingItems,
      db.eventIngredientChecks,
      db.eventTodos,
      async () => {
        await db.eventRecipes.where('eventId').equals(id).delete()
        await db.eventShoppingItems.where('eventId').equals(id).delete()
        await db.eventIngredientChecks.where('eventId').equals(id).delete()
        await db.eventTodos.where('eventId').equals(id).delete()
        await db.events.delete(id)
      },
    )
    set((s) => ({ activeEventId: s.activeEventId === id ? null : s.activeEventId }))
    await get().refresh()
  },

  async addEventRecipe(eventId, recipeId) {
    const existing = await db.eventRecipes
      .where('[eventId+recipeId]')
      .equals([eventId, recipeId])
      .count()
    if (existing > 0) return
    await db.eventRecipes.put({ id: uid('evtr_'), eventId, recipeId, addedAt: Date.now() })
    await get().syncEventShoppingItems(eventId)
    await get().refresh()
  },

  async removeEventRecipe(linkId) {
    const link = await db.eventRecipes.get(linkId)
    if (!link) return
    await db.eventRecipes.delete(linkId)
    await get().syncEventShoppingItems(link.eventId)
    await get().refresh()
  },

  /**
   * Keeps an event's automatic shopping rows in sync with the ingredients of
   * its recipes: adds rows for new ingredients, updates the combined label when
   * quantities change, and removes rows for ingredients no longer needed or now
   * flagged "in pantry". Manual rows are untouched.
   */
  async syncEventShoppingItems(eventId) {
    const links = await db.eventRecipes.where('eventId').equals(eventId).toArray()
    const recipeIds = links.map((l) => l.recipeId)
    const recipes = recipeIds.length ? await db.recipes.where('id').anyOf(recipeIds).toArray() : []

    // combine similar ingredients across the event's recipes (sums quantities)
    const wanted = combineIngredients(recipes)

    const [rows, checks] = await Promise.all([
      db.eventShoppingItems.where('eventId').equals(eventId).toArray(),
      db.eventIngredientChecks.where('eventId').equals(eventId).toArray(),
    ])
    const pantryKeys = new Set(checks.filter((c) => c.pantry).map((c) => c.key))
    const autoRows = rows.filter((r) => !r.manual)

    const toDelete: string[] = []
    for (const row of autoRows) {
      if (!wanted.some((w) => w.key === row.key) || pantryKeys.has(row.key)) toDelete.push(row.id)
    }
    const now = Date.now()
    const toPut: EventShoppingItem[] = []
    for (const ing of wanted) {
      if (pantryKeys.has(ing.key)) continue
      const existing = autoRows.find((r) => r.key === ing.key)
      if (!existing) {
        toPut.push({
          id: uid('evti_'),
          eventId,
          key: ing.key,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          raw: ing.label,
          manual: false,
          checked: false,
          createdAt: now,
        })
      } else if (
        existing.raw !== ing.label ||
        existing.name !== ing.name ||
        existing.quantity !== ing.quantity ||
        existing.unit !== ing.unit
      ) {
        // quantities were combined differently now — refresh the row's label
        toPut.push({ ...existing, name: ing.name, quantity: ing.quantity, unit: ing.unit, raw: ing.label })
      }
    }
    if (!toDelete.length && !toPut.length) return
    await db.transaction('rw', db.eventShoppingItems, async () => {
      if (toDelete.length) await db.eventShoppingItems.bulkDelete(toDelete)
      if (toPut.length) await db.eventShoppingItems.bulkPut(toPut)
    })
  },

  async toggleEventPantry(eventId, key) {
    const id = `${eventId}:${key}`
    const existing = await db.eventIngredientChecks.get(id)
    const pantry = !existing?.pantry
    if (existing) await db.eventIngredientChecks.update(id, { pantry })
    else await db.eventIngredientChecks.put({ id, eventId, key, pantry })
    // the sync adds the auto row back (pantry off) or removes it (pantry on)
    await get().syncEventShoppingItems(eventId)
    await get().refresh()
  },

  async toggleEventShoppingItem(itemId) {
    const item = await db.eventShoppingItems.get(itemId)
    if (!item) return
    await db.eventShoppingItems.update(itemId, { checked: !item.checked })
    await get().refresh()
  },

  /** Sets the checked state of several event shopping rows in one write — used
   *  by the combined \"Everything needed\" list. */
  async setEventShoppingItemsChecked(itemIds, checked) {
    if (!itemIds.length) return
    const rows = await db.eventShoppingItems.bulkGet(itemIds)
    const changed = rows.filter((r) => r && r.checked !== checked).map((r) => ({ ...r!, checked }))
    if (!changed.length) return
    await db.eventShoppingItems.bulkPut(changed)
    await get().refresh()
  },

  async addEventShoppingItem(eventId, item) {
    await db.eventShoppingItems.put({
      id: uid('evti_'),
      eventId,
      key: '',
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      raw: item.raw ?? item.name,
      manual: true,
      checked: false,
      createdAt: Date.now(),
    })
    await get().refresh()
  },

  async deleteEventShoppingItem(itemId) {
    await db.eventShoppingItems.delete(itemId)
    await get().refresh()
  },

  async addEventTodo(eventId, text) {
    await db.eventTodos.put({
      id: uid('evtt_'),
      eventId,
      text: text.trim(),
      checked: false,
      createdAt: Date.now(),
    })
    await get().refresh()
  },

  async toggleEventTodo(todoId) {
    const todo = await db.eventTodos.get(todoId)
    if (!todo) return
    await db.eventTodos.update(todoId, { checked: !todo.checked })
    await get().refresh()
  },

  async deleteEventTodo(todoId) {
    await db.eventTodos.delete(todoId)
    await get().refresh()
  },

  // --------------------------------------------------------- meal planner (weekly)

  async createMealPlan(name, weekStart) {
    const now = Date.now()
    const plan: MealPlan = {
      id: uid('mpl_'),
      name: name.trim() || defaultMealPlanName(weekStart),
      weekStart: weekStart || mondayOf(new Date()),
      createdAt: now,
      updatedAt: now,
    }
    await db.mealPlans.put(plan)
    set({ activeMealPlanId: plan.id })
    await get().refresh()
    return plan
  },

  async updateMealPlan(id, patch) {
    await db.mealPlans.update(id, { ...patch, updatedAt: Date.now() })
    await get().refresh()
  },

  async deleteMealPlan(id) {
    await db.transaction(
      'rw',
      db.mealPlans,
      db.mealPlanEntries,
      db.mealPlanShoppingItems,
      db.mealPlanIngredientChecks,
      db.mealPlanTodos,
      async () => {
        await db.mealPlanEntries.where('mealPlanId').equals(id).delete()
        await db.mealPlanShoppingItems.where('mealPlanId').equals(id).delete()
        await db.mealPlanIngredientChecks.where('mealPlanId').equals(id).delete()
        await db.mealPlanTodos.where('mealPlanId').equals(id).delete()
        await db.mealPlans.delete(id)
      },
    )
    set((s) => ({ activeMealPlanId: s.activeMealPlanId === id ? null : s.activeMealPlanId }))
    await get().refresh()
  },

  async addMealPlanEntry(mealPlanId, recipeId, day, slot) {
    const existing = await db.mealPlanEntries
      .where('[mealPlanId+recipeId]')
      .equals([mealPlanId, recipeId])
      .toArray()
    if (existing.some((e) => e.day === day && e.slot === slot)) return
    await db.mealPlanEntries.put({ id: uid('mple_'), mealPlanId, recipeId, day, slot, addedAt: Date.now() })
    await get().syncMealPlanShoppingItems(mealPlanId)
    await get().refresh()
  },

  async removeMealPlanEntry(entryId) {
    const entry = await db.mealPlanEntries.get(entryId)
    if (!entry) return
    await db.mealPlanEntries.delete(entryId)
    await get().syncMealPlanShoppingItems(entry.mealPlanId)
    await get().refresh()
  },

  async syncMealPlanShoppingItems(mealPlanId) {
    const entries = await db.mealPlanEntries.where('mealPlanId').equals(mealPlanId).toArray()
    const recipeIds = [...new Set(entries.map((e) => e.recipeId))]
    const recipes = recipeIds.length ? await db.recipes.where('id').anyOf(recipeIds).toArray() : []

    const wanted = combineIngredients(recipes)

    const [rows, checks] = await Promise.all([
      db.mealPlanShoppingItems.where('mealPlanId').equals(mealPlanId).toArray(),
      db.mealPlanIngredientChecks.where('mealPlanId').equals(mealPlanId).toArray(),
    ])
    const pantryKeys = new Set(checks.filter((c) => c.pantry).map((c) => c.key))
    const autoRows = rows.filter((r) => !r.manual)

    const toDelete: string[] = []
    for (const row of autoRows) {
      if (!wanted.some((w) => w.key === row.key) || pantryKeys.has(row.key)) toDelete.push(row.id)
    }
    const now = Date.now()
    const toPut: MealPlanShoppingItem[] = []
    for (const ing of wanted) {
      if (pantryKeys.has(ing.key)) continue
      const existing = autoRows.find((r) => r.key === ing.key)
      if (!existing) {
        toPut.push({
          id: uid('mpli_'),
          mealPlanId,
          key: ing.key,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          raw: ing.label,
          manual: false,
          checked: false,
          createdAt: now,
        })
      } else if (
        existing.raw !== ing.label ||
        existing.name !== ing.name ||
        existing.quantity !== ing.quantity ||
        existing.unit !== ing.unit
      ) {
        toPut.push({ ...existing, name: ing.name, quantity: ing.quantity, unit: ing.unit, raw: ing.label })
      }
    }
    if (!toDelete.length && !toPut.length) return
    await db.transaction('rw', db.mealPlanShoppingItems, async () => {
      if (toDelete.length) await db.mealPlanShoppingItems.bulkDelete(toDelete)
      if (toPut.length) await db.mealPlanShoppingItems.bulkPut(toPut)
    })
  },

  async toggleMealPlanPantry(mealPlanId, key) {
    const id = `${mealPlanId}:${key}`
    const existing = await db.mealPlanIngredientChecks.get(id)
    const pantry = !existing?.pantry
    if (existing) await db.mealPlanIngredientChecks.update(id, { pantry })
    else await db.mealPlanIngredientChecks.put({ id, mealPlanId, key, pantry })
    await get().syncMealPlanShoppingItems(mealPlanId)
    await get().refresh()
  },

  async toggleMealPlanShoppingItem(itemId) {
    const item = await db.mealPlanShoppingItems.get(itemId)
    if (!item) return
    await db.mealPlanShoppingItems.update(itemId, { checked: !item.checked })
    await get().refresh()
  },

  async setMealPlanShoppingItemsChecked(itemIds, checked) {
    if (!itemIds.length) return
    const rows = await db.mealPlanShoppingItems.bulkGet(itemIds)
    const changed = rows.filter((r) => r && r.checked !== checked).map((r) => ({ ...r!, checked }))
    if (!changed.length) return
    await db.mealPlanShoppingItems.bulkPut(changed)
    await get().refresh()
  },

  async addMealPlanShoppingItem(mealPlanId, item) {
    await db.mealPlanShoppingItems.put({
      id: uid('mpli_'),
      mealPlanId,
      key: '',
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      raw: item.raw ?? item.name,
      manual: true,
      checked: false,
      createdAt: Date.now(),
    })
    await get().refresh()
  },

  async deleteMealPlanShoppingItem(itemId) {
    await db.mealPlanShoppingItems.delete(itemId)
    await get().refresh()
  },

  async addMealPlanTodo(mealPlanId, text) {
    await db.mealPlanTodos.put({
      id: uid('mplt_'),
      mealPlanId,
      text: text.trim(),
      checked: false,
      createdAt: Date.now(),
    })
    await get().refresh()
  },

  async toggleMealPlanTodo(todoId) {
    const todo = await db.mealPlanTodos.get(todoId)
    if (!todo) return
    await db.mealPlanTodos.update(todoId, { checked: !todo.checked })
    await get().refresh()
  },

  async deleteMealPlanTodo(todoId) {
    await db.mealPlanTodos.delete(todoId)
    await get().refresh()
  },

  async importData(data, mode) {
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
        if (mode === 'replace') {
          await Promise.all([
            db.categories.clear(),
            db.recipes.clear(),
            db.shoppingLists.clear(),
            db.events.clear(),
            db.eventRecipes.clear(),
            db.eventShoppingItems.clear(),
            db.eventIngredientChecks.clear(),
            db.eventTodos.clear(),
            db.recipeOrders.clear(),
            db.mealPlans.clear(),
            db.mealPlanEntries.clear(),
            db.mealPlanShoppingItems.clear(),
            db.mealPlanIngredientChecks.clear(),
            db.mealPlanTodos.clear(),
          ])
        }
        await db.categories.bulkPut(data.categories)
        await db.recipes.bulkPut(data.recipes)
        if (data.shoppingLists) await db.shoppingLists.bulkPut(data.shoppingLists)
        if (data.events) await db.events.bulkPut(data.events)
        if (data.eventRecipes) await db.eventRecipes.bulkPut(data.eventRecipes)
        if (data.eventShoppingItems) await db.eventShoppingItems.bulkPut(data.eventShoppingItems)
        if (data.eventIngredientChecks) {
          await db.eventIngredientChecks.bulkPut(data.eventIngredientChecks)
        }
        if (data.eventTodos) await db.eventTodos.bulkPut(data.eventTodos)
        if (data.recipeOrders) await db.recipeOrders.bulkPut(data.recipeOrders)
        if (data.mealPlans) await db.mealPlans.bulkPut(data.mealPlans)
        if (data.mealPlanEntries) await db.mealPlanEntries.bulkPut(data.mealPlanEntries)
        if (data.mealPlanShoppingItems) await db.mealPlanShoppingItems.bulkPut(data.mealPlanShoppingItems)
        if (data.mealPlanIngredientChecks) {
          await db.mealPlanIngredientChecks.bulkPut(data.mealPlanIngredientChecks)
        }
        if (data.mealPlanTodos) await db.mealPlanTodos.bulkPut(data.mealPlanTodos)
        if (data.settings && mode === 'replace') {
          await db.settings.put({ ...data.settings, id: 'settings' })
        }
      },
    )
    await get().refresh()
    if (mode === 'replace' && data.settings) {
      set({ settings: { ...DEFAULT_SETTINGS, ...data.settings } })
      applyTheme(data.settings.theme)
    }
    // A backup can carry photos that still point at websites — pull those in too.
    void get().savePhotosLocally()
  },

  toast(message, tone = 'info') {
    const id = uid('toast_')
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  // timer
  setTimerDuration(seconds: number) {
    const s = Math.max(0, Math.floor(seconds))
    stopTicker()
    timerSettled = false
    set({
      timerDuration: s,
      timerRemaining: s,
      timerRunning: false,
      timerEndsAt: null,
      timerDone: s === 0,
      timerOwner: windowLabel(),
    })
    broadcastTimer()
  },
  startTimer() {
    const st = get()
    if (st.timerRunning) return
    // This runs inside the click that starts the timer, so it is the one
    // chance to unlock audio. Without it the alarm fires later with no gesture
    // in flight and can be refused by the autoplay policy.
    primeTimerAudio()
    const dur = st.timerDuration || st.timerRemaining || 0
    if (dur === 0 && st.timerRemaining === 0) {
      set({ timerDone: true })
      broadcastTimer()
      return
    }
    const rem = st.timerRemaining > 0 ? st.timerRemaining : dur
    timerSettled = false
    set({
      timerDuration: dur || rem,
      timerRemaining: rem,
      timerRunning: true,
      timerEndsAt: Date.now() + rem * 1000,
      timerDone: false,
      timerOwner: windowLabel(),
    })
    armTicker()
    broadcastTimer()
  },
  pauseTimer() {
    if (!get().timerRunning) return
    const st = get()
    const rem =
      st.timerEndsAt !== null
        ? Math.max(0, Math.ceil((st.timerEndsAt - Date.now()) / 1000))
        : st.timerRemaining
    stopTicker()
    set({
      timerRunning: false,
      timerEndsAt: null,
      timerRemaining: rem,
      timerOwner: windowLabel(),
    })
    broadcastTimer()
  },
  resetTimer() {
    stopTicker()
    timerSettled = false
    set({
      timerRunning: false,
      timerEndsAt: null,
      timerRemaining: get().timerDuration,
      timerDone: false,
      timerOwner: windowLabel(),
    })
    broadcastTimer()
  },

}))

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0b1220' : '#0f766e')
}

/** Ingredient item helpers shared by UI components. */
export function itemLabel(item: ShoppingListItem): string {
  if (item.raw && item.raw.trim()) return item.raw.trim()
  const parts: string[] = []
  if (item.quantity !== undefined && item.quantity > 0) parts.push(String(item.quantity))
  if (item.unit) parts.push(item.unit)
  parts.push(item.name)
  return parts.join(' ').trim()
}
