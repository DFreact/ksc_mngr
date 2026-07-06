import { cn } from '@/lib/utils'

export interface DiffEntry {
  field: string
  before: unknown
  after: unknown
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

interface DiffViewerProps {
  diff: DiffEntry[]
  className?: string
}

export function DiffViewer({ diff, className }: DiffViewerProps) {
  if (diff.length === 0) {
    return (
      <p className="py-2 text-center text-xs text-muted-foreground">Нет изменений</p>
    )
  }

  return (
    <table className={cn('w-full text-xs', className)}>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="pb-1 pr-4 font-medium">Поле</th>
          <th className="pb-1 pr-4 font-medium text-red-500">Было</th>
          <th className="pb-1 font-medium text-green-600">Стало</th>
        </tr>
      </thead>
      <tbody>
        {diff.map((entry, idx) => {
          const changed = formatVal(entry.before) !== formatVal(entry.after)
          return (
            <tr key={idx} className={cn('border-b last:border-0', changed && 'bg-yellow-50/40 dark:bg-yellow-900/10')}>
              <td className="py-1.5 pr-4 font-mono text-muted-foreground">{entry.field}</td>
              <td className={cn('py-1.5 pr-4', changed && 'text-red-600 dark:text-red-400 line-through decoration-red-300')}>
                {formatVal(entry.before)}
              </td>
              <td className={cn('py-1.5', changed && 'font-medium text-green-700 dark:text-green-400')}>
                {formatVal(entry.after)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
