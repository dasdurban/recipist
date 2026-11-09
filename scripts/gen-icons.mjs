/**
 * macOS Tahoe-style app icons - proper rounded square
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHAPES, VIEWBOX } from './tomato-outline.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const VIEWBOX_X = VIEWBOX.x
const VIEWBOX_Y = VIEWBOX.y
const VIEWBOX_W = VIEWBOX.w
const VIEWBOX_H = VIEWBOX.h

const RED = [225, 29, 46]
const GREEN = [55, 168, 58]
const WHITE = [255, 255, 255]

let dst

function fillPolygon(cov, W, H, points) {
  cov.fill(0)
  const n = points.length
  if (n === 0) return
  const edges = []
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    if (y0 === y1) continue
    const ymin = Math.min(y0, y1)
    const ymax = Math.max(y0, y1)
    const xAtYmin = y0 < y1 ? x0 : x1
    const dx = (x1 - x0) / (y1 - y0)
    edges.push({ ymin, ymax, x: xAtYmin, dx })
  }
  edges.sort((a, b) => a.ymin - b.ymin)
  let active = []
  let ei = 0
  for (let y = 0; y < H; y++) {
    while (ei < edges.length && edges[ei].ymin <= y) {
      active.push(edges[ei]); ei++
    }
    active = active.filter((e) => e.ymax > y)
    active.sort((a, b) => a.x - b.x)
    for (let j = 0; j + 1 < active.length; j += 2) {
      const x1 = Math.max(0, Math.ceil(active[j].x))
      const x2 = Math.min(W - 1, Math.floor(active[j + 1].x))
      for (let x = x1; x <= x2; x++) cov[y * W + x] = 1
    }
    for (const e of active) e.x += e.dx
  }
}

function composite(dst, cov, W, H, rgb) {
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const a = cov[i]
    if (a <= 0) continue
    const da = dst[p + 3] / 255
    const outA = a + da * (1 - a)
    const back = da * (1 - a)
    dst[p] = Math.round((rgb[0] * a + dst[p] * back) / outA)
    dst[p + 1] = Math.round((rgb[1] * a + dst[p + 1] * back) / outA)
    dst[p + 2] = Math.round((rgb[2] * a + dst[p + 2] * back) / outA)
    dst[p + 3] = Math.round(outA * 255)
  }
}

function render(size, macos = false) {
  const W = size, H = size
  dst = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H * 4; i += 4) {
    dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 0
  }
  const cov = new Float32Array(W * H)

  // macOS Tahoe rounded square (macOS app icon: 2% smaller for better margins,
  // then a further 2% → 0.85 * 0.98 * 0.98 of the canvas)
  const bgScale = macos ? 0.85 * 0.98 * 0.98 : 0.85
  const bgSize = size * bgScale
  const radius = size * (macos ? 0.23 * 0.98 * 0.98 : 0.23)
  const cx = W / 2, cy = H / 2
  const halfBg = bgSize / 2
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - cx)
      const dy = Math.abs(y - cy)
      if (dx > halfBg || dy > halfBg) {
        cov[row + x] = 0
        continue
      }
      if (dx <= halfBg - radius || dy <= halfBg - radius) {
        cov[row + x] = 1
        continue
      }
      const rx = dx - (halfBg - radius)
      const ry = dy - (halfBg - radius)
      cov[row + x] = (rx * rx + ry * ry <= radius * radius * 1.02) ? 1 : 0
    }
  }
  composite(dst, cov, W, H, WHITE)

  // Tomato scaled to fit nicely
  const tomatoPad = bgSize * 0.08
  const tLeft = cx - (bgSize - tomatoPad * 2) / 2
  const tTop = cy - (bgSize - tomatoPad * 2) / 2
  const tWidth = bgSize - tomatoPad * 2
  const tHeight = bgSize - tomatoPad * 2
  function draw(points, color) {
    const pxPoints = points.map(([x, y]) => [
      tLeft + ((x - VIEWBOX_X) / VIEWBOX_W) * tWidth,
      tTop + ((y - VIEWBOX_Y) / VIEWBOX_H) * tHeight,
    ])
    fillPolygon(cov, W, H, pxPoints)
    composite(dst, cov, W, H, color)
    cov.fill(0)
  }

  draw(SHAPES[0].points, RED)
  draw(SHAPES[1].points, RED)
  for (let i = 2; i < SHAPES.length; i++) {
    draw(SHAPES[i].points, GREEN)
  }
  return dst
}

function write(path, size, macos = false) {
  const started = Date.now()
  const png = encodePng(size, size, render(size, macos))
  writeFileSync(path, png)
  console.log('wrote', path.replace(root + '/', ''), size + 'x' + size, (png.length / 1024).toFixed(1) + 'kb', (Date.now() - started) + 'ms')
}

/**
 * Bounding box of the tomato itself, in the little polygon coordinate space.
 *
 * The viewBox around the drawing is deliberately roomier than the mark, so
 * scaling by the viewBox leaves the tomato at about 84% of the space it is
 * given. Browser toolbar icons are shown at 16px, where that padding costs
 * most of the recognisable silhouette — the extension icons therefore map this
 * box to the tile instead, which is what makes the mark read at toolbar size.
 */
const SHAPE_BOUNDS = (() => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const shape of SHAPES) {
    for (const [x, y] of shape.points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, maxX, minY, maxY }
})()

/**
 * The icon with the mark scaled against the canvas rather than the viewBox.
 *
 * `bgScale` is the white rounded square as a fraction of the canvas, and
 * `markFraction` is the tomato as a fraction of the canvas — measured against
 * the canvas on purpose, because "95% of the icon" is how the size is actually
 * discussed, and expressing it against the tile leaves the two related in a way
 * nobody can read off the numbers.
 */
function renderFitted(size, bgScale, markFraction) {
  const W = size
  const H = size
  const dst = Buffer.alloc(W * H * 4)
  const cov = new Float32Array(W * H)

  const bgSize = size * bgScale
  const radius = size * 0.23
  const cx = W / 2
  const cy = H / 2
  const halfBg = bgSize / 2
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - cx)
      const dy = Math.abs(y - cy)
      if (dx > halfBg || dy > halfBg) {
        cov[row + x] = 0
        continue
      }
      if (dx <= halfBg - radius || dy <= halfBg - radius) {
        cov[row + x] = 1
        continue
      }
      const rx = dx - (halfBg - radius)
      const ry = dy - (halfBg - radius)
      cov[row + x] = rx * rx + ry * ry <= radius * radius * 1.02 ? 1 : 0
    }
  }
  composite(dst, cov, W, H, WHITE)

  // The mark keeps its own aspect ratio and is centred on the canvas.
  const boxW = SHAPE_BOUNDS.maxX - SHAPE_BOUNDS.minX
  const boxH = SHAPE_BOUNDS.maxY - SHAPE_BOUNDS.minY
  const target = size * markFraction
  const scale = target / Math.max(boxW, boxH)
  const drawnW = boxW * scale
  const drawnH = boxH * scale
  const left = cx - drawnW / 2
  const top = cy - drawnH / 2

  const draw = (points, color) => {
    const mapped = points.map(([x, y]) => [
      left + (x - SHAPE_BOUNDS.minX) * scale,
      top + (y - SHAPE_BOUNDS.minY) * scale,
    ])
    fillPolygon(cov, W, H, mapped)
    composite(dst, cov, W, H, color)
    cov.fill(0)
  }

  draw(SHAPES[0].points, RED)
  draw(SHAPES[1].points, RED)
  for (let i = 2; i < SHAPES.length; i++) draw(SHAPES[i].points, GREEN)
  return dst
}

/**
 * Box-filters an RGBA buffer down by an integer factor.
 *
 * The renderer fills polygons with a hard 0/1 coverage, which is fine at app
 * icon sizes but turns into visible stair-stepping at 16px. Rendering large and
 * averaging is the cheapest way to get real edges. Colours are averaged in
 * premultiplied alpha, because averaging straight RGB across a transparent edge
 * pulls the outline toward black.
 */
function downsample(src, srcSize, factor) {
  const outSize = srcSize / factor
  const out = Buffer.alloc(outSize * outSize * 4)
  const n = factor * factor
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < factor; sy++) {
        const row = (y * factor + sy) * srcSize
        for (let sx = 0; sx < factor; sx++) {
          const p = (row + x * factor + sx) * 4
          const alpha = src[p + 3] / 255
          r += src[p] * alpha
          g += src[p + 1] * alpha
          b += src[p + 2] * alpha
          a += alpha
        }
      }
      const o = (y * outSize + x) * 4
      const outA = a / n
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
      }
      out[o + 3] = Math.round(outA * 255)
    }
  }
  return out
}

function writeExtensionIcon(path, size, bgScale, markFraction) {
  const started = Date.now()
  const factor = size <= 48 ? 8 : 4
  const big = renderFitted(size * factor, bgScale, markFraction)
  const png = encodePng(size, size, downsample(big, size * factor, factor))
  writeFileSync(path, png)
  console.log('wrote', path.replace(root + '/', ''), size + 'x' + size, (png.length / 1024).toFixed(1) + 'kb', (Date.now() - started) + 'ms')
}


write(join(outDir, 'icon-192.png'), 192)
write(join(outDir, 'icon-512.png'), 512)
write(join(outDir, 'icon-1024.png'), 1024)
write(join(outDir, 'maskable-512.png'), 512)
write(join(root, 'public', 'apple-touch-icon.png'), 180)
// Source for the macOS app icon only (icon.icns via `tauri icon`):
// 2% smaller white square + thin shaded outline. Web icons stay unchanged.
write(join(root, 'src-tauri', 'icons', 'icon-macos-1024.png'), 1024, true)

// Browser extension toolbar icons.
//
// These are not the app icons shrunk down. A toolbar icon is drawn at 16px and
// sits in a strip of other 16px icons, so the tile is edge to edge and the
// tomato fills 95% of the canvas. At app icon proportions the tomato came out
// around 60%, which at 16px is a few pixels of red in a field of white.
//
// All four sizes use the same framing so the button does not change size
// between a normal and a retina screen, or between the toolbar and the
// extensions page.
const extensionIconDir = join(root, 'extension', 'icons')
mkdirSync(extensionIconDir, { recursive: true })
writeExtensionIcon(join(extensionIconDir, 'icon-16.png'), 16, 1, 0.95)
writeExtensionIcon(join(extensionIconDir, 'icon-32.png'), 32, 1, 0.95)
writeExtensionIcon(join(extensionIconDir, 'icon-48.png'), 48, 1, 0.95)
writeExtensionIcon(join(extensionIconDir, 'icon-128.png'), 128, 1, 0.95)
console.log('done')
