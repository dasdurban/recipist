import { useEffect, useState } from 'react'
import type { Recipe } from './types'
import { useApp, applyTheme } from './store/useApp'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { CategoryPage } from './components/CategoryPage'
import { RecipeView } from './components/RecipeView'
import { emptyRecipe, RecipeEditor } from './components/RecipeEditor'
import { CategoryDialog } from './components/CategoryDialog'
import { ImportDialog } from './components/ImportDialog'
import { ShoppingListsPage } from './components/ShoppingListsPage'
import { ShoppingListView } from './components/ShoppingListView'
import { EventPlannerPage } from './components/EventPlannerPage'
import { SettingsPanel } from './components/SettingsPanel'
import { Confirm } from './components/ui/Confirm'
import { Toasts } from './components/ui/Toasts'
import { TomatoLogo } from './components/TomatoLogo'
import { seedIfEmpty, seedSampleRecipeIfEmpty } from './lib/seed'
import { DEFAULT_SETTINGS } from './db/database'
import { FAVORITES_ID } from './lib/nav'

export default function App() {
  const ready = useApp((s) => s.ready)
  const init = useApp((s) => s.init)
  const refresh = useApp((s) => s.refresh)
  const settings = useApp((s) => s.settings)
  const categories = useApp((s) => s.categories)
  const recipes = useApp((s) => s.recipes)
  const activeCategoryId = useApp((s) => s.activeCategoryId)
  const activeRecipeId = useApp((s) => s.activeRecipeId)
  const closeRecipe = useApp((s) => s.closeRecipe)
  const setActiveCategory = useApp((s) => s.setActiveCategory)
  const deleteRecipe = useApp((s) => s.deleteRecipe)
  const toast = useApp((s) => s.toast)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)

  const [editing, setEditing] = useState<Recipe | null>(null)
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category: string | null }>({
    open: false,
    category: null,
  })
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [shoppingListsOpen, setShoppingListsOpen] = useState(false)
  const [eventPlannerOpen, setEventPlannerOpen] = useState(false)
  const activeShoppingListId = useApp((s) => s.activeShoppingListId)

  // one unified back: editor → list detail → lists page → planner → recipe → category → home
  const canGoBack = Boolean(
    editing ||
      activeShoppingListId ||
      shoppingListsOpen ||
      eventPlannerOpen ||
      activeRecipeId ||
      activeCategoryId,
  )
  function goBack() {
    if (editing) {
      setEditing(null)
      return
    }
    if (activeShoppingListId) {
      useApp.setState({ activeShoppingListId: null }) // list detail → lists page
      return
    }
    if (shoppingListsOpen) {
      setShoppingListsOpen(false) // lists page → previous page (category/home)
      return
    }
    if (eventPlannerOpen) {
      setEventPlannerOpen(false) // planner → previous page (category/home)
      return
    }
    if (activeRecipeId) {
      closeRecipe()
      return
    }
    if (activeCategoryId) {
      setActiveCategory(null)
    }
  }

  // opening a recipe (e.g. from sidebar search) must exit the shopping lists pages
  useEffect(() => {
    if (activeRecipeId && shoppingListsOpen) setShoppingListsOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecipeId])

  // boot: open the database, create starter categories, apply the theme
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await init()
      await seedIfEmpty(DEFAULT_SETTINGS.defaultColorSet)
      await seedSampleRecipeIfEmpty()
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [init, refresh])

  // react to OS theme changes when following the system
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  // the sidebar's "New category" button
  useEffect(() => {
    const handler = () => setCategoryDialog({ open: true, category: null })
    window.addEventListener('recipist:new-category', handler)
    return () => window.removeEventListener('recipist:new-category', handler)
  }, [])

  // the brand in the nav pane links "home": close everything, show all recipes
  useEffect(() => {
    const handler = () => {
      setEditing(null)
      setImportOpen(false)
      setCategoryDialog({ open: false, category: null })
      setDeleteTarget(null)
      setSettingsOpen(false)
      setShoppingListsOpen(false)
      setEventPlannerOpen(false)
      useApp.getState().setActiveCategory(null)
    }
    window.addEventListener('recipist:home', handler)
    return () => window.removeEventListener('recipist:home', handler)
  }, [setSettingsOpen])

  // navigate to shopping lists view
  useEffect(() => {
    const handler = () => {
      setEditing(null)
      setImportOpen(false)
      setCategoryDialog({ open: false, category: null })
      setDeleteTarget(null)
      setSettingsOpen(false)
      setEventPlannerOpen(false)
      setShoppingListsOpen(true)
      useApp.setState({ activeShoppingListId: null }) // keep category/recipe context for back
    }
    window.addEventListener('recipist:shopping-lists', handler)
    return () => window.removeEventListener('recipist:shopping-lists', handler)
  }, [])

  // navigate to the event planner view; an optional eventId opens that event
  useEffect(() => {
    const handler = (e: Event) => {
      setEditing(null)
      setImportOpen(false)
      setCategoryDialog({ open: false, category: null })
      setDeleteTarget(null)
      setSettingsOpen(false)
      setShoppingListsOpen(false)
      setEventPlannerOpen(true)
      const eventId = (e as CustomEvent<{ eventId?: string }>).detail?.eventId ?? null
      useApp.getState().setActiveEvent(eventId)
    }
    window.addEventListener('recipist:event-planner', handler as EventListener)
    return () => window.removeEventListener('recipist:event-planner', handler as EventListener)
  }, [])

  // open a specific shopping list from the lists page
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      setShoppingListsOpen(true)
      setEventPlannerOpen(false)
      setEditing(null)
      setImportOpen(false)
      setCategoryDialog({ open: false, category: null })
      setDeleteTarget(null)
      setSettingsOpen(false)
      useApp.setState({ activeShoppingListId: customEvent.detail.id }) // keep context for back
    }
    window.addEventListener('recipist:open-shopping-list', handler as EventListener)
    return () => window.removeEventListener('recipist:open-shopping-list', handler as EventListener)
  }, [])

  // select a category from the sidebar (exits shopping lists view)
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      setShoppingListsOpen(false)
      setEventPlannerOpen(false)
      setEditing(null)
      setImportOpen(false)
      setCategoryDialog({ open: false, category: null })
      setDeleteTarget(null)
      setSettingsOpen(false)
      useApp.getState().setActiveCategory(customEvent.detail.id || null)
    }
    window.addEventListener('recipist:select-category', handler as EventListener)
    return () => window.removeEventListener('recipist:select-category', handler as EventListener)
  }, [])

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null
  const activeRecipe = recipes.find((r) => r.id === activeRecipeId) ?? null

  if (!ready) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-3">
        <TomatoLogo className="h-14 w-14 animate-pulse" />
        <p className="text-sm text-content-muted">Loading your recipes…</p>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-surface">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col h-full">
        <Header
          canGoBack={canGoBack}
          onBack={goBack}
          titleOverride={
            shoppingListsOpen && !activeShoppingListId
              ? 'Shopping lists'
              : eventPlannerOpen
                ? 'Event planner'
                : editing
                  ? 'Edit recipe'
                  : undefined
          }
        />

        <main className="flex-1 overflow-y-auto">
          {shoppingListsOpen ? activeShoppingListId ? (
            <ShoppingListView
              list={useApp.getState().shoppingLists.find((l) => l.id === activeShoppingListId)!}
              onClose={() => {
                useApp.setState({ activeShoppingListId: null }) // list detail → lists page (keep context)
              }}
            />
          ) : (
            <ShoppingListsPage />
          ) : eventPlannerOpen ? (
            <EventPlannerPage />
          ) : editing ? (
            <RecipeEditor
              recipe={editing}
              onClose={() => setEditing(null)}
              onSaved={(r) => {
                setEditing(null)
                useApp.getState().openRecipe(r.id)
              }}
            />
          ) : activeRecipe ? (
            <RecipeView
              recipe={activeRecipe}
              onEdit={() => setEditing(activeRecipe)}
              onDelete={() => setDeleteTarget(activeRecipe.id)}
              onGenerateShoppingList={() => {
                useApp.getState().generateShoppingListFromRecipe(activeRecipe.id)
                window.dispatchEvent(new CustomEvent('recipist:shopping-lists'))
              }}
            />
          ) : (
            <CategoryPage
              category={activeCategory}
              favoritesOnly={activeCategoryId === FAVORITES_ID}
              onEditCategory={
                activeCategory
                  ? () => setCategoryDialog({ open: true, category: activeCategory.id })
                  : undefined
              }
              onNewRecipe={() =>
                setEditing(
                  emptyRecipe(
                    activeCategoryId && activeCategoryId !== FAVORITES_ID
                      ? activeCategoryId
                      : categories[0]?.id ?? '',
                  ),
                )
              }
              onImport={() => setImportOpen(true)}
            />
          )}
        </main>
      </div>

      <CategoryDialog
        open={categoryDialog.open}
        category={categories.find((c) => c.id === categoryDialog.category) ?? null}
        onClose={() => setCategoryDialog({ open: false, category: null })}
      />

      <ImportDialog
        open={importOpen}
        defaultCategoryId={activeCategoryId === FAVORITES_ID ? null : activeCategoryId}
        onClose={() => setImportOpen(false)}
        onImported={(recipe, review) => {
          if (review) {
            setEditing(recipe)
          } else {
            useApp.getState().saveRecipe(recipe).then(() => {
              toast('Recipe added.', 'success')
              if (!activeCategoryId) useApp.getState().setActiveCategory(recipe.categoryId)
              useApp.getState().openRecipe(recipe.id)
            })
          }
        }}
      />

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Confirm
        open={Boolean(deleteTarget)}
        title="Delete recipe?"
        message="This recipe will be permanently removed from this device."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecipe(deleteTarget)
            toast('Recipe deleted.', 'success')
          }
          setDeleteTarget(null)
        }}
      />

      <Toasts />
    </div>
  )
}
