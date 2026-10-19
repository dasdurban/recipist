import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  Check,
  LayoutGrid,
  Link2,
  List,
  PanelsTopLeft,
  Plus,
  Trash2,
} from 'lucide-react'
import { itemLabel, useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import type { Recipe, ShoppingList, ViewMode } from '../types'

/** The three layouts offered for the shopping lists — same as the Event planner. */
const SHOPPING_VIEWS: Array<{ id: ViewMode; label: string; icon: typeof LayoutGrid }> = [
  { id: 'cards', label: 'Card view', icon: LayoutGrid },
  { id: 'list', label: 'List view', icon: List },
  { id: 'preview', label: 'Preview view', icon: PanelsTopLeft },
]

/** Open a shopping list's own page (handled in App). */
function openList(id: string) {
  window.dispatchEvent(new CustomEvent('recipist:open-shopping-list', { detail: { id } }))
}

export function ShoppingListsPage() {
  const lists = useApp((s) => s.shoppingLists)
  const recipes = useApp((s) => s.recipes)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const createList = useApp((s) => s.createShoppingList)
  const deleteList = useApp((s) => s.deleteShoppingList)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  const view = settings.shoppingView

  useEffect(() => {
    if (createOpen) {
      setNewName('')
      // focus after the modal has painted
      requestAnimationFrame(() => nameInput.current?.focus())
    }
  }, [createOpen])

  const sorted = useMemo(() => [...lists].sort((a, b) => b.updatedAt - a.updatedAt), [lists])

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    for (const r of recipes) map.set(r.id, r)
    return map
  }, [recipes])

  // Lists generated from a recipe that still exists
  const listsFromRecipes = useMemo(
    () =>
      sorted
        .filter((l) => l.recipeId && recipesById.has(l.recipeId))
        .map((l) => ({ list: l, recipe: recipesById.get(l.recipeId!)! })),
    [sorted, recipesById],
  )

  // Everything else: hand-made lists, plus lists whose recipe was deleted.
  // These must stay reachable, otherwise their items would linger forever in
  // the combined ingredients view with no way to open or remove them.
  const otherLists = useMemo(() => {
    const shown = new Set(listsFromRecipes.map(({ list }) => list.id))
    return sorted.filter((l) => !shown.has(l.id))
  }, [sorted, listsFromRecipes])

  // Combined ingredients across all lists; sum qty when unit matches
  const combinedItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity?: number; unit?: string; lists: string[] }>()
    for (const list of lists) {
      for (const item of list.items) {
        const key = item.name.toLowerCase()
        const existing = map.get(key)
        if (existing) {
          if (
            existing.unit === item.unit &&
            existing.quantity !== undefined &&
            item.quantity !== undefined
          ) {
            existing.quantity += item.quantity
          } else if (item.unit !== existing.unit || existing.quantity === undefined) {
            existing.quantity = undefined
            existing.unit = item.unit || undefined
          }
          if (!existing.lists.includes(list.name)) existing.lists.push(list.name)
        } else {
          map.set(key, {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            lists: [list.name],
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lists])

  async function handleCreate() {
    const name = newName.trim() || 'New shopping list'
    await createList(name)
    setNewName('')
    setCreateOpen(false)
  }

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete “${lists.find((l) => l.id === id)?.name}”?`)) return
    await deleteList(id)
    toast('Shopping list deleted.', 'success')
  }

  const recipeEntries = listsFromRecipes.map(({ list, recipe }) => ({
    list,
    title: recipe.title,
  }))
  const otherEntries = otherLists.map((list) => ({
    list,
    title: list.name || 'Shopping list',
    note: list.recipeId && !recipesById.has(list.recipeId) ? 'Recipe deleted' : undefined,
  }))

  return (
    <div className="px-4 sm:px-6 py-5 pb-28 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <List size={26} className="text-brand shrink-0" />
          <h1 className="text-2xl font-bold truncate">Shopping lists</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sorted.length > 0 && (
            <div
              className="flex items-center gap-0.5 rounded-lg border border-line p-0.5 shrink-0"
              role="group"
              aria-label="Shopping list view"
            >
              {SHOPPING_VIEWS.map((v) => {
                const Icon = v.icon
                const selected = view === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    title={v.label}
                    aria-label={v.label}
                    aria-pressed={selected}
                    onClick={() => updateSettings({ shoppingView: v.id })}
                    className={clsx(
                      'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                      selected
                        ? 'bg-surface-3 text-content'
                        : 'text-content-muted hover:text-content',
                    )}
                  >
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          )}
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New list
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-line p-4">
          <Plus size={36} className="mx-auto mb-3 text-content-muted" />
          <p className="text-sm text-content-muted">
            No shopping lists yet. Generate one from a recipe or create a new list.
          </p>
          <div className="mt-4 flex justify-center">
            <button className="btn-soft" onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> New list
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Recipes section */}
          {recipeEntries.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-brand" />
                Recipes
              </h2>
              <ListsLayout
                entries={recipeEntries}
                view={view}
                onDelete={(id) => handleDelete(id)}
              />
            </section>
          )}

          {/* Hand-made lists and lists whose recipe has been deleted */}
          {otherEntries.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-surface-3" />
                Your lists
              </h2>
              <ListsLayout
                entries={otherEntries}
                view={view}
                onDelete={(id) => handleDelete(id)}
              />
            </section>
          )}

          {/* Combined ingredients section */}
          <section className="rounded-xl border border-line bg-surface-2 p-4">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <span className="h-4 w-1.5 rounded-full bg-brand" />
              All needed ingredients
            </h2>
            {combinedItems.length === 0 ? (
              <p className="text-sm text-content-muted">
                No ingredients yet — generate a list from a recipe to add ingredients.
              </p>
            ) : (
              <ul className="space-y-2">
                {combinedItems.map((item) => (
                  <li key={item.name} className="flex items-start gap-3 rounded-lg p-2 bg-surface hover:bg-surface-3 transition-colors">
                    <span className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-brand border border-brand/30">
                      {item.lists.length}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        {item.name}
                        {item.quantity !== undefined ? ` ${item.quantity}` : ''}
                        {item.unit ? ` ${item.unit}` : ''}
                      </div>
                      <div className="text-[11px] text-content-muted">
                        in {item.lists.join(', ')}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-content-muted mt-3">
              Quantities are summed when the unit matches across lists.
            </p>
          </section>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New shopping list"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleCreate}>
              Create
            </button>
          </>
        }
      >
        <label className="field-label">List name</label>
        <input
          ref={nameInput}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="e.g. Weekend barbecue"
          className="w-full"
        />
      </Modal>
    </div>
  )
}

/** One entry in a lists section: the list plus the title to show for it. */
interface ListEntry {
  list: ShoppingList
  title: string
  note?: string
}

/**
 * Lays a section's lists out in the chosen view. Cards and previews stretch to
 * fill the row — two tiles sit at 50% each, three at 33%, and so on — while
 * list rows always take the full width.
 */
function ListsLayout({
  entries,
  view,
  onDelete,
}: {
  entries: ListEntry[]
  view: ViewMode
  onDelete: (id: string) => void
}) {
  if (view === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <ListRow key={e.list.id} {...e} onDelete={() => onDelete(e.list.id)} />
        ))}
      </div>
    )
  }

  if (view === 'preview') {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        {entries.map((e) => (
          <ListPreview key={e.list.id} {...e} onDelete={() => onDelete(e.list.id)} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}>
      {entries.map((e) => (
        <ListCard
          key={e.list.id}
          list={e.list}
          title={e.title}
          note={e.note}
          onDelete={() => onDelete(e.list.id)}
        />
      ))}
    </div>
  )
}

/**
 * A whole tile is the click target — like the Event planner's event tiles.
 * Keyboard users get Enter / Space, and the delete button inside stops the
 * click from bubbling up.
 */
function ShoppingTile({
  label,
  onSelect,
  className,
  children,
}: {
  label: string
  onSelect: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${label}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        // ignore keys aimed at an inner control (e.g. the delete button)
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={clsx(
        'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Small "delete list" icon button shared by the three layouts. */
function DeleteListButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      className="btn-ghost !p-1 text-content-muted hover:text-red-600 shrink-0"
      onClick={(e) => {
        e.stopPropagation()
        onDelete()
      }}
      aria-label="Delete list"
      title="Delete list"
    >
      <Trash2 size={14} />
    </button>
  )
}

/** Props shared by the three list layouts. */
type ListEntryProps = ListEntry & { onDelete: () => void }

/** Card: title, progress and item counts. The whole card opens the list. */
function ListCard({ list, title, note, onDelete }: ListEntryProps) {
  const checked = list.items.filter((i) => i.checked).length
  const total = list.items.length
  const pct = total ? Math.round((checked / total) * 100) : 0

  return (
    <ShoppingTile
      label={title}
      onSelect={() => openList(list.id)}
      className="card p-3 overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm truncate">{title}</h3>
        <DeleteListButton onDelete={onDelete} />
      </div>
      <div className="mb-2 text-[11px] text-content-muted">
        {total} item{total === 1 ? '' : 's'} · {checked} checked
        {note ? ` · ${note}` : ''}
      </div>
      <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </ShoppingTile>
  )
}

/** Full-width row (one per list). */
function ListRow({ list, title, note, onDelete }: ListEntryProps) {
  const checked = list.items.filter((i) => i.checked).length
  const total = list.items.length
  const pct = total ? Math.round((checked / total) * 100) : 0

  return (
    <ShoppingTile
      label={title}
      onSelect={() => openList(list.id)}
      className="card px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-surface-3"
    >
      <span
        className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center bg-brand/10 text-brand"
        aria-hidden
      >
        <List size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{title}</div>
        <div className="text-[11px] text-content-muted truncate">
          {total} item{total === 1 ? '' : 's'} · {checked} checked
          {note ? ` · ${note}` : ''}
        </div>
      </div>
      <div className="hidden sm:block w-28 shrink-0">
        <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <DeleteListButton onDelete={onDelete} />
    </ShoppingTile>
  )
}

/** Preview: a miniature of the shopping list's own page. */
function ListPreview({ list, title, note, onDelete }: ListEntryProps) {
  const checked = list.items.filter((i) => i.checked).length
  const total = list.items.length
  const pct = total ? Math.round((checked / total) * 100) : 0
  const shown = list.items.slice(0, 4)

  return (
    <ShoppingTile
      label={title}
      onSelect={() => openList(list.id)}
      className="card overflow-hidden flex flex-col transition-shadow hover:shadow-lg"
    >
      <div className="text-left p-2.5 flex-1">
        {/* mini title bar */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center bg-brand/10 text-brand">
            <List size={11} />
          </span>
          <span className="text-xs font-semibold truncate">{title}</span>
        </div>

        {/* mini progress */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-content-muted mb-1">
          <span>
            {checked}/{total}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
        </div>

        {/* mini item checklist */}
        <ul className="space-y-1">
          {list.items.length === 0 ? (
            <li className="text-[11px] text-content-muted italic">No items yet</li>
          ) : (
            shown.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5">
                <span
                  className={clsx(
                    'h-3 w-3 rounded-[4px] border shrink-0 flex items-center justify-center',
                    item.checked ? 'bg-brand border-brand text-white' : 'border-line',
                  )}
                  aria-hidden
                >
                  {item.checked && <Check size={9} strokeWidth={3} />}
                </span>
                <span
                  className={clsx(
                    'text-[11px] truncate',
                    item.checked && 'line-through text-content-muted opacity-70',
                  )}
                >
                  {itemLabel(item)}
                </span>
              </li>
            ))
          )}
        </ul>
        {list.items.length > 4 && (
          <div className="text-[10px] text-content-muted mt-1">
            +{list.items.length - 4} more
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
        <span className="text-[11px] text-content-muted truncate flex items-center gap-1">
          <Link2 size={11} /> {note ?? `${total} item${total === 1 ? '' : 's'}`}
        </span>
        <DeleteListButton onDelete={onDelete} />
      </div>
    </ShoppingTile>
  )
}
