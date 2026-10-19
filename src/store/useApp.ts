import { create } from 'zustand'
import type {
  Category,
  ColorSet,
  EventIngredientCheck,
  EventPlan,
  EventRecipeLink,
  EventShoppingItem,
  EventTodo,
  Recipe,
  ShoppingList,
  ShoppingListItem,
  Settings,
  ThemeMode,
} from '../types'
import { db, DEFAULT_SETTINGS, loadSettings, saveSettings, uid } from '../db/database'
import { pickColorForName } from '../lib/colors'
import { combineIngredients } from '../lib/combineIngredients'
import { playTimerDing } from '../lib/timerSound'

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

interface AppState {
  ready: boolean
  categories: Category[]
  recipes: Recipe[]
  shoppingLists: ShoppingList[]
  settings: Settings

  // event planner
  events: EventPlan[]
  eventRecipes: EventRecipeLink[]
  eventShoppingItems: EventShoppingItem[]
  eventIngredientChecks: EventIngredientCheck[]
  eventTodos: EventTodo[]

  // navigation
  activeCategoryId: string | null
  activeRecipeId: string | null
  activeShoppingListId: string | null
  activeEventId: string | null
  sidebarOpen: boolean
  settingsOpen: boolean

  toasts: Toast[]

  // kitchen timer — lives in the store so it keeps counting while the panel is closed
  timerDuration: number // seconds, last configured duration
  timerRemaining: number // seconds left on the countdown
  timerRunning: boolean
  timerEndsAt: number | null // epoch ms when running (authoritative for accuracy)
  timerDone: boolean // reached zero

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

  createCategory: (name: string, opts?: { colorSet?: ColorSet }) => Promise<Category>
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>

  // recipes
  saveRecipe: (recipe: Recipe) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>

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
// closed (state lives in the store; this interval only advances it).
let timerHandle: ReturnType<typeof setInterval> | null = null
function stopTicker() {
  if (timerHandle !== null) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  categories: [],
  recipes: [],
  shoppingLists: [],
  settings: DEFAULT_SETTINGS,

  events: [],
  eventRecipes: [],
  eventShoppingItems: [],
  eventIngredientChecks: [],
  eventTodos: [],

  activeCategoryId: null,
  activeRecipeId: null,
  activeShoppingListId: null,
  activeEventId: null,
  sidebarOpen: false,
  settingsOpen: false,
  timerDuration: 0,
  timerRemaining: 0,
  timerRunning: false,
  timerEndsAt: null,
  timerDone: false,
  toasts: [],

  async init() {
    const [settings, categories, recipes, lists, events, eventRecipes, eventItems, eventChecks, eventTodos] =
      await Promise.all([
        loadSettings(),
        db.categories.toArray(),
        db.recipes.toArray(),
        db.shoppingLists.toArray(),
        db.events.toArray(),
        db.eventRecipes.toArray(),
        db.eventShoppingItems.toArray(),
        db.eventIngredientChecks.toArray(),
        db.eventTodos.toArray(),
      ])
    set({
      settings,
      categories: sortCategories(categories),
      recipes: recipes.sort((a, b) => b.updatedAt - a.updatedAt),
      shoppingLists: sortLists(lists),
      events: events.sort((a, b) => b.createdAt - a.createdAt),
      eventRecipes,
      eventShoppingItems: eventItems,
      eventIngredientChecks: eventChecks,
      eventTodos,
      ready: true,
    })
    applyTheme(settings.theme)
  },

  async refresh() {
    const [categories, recipes, lists, events, eventRecipes, eventItems, eventChecks, eventTodos] =
      await Promise.all([
        db.categories.toArray(),
        db.recipes.toArray(),
        db.shoppingLists.toArray(),
        db.events.toArray(),
        db.eventRecipes.toArray(),
        db.eventShoppingItems.toArray(),
        db.eventIngredientChecks.toArray(),
        db.eventTodos.toArray(),
      ])
    set({
      categories: sortCategories(categories),
      recipes: recipes.sort((a, b) => b.updatedAt - a.updatedAt),
      shoppingLists: sortLists(lists),
      events: events.sort((a, b) => b.createdAt - a.createdAt),
      eventRecipes,
      eventShoppingItems: eventItems,
      eventIngredientChecks: eventChecks,
      eventTodos,
    })
  },

  setActiveCategory(id) {
    set({
      activeCategoryId: id,
      activeRecipeId: null,
      activeShoppingListId: null,
      activeEventId: null,
      sidebarOpen: false,
    })
  },
  openRecipe(id) {
    set({ activeRecipeId: id, activeShoppingListId: null, activeEventId: null, sidebarOpen: false })
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
      colorName: pickColorForName(name, set2),
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
    const recipeIds = (await db.recipes.where('categoryId').equals(id).primaryKeys()) as string[]
    const listIds = recipeIds.length
      ? ((await db.shoppingLists.where('recipeId').anyOf(recipeIds).primaryKeys()) as string[])
      : []
    await db.transaction('rw', db.categories, db.recipes, db.shoppingLists, async () => {
      if (recipeIds.length) {
        await db.recipes.bulkDelete(recipeIds)
        // derived shopping lists go with their recipes
        await db.shoppingLists.where('recipeId').anyOf(recipeIds).delete()
      }
      await db.categories.delete(id)
    })
    set((s) => ({
      activeCategoryId: s.activeCategoryId === id ? null : s.activeCategoryId,
      activeRecipeId: recipeIds.includes(s.activeRecipeId ?? '') ? null : s.activeRecipeId,
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
    set({
      timerDuration: s,
      timerRemaining: s,
      timerRunning: false,
      timerEndsAt: null,
      timerDone: s === 0,
    })
  },
  startTimer() {
    const st = get()
    if (st.timerRunning) return
    const dur = st.timerDuration || st.timerRemaining || 0
    if (dur === 0 && st.timerRemaining === 0) {
      set({ timerDone: true })
      return
    }
    const now = Date.now()
    const rem = st.timerRemaining > 0 ? st.timerRemaining : dur
    const ends = now + rem * 1000
    stopTicker()
    timerHandle = setInterval(() => {
      const n = Date.now()
      const left = Math.max(0, Math.ceil((ends - n) / 1000))
      if (left <= 0) {
        stopTicker()
        set({ timerRunning: false, timerEndsAt: null, timerRemaining: 0, timerDone: true })
        playTimerDing()
        get().toast('Timer finished — time’s up!', 'error')
      } else {
        set({ timerRemaining: left })
      }
    }, 500)
    set({
      timerDuration: dur || rem,
      timerRemaining: rem,
      timerRunning: true,
      timerEndsAt: ends,
      timerDone: false,
    })
  },
  pauseTimer() {
    if (!get().timerRunning) return
    stopTicker()
    const st = get()
    let rem = st.timerRemaining
    if (st.timerEndsAt !== null) {
      rem = Math.max(0, Math.ceil((st.timerEndsAt - Date.now()) / 1000))
    }
    set({ timerRunning: false, timerEndsAt: null, timerRemaining: rem })
  },
  resetTimer() {
    stopTicker()
    const dur = get().timerDuration
    set({
      timerRunning: false,
      timerEndsAt: null,
      timerRemaining: dur,
      timerDone: false,
    })
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
