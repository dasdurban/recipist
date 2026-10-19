import type { Ingredient, Recipe } from '../types'
import { uid } from '../db/database'
import { estimateNutrition, ingredientFromRaw } from './nutrition'
import { nativeFetchText, nativeFetchViaWebview } from './nativeFetch'

export interface ImportedRecipe {
  title: string
  description?: string
  photo?: string
  servings?: number
  prepMinutes?: number
  cookMinutes?: number
  yieldText?: string
  ingredients: string[]
  instructions: string[]
  sourceUrl: string
}

function isoDurationToMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!match) return undefined
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const total = days * 1440 + hours * 60 + minutes
  return total || undefined
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** Walks JSON-LD looking for a schema.org Recipe node (handles @graph and nesting). */
function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node) return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipeNode(child)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object') return null
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  const types = asArray(type).map((t) => String(t).toLowerCase())
  if (types.includes('recipe')) return obj
  if (obj['@graph']) {
    const found = findRecipeNode(obj['@graph'])
    if (found) return found
  }
  return null
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.name === 'string') return obj.name
  }
  return ''
}

function cleanLines(values: string[]): string[] {
  return values
    .flatMap((v) => v.split(/\r?\n/))
    .map((v) => v.replace(/^\s*[\u2022\-*]\s*/, '').trim())
    .filter((v) => v.length > 0)
}

function parseIngredientStrings(items: unknown): string[] {
  const out: string[] = []
  for (const item of asArray(items)) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      if (Array.isArray(obj.itemListElement)) {
        out.push(...parseIngredientStrings(obj.itemListElement))
      } else {
        const name = textOf(obj.name) || textOf(obj.text)
        if (name) out.push(name)
      }
    }
  }
  return cleanLines(out)
}

function parseInstructionStrings(items: unknown): string[] {
  const out: string[] = []
  for (const item of asArray(items)) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      if (Array.isArray(obj.itemListElement)) out.push(...parseInstructionStrings(obj.itemListElement))
      else {
        const text = textOf(obj.text) || textOf(obj.name)
        if (text) out.push(text)
      }
    }
  }
  return cleanLines(out)
}

function imageOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const v of value) {
      const url = imageOf(v)
      if (url) return url
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
  }
  return undefined
}

export function extractFromHtml(html: string, sourceUrl: string): ImportedRecipe | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1) JSON-LD
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.textContent ?? '')
      const node = findRecipeNode(json)
      if (!node) continue
      const ingredients = parseIngredientStrings(node.recipeIngredient ?? node.ingredients)
      const instructions = parseInstructionStrings(node.recipeInstructions)
      if (!ingredients.length && !instructions.length) continue
      const yieldRaw = node.recipeYield
      return {
        title: textOf(node.name) || doc.title || 'Imported recipe',
        description: textOf(node.description) || undefined,
        photo: imageOf(node.image),
        servings: parseServings(yieldRaw),
        prepMinutes: isoDurationToMinutes(node.prepTime),
        cookMinutes: isoDurationToMinutes(node.cookTime ?? node.totalTime),
        yieldText: typeof yieldRaw === 'string' ? yieldRaw : undefined,
        ingredients,
        instructions,
        sourceUrl,
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  // 2) microdata / heuristic fallback
  const title =
    doc.querySelector('[itemprop="name"]')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.title
  const ingredientNodes = doc.querySelectorAll(
    '[itemprop="recipeIngredient"], [itemprop="ingredients"], .recipe-ingredient, .ingredients li',
  )
  const instructionNodes = doc.querySelectorAll(
    '[itemprop="recipeInstructions"] li, .recipe-instructions li, .instructions li, [itemprop="recipeInstructions"] p',
  )
  const ingredients = cleanLines(Array.from(ingredientNodes).map((n) => n.textContent ?? ''))
  const instructions = cleanLines(Array.from(instructionNodes).map((n) => n.textContent ?? ''))
  if (!ingredients.length && !instructions.length) return null

  return {
    title: title || 'Imported recipe',
    ingredients,
    instructions,
    sourceUrl,
  }
}

function parseServings(value: unknown): number | undefined {
  const text = Array.isArray(value) ? value.join(' ') : String(value ?? '')
  const match = text.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : undefined
}

/** Public read-only proxies tried in order if the configured one is unavailable. */
export const FALLBACK_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://corsproxy.io/?url=',
  'https://api.cors.lol/?url=',
]

/** Supports both `https://proxy/?url={url}` and `https://proxy/?url=` styles. */
export function buildProxyUrl(template: string, url: string): string {
  if (template.includes('{url}')) return template.replace('{url}', encodeURIComponent(url))
  return `${template}${encodeURIComponent(url)}`
}

/** Some proxies wrap the page as JSON, e.g. { contents: "<html>…" }. */
function unwrapProxyBody(text: string): string | null {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of ['contents', 'data', 'body', 'html', 'result']) {
      const value = json[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
  } catch {
    return text
  }
  return text
}

interface FetchResult {
  html: string
  via: string
}

async function fetchPage(url: string, proxy: string): Promise<FetchResult> {
  // 1) Native fetch (desktop/mobile shell). No CORS, no proxy, our own IP — so
  // this also works on sites that block datacenter proxy IPs.
  const native = await nativeFetchText(url)
  if (native) return { html: native, via: 'native' }

  // 2) The webview engine (desktop/mobile shell). A real browser, so it also
  // works on sites that block plain HTTP clients by fingerprint.
  const rendered = await nativeFetchViaWebview(url)
  if (rendered) return { html: rendered, via: 'webview' }

  // 3) CORS proxies, configured one first.
  const candidates = Array.from(new Set([proxy, ...FALLBACK_PROXIES].filter(Boolean)))
  let lastError = ''

  for (const candidate of candidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    try {
      const response = await fetch(buildProxyUrl(candidate, url), {
        headers: { Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const text = unwrapProxyBody(await response.text())
      if (!text || text.length < 200) {
        lastError = 'empty response'
        continue
      }
      return { html: text, via: candidate }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network error'
    } finally {
      clearTimeout(timer)
    }
  }

  // Last resort: some packaged builds (desktop / mobile shells) allow direct requests.
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml' } })
    if (response.ok) {
      const text = await response.text()
      if (text.length > 200) return { html: text, via: 'direct' }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : lastError
  }

  throw new Error(
    `Could not reach that page (${lastError || 'all recipe proxies are busy'}). ` +
      'Add your own proxy in Settings → General, or add the recipe by hand.',
  )
}
/** Fetches the page (natively when the shell allows it, otherwise through a CORS
 * proxy with fallbacks), parses the recipe out of it, and retries through the
 * browser engine when that first attempt carries no recipe data. */
export async function importFromUrl(url: string, proxy: string): Promise<ImportedRecipe> {
  const first = await fetchPage(url, proxy)
  const parsed = extractFromHtml(first.html, url)
  if (parsed) return parsed

  // The markup we hold isn't enough. A proxy or plain HTTP fetch only sees the
  // served page, and our filtered webview view drops frames and ad scripts, so
  // retry through the browser — first filtered, then (if we haven't already)
  // exactly as the site intended.
  const retries = first.via === 'webview' ? [false] : [true, false]
  for (const blockAds of retries) {
    const html = await nativeFetchViaWebview(url, blockAds)
    if (!html) continue
    const replayed = extractFromHtml(html, url)
    if (replayed) return replayed
  }

  throw new Error(
    'That page loaded but no recipe data was found. Try a link directly to the recipe, or add it manually.',
  )
}

/** Converts an ImportedRecipe into a storable Recipe bound to a category. */
export function toRecipe(imported: ImportedRecipe, categoryId: string): Recipe {
  const now = Date.now()
  const ingredients: Ingredient[] = imported.ingredients.map((line) => ingredientFromRaw(line))
  const recipe: Recipe = {
    id: uid('rec_'),
    categoryIds: categoryId ? [categoryId] : [],
    title: imported.title,
    description: imported.description,
    photo: imported.photo,
    servings: imported.servings,
    prepMinutes: imported.prepMinutes,
    cookMinutes: imported.cookMinutes,
    yieldText: imported.yieldText,
    ingredients,
    instructions: imported.instructions,
    sourceUrl: imported.sourceUrl,
    createdAt: now,
    updatedAt: now,
  }
  recipe.nutrition = estimateNutrition(ingredients, recipe.servings)
  return recipe
}
