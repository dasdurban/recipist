import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  LayoutGrid,
  List,
  ListTodo,
  PanelsTopLeft,
  Pencil,
  Plus,
  Salad,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '../store/useApp'
import { ColorPicker } from './ui/ColorPicker'
import { Modal } from './ui/Modal'
import { parseIngredient } from '../lib/nutrition'
import { combineIngredients } from '../lib/combineIngredients'
import { allRecipesColor, colorFor, prefersLightText } from '../lib/colors'
import type {
  EventPlan,
  EventShoppingItem,
  EventTodo,
  PlannerView,
  Recipe,
} from '../types'

/** The three layouts offered in the "Your events" section. */
const PLANNER_VIEWS: Array<{ id: PlannerView; label: string; icon: typeof LayoutGrid }> = [
  { id: 'cards', label: 'Card view', icon: LayoutGrid },
  { id: 'list', label: 'List view', icon: List },
  { id: 'preview', label: 'Preview view', icon: PanelsTopLeft },
]

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
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  /** Title-box colour — user-selectable, like the category / All recipes views. */
  const hex = colorFor(settings.plannerColorName, settings.plannerColorSet)
  const view = settings.plannerView

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
        style={{ backgroundColor: `${hex}14`, borderColor: `${hex}33` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-12 w-12 rounded-2xl shrink-0 flex items-center justify-center text-white"
            style={{ backgroundColor: hex }}
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
            type="button"
            onClick={() => setColorOpen(true)}
            title="Change the Event planner color"
            aria-label="Change the Event planner color"
            className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-content ring-offset-2 ring-offset-surface"
            style={{ backgroundColor: hex }}
          >
            <Pencil
              size={14}
              color={prefersLightText(hex) ? '#ffffff' : '#111827'}
              className="opacity-70"
            />
          </button>
          <button
            className="btn-grey shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      <>
          {/* Events section */}
          <section className="mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-bold flex items-center gap-2">
                <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
                Your events
              </h3>
              {sorted.length > 0 && (
                <div
                  className="flex items-center gap-0.5 rounded-lg border border-line p-0.5 shrink-0"
                  role="group"
                  aria-label="Event view"
                >
                  {PLANNER_VIEWS.map((v) => {
                    const Icon = v.icon
                    const selected = view === v.id
                    return (
                      <button
                        key={v.id}
                        type="button"
                        title={v.label}
                        aria-label={v.label}
                        aria-pressed={selected}
                        onClick={() => updateSettings({ plannerView: v.id })}
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
            </div>
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
            ) : view === 'list' ? (
              /* One full-width row per event. */
              <div className="flex flex-col gap-2">
                {sorted.map((ev) => (
                  <EventListRow
                    key={ev.id}
                    event={ev}
                    hex={hex}
                    onSelect={() => setActiveEvent(ev.id)}
                    onDelete={() => handleDelete(ev)}
                  />
                ))}
              </div>
            ) : view === 'preview' ? (
              /* Miniature of the event's own page — fills the width, so two
                 previews sit at 50% each, three at 33%, and so on. */
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}
              >
                {sorted.map((ev) => (
                  <EventPreviewCard
                    key={ev.id}
                    event={ev}
                    hex={hex}
                    onSelect={() => setActiveEvent(ev.id)}
                    onDelete={() => handleDelete(ev)}
                  />
                ))}
              </div>
            ) : (
              /* Cards stretch to fill the row: 2 events → 50% each, 3 → 33%. */
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}
              >
                {sorted.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    hex={hex}
                    onSelect={() => setActiveEvent(ev.id)}
                    onDelete={() => handleDelete(ev)}
                  />
                ))}
              </div>
            )}
          </section>

        {event && (
          <EventDetail event={event} onBack={() => setActiveEvent(null)} onDelete={() => handleDelete(event)} />
        )}
      </>

      {/* Event planner colour picker */}
      <Modal
        open={colorOpen}
        onClose={() => setColorOpen(false)}
        title="Event planner color"
        size="sm"
        footer={
          <button className="btn-primary" onClick={() => setColorOpen(false)}>
            Done
          </button>
        }
      >
        <ColorPicker
          colorSet={settings.plannerColorSet}
          colorName={settings.plannerColorName}
          onChange={(next) =>
            updateSettings({ plannerColorName: next.colorName, plannerColorSet: next.colorSet })
          }
        />
      </Modal>

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

/** Everything the event tiles need: linked recipes (with photos), shopping
 *  items and to-dos. Memoised, so it is safe to call per tile. */
function useEventStats(event: EventPlan) {
  const recipes = useApp((s) => s.recipes)
  const allEventRecipes = useApp((s) => s.eventRecipes)
  const allItems = useApp((s) => s.eventShoppingItems)
  const allTodos = useApp((s) => s.eventTodos)

  const links = useMemo(
    () => allEventRecipes.filter((l) => l.eventId === event.id),
    [allEventRecipes, event.id],
  )
  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    for (const r of recipes) map.set(r.id, r)
    return map
  }, [recipes])
  const included = useMemo(
    () =>
      links
        .map((l) => recipesById.get(l.recipeId))
        .filter((r): r is Recipe => Boolean(r)),
    [links, recipesById],
  )
  const photos = useMemo(
    () => included.map((r) => r.photo).filter((p): p is string => Boolean(p)),
    [included],
  )
  const items = useMemo(() => allItems.filter((i) => i.eventId === event.id), [allItems, event.id])
  const todos = useMemo(() => allTodos.filter((t) => t.eventId === event.id), [allTodos, event.id])

  return {
    links,
    included,
    photos,
    items,
    todos,
    openTodos: todos.filter((t) => !t.checked).length,
    dateLabel: fmtDate(event.date),
  }
}

type EventStats = ReturnType<typeof useEventStats>

/** "Thu, Nov 26 · 3 recipes · 12 items · 2 to-dos" */
function statsText(s: EventStats): string {
  const parts = [
    s.dateLabel ?? 'No date',
    `${s.links.length} recipe${s.links.length === 1 ? '' : 's'}`,
    `${s.items.length} item${s.items.length === 1 ? '' : 's'}`,
  ]
  if (s.openTodos > 0) parts.push(`${s.openTodos} to-do${s.openTodos === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Wraps an event tile and makes the whole thing open the event. */
function EventTile({
  name,
  onSelect,
  className,
  children,
}: {
  name: string
  onSelect: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${name}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        // ignore keys aimed at a nested control (e.g. the delete button)
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

/** Small "delete event" icon button shared by the three layouts. */
function DeleteEventButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      className="btn-ghost !p-1 text-content-muted hover:text-red-600 shrink-0"
      onClick={(e) => {
        e.stopPropagation()
        onDelete()
      }}
      aria-label="Delete event"
      title="Delete event"
    >
      <Trash2 size={14} />
    </button>
  )
}

/** Card view — a compact summary tile. */
function EventCard({
  event,
  hex,
  onSelect,
  onDelete,
}: {
  event: EventPlan
  hex: string
  onSelect: () => void
  onDelete: () => void
}) {
  const s = useEventStats(event)

  return (
    <EventTile
      name={event.name}
      onSelect={onSelect}
      className="card p-3 overflow-hidden flex flex-col gap-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="h-7 w-7 rounded-lg shrink-0 flex items-center justify-center"
          style={{ backgroundColor: `${hex}22`, color: hex }}
          aria-hidden
        >
          <CalendarDays size={15} />
        </span>
        <h4 className="font-semibold text-sm truncate flex-1">{event.name}</h4>
        <DeleteEventButton onDelete={onDelete} />
      </div>
      {s.photos.length > 0 && (
        <div className="flex gap-1.5 overflow-hidden">
          {s.photos.slice(0, 5).map((photo, i) => (
            <img
              key={i}
              src={photo}
              alt=""
              loading="lazy"
              className="h-12 w-12 rounded-lg object-cover shrink-0 bg-surface-3"
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-content-muted mt-auto">{statsText(s)}</p>
    </EventTile>
  )
}

/** List view — one full-width row per event. */
function EventListRow({
  event,
  hex,
  onSelect,
  onDelete,
}: {
  event: EventPlan
  hex: string
  onSelect: () => void
  onDelete: () => void
}) {
  const s = useEventStats(event)

  return (
    <EventTile
      name={event.name}
      onSelect={onSelect}
      className="card px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-surface-3"
    >
      <span
        className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center"
        style={{ backgroundColor: `${hex}22`, color: hex }}
        aria-hidden
      >
        <CalendarDays size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{event.name}</div>
        <div className="text-[11px] text-content-muted truncate">{statsText(s)}</div>
      </div>
      {s.photos.length > 0 && (
        <div className="hidden sm:flex -space-x-2 shrink-0">
          {s.photos.slice(0, 4).map((photo, i) => (
            <img
              key={i}
              src={photo}
              alt=""
              loading="lazy"
              className="h-8 w-8 rounded-full object-cover border-2 border-surface bg-surface-3"
            />
          ))}
        </div>
      )}
      <DeleteEventButton onDelete={onDelete} />
    </EventTile>
  )
}

/** Preview view — a miniature of the event's own page: title bar, the recipe
 *  photos and the three columns with their real (truncated) contents. */
function EventPreviewCard({
  event,
  hex,
  onSelect,
  onDelete,
}: {
  event: EventPlan
  hex: string
  onSelect: () => void
  onDelete: () => void
}) {
  const s = useEventStats(event)
  const combined = useMemo(() => combineIngredients(s.included), [s.included])

  const columns = [
    {
      key: 'shopping',
      title: 'Shopping',
      count: s.items.length,
      rows: s.items.map((i) => i.raw?.trim() || itemLabel(i)).slice(0, 4),
    },
    {
      key: 'ingredients',
      title: 'Ingredients',
      count: combined.length,
      rows: combined.map((c) => c.label).slice(0, 4),
    },
    {
      key: 'todos',
      title: 'To-dos',
      count: s.todos.length,
      rows: s.todos.map((t) => t.text).slice(0, 4),
    },
  ]

  return (
    <EventTile
      name={event.name}
      onSelect={onSelect}
      className="card overflow-hidden flex flex-col transition-shadow hover:shadow-lg"
    >
      <div className="text-left p-2.5 flex-1">
        {/* mini title bar */}
        <div
          className="rounded-lg border px-2 py-1.5 mb-2 flex items-center gap-1.5"
          style={{ backgroundColor: `${hex}14`, borderColor: `${hex}33` }}
        >
          <span
            className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center text-white"
            style={{ backgroundColor: hex }}
            aria-hidden
          >
            <CalendarDays size={12} />
          </span>
          <span className="text-[11px] font-semibold truncate">{event.name}</span>
          <span className="ml-auto text-[9px] text-content-muted shrink-0">
            {s.dateLabel ?? 'No date'}
          </span>
        </div>

        {/* mini recipe photos */}
        <div className="flex gap-1 mb-2 overflow-hidden">
          {s.photos.length === 0 ? (
            <span
              className="h-8 w-8 rounded-md shrink-0"
              style={{ background: `linear-gradient(135deg, ${hex}55, ${hex}0d)` }}
              aria-hidden
            />
          ) : (
            s.photos.slice(0, 6).map((photo, i) => (
              <img
                key={i}
                src={photo}
                alt=""
                loading="lazy"
                className="h-8 w-8 rounded-md object-cover shrink-0 bg-surface-3"
              />
            ))
          )}
        </div>

        {/* mini three columns */}
        <div className="grid grid-cols-3 gap-1.5">
          {columns.map((col) => (
            <div key={col.key} className="rounded-md border border-line bg-surface-2 p-1.5 min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-wide text-content-muted mb-1 truncate">
                {col.title}
              </div>
              {col.rows.length === 0 ? (
                <div className="text-[8px] text-content-muted opacity-60">empty</div>
              ) : (
                <ul className="space-y-0.5">
                  {col.rows.map((row, i) => (
                    <li key={i} className="flex items-start gap-1 min-w-0">
                      <span
                        className="mt-[2px] h-1.5 w-1.5 rounded-[2px] border border-line shrink-0"
                        aria-hidden
                      />
                      <span className="text-[8px] leading-tight text-content-muted truncate">
                        {row}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {col.count > col.rows.length && (
                <div className="text-[8px] text-content-muted opacity-70 mt-0.5">
                  +{col.count - col.rows.length} more
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
        <span className="text-[11px] text-content-muted truncate">
          {s.links.length} recipe{s.links.length === 1 ? '' : 's'}
        </span>
        <DeleteEventButton onDelete={onDelete} />
      </div>
    </EventTile>
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

  /** The planner's accent colour follows the title-box colour picker. */
  const plannerHex = colorFor(settings.plannerColorName, settings.plannerColorSet)

  /** Category colour per recipe — the placeholder tint when a recipe has no photo. */
  const colorByRecipe = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recipes) {
      const category = categories.find((c) => c.id === r.categoryIds[0])
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
            <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: plannerHex }} />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {included.map((recipe) => {
              const link = eventRecipes.find((l) => l.recipeId === recipe.id)
              return (
                <EventRecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  color={colorByRecipe.get(recipe.id) ?? plannerHex}
                  onRemove={() => link && removeEventRecipe(link.id)}
                />
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

/** A compact recipe card for the event's recipe grid — the homepage card, but
 *  smaller (five fit side by side) and with a remove-from-event button. */
function EventRecipeCard({
  recipe,
  color,
  onRemove,
}: {
  recipe: Recipe
  color: string
  onRemove: () => void
}) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[4/3] bg-surface-3 overflow-hidden">
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
            style={{ background: `linear-gradient(135deg, ${color}55, ${color}1a 70%, ${color}0d)` }}
            aria-hidden
          />
        )}
        <button
          className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-red-600/80 transition-colors"
          aria-label={`Remove ${recipe.title} from event`}
          title="Remove from event"
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-2.5">
        <h4 className="font-semibold text-xs leading-snug line-clamp-2" title={recipe.title}>
          {recipe.title}
        </h4>
        {totalMinutes > 0 && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-content-muted">
            <Clock size={11} /> {totalMinutes} min
          </div>
        )}
      </div>
    </div>
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
