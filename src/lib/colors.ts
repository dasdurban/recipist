import type { ColorName, ColorSet, Settings } from '../types'

/**
 * Two coordinated palettes:
 *  - `vivid`  : saturated, high-contrast colors (black and grey are the neutrals)
 *  - `pastel` : the same hues softened, with grey replacing black
 * Every category picks one color name + one palette. The two virtual views
 * ("All recipes", "Favorites") are not categories, so their color lives in
 * settings instead.
 */
// The Bright palette no longer offers black (grey is the neutral). The
// `VIVID.black` entry is kept below so any category already using black still
// renders; it just isn't offered in the picker.
export const COLOR_NAMES: ColorName[] = [
  'grey',
  'blue',
  'pink',
  'green',
  'yellow',
  'red',
  'orange',
  'turquoise',
  'purple',
  'brown',
]

export const PASTEL_COLOR_NAMES: ColorName[] = [
  'grey',
  'blue',
  'pink',
  'green',
  'yellow',
  'red',
  'orange',
  'turquoise',
  'purple',
  'brown',
]

export const COLOR_LABELS: Record<ColorName, string> = {
  black: 'Black',
  grey: 'Grey',
  blue: 'Blue',
  pink: 'Pink',
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
  orange: 'Orange',
  turquoise: 'Turquoise',
  purple: 'Purple',
  brown: 'Brown',
}

/** Hex values per palette + color name. */
const VIVID: Record<string, string> = {
  black: '#111827',
  grey: '#6b7280',
  blue: '#2563eb',
  pink: '#ec4899',
  green: '#16a34a',
  yellow: '#eab308',
  red: '#dc2626',
  orange: '#ea580c',
  turquoise: '#14b8a6',
  purple: '#7c3aed',
  brown: '#8b5a2b',
}

const PASTEL: Record<string, string> = {
  black: '#9ca3af',
  grey: '#9ca3af',
  blue: '#a8c8ff',
  pink: '#ffb8d9',
  green: '#a9e6b8',
  yellow: '#fbeaa0',
  red: '#ffc0b4',
  orange: '#ffd6a5',
  turquoise: '#a4e6df',
  purple: '#cbb8ff',
  brown: '#dcc0a2',
}

export function colorFor(colorName: ColorName, colorSet: ColorSet): string {
  const table = colorSet === 'pastel' ? PASTEL : VIVID
  return table[colorName] ?? table.black
}

/** Color of the virtual "All recipes" view (its color lives in settings). */
export function allRecipesColor(settings: Settings): string {
  return colorFor(settings.allRecipesColorName, settings.allRecipesColorSet)
}

/** Color of the virtual "Favorites" view (its color lives in settings). */
export function favoritesColor(settings: Settings): string {
  return colorFor(settings.favoritesColorName, settings.favoritesColorSet)
}

/** Returns true when text should be light (for contrast against `hex`). */
export function prefersLightText(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  // relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum < 0.6
}

export function tint(hex: string, alpha: number): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Turns a category name into a pleasant fallback color choice. */
export function pickColorForName(name: string, set: ColorSet): ColorName {
  const pool = set === 'pastel' ? PASTEL_COLOR_NAMES : COLOR_NAMES
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return pool[Math.abs(hash) % pool.length]
}
