import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, List, Link2, Trash2 } from 'lucide-react'
import { useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import type { Recipe, ShoppingList } from '../types'

export function ShoppingListsPage() {
  const lists = useApp((s) => s.shoppingLists)
  const recipes = useApp((s) => s.recipes)
  const createList = useApp((s) => s.createShoppingList)
  const deleteList = useApp((s) => s.deleteShoppingList)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

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

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-5 pb-28">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <List size={26} className="text-brand" />
          <h1 className="text-2xl font-bold">Shopping lists</h1>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> New list
        </button>
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
          {listsFromRecipes.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-brand" />
                Recipes
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {listsFromRecipes.map(({ list, recipe }) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    title={recipe.title}
                    onDelete={() => handleDelete(list.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Hand-made lists and lists whose recipe has been deleted */}
          {otherLists.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-surface-3" />
                Your lists
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {otherLists.map((list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    title={list.name || 'Shopping list'}
                    note={list.recipeId && !recipesById.has(list.recipeId) ? 'Recipe deleted' : undefined}
                    onDelete={() => handleDelete(list.id)}
                  />
                ))}
              </div>
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

/** One shopping-list card: title, progress, open + delete. */
function ListCard({
  list,
  title,
  note,
  onDelete,
}: {
  list: ShoppingList
  title: string
  note?: string
  onDelete: () => void
}) {
  const checked = list.items.filter((i) => i.checked).length
  const total = list.items.length
  const pct = total ? Math.round((checked / total) * 100) : 0

  return (
    <div className="card p-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm truncate">{title}</h3>
        <button
          className="btn-ghost !p-1 text-content-muted hover:text-red-600"
          onClick={onDelete}
          aria-label="Delete list"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mb-2 text-[11px] text-content-muted">
        {total} item{total === 1 ? '' : 's'} · {checked} checked
        {note ? ` · ${note}` : ''}
      </div>
      <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <button
        className="w-full btn-soft justify-start text-sm"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('recipist:open-shopping-list', { detail: { id: list.id } }),
          )
        }}
      >
        Open list <Link2 size={13} />
      </button>
    </div>
  )
}
