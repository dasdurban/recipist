import { ArrowLeft, Menu, Printer, Settings as SettingsIcon } from 'lucide-react'
import { useApp } from '../store/useApp'
import { FAVORITES_ID } from '../lib/nav'
import { TomatoLogo } from './TomatoLogo'
import { KitchenTimerIcon } from './KitchenTimerIcon'
import { useState } from 'react'
import { TimerPanel } from './TimerPanel'

/** Top bar: nav tree toggle, back button, title/breadcrumb, settings. */
export function Header({
  canGoBack,
  onBack,
  titleOverride,
}: {
  canGoBack: boolean
  onBack: () => void
  titleOverride?: string
}) {
  const activeCategoryId = useApp((s) => s.activeCategoryId)
  const activeRecipeId = useApp((s) => s.activeRecipeId)
  const activeShoppingListId = useApp((s) => s.activeShoppingListId)
  const categories = useApp((s) => s.categories)
  const recipes = useApp((s) => s.recipes)
  const shoppingLists = useApp((s) => s.shoppingLists)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const timerRunning = useApp((s) => s.timerRunning)
  const timerDone = useApp((s) => s.timerDone)
  const timerRemaining = useApp((s) => s.timerRemaining)
  const timerDuration = useApp((s) => s.timerDuration)

  const timerActive =
    timerRunning ||
    timerDone ||
    (timerRemaining > 0 && timerRemaining < timerDuration)

  const category = categories.find((c) => c.id === activeCategoryId)
  const recipe = recipes.find((r) => r.id === activeRecipeId)
  const shoppingList = shoppingLists.find((l) => l.id === activeShoppingListId)

  const [timerOpen, setTimerOpen] = useState(false)

  const title = titleOverride
    ? titleOverride
    : recipe
      ? recipe.title
      : shoppingList
        ? shoppingList.name
        : activeCategoryId === FAVORITES_ID
          ? 'Favorites'
          : category
            ? category.name
            : 'All recipes'

  return (
    <header className="safe-top safe-x sticky top-0 z-30 bg-surface/85 backdrop-blur border-b border-line shrink-0">
      <div className="h-14 flex items-center gap-1 px-2 sm:px-3">
        <button
          className="btn-ghost !p-2 md:hidden"
          onClick={() => toggleSidebar()}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <button
          className="btn-ghost !p-2 disabled:opacity-30"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1 pl-1">
          <TomatoLogo className="h-6 w-6 shrink-0 md:hidden" />
          <div className="min-w-0">
            {recipe && category && (
              <div className="text-[11px] uppercase tracking-wide text-content-muted truncate">
                {category.name}
              </div>
            )}
            <h1 className="font-semibold truncate leading-tight">{title}</h1>
          </div>
        </div>

        <button
          className="btn-ghost !p-2 relative"
          onClick={() => setTimerOpen(true)}
          aria-label="Open timer"
          title="Kitchen timer"
        >
          <KitchenTimerIcon size={22} />
          {timerActive && (
            <span
              className={`absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ${
                timerRunning ? 'animate-pulse' : ''
              }`}
              aria-hidden
            />
          )}
        </button>
        <button
          className="btn-ghost !p-2"
          onClick={() => window.print()}
          aria-label="Print"
          title="Print"
        >
          <Printer size={20} />
        </button>
        <button
          className="btn-ghost !p-2"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
      <TimerPanel open={timerOpen} onClose={() => setTimerOpen(false)} />
    </header>
  )
}
