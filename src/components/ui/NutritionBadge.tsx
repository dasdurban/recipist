import clsx from 'clsx'
import type { NutritionEstimate } from '../../types'

const RATING_STYLE: Record<NutritionEstimate['rating'], { label: string; classes: string }> = {
  excellent: { label: 'Very healthy', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  good: { label: 'Healthy', classes: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  fair: { label: 'Okay', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  poor: { label: 'Indulgent', classes: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const RATING_COLOR: Record<NutritionEstimate['rating'], string> = {
  excellent: '#059669',
  good: '#65a30d',
  fair: '#d97706',
  poor: '#e11d48',
}

/** A compact, colorful health indicator: a ring plus a label. */
export function HealthScore({
  nutrition,
  size = 64,
  showLabel = true,
}: {
  nutrition?: NutritionEstimate
  size?: number
  showLabel?: boolean
}) {
  if (!nutrition) return null
  const style = RATING_STYLE[nutrition.rating]
  const color = RATING_COLOR[nutrition.rating]
  const stroke = size >= 56 ? 6 : 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (nutrition.score / 100) * c

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-line" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c}`}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{ fontSize: size * 0.3, color }}
        >
          {nutrition.score}
        </div>
      </div>
      {showLabel && (
        <div className="min-w-0">
          <span className={clsx('chip', style.classes)}>{style.label}</span>
          <p className="text-xs text-content-muted mt-1">Health score out of 100</p>
        </div>
      )}
    </div>
  )
}

const MACROS: Array<{ key: keyof NutritionEstimate; label: string; unit: string; color: string }> = [
  { key: 'protein', label: 'Protein', unit: 'g', color: '#2563eb' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: '#d97706' },
  { key: 'fat', label: 'Fat', unit: 'g', color: '#db2777' },
  { key: 'fiber', label: 'Fiber', unit: 'g', color: '#16a34a' },
  { key: 'sugar', label: 'Sugar', unit: 'g', color: '#9333ea' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', color: '#0891b2' },
]

export function MacroGrid({ nutrition, servings }: { nutrition: NutritionEstimate; servings?: number }) {
  const per = servings && servings > 0 ? servings : 1
  return (
    <div className="grid grid-cols-3 gap-2">
      {MACROS.map((m) => {
        const value = (nutrition[m.key] as number) / per
        return (
          <div key={m.key} className="rounded-xl bg-surface-2 border border-line px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-content-muted">{m.label}</div>
            <div className="text-sm font-semibold" style={{ color: m.color }}>
              {Math.round(value * 10) / 10}
              <span className="text-[11px] font-normal text-content-muted ml-0.5">{m.unit}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
