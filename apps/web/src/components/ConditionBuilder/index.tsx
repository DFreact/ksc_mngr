import { Plus, Trash2, PlusSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  type ConditionLeaf,
  type ConditionGroup,
  type CriteriaMeta,
  isGroup,
  emptyGroup,
  emptyLeaf,
  OPERATOR_LABELS,
  GROUP_LABELS,
} from './types'

// ─── Value input by criteria valueType ──────────────────────────────────────

function ValueInput({
  criteria,
  value,
  onChange,
}: {
  criteria: CriteriaMeta | undefined
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (!criteria) return null

  if (criteria.valueType === 'bool') {
    return (
      <Select
        className="w-28"
        value={String(value ?? 'true')}
        options={[
          { value: 'true', label: 'Да' },
          { value: 'false', label: 'Нет' },
        ]}
        onChange={e => onChange(e.target.value === 'true')}
      />
    )
  }

  return (
    <Input
      className="w-40"
      type={criteria.valueType === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      placeholder="значение"
      onChange={e => onChange(criteria.valueType === 'number' ? Number(e.target.value) : e.target.value)}
    />
  )
}

// ─── Single leaf rule row ────────────────────────────────────────────────────

function LeafRow({
  leaf,
  onChange,
  onRemove,
  criteriaList,
}: {
  leaf: ConditionLeaf
  onChange: (l: ConditionLeaf) => void
  onRemove: () => void
  criteriaList: CriteriaMeta[]
}) {
  const criteria = criteriaList.find(c => c.criteriaKey === leaf.criteriaKey)
  const operators = (criteria?.operatorOptions as string[] | null) ?? ['equals']

  return (
    <div className="flex items-center gap-2">
      {/* Criteria selector */}
      <Select
        className="w-52"
        value={leaf.criteriaKey}
        options={[
          { value: '', label: 'Выберите критерий…' },
          ...Object.entries(
            criteriaList.reduce<Record<string, CriteriaMeta[]>>((acc, c) => {
              const g = GROUP_LABELS[c.group] ?? c.group
              if (!acc[g]) acc[g] = []
              acc[g].push(c)
              return acc
            }, {}),
          ).flatMap(([group, items]) => [
            { value: `__group_${group}`, label: `── ${group} ──`, disabled: true },
            ...items.map(c => ({ value: c.criteriaKey, label: c.description ?? c.criteriaKey })),
          ]),
        ]}
        onChange={e => {
          const c = criteriaList.find(x => x.criteriaKey === e.target.value)
          onChange({
            criteriaKey: e.target.value,
            op: (c?.operatorOptions as string[] | null)?.[0] ?? 'equals',
            value: c?.valueType === 'bool' ? true : '',
          })
        }}
      />

      {/* Operator selector */}
      <Select
        className="w-32"
        value={leaf.op}
        options={operators.map(op => ({ value: op, label: OPERATOR_LABELS[op] ?? op }))}
        onChange={e => onChange({ ...leaf, op: e.target.value })}
      />

      {/* Value input */}
      <ValueInput
        criteria={criteria}
        value={leaf.value}
        onChange={v => onChange({ ...leaf, value: v })}
      />

      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Recursive rule group ────────────────────────────────────────────────────

interface RuleGroupProps {
  group: ConditionGroup
  onChange: (g: ConditionGroup) => void
  onRemove?: () => void
  criteriaList: CriteriaMeta[]
  depth?: number
}

function RuleGroup({ group, onChange, onRemove, criteriaList, depth = 0 }: RuleGroupProps) {
  function updateRule(index: number, rule: ConditionLeaf | ConditionGroup) {
    const rules = [...group.rules]
    rules[index] = rule
    onChange({ ...group, rules })
  }

  function removeRule(index: number) {
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) })
  }

  function addLeaf() {
    onChange({ ...group, rules: [...group.rules, emptyLeaf()] })
  }

  function addSubGroup() {
    onChange({ ...group, rules: [...group.rules, emptyGroup()] })
  }

  const borderColor = depth === 0
    ? 'border-border'
    : depth === 1
      ? 'border-blue-200 dark:border-blue-800'
      : 'border-purple-200 dark:border-purple-800'

  return (
    <div className={cn('rounded-lg border p-3', borderColor)}>
      {/* Group header: AND/OR toggle + optional remove */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-input text-xs">
          {(['and', 'or'] as const).map(op => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...group, operator: op })}
              className={cn(
                'px-3 py-1 transition-colors',
                group.operator === op
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {op === 'and' ? 'И (AND)' : 'ИЛИ (OR)'}
            </button>
          ))}
        </div>

        {depth > 0 && (
          <span className="flex-1 text-xs text-muted-foreground">
            {depth === 1 ? 'вложенная группа' : `уровень ${depth}`}
          </span>
        )}

        {onRemove && (
          <Button variant="ghost" size="icon" className="ml-auto text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {group.rules.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Добавьте условие или вложенную группу
          </p>
        )}

        {group.rules.map((rule, idx) => (
          <div key={idx}>
            {isGroup(rule) ? (
              <RuleGroup
                group={rule}
                onChange={updated => updateRule(idx, updated)}
                onRemove={() => removeRule(idx)}
                criteriaList={criteriaList}
                depth={depth + 1}
              />
            ) : (
              <LeafRow
                leaf={rule}
                onChange={updated => updateRule(idx, updated)}
                onRemove={() => removeRule(idx)}
                criteriaList={criteriaList}
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addLeaf}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Условие
        </Button>
        {depth < 2 && (
          <Button type="button" variant="ghost" size="sm" onClick={addSubGroup}>
            <PlusSquare className="mr-1 h-3.5 w-3.5" />
            Группа
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ConditionBuilderProps {
  value: ConditionGroup
  onChange: (v: ConditionGroup) => void
  criteriaList: CriteriaMeta[]
}

export function ConditionBuilder({ value, onChange, criteriaList }: ConditionBuilderProps) {
  return <RuleGroup group={value} onChange={onChange} criteriaList={criteriaList} depth={0} />
}

export type { ConditionGroup, ConditionLeaf, CriteriaMeta } from './types'
export { emptyGroup } from './types'
