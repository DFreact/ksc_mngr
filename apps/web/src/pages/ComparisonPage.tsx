import { useState, useMemo } from 'react'
import { Lock, ArrowDownCircle, GitCompare } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { EffectiveSettingsMap, EffectiveSetting } from '@ksc/domain'

// ─── Local flat interfaces to avoid tRPC recursive type errors ─────────────

interface Param {
  id: string
  category: string
  subcategory: string | null
  name: string
  valueType: string
  unit: string | null
  defaultValue: unknown
}

interface PolicyRow {
  id: string
  name: string
  status: string
  targetGroup: { id: string; name: string } | null
  application: { id: string; name: string; version: string }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatValue(value: unknown, valueType: string): string {
  if (value === null || value === undefined) return '—'
  if (valueType === 'bool' || typeof value === 'boolean') return value ? 'Вкл' : 'Выкл'
  return String(value)
}

const MAX_SELECTED = 6

// ─── Cell ───────────────────────────────────────────────────────────────────

function MatrixCell({
  param,
  effective,
  isDiff,
}: {
  param: Param
  effective: EffectiveSetting | undefined
  isDiff: boolean
}) {
  const value = effective?.value
  const source = effective?.source
  const locked = effective?.lockedFromAbove === true

  const text = formatValue(value, param.valueType)
  const unit = param.unit && value !== null && value !== undefined ? ` ${param.unit}` : ''

  return (
    <td
      className={cn(
        'border-r px-3 py-2 text-sm align-top transition-colors',
        locked && 'bg-orange-50/60 dark:bg-orange-900/10',
        source === 'inherited' && !locked && 'bg-amber-50/40 dark:bg-amber-900/10',
        isDiff && 'font-medium',
        !effective && 'text-muted-foreground',
      )}
    >
      <div className="flex items-center gap-1.5">
        {locked && <Lock className="h-3 w-3 shrink-0 text-orange-400" />}
        {source === 'inherited' && !locked && (
          <ArrowDownCircle className="h-3 w-3 shrink-0 text-amber-400" />
        )}
        <span>
          {text}
          {unit && <span className="text-muted-foreground">{unit}</span>}
        </span>
      </div>
    </td>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ComparisonPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([])
  const [showOnlyDiff, setShowOnlyDiff] = useState(false)

  // ── Catalog queries ──────────────────────────────────────────────────────

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const { data: applications } = trpc.catalog.listApplications.useQuery()

  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''
  const activeAppId = selectedAppId ?? applications?.[0]?.id ?? ''

  const { data: rawPolicies } = trpc.policies.listForEnvironment.useQuery(
    { environmentId: activeEnvId, applicationId: activeAppId },
    { enabled: !!(activeEnvId && activeAppId) },
  )
  const policies = rawPolicies as PolicyRow[] | undefined

  const { data: rawParams } = trpc.catalog.listParameters.useQuery(
    { applicationId: activeAppId },
    { enabled: !!activeAppId },
  )
  const params = rawParams as Param[] | undefined

  const { data: rawMatrix } = trpc.policies.compareMatrix.useQuery(
    { policyIds: selectedPolicyIds },
    { enabled: selectedPolicyIds.length >= 1 },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matrix = (rawMatrix as any ?? {}) as Record<string, EffectiveSettingsMap>

  // ── Derived ──────────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    if (!params) return new Map<string, Param[]>()
    const map = new Map<string, Param[]>()
    for (const p of params) {
      const key = p.subcategory ? `${p.category} / ${p.subcategory}` : p.category
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [params])

  const groupEntries: Array<[string, Param[]]> = useMemo(
    () => Array.from(grouped.entries()),
    [grouped],
  )

  const selectedPolicies = useMemo(
    () => (policies ?? []).filter(p => selectedPolicyIds.includes(p.id)),
    [policies, selectedPolicyIds],
  )

  function togglePolicy(id: string) {
    setSelectedPolicyIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_SELECTED) return prev
      return [...prev, id]
    })
  }

  // Reset selections when env/app changes
  function handleEnvChange(envId: string) {
    setSelectedEnvId(envId)
    setSelectedPolicyIds([])
  }
  function handleAppChange(appId: string) {
    setSelectedAppId(appId)
    setSelectedPolicyIds([])
  }

  // Whether a parameter row has any difference across selected policies
  function hasDiff(paramId: string): boolean {
    if (selectedPolicyIds.length < 2) return false
    const values = selectedPolicyIds.map(pid => formatValue(matrix[pid]?.[paramId]?.value, ''))
    return new Set(values).size > 1
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b bg-card px-6 py-3">
        <Select
          className="w-44"
          value={activeEnvId}
          onChange={e => handleEnvChange(e.target.value)}
          options={(environments ?? []).map(e => ({ value: e.id, label: e.name }))}
        />
        <Select
          className="w-52"
          value={activeAppId}
          onChange={e => handleAppChange(e.target.value)}
          options={(applications ?? []).map(a => ({ value: a.id, label: `${a.name} ${a.version}` }))}
        />
        <Separator orientation="vertical" className="h-6" />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={showOnlyDiff} onCheckedChange={setShowOnlyDiff} />
          <span>Только отличия</span>
        </label>
        {selectedPolicyIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedPolicyIds([])}>
            Сбросить выбор
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: policy picker */}
        <aside className="flex w-56 shrink-0 flex-col border-r">
          <div className="border-b px-4 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              Политики {selectedPolicyIds.length > 0 && `(${selectedPolicyIds.length}/${MAX_SELECTED})`}
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {(policies ?? []).length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {activeEnvId && activeAppId ? 'Политики не найдены' : 'Выберите среду и приложение'}
                </p>
              )}
              {(policies ?? []).map(policy => {
                const isSelected = selectedPolicyIds.includes(policy.id)
                const isDisabled = !isSelected && selectedPolicyIds.length >= MAX_SELECTED
                return (
                  <button
                    key={policy.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => togglePolicy(policy.id)}
                    className={cn(
                      'flex w-full flex-col items-start rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                      'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
                      isSelected && 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30',
                    )}
                  >
                    <span className="font-medium leading-snug">{policy.name}</span>
                    {policy.targetGroup && (
                      <span className="text-muted-foreground">{policy.targetGroup.name}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Right: matrix table */}
        <div className="flex-1 overflow-auto">
          {selectedPolicyIds.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <GitCompare className="h-10 w-10 opacity-30" />
              <p className="text-sm">Выберите одну или несколько политик слева для сравнения</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-sm">
                <tr>
                  <th className="border-b border-r px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-56">
                    Параметр
                  </th>
                  {selectedPolicies.map(p => (
                    <th
                      key={p.id}
                      className="border-b border-r px-3 py-2.5 text-left text-xs font-medium min-w-[160px]"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>{p.name}</span>
                        {p.targetGroup && (
                          <span className="font-normal text-muted-foreground">{p.targetGroup.name}</span>
                        )}
                        <Badge
                          variant={p.status === 'active' ? 'default' : 'secondary'}
                          className="mt-0.5 w-fit text-[10px]"
                        >
                          {p.status === 'active' ? 'Активна' : p.status === 'inactive' ? 'Неактивна' : 'Не в офисе'}
                        </Badge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupEntries.map(([category, categoryParams]) => {
                  const visibleParams = showOnlyDiff
                    ? categoryParams.filter(p => hasDiff(p.id))
                    : categoryParams
                  if (visibleParams.length === 0) return null
                  return (
                    <>
                      <tr key={`cat-${category}`} className="bg-muted/30">
                        <td
                          colSpan={selectedPolicies.length + 1}
                          className="border-b border-r px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {category}
                        </td>
                      </tr>
                      {visibleParams.map(param => {
                        const diff = hasDiff(param.id)
                        return (
                          <tr
                            key={param.id}
                            className={cn(
                              'border-b transition-colors hover:bg-muted/30',
                              diff && 'bg-yellow-50/30 dark:bg-yellow-900/5',
                            )}
                          >
                            <td className="border-r px-3 py-2 text-xs text-muted-foreground w-56 align-top">
                              {param.name}
                            </td>
                            {selectedPolicies.map(policy => (
                              <MatrixCell
                                key={policy.id}
                                param={param}
                                effective={matrix[policy.id]?.[param.id] as EffectiveSetting | undefined}
                                isDiff={diff}
                              />
                            ))}
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
