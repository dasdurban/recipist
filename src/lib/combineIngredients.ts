import type { Recipe } from '../types'
import { COUNT_UNITS, FOODS, VOLUME_ML, WEIGHT_G } from './nutrition-data'
import { normalizeName, parseIngredient, stripNoise } from './nutrition'

/**
 * Combines the ingredients of several recipes into one summary, adding the
 * quantities of similar items together — "1 cup milk" + "3 cups milk" becomes
 * a single "4 cups milk" line. Used by the Event Planner's all-ingredients
 * column and its auto-generated shopping list so both stay in step.
 */

export interface CombinedIngredient {
  /** normalized key also used to remember pantry checks */
  key: string
  /** display name, e.g. "milk" */
  name: string
  /** ready-to-show label, e.g. "4 cups milk" */
  label: string
  quantity?: number
  unit?: string
  /** how many source ingredient lines were folded into this row */
  count: number
}

type UnitFamilyName = 'volume' | 'weight' | 'count' | 'other' | 'none'

interface UnitInfo {
  canon: string
  family: 'volume' | 'weight' | 'count' | 'other' | 'none'
  /** ml (volume) or grams (weight) per unit; 1 otherwise */
  factor: number
}

/**
 * Key used to match the "same" ingredient across recipes. Ingredients whose
 * (noise-stripped) name exactly matches a known food or one of its aliases are
 * keyed by that food — so "milk" and "whole milk" combine, as do "flour" and
 * "all-purpose flour" — while anything else falls back to a normalized,
 * singularized name. Matching is exact, so "almond flour" never merges "flour".
 */
let FOOD_INDEX: Map<string, string> | null = null

function foodIndex(): Map<string, string> {
  if (FOOD_INDEX) return FOOD_INDEX
  const index = new Map<string, string>()
  for (const food of FOODS) {
    index.set(normalizeName(food.name), food.name)
    for (const alias of food.aliases ?? []) index.set(normalizeName(alias), food.name)
  }
  FOOD_INDEX = index
  return index
}

export function ingredientKey(name: string): string {
  // "butter, melted" / "onion, finely diced": match on the part before the comma
  const text = (name ?? '').split(',')[0].trim()
  if (!text) return ''
  const cleaned = stripNoise(text)
  if (!cleaned) return ''
  const singular = cleaned.replace(/ies$/, 'y').replace(/(es|s)$/, '')
  const index = foodIndex()
  const food = index.get(cleaned) ?? (singular !== cleaned ? index.get(singular) : undefined)
  if (food) return `food:${food.toLowerCase()}`
  return `text:${singular || cleaned}`
}

/** Units that share a meaning but differ in spelling. */
const UNIT_ALIASES: Record<string, string> = {
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  cc: 'ml',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  pieces: 'piece',
  bunches: 'bunch',
  pinches: 'pinch',
  dashes: 'dash',
}

function knownUnit(u: string): boolean {
  return VOLUME_ML[u] !== undefined || WEIGHT_G[u] !== undefined || COUNT_UNITS.has(u)
}

function canonicalUnit(unit?: string): string {
  if (!unit) return ''
  const u = unit.trim().toLowerCase().replace(/\.+$/, '')
  if (!u) return ''
  if (UNIT_ALIASES[u]) return UNIT_ALIASES[u]
  // plural of a known unit, e.g. "cups" -> "cup", "cloves" -> "clove"
  if (u.endsWith('s') && !u.endsWith('ss')) {
    const singular = u.replace(/ies$/, 'y').replace(/s$/, '')
    if (singular !== u && knownUnit(singular)) return singular
  }
  return u
}

function unitInfo(unit?: string): UnitInfo {
  const canon = canonicalUnit(unit)
  if (!canon) return { canon: '', family: 'none', factor: 1 }
  if (VOLUME_ML[canon] !== undefined) return { canon, family: 'volume', factor: VOLUME_ML[canon] }
  if (WEIGHT_G[canon] !== undefined) return { canon, family: 'weight', factor: WEIGHT_G[canon] }
  if (COUNT_UNITS.has(canon)) return { canon, family: 'count', factor: 1 }
  return { canon, family: 'other', factor: 1 }
}

/** Units whose names pluralize with a trailing "s". */
const PLURAL_UNITS = new Set([
  'cup',
  'clove',
  'slice',
  'can',
  'jar',
  'package',
  'pint',
  'quart',
  'gallon',
  'pound',
  'liter',
  'stick',
  'sprig',
  'head',
  'bunch',
  'handful',
  'pinch',
  'dash',
  'piece',
])

function unitLabel(canon: string, quantity: number): string {
  if (!canon) return ''
  if (PLURAL_UNITS.has(canon)) return quantity > 1 ? `${canon}s` : canon
  return canon
}

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
]

/** "4" -> "4", "1.5" -> "1½", "0.25" -> "¼", "2.125" -> "2.13" */
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return ''
  const rounded = Math.round(quantity * 1000) / 1000
  if (Number.isInteger(rounded)) return String(rounded)
  const whole = Math.floor(rounded)
  const frac = rounded - whole
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) return whole > 0 ? `${whole}${glyph}` : glyph
  }
  return String(Math.round(rounded * 100) / 100)
}

interface Group {
  canon: string
  family: UnitFamilyName
  factor: number
  quantity: number
}

interface Accumulator {
  key: string
  name: string
  order: number
  groups: Map<string, Group>
  count: number
}

function groupKeyFor(info: { canon: string; family: UnitFamilyName }): string {
  switch (info.family) {
    case 'volume':
      return 'volume'
    case 'weight':
      return 'weight'
    case 'none':
      return 'none'
    default:
      return `${info.family}:${info.canon}`
  }
}

function groupText(group: Group): string {
  const qty = formatQuantity(group.quantity)
  if (group.family === 'none') return qty
  const unit = unitLabel(group.canon, group.quantity)
  return unit ? `${qty} ${unit}` : qty
}

export function combineIngredients(recipes: Recipe[]): CombinedIngredient[] {
  const rows = new Map<string, Accumulator>()
  let order = 0

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients ?? []) {
      const name = (ing.name || ing.raw || '').trim()
      if (!name) continue
      const key = ingredientKey(name)
      if (!key) continue

      let row = rows.get(key)
      if (!row) {
        row = { key, name, order: order++, groups: new Map(), count: 0 }
        rows.set(key, row)
      }
      row.count += 1

      // fall back to the raw text when an ingredient was saved without parsing
      const parsed = ing.quantity === undefined || ing.unit === undefined ? parseIngredient(ing.raw) : null
      const quantity = ing.quantity ?? parsed?.quantity
      const unit = ing.unit ?? parsed?.unit
      if (quantity === undefined || !Number.isFinite(quantity)) continue

      const info = unitInfo(unit)
      const groupKey = groupKeyFor(info)
      const existing = row.groups.get(groupKey)
      if (!existing) {
        row.groups.set(groupKey, {
          canon: info.canon,
          family: info.family,
          factor: info.factor,
          quantity,
        })
      } else if (existing.family === 'volume' || existing.family === 'weight') {
        // convert into the unit we saw first, e.g. 2 tbsp -> 0.125 cup
        existing.quantity += (quantity * info.factor) / existing.factor
      } else {
        existing.quantity += quantity
      }
    }
  }

  return [...rows.values()]
    .sort((a, b) => a.order - b.order)
    .map((row) => {
      const groups = [...row.groups.values()]
      const prefix = groups.map(groupText).join(' + ')
      return {
        key: row.key,
        name: row.name,
        label: prefix ? `${prefix} ${row.name}` : row.name,
        quantity: groups.length === 1 ? groups[0].quantity : undefined,
        unit: groups.length === 1 ? groups[0].canon || undefined : undefined,
        count: row.count,
      }
    })
}
