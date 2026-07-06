import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Универсальная таблица, управляемая схемой из каталога.
// Новый тип списка в будущей версии = новая строка каталога, не новый компонент.

export interface SchemaColumn {
  key: string
  label: string
  type: 'string' | 'number' | 'bool' | 'enum' | 'text'
  options?: string[]
}

export interface SchemaTableRow {
  id: string
  rowData: Record<string, unknown>
}

interface SchemaTableProps {
  columns: SchemaColumn[]
  rows: SchemaTableRow[]
  readOnly?: boolean
  emptyText?: string
  onAdd?: (rowData: Record<string, unknown>) => void
  onUpdate?: (rowId: string, rowData: Record<string, unknown>) => void
  onDelete?: (rowId: string) => void
}

function emptyDraft(columns: SchemaColumn[]): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const c of columns) {
    if (c.type === 'bool') d[c.key] = false
    else if (c.type === 'number') d[c.key] = 0
    else if (c.type === 'enum') d[c.key] = c.options?.[0] ?? ''
    else d[c.key] = ''
  }
  return d
}

function CellEditor({
  column,
  value,
  onChange,
}: {
  column: SchemaColumn
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (column.type) {
    case 'bool':
      return <Switch checked={Boolean(value)} onCheckedChange={onChange} />
    case 'number':
      return (
        <Input
          type="number"
          className="h-7 w-24"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'enum':
      return (
        <Select
          className="h-7"
          value={String(value ?? '')}
          options={(column.options ?? []).map(o => ({ value: o, label: o }))}
          onChange={e => onChange(e.target.value)}
        />
      )
    case 'text':
      return (
        <Textarea
          className="min-h-[3rem] text-xs"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
        />
      )
    default:
      return (
        <Input
          className="h-7"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
        />
      )
  }
}

function CellView({ column, value }: { column: SchemaColumn; value: unknown }) {
  if (column.type === 'bool') {
    return value
      ? <Check className="h-4 w-4 text-green-600" />
      : <X className="h-4 w-4 text-muted-foreground/50" />
  }
  const text = value === null || value === undefined ? '' : String(value)
  if (!text) return <span className="text-muted-foreground/50">—</span>
  return <span className={cn(column.type === 'text' && 'whitespace-pre-wrap text-xs')}>{text}</span>
}

export function SchemaTable({
  columns,
  rows,
  readOnly = false,
  emptyText = 'Список пуст',
  onAdd,
  onUpdate,
  onDelete,
}: SchemaTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [adding, setAdding] = useState(false)

  const startEdit = (row: SchemaTableRow) => {
    setAdding(false)
    setEditingId(row.id)
    setDraft({ ...row.rowData })
  }

  const startAdd = () => {
    setEditingId(null)
    setDraft(emptyDraft(columns))
    setAdding(true)
  }

  const cancel = () => {
    setEditingId(null)
    setAdding(false)
    setDraft({})
  }

  const commit = () => {
    if (adding) onAdd?.(draft)
    else if (editingId) onUpdate?.(editingId, draft)
    cancel()
  }

  const canEdit = !readOnly && (onUpdate ?? onAdd ?? onDelete)

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map(c => (
              <th key={c.key} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                {c.label}
              </th>
            ))}
            {canEdit && <th className="w-20 px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !adding && (
            <tr>
              <td
                colSpan={columns.length + (canEdit ? 1 : 0)}
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          )}

          {rows.map(row => {
            const isEditing = editingId === row.id
            return (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-1.5 align-middle">
                    {isEditing
                      ? <CellEditor column={c} value={draft[c.key]} onChange={v => setDraft(d => ({ ...d, [c.key]: v }))} />
                      : <CellView column={c} value={row.rowData[c.key]} />
                    }
                  </td>
                ))}
                {canEdit && (
                  <td className="px-3 py-1.5 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commit} title="Сохранить">
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel} title="Отмена">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity [tr:hover_&]:opacity-100">
                        {onUpdate && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(row)} title="Изменить">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(row.id)} title="Удалить">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            )
          })}

          {adding && (
            <tr className="border-b bg-primary/5 last:border-b-0">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-1.5 align-middle">
                  <CellEditor column={c} value={draft[c.key]} onChange={v => setDraft(d => ({ ...d, [c.key]: v }))} />
                </td>
              ))}
              <td className="px-3 py-1.5 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commit} title="Добавить">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel} title="Отмена">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!readOnly && onAdd && !adding && (
        <div className="border-t px-3 py-2">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" /> Добавить строку
          </Button>
        </div>
      )}
    </div>
  )
}
