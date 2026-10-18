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

write(join(outDir, 'icon-192.png'), 192)
write(join(outDir, 'icon-512.png'), 512)
write(join(outDir, 'icon-1024.png'), 1024)
write(join(outDir, 'maskable-512.png'), 512)
write(join(root, 'public', 'apple-touch-icon.png'), 180)
// Source for the macOS app icon only (icon.icns via `tauri icon`):
// 2% smaller white square + thin shaded outline. Web icons stay unchanged.
write(join(root, 'src-tauri', 'icons', 'icon-macos-1024.png'), 1024, true)
console.log('done')
