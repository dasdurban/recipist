import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ListTodo,
  Plus,
  Salad,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import { parseIngredient } from '../lib/nutrition'
import { combineIngredients } from '../lib/combineIngredients'
import { allRecipesColor, colorFor } from '../lib/colors'
import type { EventPlan, EventShoppingItem, EventTodo, Recipe } from '../types'

const PLANNER_HEX = '#7c3aed'

/** Ingredient label: "2 cups flour" or the raw text. */
function itemLabel(item: { name: string; quantity?: number; unit?: string; raw?: string }): string {
  if (item.raw && item.raw.trim()) return item.raw.trim()
  const parts: string[] = []
  if (item.quantity !== undefined && item.quantity > 0) parts.push(String(item.quantity))
  if (item.unit) parts.push(item.unit)
  parts.push(item.name)
  return parts.join(' ').trim()
}

/** e.g. "2026-11-26" -> "Thu, Nov 26" */
function fmtDate(date?: string): string | undefined {
  if (!date) return undefined
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Event Planner: create events, attach recipes, then plan each event with a
 * three-column workspace — shopping list (auto + manual), the automatically
 * generated ingredients summary (check off pantry items to remove them from
 * the shopping list), and a to-do list.
 */
export function EventPlannerPage() {
  const events = useApp((s) => s.events)
  const activeEventId = useApp((s) => s.activeEventId)
  const setActiveEvent = useApp((s) => s.setActiveEvent)
  const createEvent = useApp((s) => s.createEvent)
  const deleteEvent = useApp((s) => s.deleteEvent)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (createOpen) {
      setNewName('')
      setNewDate('')
      requestAnimationFrame(() => nameInput.current?.focus())
    }
  }, [createOpen])

  const event = events.find((e) => e.id === activeEventId) ?? null

  async function handleCreate() {
    const name = newName.trim() || 'New event'
    await createEvent(name, newDate || undefined)
    setCreateOpen(false)
    toast('Event created.', 'success')
  }

  async function handleDelete(ev: EventPlan) {
    if (!window.confirm(`Delete event “${ev.name}”?`)) return
    await deleteEvent(ev.id)
    toast('Event deleted.', 'success')
  }

  const sorted = useMemo(
    () => [...events].sort((a, b) => b.createdAt - a.createdAt),
    [events],
  )

  return (
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto w-full">
      {/* Title box */}
      <div
        className="rounded-2xl p-5 mb-5 border"
        style={{ backgroundColor: `${PLANNER_HEX}14`, borderColor: `${PLANNER_HEX}33` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-12 w-12 rounded-2xl shrink-0 flex items-center justify-center text-white"
            style={{ backgroundColor: PLANNER_HEX }}
            aria-hidden
          >
            <CalendarDays size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate">Event planner</h2>
            <p className="text-sm text-content-muted">
              {sorted.length} {sorted.length === 1 ? 'event' : 'events'}
              {event ? ` · planning “${event.name}”` : ''}
            </p>
          </div>
          <button
            className="btn bg-white text-black border border-black hover:bg-surface-3 shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} /> New event
          </button>
        </div>
      </div>

      {event ? (
        <EventDetail event={event} onBack={() => setActiveEvent(null)} onDelete={() => handleDelete(event)} />
      ) : (
        <>
          {/* Events section */}
          <section className="mb-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: PLANNER_HEX }} />
              Your events
            </h3>
            {sorted.length === 0 ? (
              <div className="text-center py-14 rounded-2xl border border-dashed border-line p-4">
                <CalendarDays size={36} className="mx-auto mb-3 text-content-muted" />
                <p className="text-sm text-content-muted">
                  No events yet. Create an event — like a dinner party or holiday meal — to plan its
                  recipes, shopping list and to-dos in one place.
                </p>
                <div className="mt-4 flex justify-center">
                  <button className="btn-soft" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> New event
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {sorted.map((ev) => (
                  <EventCard key={ev.id} event={ev} onSelect={() => setActiveEvent(ev.id)} onDelete={() => handleDelete(ev)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* New event modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New event"
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
        <label className="field-label">Event name</label>
        <input
          ref={nameInput}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="e.g. Thanksgiving dinner"
          className="w-full mb-4"
        />
        <label className="field-label">Date (optional)</label>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full" />
      </Modal>
    </div>
  )
}

function EventCard({
  event,
  onSelect,
  onDelete,
}: {
  event: EventPlan
  onSelect: () => void
  onDelete: () => void
}) {
  const allTodos = useApp((s) => s.eventTodos)
  const todos = useMemo(() => allTodos.filter((t) => t.eventId === event.id), [allTodos, event.id])
  const openTodos = todos.filter((t) => !t.checked).length
  const dateLabel = fmtDate(event.date)

  return (
    <div className="card p-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm truncate flex-1">{event.name}</h4>
        <button
          className="btn-ghost !p-1 text-content-muted hover:text-red-600"
          onClick={onDelete}
          aria-label="Delete event"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-1 mb-2 text-[11px] text-content-muted">
        {dateLabel ?? 'No date'}
        {openTodos > 0 ? ` · ${openTodos} to-do${openTodos === 1 ? '' : 's'}` : ''}
      </div>
      <button className="w-full btn-soft justify-start text-sm" onClick={onSelect}>
        Plan event <CalendarDays size={13} />
      </button>
    </div>
  )
}

/** The selected event: header, recipes section, then the three columns. */
function EventDetail({
  event,
  onBack,
  onDelete,
}: {
  event: EventPlan
  onBack: () => void
  onDelete: () => void
}) {
  const recipes = useApp((s) => s.recipes)
  const categories = useApp((s) => s.categories)
  const settings = useApp((s) => s.settings)
  const allEventRecipes = useApp((s) => s.eventRecipes)
  const eventRecipes = useMemo(
    () => allEventRecipes.filter((l) => l.eventId === event.id),
    [allEventRecipes, event.id],
  )
  const updateEvent = useApp((s) => s.updateEvent)
  const addEventRecipe = useApp((s) => s.addEventRecipe)
  const removeEventRecipe = useApp((s) => s.removeEventRecipe)
  const toast = useApp((s) => s.toast)

  const [addRecipesOpen, setAddRecipesOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [nameDraft, setNameDraft] = useState(event.name)

  useEffect(() => {
    setNameDraft(event.name)
  }, [event.id])

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    for (const r of recipes) map.set(r.id, r)
    return map
  }, [recipes])

  const included = useMemo(
    () =>
      eventRecipes
        .map((l) => recipesById.get(l.recipeId))
        .filter((r): r is Recipe => Boolean(r)),
    [eventRecipes, recipesById],
  )

  /** Category colour per recipe — the placeholder tint when a recipe has no photo. */
  const colorByRecipe = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recipes) {
      const category = categories.find((c) => c.id === r.categoryId)
      map.set(
        r.id,
        category ? colorFor(category.colorName, category.colorSet) : allRecipesColor(settings),
      )
    }
    return map
  }, [recipes, categories, settings])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const addedIds = new Set(eventRecipes.map((l) => l.recipeId))
    return recipes
      .filter((r) => !addedIds.has(r.id))
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [recipes, eventRecipes, query])

  async function saveName() {
    const name = nameDraft.trim() || event.name
    setNameDraft(name)
    if (name !== event.name) await updateEvent(event.id, { name })
  }

  async function handleAddRecipe(recipe: Recipe) {
    await addEventRecipe(event.id, recipe.id)
    toast(`“${recipe.title}” added to ${event.name}.`, 'success')
  }

  return (
    <>
      {/* Event header: back, editable name, date */}
      <div className="card p-4 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-ghost !px-2 text-sm" onClick={onBack}>
            <ChevronLeft size={16} /> All events
          </button>
          <div className="flex-1 min-w-[12rem] flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              aria-label="Event name"
              className="!py-1.5 font-semibold flex-1 min-w-0"
            />
          </div>
          <label className="text-sm text-content-muted flex items-center gap-2 shrink-0">
            Date
            <input
              type="date"
              value={event.date ?? ''}
              onChange={(e) => updateEvent(event.id, { date: e.target.value || undefined })}
              className="!py-1.5"
              aria-label="Event date"
            />
          </label>
          <button
            className="btn-ghost !p-2 text-content-muted hover:text-red-600 shrink-0"
            onClick={onDelete}
            aria-label="Delete event"
            title="Delete event"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Recipes for this event */}
      <section className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-bold flex items-center gap-2">
            <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: PLANNER_HEX }} />
            Event recipes
          </h3>
          <button className="btn-soft" onClick={() => setAddRecipesOpen(true)}>
            <Plus size={15} /> Add recipe
          </button>
        </div>
        {included.length === 0 ? (
          <p className="text-sm text-content-muted rounded-xl border border-dashed border-line p-4 text-center">
            No recipes yet — add the recipes you&apos;ll cook for this event. Their ingredients flow
            automatically into the shopping list below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {included.map((recipe) => {
              const link = eventRecipes.find((l) => l.recipeId === recipe.id)
              const hex = colorByRecipe.get(recipe.id) ?? PLANNER_HEX
              return (
                <div
                  key={recipe.id}
                  className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-1.5 pr-2.5"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                    {recipe.photo ? (
                      <img
                        src={recipe.photo}
                        alt={recipe.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(135deg, ${hex}55, ${hex}1a 70%, ${hex}0d)`,
                        }}
                        aria-hidden
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium max-w-[14rem] truncate" title={recipe.title}>
                    {recipe.title}
                  </span>
                  <button
                    className="btn-ghost !p-1 rounded-full text-content-muted hover:text-red-600"
                    aria-label={`Remove ${recipe.title} from event`}
                    onClick={() => link && removeEventRecipe(link.id)}
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Three columns: shopping list | all ingredients | to-do list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <ShoppingColumn event={event} />
        <IngredientsColumn event={event} included={included} />
        <TodoColumn event={event} />
      </div>

      {/* Add-recipes modal */}
      <Modal
        open={addRecipesOpen}
        onClose={() => {
          setAddRecipesOpen(false)
          setQuery('')
        }}
        title={`Add recipes to “${event.name}”`}
        size="lg"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="w-full mb-3"
          autoFocus
        />
        {candidates.length === 0 ? (
          <p className="text-sm text-content-muted py-6 text-center">
            {recipes.length === 0
              ? 'No recipes in your cookbook yet.'
              : 'All your recipes are already in this event.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((recipe) => (
              <li key={recipe.id}>
                <button
                  className="w-full text-left rounded-lg px-2 py-2 text-sm hover:bg-surface-3 flex items-center gap-2"
                  onClick={() => handleAddRecipe(recipe)}
                >
                  <Plus size={14} className="text-content-muted shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{recipe.title}</span>
                  <span className="text-xs text-content-muted shrink-0">
                    {recipe.ingredients.length} ingr.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}

/** Column 1 — the event's shopping list: auto ingredients + manual items. */
function ShoppingColumn({ event }: { event: EventPlan }) {
  const allItems = useApp((s) => s.eventShoppingItems)
  const items = useMemo(() => allItems.filter((i) => i.eventId === event.id), [allItems, event.id])
  const toggleItem = useApp((s) => s.toggleEventShoppingItem)
  const addItem = useApp((s) => s.addEventShoppingItem)
  const deleteItem = useApp((s) => s.deleteEventShoppingItem)

  const [draft, setDraft] = useState('')

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
    [items],
  )
  const checked = items.filter((i) => i.checked).length

  function handleAdd() {
    const raw = draft.trim()
    if (!raw) return
    const parsed = parseIngredient(raw)
    void addItem(event.id, { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, raw })
    setDraft('')
  }

  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h4 className="font-bold mb-1 flex items-center gap-2">
        <ShoppingCart size={17} className="text-brand" />
        Shopping list
      </h4>
      <p className="text-[11px] text-content-muted mb-3">
        {items.length} item{items.length === 1 ? '' : 's'} · {checked} checked · auto-filled from
        your recipes
      </p>

      <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-line">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder="Add item — e.g. 2 cups olive oil"
          className="!py-1.5 text-sm flex-1 min-w-0"
          aria-label="Add shopping list item"
        />
        <button className="btn-soft !py-1.5 shrink-0" onClick={handleAdd} disabled={!draft.trim()}>
          <Plus size={15} />
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-content-muted">
          Nothing here yet — add recipes to this event, or add items by hand above.
        </p>
      ) : (
        <ul className="space-y-1">
          {sorted.map((item) => (
            <EventItemRow
              key={item.id}
              item={item}
              onToggle={() => toggleItem(item.id)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function EventItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: EventShoppingItem
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg p-2 bg-surface hover:bg-surface-3 transition-colors group">
      <input
        type="checkbox"
        checked={item.checked}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-label={`Check ${itemLabel(item)}`}
      />
      <span className={`flex-1 min-w-0 text-sm ${item.checked ? 'line-through text-content-muted' : ''}`}>
        {itemLabel(item)}
        {!item.manual && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-content-muted">auto</span>
        )}
      </span>
      <button
        className="btn-ghost !p-1 text-content-muted hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
        onClick={onDelete}
        aria-label="Remove item"
      >
        <Trash2 size={13} />
      </button>
    </li>
  )
}

/** Column 2 — the automatically generated ingredients summary (pantry checks). */
function IngredientsColumn({ event, included }: { event: EventPlan; included: Recipe[] }) {
  const allChecks = useApp((s) => s.eventIngredientChecks)
  const checks = useMemo(
    () => allChecks.filter((c) => c.eventId === event.id),
    [allChecks, event.id],
  )
  const togglePantry = useApp((s) => s.toggleEventPantry)

  const ingredients = useMemo(() => combineIngredients(included), [included])
  const pantryKeys = useMemo(() => {
    const set = new Set<string>()
    for (const c of checks) if (c.pantry) set.add(c.key)
    return set
  }, [checks])

  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h4 className="font-bold mb-1 flex items-center gap-2">
        <Salad size={17} className="text-brand" />
        All ingredients
      </h4>
      <p className="text-[11px] text-content-muted mb-3">
        Generated from the event recipes · check pantry items to remove them from the shopping list
      </p>

      {ingredients.length === 0 ? (
        <p className="text-sm text-content-muted">
          Add recipes to this event and their ingredients appear here automatically.
        </p>
      ) : (
        <ul className="space-y-1">
          {ingredients.map((ing) => {
            const inPantry = pantryKeys.has(ing.key)
            return (
              <li
                key={ing.key}
                className="flex items-start gap-2.5 rounded-lg p-2 bg-surface hover:bg-surface-3 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={inPantry}
                  onChange={() => togglePantry(event.id, ing.key)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-label={`I already have ${ing.name} in the pantry`}
                />
                <span
                  className={`flex-1 min-w-0 text-sm ${inPantry ? 'line-through text-content-muted' : ''}`}
                >
                  {ing.label}
                  {inPantry && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-content-muted">
                      pantry
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Column 3 — the event's to-do list. */
function TodoColumn({ event }: { event: EventPlan }) {
  const allTodos = useApp((s) => s.eventTodos)
  const todos = useMemo(() => allTodos.filter((t) => t.eventId === event.id), [allTodos, event.id])
  const addTodo = useApp((s) => s.addEventTodo)
  const toggleTodo = useApp((s) => s.toggleEventTodo)
  const deleteTodo = useApp((s) => s.deleteEventTodo)

  const [draft, setDraft] = useState('')

  const sorted = useMemo(
    () => [...todos].sort((a, b) => Number(a.checked) - Number(b.checked) || b.createdAt - a.createdAt),
    [todos],
  )

  function handleAdd() {
    const text = draft.trim()
    if (!text) return
    void addTodo(event.id, text)
    setDraft('')
  }

  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h4 className="font-bold mb-1 flex items-center gap-2">
        <ListTodo size={17} className="text-brand" />
        To-do list
      </h4>
      <p className="text-[11px] text-content-muted mb-3">
        {todos.filter((t) => !t.checked).length} of {todos.length} open
      </p>

      <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-line">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder="Add a to-do"
          className="!py-1.5 text-sm flex-1 min-w-0"
          aria-label="Add to-do"
        />
        <button className="btn-soft !py-1.5 shrink-0" onClick={handleAdd} disabled={!draft.trim()}>
          <Plus size={15} />
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-content-muted">
          Plan the prep — clean the house, chill the drinks, borrow tables…
        </p>
      ) : (
        <ul className="space-y-1">
          {sorted.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={() => toggleTodo(todo.id)}
              onDelete={() => deleteTodo(todo.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: EventTodo
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg p-2 bg-surface hover:bg-surface-3 transition-colors group">
      <input
        type="checkbox"
        checked={todo.checked}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-label={`Complete ${todo.text}`}
      />
      <span className={`flex-1 min-w-0 text-sm ${todo.checked ? 'line-through text-content-muted' : ''}`}>
        {todo.text}
      </span>
      <button
        className="btn-ghost !p-1 text-content-muted hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
        onClick={onDelete}
        aria-label="Remove to-do"
      >
        <Trash2 size={13} />
      </button>
    </li>
  )
}
