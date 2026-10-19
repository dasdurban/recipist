import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  CalendarDays,
  Check,
  LayoutGrid,
  Link2,
  List,
  PanelsTopLeft,
  Plus,
  Trash2,
} from 'lucide-react'
import { itemLabel, useApp } from '../store/useApp'
import { colorFor } from '../lib/colors'
import { Modal } from './ui/Modal'
import type { EventShoppingItem, Recipe, ShoppingList, ViewMode } from '../types'

/** The three layouts offered for the lists — same as the Event planner. */
const SHOPPING_VIEWS: Array<{ id: ViewMode; label: string; icon: typeof LayoutGrid }> = [
  { id: 'cards', label: 'Card view', icon: LayoutGrid },
  { id: 'list', label: 'List view', icon: List },
  { id: 'preview', label: 'Preview view', icon: PanelsTopLeft },
]

/** Open a shopping list's own page (handled in App). */
function openList(id: string) {
  window.dispatchEvent(new CustomEvent('recipist:open-shopping-list', { detail: { id } }))
}

/**
 * Open an event's page in the Event planner (handled in App). An event's
 * shopping list only ever lives on that page, so this is the single source of
 * truth for checking its items off.
 */
function openEvent(id: string) {
  window.dispatchEvent(new CustomEvent('recipist:event-planner', { detail: { eventId: id } }))
}

/** e.g. "2026-11-26" -> "Thu, Nov 26" */
function fmtDate(date?: string): string | undefined {
  if (!date) return undefined
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Everything a tile needs, whatever it came from: a real shopping list, or an
 * event's live shopping list.
 */
interface TileEntry {
  id: string
  title: string
  kind: 'list' | 'event'
  /** secondary text: an event's date, or a note such as "Recipe deleted" */
  note?: string
  /** accent hex for event entries; lists fall back to the app's brand colour */
  accent?: string
  items: Array<{ id: string; checked: boolean; label: string }>
  onSelect: () => void
  /** omitted for events — their list is managed on the event's own page */
  onDelete?: () => void
}

/** One underlying row behind a combined ingredient — what a tick has to update. */
interface CombinedRef {
  /** which list the row belongs to */
  listId: string
  itemId: string
  checked: boolean
}

/** One ingredient of "Everything needed", summed across the shopping lists on this page. */
interface CombinedItem {
  name: string
  quantity?: number
  unit?: string
  /** list / event names that need it */
  sources: string[]
  /** the rows it is made of, so it can be ticked off from here */
  refs: CombinedRef[]
}

export function ShoppingListsPage() {
  const lists = useApp((s) => s.shoppingLists)
  const recipes = useApp((s) => s.recipes)
  const events = useApp((s) => s.events)
  const eventItems = useApp((s) => s.eventShoppingItems)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const createList = useApp((s) => s.createShoppingList)
  const deleteList = useApp((s) => s.deleteShoppingList)
  const setListItemsChecked = useApp((s) => s.setShoppingListItemsChecked)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  const view = settings.shoppingView
  /** Events section accent — the Event planner's title-box colour. */
  const plannerHex = colorFor(settings.plannerColorName, settings.plannerColorSet)

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

  /** The event shopping items, grouped by event — used by the Events tiles. */
  const eventItemsByEvent = useMemo(() => {
    const byEvent = new Map<string, EventShoppingItem[]>()
    for (const item of eventItems) {
      const rows = byEvent.get(item.eventId)
      if (rows) rows.push(item)
      else byEvent.set(item.eventId, [item])
    }
    return byEvent
  }, [eventItems])

  /**
   * Each event's shopping list, shown live under "Events" and titled with the
   * event's own name. Only events that actually have items appear.
   */
  const eventTiles = useMemo<TileEntry[]>(() => {
    return [...events]
      .filter((ev) => (eventItemsByEvent.get(ev.id)?.length ?? 0) > 0)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((ev) => {
        const rows = [...eventItemsByEvent.get(ev.id)!].sort(
          // same order as the event's own shopping column: checked ones last, then A–Z
          (a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name),
        )
        const date = fmtDate(ev.date)
        return {
          id: ev.id,
          title: ev.name,
          kind: 'event' as const,
          accent: plannerHex,
          note: date ? `Event · ${date}` : 'Event',
          items: rows.map((i) => ({ id: i.id, checked: i.checked, label: itemLabel(i) })),
          onSelect: () => openEvent(ev.id),
        }
      })
  }, [events, eventItemsByEvent, plannerHex])

  /**
   * Every needed ingredient across the shopping lists on this page, summed when
   * the unit matches. Counts standalone lists only — the lists generated from
   * recipes and the hand-made ones — never the events' lists, whose ingredients
   * live on the event's own planner page. Each entry remembers which lists need
   * it, and the exact rows behind it so it can be ticked off from here.
   */
  const combinedItems = useMemo<CombinedItem[]>(() => {
    const map = new Map<string, CombinedItem>()

    const add = (
      source: string,
      item: { name: string; quantity?: number; unit?: string },
      ref: CombinedRef,
    ) => {
      const key = item.name.toLowerCase()
      // "" and undefined both mean "no unit" — treat them as the same so that
      // a recipe ingredient and a hand-typed item still add up
      const unit = item.unit?.trim() || undefined
      const existing = map.get(key)
      if (existing) {
        if (
          existing.unit === unit &&
          existing.quantity !== undefined &&
          item.quantity !== undefined
        ) {
          existing.quantity += item.quantity
        } else if (unit !== existing.unit || existing.quantity === undefined) {
          existing.quantity = undefined
          existing.unit = unit
        }
        if (!existing.sources.includes(source)) existing.sources.push(source)
        existing.refs.push(ref)
      } else {
        map.set(key, {
          name: item.name,
          quantity: item.quantity,
          unit,
          sources: [source],
          refs: [ref],
        })
      }
    }

    for (const list of lists) {
      for (const item of list.items) {
        add(list.name, item, {
          listId: list.id,
          itemId: item.id,
          checked: item.checked,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lists])

  /**
   * Ticks a combined ingredient off everywhere it is needed (or back on).
   * Lists are written once per list, so several items can change in one go.
   */
  async function applyChecked(refs: CombinedRef[], checked: boolean) {
    const byList = new Map<string, string[]>()
    for (const ref of refs) {
      if (ref.checked === checked) continue
      const ids = byList.get(ref.listId) ?? []
      ids.push(ref.itemId)
      byList.set(ref.listId, ids)
    }
    await Promise.all(
      [...byList].map(([listId, itemIds]) => setListItemsChecked(listId, itemIds, checked)),
    )
  }

  /** A combined row counts as bought once every underlying row is ticked. */
  const isCombinedDone = (item: CombinedItem) => item.refs.every((r) => r.checked)
  const combinedDone = combinedItems.filter(isCombinedDone).length

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

  /** Turn a stored list into the generic shape the tiles render. */
  function listTile(list: ShoppingList, title: string, note?: string): TileEntry {
    return {
      id: list.id,
      title,
      kind: 'list',
      note,
      items: list.items.map((i) => ({ id: i.id, checked: i.checked, label: itemLabel(i) })),
      onSelect: () => openList(list.id),
      onDelete: () => handleDelete(list.id),
    }
  }

  const recipeTiles = listsFromRecipes.map(({ list, recipe }) => listTile(list, recipe.title))
  const otherTiles = otherLists.map((list) =>
    listTile(
      list,
      list.name || 'Shopping list',
      list.recipeId && !recipesById.has(list.recipeId) ? 'Recipe deleted' : undefined,
    ),
  )

  return (
    <div className="px-4 sm:px-6 py-5 pb-28 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <List size={26} className="text-brand shrink-0" />
          <h1 className="text-2xl font-bold truncate">Shopping lists</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sorted.length + eventTiles.length > 0 && (
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

      {sorted.length === 0 && eventTiles.length === 0 ? (
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
          {/* Events: each event's own shopping list, live and titled after the event */}
          {eventTiles.length > 0 && (
            <section className="mb-6">
              <div className="mb-3">
                <h2 className="font-bold flex items-center gap-2">
                  <span
                    className="h-4 w-1.5 rounded-full"
                    style={{ backgroundColor: plannerHex }}
                  />
                  Events
                </h2>
                <p className="text-[11px] text-content-muted mt-1 pl-3.5">
                  Each event's shopping list, kept in sync with its planner page — open one to
                  check items off.
                </p>
              </div>
              <TilesLayout entries={eventTiles} view={view} />
            </section>
          )}

          {/* Recipes section */}
          {recipeTiles.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-brand" />
                Recipes
              </h2>
              <TilesLayout entries={recipeTiles} view={view} />
            </section>
          )}

          {/* Hand-made lists and lists whose recipe has been deleted */}
          {otherTiles.length > 0 && (
            <section className="mb-6">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-surface-3" />
                Your lists
              </h2>
              <TilesLayout entries={otherTiles} view={view} />
            </section>
          )}

          {/* Everything needed section — the standalone lists on this page combined */}
          <section className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
              <h2 className="font-bold flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full bg-brand" />
                Everything needed
              </h2>
              {combinedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-content-muted">
                    {combinedDone} of {combinedItems.length} bought
                  </span>
                  <button
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() =>
                      applyChecked(
                        combinedItems.flatMap((i) => i.refs),
                        combinedDone !== combinedItems.length,
                      )
                    }
                  >
                    {combinedDone === combinedItems.length ? 'Uncheck all' : 'Check all'}
                  </button>
                </div>
              )}
            </div>
            {combinedItems.length === 0 ? (
              <p className="text-sm text-content-muted">
                Nothing yet — generate a list from a recipe, or create a new list.
              </p>
            ) : (
              <ul className="space-y-2">
                {combinedItems.map((item) => {
                  const done = isCombinedDone(item)
                  const partly = !done && item.refs.some((r) => r.checked)
                  return (
                    <li key={item.name} className="rounded-lg bg-surface hover:bg-surface-3 transition-colors">
                      <label className="flex items-start gap-3 p-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={done}
                          // "some of the lists have it" gets the usual dash
                          ref={(el) => {
                            if (el) el.indeterminate = partly
                          }}
                          onChange={() => applyChecked(item.refs, !done)}
                          className="h-4 w-4 mt-0.5 shrink-0"
                          aria-label={`Mark ${item.name} as bought`}
                        />
                        <span
                          className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-brand border border-brand/30"
                          title={`Needed by ${item.sources.length} list${item.sources.length === 1 ? '' : 's'}`}
                        >
                          {item.sources.length}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={clsx(
                              'text-sm',
                              done && 'line-through text-content-muted opacity-70',
                            )}
                          >
                            {item.name}
                            {item.quantity !== undefined ? ` ${item.quantity}` : ''}
                            {item.unit ? ` ${item.unit}` : ''}
                          </div>
                          <div className="text-[11px] text-content-muted">
                            in {item.sources.join(', ')}
                          </div>
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="text-xs text-content-muted mt-3">
              The shopping lists on this page — recipe lists and your own lists. Quantities are
              summed when the unit matches, and ticking an ingredient here ticks it off in every
              list that needs it. Events keep their own lists on the event&apos;s planner page.
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

/**
 * Lays a section's tiles out in the chosen view. Cards and previews stretch to
 * fill the row — two tiles sit at 50% each, three at 33%, and so on — while
 * list rows always take the full width.
 */
function TilesLayout({ entries, view }: { entries: TileEntry[]; view: ViewMode }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <TileRow key={e.id} entry={e} />
        ))}
      </div>
    )
  }

  if (view === 'preview') {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        {entries.map((e) => (
          <TilePreview key={e.id} entry={e} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}>
      {entries.map((e) => (
        <TileCard key={e.id} entry={e} />
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

/** Icon square: lists take the app accent, events the Event planner colour. */
function TileIcon({
  entry,
  size,
  className,
}: {
  entry: TileEntry
  size: number
  className: string
}) {
  const Icon = entry.kind === 'event' ? CalendarDays : List
  if (entry.accent) {
    return (
      <span
        className={clsx('shrink-0 flex items-center justify-center', className)}
        style={{ backgroundColor: `${entry.accent}1a`, color: entry.accent }}
        aria-hidden
      >
        <Icon size={size} />
      </span>
    )
  }
  return (
    <span
      className={clsx('shrink-0 flex items-center justify-center bg-brand/10 text-brand', className)}
      aria-hidden
    >
      <Icon size={size} />
    </span>
  )
}

/** Small "delete list" icon button — only real shopping lists can be deleted. */
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

/** Card: title, progress and item counts. The whole card opens the list. */
function TileCard({ entry }: { entry: TileEntry }) {
  const total = entry.items.length
  const checked = entry.items.filter((i) => i.checked).length
  const pct = total ? Math.round((checked / total) * 100) : 0

  return (
    <ShoppingTile
      label={entry.title}
      onSelect={entry.onSelect}
      className="card p-3 overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
          {entry.kind === 'event' && entry.accent && (
            <CalendarDays size={13} className="shrink-0" style={{ color: entry.accent }} />
          )}
          <span className="truncate">{entry.title}</span>
        </h3>
        {entry.onDelete && <DeleteListButton onDelete={entry.onDelete} />}
      </div>
      <div className="mb-2 text-[11px] text-content-muted truncate">
        {entry.items.length} item{entry.items.length === 1 ? '' : 's'} ·{' '}
        {entry.items.filter((i) => i.checked).length} checked
        {entry.note ? ` · ${entry.note}` : ''}
      </div>
      <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={clsx('h-full', !entry.accent && 'bg-brand')}
          style={{ width: `${pct}%`, backgroundColor: entry.accent }}
        />
      </div>
    </ShoppingTile>
  )
}

/** Full-width row (one per list). */
function TileRow({ entry }: { entry: TileEntry }) {
  const total = entry.items.length
  const checked = entry.items.filter((i) => i.checked).length
  const pct = total ? Math.round((checked / total) * 100) : 0

  return (
    <ShoppingTile
      label={entry.title}
      onSelect={entry.onSelect}
      className="card px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-surface-3"
    >
      <TileIcon entry={entry} size={17} className="h-9 w-9 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{entry.title}</div>
        <div className="text-[11px] text-content-muted truncate">
          {entry.items.length} item{entry.items.length === 1 ? '' : 's'} ·{' '}
          {checked} checked
          {entry.note ? ` · ${entry.note}` : ''}
        </div>
      </div>
      <div className="hidden sm:block w-28 shrink-0">
        <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={clsx('h-full', !entry.accent && 'bg-brand')}
            style={{ width: `${pct}%`, backgroundColor: entry.accent }}
          />
        </div>
      </div>
      {entry.onDelete && <DeleteListButton onDelete={entry.onDelete} />}
    </ShoppingTile>
  )
}

/** Preview: a miniature of the list's own page (or the event's planner page). */
function TilePreview({ entry }: { entry: TileEntry }) {
  const total = entry.items.length
  const checked = entry.items.filter((i) => i.checked).length
  const pct = total ? Math.round((checked / total) * 100) : 0
  const shown = entry.items.slice(0, 4)

  return (
    <ShoppingTile
      label={entry.title}
      onSelect={entry.onSelect}
      className="card overflow-hidden flex flex-col transition-shadow hover:shadow-lg"
    >
      <div className="text-left p-2.5 flex-1">
        {/* mini title bar */}
        <div className="flex items-center gap-1.5 mb-2">
          <TileIcon entry={entry} size={11} className="h-5 w-5 rounded-md" />
          <span className="text-xs font-semibold truncate">{entry.title}</span>
        </div>

        {/* mini progress */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-content-muted mb-1">
          <span>
            {checked}/{total}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden mb-2">
          <div
            className={clsx('h-full', !entry.accent && 'bg-brand')}
            style={{ width: `${pct}%`, backgroundColor: entry.accent }}
          />
        </div>

        {/* mini item checklist */}
        <ul className="space-y-1">
          {entry.items.length === 0 ? (
            <li className="text-[11px] text-content-muted italic">No items yet</li>
          ) : (
            shown.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5">
                <span
                  className={clsx(
                    'h-3 w-3 rounded-[4px] border shrink-0 flex items-center justify-center',
                    item.checked
                      ? entry.accent
                        ? 'border-transparent text-white'
                        : 'bg-brand border-brand text-white'
                      : 'border-line',
                  )}
                  style={item.checked && entry.accent ? { backgroundColor: entry.accent } : undefined}
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
                  {item.label}
                </span>
              </li>
            ))
          )}
        </ul>
        {entry.items.length > 4 && (
          <div className="text-[10px] text-content-muted mt-1">
            +{entry.items.length - 4} more
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
        <span className="text-[11px] text-content-muted truncate flex items-center gap-1">
          {entry.kind === 'event' ? <CalendarDays size={11} /> : <Link2 size={11} />}
          {entry.note ?? `${total} item${total === 1 ? '' : 's'}`}
        </span>
        {entry.onDelete && <DeleteListButton onDelete={entry.onDelete} />}
      </div>
    </ShoppingTile>
  )
}
