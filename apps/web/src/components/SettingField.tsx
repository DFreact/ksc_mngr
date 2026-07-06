import { useRef, useState } from 'react'
import { Lock, Unlock, Info, ArrowDownCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { EffectiveSetting, JsonValue } from '@ksc/domain'

// Minimal ParameterCatalog shape needed by this component
export interface ParamMeta {
  id: string
  name: string
  category: string
  valueType: 'bool' | 'enum' | 'number' | 'string' | 'list'
  enumOptions: unknown[] | null   // string[] stored as Json
  unit: string | null
  defaultValue: unknown | null
  description: string | null
  purpose: string | null
  tradeoffsPros?: string[] | null // влияние на защиту (что даёт включение)
  tradeoffsCons?: string[] | null // цена: производительность / совместимость / удобство
}

interface SettingFieldProps {
  param: ParamMeta
  /** The value currently stored in THIS policy (undefined = not set / use default) */
  ownValue?: JsonValue
  forced?: boolean  // zamochek on this setting in this policy
  effective?: EffectiveSetting
  /** Whether we are currently in a read-only view */
  readOnly?: boolean
  onValueChange: (parameterId: string, value: JsonValue) => void
  onForcedChange?: (parameterId: string, forced: boolean) => void
}

function ValueDisplay({ param, value }: { param: ParamMeta; value: JsonValue }) {
  if (param.valueType === 'bool') {
    return <span className={cn('text-sm', value ? 'text-green-600' : 'text-muted-foreground')}>{value ? 'Включено' : 'Выключено'}</span>
  }
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  return (
    <span className="text-sm">
      {String(value)}{param.unit ? ` ${param.unit}` : ''}
    </span>
  )
}

export function SettingField({
  param,
  ownValue,
  forced = false,
  effective,
  readOnly = false,
  onValueChange,
  onForcedChange,
}: SettingFieldProps) {
  const [localStr, setLocalStr] = useState<string | null>(null) // for text/number editing
  const inputRef = useRef<HTMLInputElement>(null)

  const effectiveValue = effective?.value
  const isLockedFromAbove = effective?.lockedFromAbove === true
  const isInherited = effective?.source === 'inherited'

  // The value to show in the editor — own value takes precedence, then effective, then default
  const displayValue = ownValue !== undefined ? ownValue : (effectiveValue ?? param.defaultValue ?? null)

  const isEffectivelyReadOnly = readOnly || isLockedFromAbove

  function commit(newValue: JsonValue) {
    setLocalStr(null)
    onValueChange(param.id, newValue)
  }

  // ── Render control by value_type ──────────────────────────────────────────

  function renderControl() {
    if (param.valueType === 'bool') {
      return (
        <Switch
          checked={!!displayValue}
          onCheckedChange={v => !isEffectivelyReadOnly && commit(v)}
          disabled={isEffectivelyReadOnly}
        />
      )
    }

    if (param.valueType === 'enum') {
      const options = (param.enumOptions as string[] | null) ?? []
      return (
        <Select
          className="w-48"
          value={String(displayValue ?? '')}
          options={options.map(o => ({ value: o, label: o }))}
          disabled={isEffectivelyReadOnly}
          onChange={e => commit(e.target.value)}
        />
      )
    }

    if (param.valueType === 'number') {
      const numVal = displayValue !== null && displayValue !== undefined ? Number(displayValue) : ''
      return (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="number"
            className="w-32"
            disabled={isEffectivelyReadOnly}
            value={localStr ?? (numVal !== '' ? String(numVal) : '')}
            onChange={e => setLocalStr(e.target.value)}
            onBlur={() => {
              if (localStr !== null) {
                const n = parseFloat(localStr)
                if (!isNaN(n)) commit(n)
                else setLocalStr(null)
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') inputRef.current?.blur()
            }}
          />
          {param.unit && <span className="text-sm text-muted-foreground">{param.unit}</span>}
        </div>
      )
    }

    if (param.valueType === 'string') {
      return (
        <Input
          ref={inputRef}
          type="text"
          className="w-64"
          disabled={isEffectivelyReadOnly}
          value={localStr ?? (displayValue !== null && displayValue !== undefined ? String(displayValue) : '')}
          onChange={e => setLocalStr(e.target.value)}
          onBlur={() => {
            if (localStr !== null) {
              commit(localStr)
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') inputRef.current?.blur()
          }}
        />
      )
    }

    if (param.valueType === 'list') {
      return (
        <span className="rounded-md border border-dashed px-3 py-1 text-xs text-muted-foreground">
          Редактор списков — шаг 3
        </span>
      )
    }

    return null
  }

  return (
    <div
      className={cn(
        'group flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors',
        'hover:bg-muted/50',
        isLockedFromAbove && 'bg-amber-50/50 dark:bg-amber-900/10',
      )}
    >
      {/* Left: name + description + inherited hint */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium leading-none">{param.name}</span>

          {/* Info tooltip: description + purpose + влияние на защиту/производительность */}
          {(param.description || param.purpose || param.tradeoffsPros?.length || param.tradeoffsCons?.length) && (
            <Tooltip
              content={
                <div className="max-w-sm space-y-2">
                  {param.description && <p>{param.description}</p>}
                  {param.purpose && <p className="text-muted-foreground">{param.purpose}</p>}
                  {!!param.tradeoffsPros?.length && (
                    <div>
                      <p className="mb-0.5 font-semibold text-green-500">Влияние на защиту</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {param.tradeoffsPros.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {!!param.tradeoffsCons?.length && (
                    <div>
                      <p className="mb-0.5 font-semibold text-amber-500">Цена (производительность / удобство)</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {param.tradeoffsCons.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              }
            >
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </Tooltip>
          )}
        </div>

        {/* Inherited origin hint */}
        {isInherited && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <ArrowDownCircle className="h-3 w-3" />
            <span>
              {isLockedFromAbove ? 'Заблокировано родительской политикой' : 'Унаследовано'}
            </span>
            {/* Show effective value when inherited and own value differs */}
            {ownValue !== undefined && effectiveValue !== undefined && ownValue !== effectiveValue && (
              <span className="ml-2 text-muted-foreground">
                (действует: <ValueDisplay param={param} value={effectiveValue as JsonValue} />)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: control + lock icon */}
      <div className="flex shrink-0 items-center gap-2">
        {renderControl()}

        {/* Lock toggle — only visible for non-locked-from-above fields, and only on own policy */}
        {!readOnly && !isLockedFromAbove && (
          <Tooltip content={forced ? 'Параметр заблокирован для дочерних политик' : 'Разрешить изменение в дочерних политиках'}>
            <button
              type="button"
              onClick={() => onForcedChange?.(param.id, !forced)}
              className={cn(
                'rounded p-0.5 transition-colors',
                'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                forced ? 'text-orange-500' : 'text-muted-foreground/40 group-hover:text-muted-foreground/70',
              )}
              aria-label={forced ? 'Снять блокировку' : 'Заблокировать'}
            >
              {forced ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>
        )}

        {/* Lock icon shown when locked from above (read-only) */}
        {isLockedFromAbove && (
          <Tooltip content="Заблокировано родительской политикой">
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          </Tooltip>
        )}
      </div>
    </div>
  )
}
