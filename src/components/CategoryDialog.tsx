import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Category, ColorName, ColorSet } from '../types'
import { useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import { ColorPicker } from './ui/ColorPicker'
import { Confirm } from './ui/Confirm'
import { pickColorForName } from '../lib/colors'

export function CategoryDialog({
  open,
  category,
  onClose,
}: {
  open: boolean
  category?: Category | null
  onClose: () => void
}) {
  const settings = useApp((s) => s.settings)
  const createCategory = useApp((s) => s.createCategory)
  const updateCategory = useApp((s) => s.updateCategory)
  const deleteCategory = useApp((s) => s.deleteCategory)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [colorSet, setColorSet] = useState<ColorSet>(settings.defaultColorSet)
  const [colorName, setColorName] = useState<ColorName>(
    settings.defaultColorSet === 'pastel' ? 'grey' : 'turquoise',
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (category) {
      setName(category.name)
      setColorSet(category.colorSet)
      setColorName(category.colorName)
    } else {
      setName('')
      setColorSet(settings.defaultColorSet)
      setColorName(pickColorForName('', settings.defaultColorSet))
    }
  }, [open, category, settings.defaultColorSet])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Give the category a name.', 'error')
      return
    }
    if (category) {
      await updateCategory(category.id, { name: trimmed, colorSet, colorName })
      toast('Category updated.', 'success')
    } else {
      await createCategory(trimmed, { colorSet, colorName })
      toast('Category created.', 'success')
    }
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={category ? 'Edit category' : 'New category'}
        footer={
          <>
            {category && (
              <button
                className="btn-ghost text-red-600 mr-auto hover:bg-red-50 dark:hover:bg-red-950/40"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} /> Delete
              </button>
            )}
            <button className="btn-soft" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              {category ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="e.g. Appetizers"
              className="w-full"
            />
          </div>

          <div>
            <label className="field-label">Color</label>
            <ColorPicker
              colorSet={colorSet}
              colorName={colorName}
              onChange={({ colorSet: cs, colorName: cn }) => {
                setColorSet(cs)
                setColorName(cn)
              }}
            />
          </div>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title="Delete category?"
        message={`"${category?.name}" will be removed. Recipes that are only in this category will be permanently deleted; recipes that are also in other categories will stay. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (category) {
            await deleteCategory(category.id)
            toast('Category deleted.', 'success')
          }
          setConfirmDelete(false)
          onClose()
        }}
      />
    </>
  )
}
