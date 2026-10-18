import { useState } from 'react'
import { Plus, Trash2, List, Link2 } from 'lucide-react'
import clsx from 'clsx'
import type { ShoppingList } from '../types'
import { useApp, itemLabel } from '../store/useApp'
import { Modal } from './ui/Modal'

export function ShoppingListView({
  list,
  onClose,
}: {
  list: ShoppingList
  onClose: () => void
}) {
  const toggleItem = useApp((s) => s.toggleShoppingListItem)
  const addItem = useApp((s) => s.addShoppingListItem)
  const deleteItem = useApp((s) => s.deleteShoppingListItem)
  const deleteList = useApp((s) => s.deleteShoppingList)
  const toast = useApp((s) => s.toast)

  const [newItemName, setNewItemName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const checkedCount = list.items.filter((i) => i.checked).length
  const total = list.items.length
  const pct = total ? Math.round((checkedCount / total) * 100) : 0

  const recipes = useApp((s) => s.recipes)
  const sourceRecipe = recipes.find((r) => r.id === list.recipeId)

  async function handleAddItem() {
    const name = newItemName.trim()
    if (!name) return
    await addItem(list.id, { name })
    setNewItemName('')
  }

  return (
    <article className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-5 pb-28">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="btn-ghost !p-2 rounded-full"
            aria-label="Back to shopping lists"
          >
            <List size={20} />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-content-muted">
              {sourceRecipe ? (
                <span>
                  From recipe: <Link2 size={12} className="text-brand hover:underline" />
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold">{list.name}</h1>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="btn-ghost text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} /> Delete list
          </button>
        </div>
      </header>

      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {checkedCount} of {total} item{total === 1 ? '' : 's'}
          </span>
          <div className="inline-flex items-center gap-2 text-[11px] text-content-muted">
            {pct}% complete
          </div>
        </div>
        <div
          className="w-full h-2 bg-surface-2 rounded-full overflow-hidden mt-2"
        >
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {list.items.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-line p-4">
            <Plus size={32} className="mx-auto mb-3 text-content-muted" />
            <p className="text-sm text-content-muted">No items yet — add some below.</p>
          </div>
        ) : (
          <>
            {list.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-line p-2.5 hover:bg-surface-2 transition-colors"
              >
                <label className="flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleItem(list.id, item.id)}
                    className="h-5 w-5 shrink-0 rounded border-line accent-brand text-brand"
                  />
                  {item.checked && (
                    <span className="ml-1.5 text-[18px] text-emerald-600 dark:text-emerald-400">
                      ✓
                    </span>
                  )}
                </label>
                <div className="flex-1 min-w-0">
                  <div
                    className={clsx(
                      'text-sm leading-relaxed break-words',
                      item.checked
                        ? 'line-through text-content-muted opacity-70'
                        : 'text-content',
                    )}
                  >
                    {itemLabel(item)}
                  </div>
                </div>
                <button
                  className="btn-ghost !p-1.5 text-content-muted hover:text-red-600 shrink-0"
                  onClick={() => deleteItem(list.id, item.id)}
                  aria-label="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-4 flex gap-2">
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
          placeholder="Add an ingredient…"
          className="flex-1"
        />
        <button
          className="btn-soft shrink-0"
          disabled={!newItemName.trim()}
          onClick={handleAddItem}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          className="btn-soft flex-1"
          disabled={checkedCount === total || !total}
          onClick={async () => {
            await Promise.all(
              list.items
                .filter((i) => !i.checked)
                .map((i) => toggleItem(list.id, i.id)),
            )
            toast('All items checked off.', 'success')
          }}
        >
          Check all
        </button>
        <button
          className="btn-soft flex-1"
          disabled={checkedCount === 0 || !total}
          onClick={async () => {
            await Promise.all(
              list.items.filter((i) => i.checked).map((i) => toggleItem(list.id, i.id)),
            )
            toast('Checklist reset.', 'info')
          }}
        >
          Uncheck all
        </button>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
      >
        <p className="text-sm text-content-muted leading-relaxed">
          “{list.name}” and its items will be removed.
        </p>
        <footer className="mt-4 flex justify-end gap-2">
          <button className="btn-soft" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              await deleteList(list.id)
              toast('Shopping list deleted.', 'success')
              setConfirmDelete(false)
              onClose()
            }}
          >
            Delete
          </button>
        </footer>
      </Modal>
    </article>
  )
}
