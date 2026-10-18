import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { ColorName, ColorSet } from '../../types'
import {
  COLOR_LABELS,
  COLOR_NAMES,
  PASTEL_COLOR_NAMES,
  colorFor,
  prefersLightText,
} from '../../lib/colors'

interface ColorPickerProps {
  colorSet: ColorSet
  colorName: ColorName
  onChange: (next: { colorSet: ColorSet; colorName: ColorName }) => void
}

/** Two rows of swatches: bright (grey is the neutral) and pastel. */
export function ColorPicker({ colorSet, colorName, onChange }: ColorPickerProps) {
  const rows: Array<{ set: ColorSet; names: ColorName[]; title: string }> = [
    { set: 'vivid', names: COLOR_NAMES, title: 'Bright' },
    { set: 'pastel', names: PASTEL_COLOR_NAMES, title: 'Pastel' },
  ]

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.set}>
          <div className="field-label">{row.title}</div>
          <div className="flex flex-wrap gap-2">
            {row.names.map((name) => {
              const hex = colorFor(name, row.set)
              const selected = colorSet === row.set && colorName === name
              return (
                <button
                  key={`${row.set}-${name}`}
                  type="button"
                  title={`${row.title} ${COLOR_LABELS[name]}`}
                  aria-label={`${row.title} ${COLOR_LABELS[name]}`}
                  onClick={() => onChange({ colorSet: row.set, colorName: name })}
                  className={clsx(
                    'h-9 w-9 rounded-full flex items-center justify-center ring-offset-2 ring-offset-surface transition-all',
                    selected ? 'ring-2 ring-content scale-105' : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: hex, border: `1px solid rgba(0,0,0,0.12)` }}
                >
                  {selected && (
                    <Check size={16} color={prefersLightText(hex) ? '#fff' : '#111827'} strokeWidth={3} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
