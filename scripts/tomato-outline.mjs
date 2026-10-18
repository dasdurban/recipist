/**
 * Geometry for The Recipe App mark: a simple line-art tomato.
 *
 * Modelled on the reference artwork — an open, tapering red sweep for the body,
 * a short inner arc for the shoulder, and a green calyx of tapered leaves plus a
 * stem. Flat two-colour outline; no fill, no watermark, no tile.
 *
 * Every "stroke" is a ribbon polygon: a centreline sampled into two offset edges
 * that close at the ends, which gives the brush-like taper. The same polygons
 * drive the vector logo and the raster icons, so they can never drift apart.
 *
 * Coordinates are in a 0..100 space; see VIEWBOX for framing.
 */

export const RED = '#e11d2e'
export const GREEN = '#37a83a'

/** Framing box that the artwork is designed against. */
export const VIEWBOX = { x: 8, y: 6, w: 84, h: 84 }

const PI = Math.PI

/** Point on a cubic Bézier. */
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    y: a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  }
}

/**
 * Builds a closed ribbon polygon around a centreline.
 * `width(t)` is the full width of the stroke at `t`; return 0 at an end to taper
 * it to a point.
 */
function ribbon(at, width, color, samples = 36) {
  const left = []
  const right = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const p = at(t)
    const a = at(Math.max(0, t - 1e-3))
    const b = at(Math.min(1, t + 1e-3))
    let dx = b.x - a.x
    let dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const h = width(t) / 2
    // normal
    left.push([p.x - dy * h, p.y + dx * h])
    right.push([p.x + dy * h, p.y - dx * h])
  }
  return { color, points: [...left, ...right.reverse()] }
}

const bez = (p0, p1, p2, p3) => (t) => cubic(p0, p1, p2, p3, t)

/** Tapers from full width at the base to a point at the tip. */
const taperTip = (w, power = 2.3) => (t) => w * (1 - t ** power)
/** Tapers to a point at both ends, with a broad middle. */
const taperBoth = (w, power = 0.62) => (t) => w * Math.sin(PI * t) ** power

/**
 * The body: one open sweep from the upper-left, around the left, base and right,
 * up to the upper-right. Slightly flatter at the base and lifted at the
 * shoulders so it reads as a tomato rather than a circle.
 */
const bodyAt = (t) => {
  const from = (-140 * PI) / 180
  const to = (-400 * PI) / 180
  const th = from + (to - from) * t
  const s = Math.sin(th)
  const x = 50 + 34 * Math.cos(th)
  let y = 52 + 28.5 * s
  if (s > 0) y -= 1.3 * s * s // flatter base
  return { x, y }
}

/** Shapes in draw order (later shapes sit on top). */
export const SHAPES = [
  // body sweep
  ribbon(bodyAt, taperBoth(3.9), RED),

  // shoulder arc across the top of the fruit
  ribbon(bez([28, 42], [35, 33.5], [47, 31.8], [58, 35.4]), taperBoth(3.4, 0.55), RED),

  // calyx: stem sweeping up-left, then leaves fanning out
  ribbon(bez([49, 34], [44, 27], [38, 19.5], [32, 12.5]), taperTip(3.7), GREEN),
  ribbon(bez([51, 32], [55.5, 26], [59.5, 21.5], [64, 17.5]), taperTip(2.9), GREEN),
  ribbon(bez([52, 32.5], [58, 29.5], [65, 28], [72, 28]), taperTip(3.3), GREEN),
  ribbon(bez([48, 32.5], [42, 29.5], [34, 27], [26, 26.5]), taperTip(3.1), GREEN),
]

const round = (n) => Math.round(n * 100) / 100

/** SVG path data for each shape. */
export function toPathData(points) {
  let d = `M${round(points[0][0])} ${round(points[0][1])}`
  for (let i = 1; i < points.length; i++) d += `L${round(points[i][0])} ${round(points[i][1])}`
  return `${d}Z`
}

/** Full standalone SVG document (used for the favicon). */
export function toSvgDocument(size = 64) {
  const paths = SHAPES.map(
    (s) => `  <path d="${toPathData(s.points)}" fill="${s.color}"/>`,
  ).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}" width="${size}" height="${size}">
${paths}
</svg>
`
}
