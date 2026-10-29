import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  CalendarDays,
  ChevronLeft,
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
import { parseIngredient } from '../lib/nutrition'
import { combineIngredients } from '../lib/combineIngredients'
import { Modal } from './ui/Modal'
import { colorFor, prefersLightText } from '../lib/colors'
import type {
  MealPlan,
  MealPlanEntry,
  MealSlot,
  PlannerView,
  Recipe,
} from '../types'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function itemLabel(item: { name: string; quantity?: number; unit?: string; raw?: string }): string {
  if (item.raw && item.raw.trim()) return item.raw.trim()
  const parts: string[] = []
  if (item.quantity !== undefined && item.quantity > 0) parts.push(String(item.quantity))
  if (item.unit) parts.push(item.unit)
  parts.push(item.name)
  return parts.join(' ').trim()
}

function mondayOf(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date.toISOString().slice(0, 10)
}

function fmtWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return weekStart
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const PLANNER_VIEWS: Array<{ id: PlannerView; label: string; icon: typeof LayoutGrid }> = [
  { id: 'cards', label: 'Card view', icon: LayoutGrid },
  { id: 'list', label: 'List view', icon: List },
  { id: 'preview', label: 'Preview view', icon: PanelsTopLeft },
]

export function MealPlannerPage() {
  const mealPlans = useApp((s) => s.mealPlans)
  const activeMealPlanId = useApp((s) => s.activeMealPlanId)
  const setActiveMealPlan = useApp((s) => s.setActiveMealPlan)
  const createMealPlan = useApp((s) => s.createMealPlan)
  const deleteMealPlan = useApp((s) => s.deleteMealPlan)
  const updateSettings = useApp((s) => s.updateSettings)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)

  const [createOpen, setCreateOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWeek, setNewWeek] = useState(mondayOf(new Date()))
  const nameInput = useRef<HTMLInputElement>(null)

  const hex = colorFor(settings.plannerColorName, settings.plannerColorSet)
  const view = settings.plannerView

  useEffect(() => {
    if (createOpen) {
      setNewName('')
      setNewWeek(mondayOf(new Date()))
      requestAnimationFrame(() => nameInput.current?.focus())
    }
  }, [createOpen])

  const plan = mealPlans.find((p) => p.id === activeMealPlanId) ?? null

  async function handleCreate() {
    const name = newName.trim() || 'New meal plan'
    await createMealPlan(name, newWeek)
    setCreateOpen(false)
    toast('Meal plan created.', 'success')
  }

  async function handleDelete(p: MealPlan) {
    if (!window.confirm(`Delete meal plan "${p.name}"?`)) return
    await deleteMealPlan(p.id)
    toast('Meal plan deleted.', 'success')
  }

  const sorted = useMemo(
    () => [...mealPlans].sort((a, b) => b.createdAt - a.createdAt),
    [mealPlans],
  )

  return (
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto w-full">
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
            <h2 className="text-xl font-bold truncate">Meal planner</h2>
            <p className="text-sm text-content-muted">
              {sorted.length} {sorted.length === 1 ? 'plan' : 'plans'}
              {plan ? ` · planning "${plan.name}"` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setColorOpen(true)}
            title="Change the Meal planner color"
            aria-label="Change the Meal planner color"
            className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-content ring-offset-2 ring-offset-surface"
            style={{ backgroundColor: hex }}
          >
            <Pencil
              size={14}
              color={prefersLightText(hex) ? '#ffffff' : '#111827'}
              className="opacity-70"
            />
          </button>
          <button className="btn-grey shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      {plan ? (
        <MealPlanDetail plan={plan} onBack={() => setActiveMealPlan(null)} onDelete={() => handleDelete(plan)} />
      ) : (
        <>
        {createOpen && (
          <div className="rounded-2xl border border-line bg-surface p-5 mb-5 space-y-4">
            <h3 className="font-bold">New meal plan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input
                  ref={nameInput}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Week of 27 Oct"
                  className="w-full"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Week starting (Monday)</label>
                <input
                  type="date"
                  value={newWeek}
                  onChange={(e) => setNewWeek(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-soft" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold flex items-center gap-2">
              <CalendarDays size={16} /> Your meal plans
            </h3>
            <div className="flex items-center gap-1">
              {PLANNER_VIEWS.map((v) => {
                const Icon = v.icon
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => updateSettings({ plannerView: v.id })}
                    title={v.label}
                    className={clsx(
                      'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                      view === v.id ? 'bg-surface-2 text-content' : 'text-content-muted hover:bg-surface-2',
                    )}
                  >
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="text-center py-16 text-content-muted">
              <CalendarDays size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No meal plans yet</p>
              <p className="text-sm mt-1">Create a plan to organise a week of meals.</p>
            </div>
          ) : view === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sorted.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveMealPlan(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setActiveMealPlan(p.id) }}
                  className="text-left rounded-2xl border border-line bg-surface p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-content-muted mt-1">{fmtWeek(p.weekStart)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-content-muted hover:bg-surface-2 hover:text-red-500"
                      aria-label="Delete meal plan"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-line border border-line rounded-2xl overflow-hidden">
              {sorted.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveMealPlan(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setActiveMealPlan(p.id) }}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-surface-2 cursor-pointer"
                >
                  <CalendarDays size={16} className="text-content-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-content-muted">{fmtWeek(p.weekStart)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-content-muted hover:text-red-500"
                    aria-label="Delete meal plan"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
      )}

      <Modal open={colorOpen} onClose={() => setColorOpen(false)} title="Planner color">
        <ColorPicker
          colorSet={settings.plannerColorSet}
          colorName={settings.plannerColorName}
          onChange={(next) => updateSettings({ plannerColorName: next.colorName, plannerColorSet: next.colorSet })}
        />
      </Modal>
    </div>
  )
}

function MealPlanDetail({
  plan,
  onBack,
  onDelete,
}: {
  plan: MealPlan
  onBack: () => void
  onDelete: () => void
}) {
  const recipes = useApp((s) => s.recipes)
  const allEntries = useApp((s) => s.mealPlanEntries)
  const allShoppingItems = useApp((s) => s.mealPlanShoppingItems)
  const allChecks = useApp((s) => s.mealPlanIngredientChecks)
  const allTodos = useApp((s) => s.mealPlanTodos)
  const entries = useMemo(() => allEntries.filter((e) => e.mealPlanId === plan.id), [allEntries, plan.id])
  const shoppingItems = useMemo(() => allShoppingItems.filter((i) => i.mealPlanId === plan.id), [allShoppingItems, plan.id])
  const checks = useMemo(() => allChecks.filter((c) => c.mealPlanId === plan.id), [allChecks, plan.id])
  const todos = useMemo(() => allTodos.filter((t) => t.mealPlanId === plan.id), [allTodos, plan.id])
  const addEntry = useApp((s) => s.addMealPlanEntry)
  const removeEntry = useApp((s) => s.removeMealPlanEntry)
  const togglePantry = useApp((s) => s.toggleMealPlanPantry)
  const toggleShopping = useApp((s) => s.toggleMealPlanShoppingItem)
  const addShopping = useApp((s) => s.addMealPlanShoppingItem)
  const deleteShopping = useApp((s) => s.deleteMealPlanShoppingItem)
  const addTodo = useApp((s) => s.addMealPlanTodo)
  const toggleTodo = useApp((s) => s.toggleMealPlanTodo)
  const deleteTodo = useApp((s) => s.deleteMealPlanTodo)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDay, setPickerDay] = useState(0)
  const [pickerSlot, setPickerSlot] = useState<MealSlot>('dinner')
  const [todoText, setTodoText] = useState('')
  const [manualName, setManualName] = useState('')

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])
  const pantryKeys = useMemo(() => new Set(checks.filter((c) => c.pantry).map((c) => c.key)), [checks])
  const included = useMemo(() => {
    const ids = [...new Set(entries.map((e) => e.recipeId))]
    return ids.map((id) => recipeById.get(id)).filter(Boolean) as Recipe[]
  }, [entries, recipeById])
  const ingredients = useMemo(() => combineIngredients(included), [included])

  const byCell = useMemo(() => {
    const m = new Map<string, MealPlanEntry[]>()
    for (const e of entries) {
      const k = `${e.day}:${e.slot}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return m
  }, [entries])

  async function openPicker(day: number, slot: MealSlot) {
    setPickerDay(day)
    setPickerSlot(slot)
    setPickerOpen(true)
  }

  async function pickRecipe(recipeId: string) {
    await addEntry(plan.id, recipeId, pickerDay, pickerSlot)
    setPickerOpen(false)
  }

  async function addManual() {
    const raw = manualName.trim()
    if (!raw) return
    const parsed = parseIngredient(raw)
    await addShopping(plan.id, { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, raw })
    setManualName('')
  }

  async function addTodoItem() {
    const t = todoText.trim()
    if (!t) return
    await addTodo(plan.id, t)
    setTodoText('')
  }


  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-soft" onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-lg truncate">{plan.name}</h3>
          <p className="text-sm text-content-muted">{fmtWeek(plan.weekStart)}</p>
        </div>
        <button className="btn-soft text-red-500" onClick={onDelete}>
          <Trash2 size={15} /> Delete
        </button>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-8 gap-1.5">
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-content-muted py-1">
                {d}
              </div>
            ))}
            {SLOTS.map((slot) => (
              <div key={slot} className="contents">
                <div className="text-xs font-semibold text-content-muted flex items-center pr-2">
                  {SLOT_LABEL[slot]}
                </div>
                {DAYS.map((_, day) => {
                  const cellEntries = byCell.get(`${day}:${slot}`) ?? []
                  return (
                    <div
                      key={`${day}-${slot}`}
                      className="min-h-[72px] rounded-xl border border-line bg-surface p-1.5 flex flex-col gap-1"
                    >
                      {cellEntries.map((e) => {
                        const r = recipeById.get(e.recipeId)
                        return (
                          <div
                            key={e.id}
                            className="flex items-center gap-1 rounded-lg bg-surface-2 px-1.5 py-1 text-xs"
                          >
                            <span className="truncate flex-1">{r?.title ?? 'Unknown recipe'}</span>
                            <button
                              type="button"
                              onClick={() => removeEntry(e.id)}
                              className="shrink-0 text-content-muted hover:text-red-500"
                              aria-label="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => openPicker(day, slot)}
                        className="mt-auto h-6 rounded-lg border border-dashed border-line text-content-muted hover:bg-surface-2 flex items-center justify-center text-xs"
                        aria-label="Add recipe"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workspace: shopping list + pantry + todos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Shopping list */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="font-bold flex items-center gap-2 mb-3">
            <ShoppingCart size={16} /> Shopping list
          </h4>
          <p className="text-[11px] text-content-muted mb-3">
            {shoppingItems.length} item{shoppingItems.length === 1 ? '' : 's'} · {shoppingItems.filter((i) => i.checked).length} checked · auto-filled from your recipes
          </p>

          <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-line">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addManual() }}
              placeholder="Add item — e.g. 2 cups olive oil"
              className="!py-1.5 text-sm flex-1 min-w-0"
              aria-label="Add shopping list item"
            />
            <button className="btn-soft !py-1.5 shrink-0" onClick={addManual} disabled={!manualName.trim()}>
              <Plus size={15} />
            </button>
          </div>

          {shoppingItems.length === 0 ? (
            <p className="text-sm text-content-muted">
              Nothing here yet — add recipes to the week, or add items by hand above.
            </p>
          ) : (
            <ul className="space-y-1">
              {[...shoppingItems]
                .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name))
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-lg p-2 bg-surface-2 hover:bg-surface-3 transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleShopping(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-label={'Check ' + itemLabel(item)}
                    />
                    <span className={'flex-1 min-w-0 text-sm ' + (item.checked ? 'line-through text-content-muted' : '')}>
                      {itemLabel(item)}
                      {!item.manual && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-content-muted">auto</span>
                      )}
                    </span>
                    {!item.manual && (
                      <button
                        type="button"
                        onClick={() => togglePantry(plan.id, item.key)}
                        className="text-xs text-content-muted hover:text-content shrink-0"
                        title="Mark as already in pantry"
                      >
                        pantry
                      </button>
                    )}
                    <button
                      className="btn-ghost !p-1 text-content-muted hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                      onClick={() => deleteShopping(item.id)}
                      aria-label="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {pantryKeys.size > 0 && (
            <p className="text-xs text-content-muted mt-2">
              {pantryKeys.size} ingredient{pantryKeys.size === 1 ? '' : 's'} marked as in pantry.
            </p>
          )}
        </div>

        {/* All ingredients (pantry checks) */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="font-bold flex items-center gap-2 mb-3">
            <Salad size={16} className="text-brand" /> All ingredients
          </h4>
          <p className="text-[11px] text-content-muted mb-3">
            Generated from the week's recipes — check pantry items to remove them from the shopping list
          </p>
          {ingredients.length === 0 ? (
            <p className="text-sm text-content-muted">
              Add recipes to the week and their ingredients appear here automatically.
            </p>
          ) : (
            <ul className="space-y-1">
              {ingredients.map((ing) => {
                const inPantry = pantryKeys.has(ing.key)
                return (
                  <li
                    key={ing.key}
                    className="flex items-start gap-2.5 rounded-lg p-2 bg-surface-2 hover:bg-surface-3 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={inPantry}
                      onChange={() => togglePantry(plan.id, ing.key)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-label={'I already have ' + ing.name + ' in the pantry'}
                    />
                    <span className={'flex-1 min-w-0 text-sm ' + (inPantry ? 'line-through text-content-muted' : '')}>
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
        </div>

        {/* Todos */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="font-bold flex items-center gap-2 mb-3">
            <ListTodo size={16} /> To-dos
          </h4>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {todos.length === 0 && (
              <p className="text-sm text-content-muted">No to-dos yet.</p>
            )}
            {todos.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.checked}
                  onChange={() => toggleTodo(t.id)}
                  className="h-4 w-4"
                />
                <span className={clsx('flex-1', t.checked && 'line-through text-content-muted')}>
                  {t.text}
                </span>
                <button
                  type="button"
                  onClick={() => deleteTodo(t.id)}
                  className="text-content-muted hover:text-red-500"
                  aria-label="Delete"
                >
                  <X size={13} />
                </button>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              placeholder="Add a to-do"
              className="flex-1 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') addTodoItem() }}
            />
            <button className="btn-soft !px-2" onClick={addTodoItem}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Recipe picker modal */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title={`Add recipe — ${SLOT_LABEL[pickerSlot]}, ${DAYS[pickerDay]}`}>
        <RecipePicker recipes={recipes} onPick={pickRecipe} />
      </Modal>
    </div>
  )
}

function RecipePicker({ recipes, onPick }: { recipes: Recipe[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? recipes.filter((r) => r.title.toLowerCase().includes(needle))
      : recipes
    return list.slice(0, 60)
  }, [recipes, q])
  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search recipes"
        className="w-full"
        autoFocus
      />
      <div className="max-h-80 overflow-auto divide-y divide-line border border-line rounded-xl">
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-content-muted">No recipes match.</p>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-3"
          >
            {r.photo && (
              <img src={r.photo} alt="" className="h-9 w-9 rounded-lg object-cover" />
            )}
            <span className="truncate">{r.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
