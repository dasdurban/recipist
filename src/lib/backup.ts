import type {
  BackupFile,
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
import { db } from '../db/database'
import { DEFAULT_SETTINGS } from '../db/database'

export const BACKUP_VERSION = 1

export async function createBackup(settings: Settings): Promise<BackupFile> {
  const [
    categories,
    recipes,
    lists,
    events,
    eventRecipes,
    eventShoppingItems,
    eventIngredientChecks,
    eventTodos,
  ] = await Promise.all([
    db.categories.toArray(),
    db.recipes.toArray(),
    db.shoppingLists.toArray(),
    db.events.toArray(),
    db.eventRecipes.toArray(),
    db.eventShoppingItems.toArray(),
    db.eventIngredientChecks.toArray(),
    db.eventTodos.toArray(),
  ])
  return {
    app: 'the-recipe-app',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    settings: { ...settings, id: 'settings' },
    categories,
    recipes,
    shoppingLists: lists,
    events,
    eventRecipes,
    eventShoppingItems,
    eventIngredientChecks,
    eventTodos,
  }
}

export function backupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

export function fileNameFor(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `the-recipe-app-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}.json`
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([backupToJson(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameFor()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface ParsedBackup {
  backup: BackupFile
  stats: { categories: number; recipes: number; shoppingLists: number }
}

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const text = await file.text()
  return parseBackupText(text)
}

export function parseBackupText(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const obj = data as Partial<BackupFile>
  if (
    !obj ||
    (obj.app !== 'recipist' && obj.app !== 'the-recipe-app') ||
    !Array.isArray(obj.recipes) ||
    !Array.isArray(obj.categories)
  ) {
    throw new Error('This does not look like a backup from The Recipe App.')
  }
  const categories = obj.categories as Category[]
  const recipes = (obj.recipes as Recipe[]).map((r) => ({ ...r, tags: r.tags ?? [] }))
  const lists = (obj.shoppingLists as ShoppingList[] | undefined) ?? []
  return {
    backup: {
      app: 'the-recipe-app',
      version: obj.version ?? BACKUP_VERSION,
      exportedAt: obj.exportedAt ?? Date.now(),
      settings: { ...DEFAULT_SETTINGS, ...(obj.settings as Settings | undefined) },
      categories,
      recipes,
      shoppingLists: lists,
      // Event Planner data (absent in backups made before the planner existed)
      events: (obj.events as EventPlan[] | undefined) ?? [],
      eventRecipes: (obj.eventRecipes as EventRecipeLink[] | undefined) ?? [],
      eventShoppingItems: (obj.eventShoppingItems as EventShoppingItem[] | undefined) ?? [],
      eventIngredientChecks: (obj.eventIngredientChecks as EventIngredientCheck[] | undefined) ?? [],
      eventTodos: (obj.eventTodos as EventTodo[] | undefined) ?? [],
    },
    stats: { categories: categories.length, recipes: recipes.length, shoppingLists: lists.length },
  }
}
