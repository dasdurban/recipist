import { TOMATO_SHAPES, TOMATO_VIEWBOX } from './tomatoOutline'

/**
 * The Recipe App mark — rendered from the same geometry source as the app
 * icons (scripts/gen-icons.mjs), so the logo and icon set always match.
 * Stroke-only tomato outline, transparent background, no fill shading.
 */
export function TomatoLogo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox={TOMATO_VIEWBOX} className={className} role="img" aria-label="The Recipe App">
      {TOMATO_SHAPES.map((shape, i) => (
        <path key={i} d={shape.d} fill={shape.color} />
      ))}
    </svg>
  )
}
