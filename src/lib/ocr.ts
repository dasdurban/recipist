import type { ImportedRecipe } from './importRecipe'
import { nativeFetchBinary } from './nativeFetch'

/**
 * Photo -> text OCR using tesseract.js (loaded lazily from its CDN worker so the
 * main bundle stays small). We then make a best-effort guess at splitting the
 * raw text into ingredients and instructions.
 */
export interface OcrProgress {
  status: string
  progress: number
}

export async function ocrImage(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => onProgress?.(m),
  })
  try {
    const result = await worker.recognize(file)
    return result.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

const INGREDIENT_MARKER = /^(ingredients?|what you'?ll need|you will need)\s*:?/i
const INSTRUCTION_MARKERS = [
  /^(instructions?|directions?|method|steps?|preparation|how to make)\s*:?/i,
]
const MEASURE_RE =
  /(^|\s)(\d|½|¼|¾|⅓|⅔|cups?|tbsp|tbsps|tablespoons?|tsp|tsps|teaspoons?|g|kg|oz|ml|lb|pounds?|grams?|cloves?|cans?|slices?)(\s|$)/i

/**
 * Splits OCR text into a title, ingredient lines and instruction lines.
 * Recipes are messy; this is deliberately forgiving.
 */
export function parseOcrText(text: string): ImportedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[\u2022\-*]\s*/, '').trim())
    .filter(Boolean)

  const title = lines[0] && lines[0].length < 90 ? lines[0] : 'Scanned recipe'

  let mode: 'head' | 'ingredients' | 'instructions' = 'head'
  const ingredients: string[] = []
  const instructions: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === title) continue

    if (INGREDIENT_MARKER.test(line)) {
      mode = 'ingredients'
      continue
    }
    if (INSTRUCTION_MARKERS.some((re) => re.test(line))) {
      mode = 'instructions'
      continue
    }

    if (mode === 'instructions') {
      instructions.push(line)
      continue
    }

    // Decide between ingredient and instruction by shape.
    const looksLikeIngredient = MEASURE_RE.test(line) && line.length < 80
    const looksLikeInstruction = /[.!?]\s*$/.test(line) && line.split(/\s+/).length > 6

    if (mode === 'ingredients') {
      if (looksLikeInstruction && !looksLikeIngredient) {
        mode = 'instructions'
        instructions.push(line)
      } else {
        ingredients.push(line)
      }
    } else {
      if (looksLikeIngredient) ingredients.push(line)
      else if (looksLikeInstruction) {
        mode = 'instructions'
        instructions.push(line)
      } else if (!ingredients.length) {
        ingredients.push(line)
      } else {
        instructions.push(line)
      }
    }
  }

  return {
    title,
    ingredients,
    instructions,
    tags: [],
    sourceUrl: '',
  }
}

/** Reads an image file, downscaling very large photos to speed up OCR. */
export async function imageFileToDataUrl(file: File | Blob, maxSize = 1280): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  if (typeof document === 'undefined') return dataUrl
  return downscaleDataUrl(dataUrl, maxSize)
}

export async function downscaleDataUrl(dataUrl: string, maxSize: number): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  if (scale >= 1) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Fetches a remote photo and inlines it as a data URL so it works offline. */
export async function remoteImageToDataUrl(url: string, proxy?: string): Promise<string | undefined> {
  // Native shell first: works even where datacenter proxies are blocked, and
  // returns the bytes already inlined.
  const native = await nativeFetchBinary(url)
  if (native) return downscaleDataUrl(native.dataUrl, 1600)

  try {
    const target = proxy ? `${proxy}${encodeURIComponent(url)}` : url
    const res = await fetch(target)
    if (!res.ok) return undefined
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return undefined
    if (blob.size > 6 * 1024 * 1024) return undefined
    const dataUrl = await blobToDataUrl(blob)
    return downscaleDataUrl(dataUrl, 1600)
  } catch {
    return undefined
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
