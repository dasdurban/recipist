import type { Ingredient, NutritionEstimate } from '../types'
import { uid } from '../db/database'
import {
  COUNT_UNITS,
  FOODS,
  VOLUME_ML,
  WEIGHT_G,
  type FoodItem,
} from './nutrition-data'

// ------------------------------------------------------------------ text utils

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

function expandFractions(text: string): string {
  let out = text
  for (const [glyph, value] of Object.entries(UNICODE_FRACTIONS)) {
    out = out.replaceAll(glyph, ` ${value} `)
  }
  return out
}

const NOISE_WORDS = new Set([
  'fresh', 'freshly', 'large', 'medium', 'small', 'ripe', 'chopped', 'diced', 'minced',
  'sliced', 'grated', 'shredded', 'crushed', 'peeled', 'halved', 'quartered', 'cubed',
  'boneless', 'skinless', 'unsalted', 'salted', 'frozen', 'thawed', 'canned', 'cooked',
  'uncooked', 'raw', 'organic', 'extra', 'virgin', 'to', 'taste', 'as', 'needed',
  'optional', 'plus', 'more', 'for', 'serving', 'garnish', 'divided', 'about', 'roughly',
  'good', 'quality', 'cold', 'warm', 'room', 'temperature', 'finely', 'thinly', 'roughly',
])

export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s%.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripNoise(text: string): string {
  return normalizeName(text)
    .split(' ')
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(' ')
}

// ------------------------------------------------------------------ food index

interface IndexEntry {
  key: string
  food: FoodItem
}

let INDEX: IndexEntry[] | null = null

function ensureIndex(): IndexEntry[] {
  if (INDEX) return INDEX
  const entries: IndexEntry[] = []
  for (const food of FOODS) {
    entries.push({ key: normalizeName(food.name), food })
    if (food.aliases) {
      for (const alias of food.aliases) entries.push({ key: normalizeName(alias), food })
    }
  }
  // Longest keys first so "cream cheese" beats "cheese".
  entries.sort((a, b) => b.key.length - a.key.length)
  INDEX = entries
  return entries
}

export function findFood(name: string): FoodItem | null {
  const cleaned = stripNoise(name)
  if (!cleaned) return null
  const entries = ensureIndex()
  for (const entry of entries) {
    if (cleaned === entry.key) return entry.food
  }
  for (const entry of entries) {
    const re = new RegExp(`(^|\\s)${escapeRegExp(entry.key)}(\\s|$)`)
    if (re.test(cleaned)) return entry.food
  }
  // try singular fallbacks for a couple of trailing chars
  const singular = cleaned.replace(/ies$/, 'y').replace(/(es|s)$/, '')
  if (singular !== cleaned) {
    for (const entry of entries) {
      const re = new RegExp(`(^|\\s)${escapeRegExp(entry.key)}(\\s|$)`)
      if (re.test(singular)) return entry.food
    }
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ------------------------------------------------------------------ parsing

export interface ParsedIngredient {
  quantity?: number
  unit?: string
  name: string
  /** grams declared in parentheses, e.g. "2 (14.5 oz) cans" */
  declaredGrams?: number
  /** number of cans/packages described by the size in parentheses */
  packageCount?: number
}

const UNIT_ALIASES: Record<string, string> = {
  t: 'tsp',
  tsps: 'tsp',
  tbs: 'tbsp',
  tbsps: 'tbsp',
  'fl.': 'fl oz',
  c: 'cup',
  gr: 'g',
  grs: 'g',
  ml: 'ml',
  ltr: 'l',
}

export function parseIngredient(raw: string): ParsedIngredient {
  const text = expandFractions(raw.replace(/\u00a0/g, ' ')).trim()
  let working = text
  let declaredGrams: number | undefined
  let packageCount: number | undefined

  // capture a size hint like "(14.5 oz)" or "(400 g)"
  const parenMatch = working.match(/\(([^)]*)\)/)
  if (parenMatch) {
    const inner = parenMatch[1]
    const size = inner.match(/(\d*\.?\d+)\s*(oz|ounce|ounces|g|gram|grams|kg|lb|pound|pounds|ml|l)\b/i)
    if (size) {
      const q = parseFloat(size[1])
      const u = size[2].toLowerCase()
      if (WEIGHT_G[u]) declaredGrams = q * WEIGHT_G[u]
      else if (VOLUME_ML[u]) declaredGrams = q * VOLUME_ML[u]
    }
    const count = inner.match(/(\d+)\s*(cans?|jars?|packages?|pkg|slices?)/i)
    if (count) packageCount = parseInt(count[1], 10)
    working = working.replace(parenMatch[0], ' ').trim()
  }

  // leading quantity: "1 1/2", "1/2", "2-3", "1.5", "3"
  let quantity: number | undefined
  const qtyMatch = working.match(
    /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\.?\d+)(\s*[-–]\s*(\d*\.?\d+))?/,
  )
  if (qtyMatch) {
    const parseQty = (s: string): number => {
      const t = s.trim()
      if (/^\d+\s+\d+\s*\/\s*\d+$/.test(t)) {
        const [whole, frac] = t.split(/\s+/)
        const [n, d] = frac.split('/').map(Number)
        return Number(whole) + n / d
      }
      if (/^\d+\s*\/\s*\d+$/.test(t)) {
        const [n, d] = t.split('/').map(Number)
        return n / d
      }
      return parseFloat(t)
    }
    const first = parseQty(qtyMatch[1])
    const second = qtyMatch[3] ? parseFloat(qtyMatch[3]) : undefined
    quantity = second !== undefined ? (first + second) / 2 : first
    working = working.slice(qtyMatch[0].length).trim()
  }

  // unit
  let unit: string | undefined
  const words = working.split(/\s+/)
  for (let take = 2; take >= 1; take--) {
    const candidate = words.slice(0, take).join(' ').toLowerCase().replace(/\.$/, '')
    const normalized = UNIT_ALIASES[candidate] ?? candidate
    if (VOLUME_ML[normalized] || WEIGHT_G[normalized] || COUNT_UNITS.has(normalized)) {
      unit = normalized
      working = words.slice(take).join(' ').trim()
      break
    }
  }

  // "3 large eggs" -> quantity without unit
  if (!unit && quantity === undefined && /^\d/.test(working)) {
    const again = working.match(/^(\d*\.?\d+)\s+(.*)$/)
    if (again) {
      quantity = parseFloat(again[1])
      working = again[2]
    }
  }

  return {
    quantity,
    unit,
    name: working.replace(/\s+/g, ' ').replace(/^[,;-]\s*/, '').trim() || raw.trim(),
    declaredGrams,
    packageCount,
  }
}

export function ingredientFromRaw(raw: string, section?: string): Ingredient {
  const parsed = parseIngredient(raw)
  return {
    id: uid('ing_'),
    raw: raw.trim(),
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    section,
  }
}

// ------------------------------------------------------------------ grams

function gramsFor(food: FoodItem, quantity: number, unit?: string, parsed?: ParsedIngredient): number {
  // Package with a declared size, e.g. "2 (14.5 oz) cans"
  if (parsed?.declaredGrams && unit && (unit === 'can' || unit === 'cans' || unit === 'jar' || unit === 'jars' || unit === 'package' || unit === 'packages' || unit === 'pkg')) {
    return quantity * parsed.declaredGrams
  }

  if (unit && WEIGHT_G[unit]) return quantity * WEIGHT_G[unit]

  if (unit && VOLUME_ML[unit]) {
    const ml = quantity * VOLUME_ML[unit]
    if (food.cup) return (ml / VOLUME_ML.cup) * food.cup
    return ml * (food.liquid ? 1 : 0.85)
  }

  if (unit && COUNT_UNITS.has(unit)) {
    if ((unit === 'can' || unit === 'cans') && food.can) return quantity * food.can
    if (food.piece && (unit === 'piece' || unit === 'pieces' || unit === 'whole' || unit === 'slice' || unit === 'slices' || unit === 'clove' || unit === 'cloves' || unit === 'stick' || unit === 'sticks')) {
      return quantity * food.piece
    }
    if (food.piece) return quantity * food.piece
    return quantity * 100
  }

  // no unit: assume "pieces" of this food, else 100 g
  if (food.piece) return quantity * food.piece
  return quantity * 100
}

// ------------------------------------------------------------------ estimate

export function nutritionForIngredient(ingredient: Ingredient): { food: FoodItem; grams: number } | null {
  const food = findFood(ingredient.name || ingredient.raw)
  if (!food) return null
  const parsed = parseIngredient(ingredient.raw)
  const quantity = ingredient.quantity ?? parsed.quantity
  const unit = ingredient.unit ?? parsed.unit

  let grams: number
  if (quantity === undefined) {
    // "salt and pepper to taste", "oil for frying": real recipes rarely mean a
    // full 100 g, so use a sensible small default instead of guessing big.
    if (food.groups?.includes('seasoning')) grams = 1
    else if (food.piece) grams = food.piece
    else grams = 15
  } else {
    grams = gramsFor(food, quantity, unit, parsed)
  }

  if (!Number.isFinite(grams) || grams <= 0) return null
  return { food, grams }
}

export function healthRating(score: number): NutritionEstimate['rating'] {
  if (score >= 78) return 'excellent'
  if (score >= 58) return 'good'
  if (score >= 38) return 'fair'
  return 'poor'
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function scoreNutrition(
  per: { cal: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number },
  groupsWeight: Record<string, number>,
): number {
  if (per.cal <= 0) return 50
  const per1000 = (v: number) => (v / per.cal) * 1000

  let score = 50

  // positive
  score += clamp(per1000(per.fiber) / 14, 0, 1) * 18 // fiber density
  score += clamp(per1000(per.protein) / 50, 0, 1) * 14 // protein density

  const totalGroups = Object.values(groupsWeight).reduce((a, b) => a + b, 0) || 1
  const goodShare =
    (['veg', 'fruit', 'legume', 'wholegrain', 'nut'] as const).reduce(
      (a, g) => a + (groupsWeight[g] ?? 0),
      0,
    ) / totalGroups
  const badShare =
    (['added-sugar', 'refined', 'processed', 'rich-fat'] as const).reduce(
      (a, g) => a + (groupsWeight[g] ?? 0),
      0,
    ) / totalGroups
  score += goodShare * 16
  score -= badShare * 10

  // negative
  score -= clamp((per1000(per.sugar) - 25) / 50, 0, 1) * 16
  score -= clamp((per1000(per.sodium) - 700) / 1300, 0, 1) * 16
  score -= clamp((per1000(per.fat) - 35) / 40, 0, 1) * 10
  // very calorie-dense single servings
  score -= clamp((per.cal - 700) / 700, 0, 1) * 6

  return Math.round(clamp(score, 0, 100))
}

/**
 * Estimates calories/macros for the whole recipe as entered, plus a 0-100
 * health score. Missing ingredients are reported so the UI can nudge the user.
 */
export function estimateNutrition(
  ingredients: Ingredient[],
  servings?: number,
): NutritionEstimate {
  let cal = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let fiber = 0
  let sugar = 0
  let sodium = 0
  let matched = 0
  const groupsWeight: Record<string, number> = {}

  for (const ingredient of ingredients) {
    const result = nutritionForIngredient(ingredient)
    if (!result) continue
    const { food, grams } = result
    matched++
    const k = grams / 100
    cal += food.kcal * k
    protein += food.protein * k
    carbs += food.carbs * k
    fat += food.fat * k
    fiber += food.fiber * k
    sugar += food.sugar * k
    sodium += food.sodium * k
    if (food.groups) {
      for (const g of food.groups) groupsWeight[g] = (groupsWeight[g] ?? 0) + grams
    }
  }

  const perServings = servings && servings > 0 ? servings : 1
  const per = {
    cal: cal / perServings,
    protein: protein / perServings,
    carbs: carbs / perServings,
    fat: fat / perServings,
    fiber: fiber / perServings,
    sugar: sugar / perServings,
    sodium: sodium / perServings,
  }

  const score = matched > 0 ? scoreNutrition(per, groupsWeight) : 50

  return {
    calories: Math.round(cal),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    sugar: Math.round(sugar * 10) / 10,
    sodium: Math.round(sodium),
    matched,
    total: ingredients.length,
    score,
    rating: healthRating(score),
    computedAt: Date.now(),
  }
}
