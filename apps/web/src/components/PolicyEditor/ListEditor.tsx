import { trpc } from '@/lib/trpc'
import { SchemaTable, type SchemaColumn } from '@/components/SchemaTable'

// Редактор одного списка-таблицы политики. Схема колонок — из каталога.
// prefill — значения, подставляемые в новые строки (например тип устройства);
// rowFilter — клиентский фильтр строк (например только строки данного типа устройства).

export interface ListTypeInfo {
  id: string
  name: string
  component: string | null
  columns: unknown
}

interface ListEditorProps {
  policyId: string
  listType: ListTypeInfo
  readOnly?: boolean
  title?: string | null // null — не показывать заголовок
  emptyText?: string
  prefill?: Record<string, unknown>
  rowFilter?: (rowData: Record<string, unknown>) => boolean
  hideColumns?: string[]
}

export function ListEditor({
  policyId,
  listType,
  readOnly = false,
  title,
  emptyText = 'Список пуст — добавьте первую строку',
  prefill,
  rowFilter,
  hideColumns,
}: ListEditorProps) {
  const { data: rows } = trpc.policies.listRows.useQuery({ policyId, listTypeId: listType.id })
  const addRow = trpc.policies.addRow.useMutation()
  const updateRow = trpc.policies.updateRow.useMutation()
  const deleteRow = trpc.policies.deleteRow.useMutation()
  const utils = trpc.useUtils()

  function invalidate() {
    void utils.policies.listRows.invalidate({ policyId, listTypeId: listType.id })
    void utils.policies.listRowCounts.invalidate({ policyId })
  }

  const allColumns = listType.columns as unknown as SchemaColumn[]
  const columns = hideColumns?.length
    ? allColumns.filter(c => !hideColumns.includes(c.key))
    : allColumns

  interface FlatRow { id: string; rowData: unknown }
  let tableRows = ((rows ?? []) as unknown as FlatRow[]).map(r => ({
    id: r.id,
    rowData: r.rowData as Record<string, unknown>,
  }))
  if (rowFilter) tableRows = tableRows.filter(r => rowFilter(r.rowData))

  return (
    <div className="space-y-2">
      {title !== null && (
        <h3 className="text-sm font-semibold">{title ?? listType.name}</h3>
      )}
      <SchemaTable
        columns={columns}
        rows={tableRows}
        readOnly={readOnly}
        emptyText={emptyText}
        onAdd={rowData =>
          addRow.mutate(
            { policyId, listTypeId: listType.id, rowData: { ...rowData, ...prefill } },
            { onSuccess: invalidate },
          )
        }
        onUpdate={(rowId, rowData) =>
          updateRow.mutate({ rowId, rowData: { ...rowData, ...prefill } }, { onSuccess: invalidate })
        }
        onDelete={rowId => deleteRow.mutate({ rowId }, { onSuccess: invalidate })}
      />
    </div>
  )
}
