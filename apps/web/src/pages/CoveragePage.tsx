import { useState } from 'react'
import {
  ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, ShieldOff, Eye, Info,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type CoverageStatus = 'prevented' | 'detected' | 'partial' | 'available' | 'gap'

interface CoverageMatch {
  mappingId: string
  parameterId: string
  coverageStrength: string
  satisfied: boolean
}

interface VectorCoverage {
  vectorId: string
  status: CoverageStatus
  matches: CoverageMatch[]
  available: CoverageMatch[]
}

interface ThreatVector {
  id: string
  tactic: string
  name: string
  description: string | null
  mitreTechniqueRef: string | null
}

// ─── Honest status model ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CoverageStatus, {
  label: string
  hint: string
  icon: React.ReactNode
  badge: string
  bar: string
}> = {
  prevented: {
    label: 'Блокируется',
    hint: 'Контроль реально останавливает технику',
    icon: <ShieldCheck className="h-4 w-4" />,
    badge: 'bg-green-100 text-green-700 border-green-200',
    bar: 'bg-green-500',
  },
  detected: {
    label: 'Обнаруживается',
    hint: 'Видно в событиях, но техника не блокируется',
    icon: <Eye className="h-4 w-4" />,
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    bar: 'bg-sky-500',
  },
  partial: {
    label: 'Частично',
    hint: 'Покрыты лишь некоторые варианты техники',
    icon: <ShieldAlert className="h-4 w-4" />,
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
  },
  available: {
    label: 'Не включено',
    hint: 'KESL умеет это закрыть, но параметр выключен в политике — исправляется настройкой',
    icon: <ShieldOff className="h-4 w-4" />,
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    bar: 'bg-orange-500',
  },
  gap: {
    label: 'Нет контроля',
    hint: 'Вне зоны действия KESL — нужен другой инструмент (EDR, PAM, сегментация, аудит)',
    icon: <ShieldX className="h-4 w-4" />,
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
  },
}

const STATUS_ORDER: CoverageStatus[] = ['prevented', 'detected', 'partial', 'available', 'gap']

const STRENGTH_LABELS: Record<string, string> = {
  prevents: 'предотвращает',
  detects: 'обнаруживает',
  partial: 'частично',
  compensating: 'усиливает',
}

const STRENGTH_COLOR: Record<string, string> = {
  prevents: 'bg-green-100 text-green-700',
  detects: 'bg-sky-100 text-sky-700',
  partial: 'bg-amber-100 text-amber-700',
  compensating: 'bg-gray-100 text-gray-600',
}

// Порядок тактик как в MITRE ATT&CK (kill chain), а не по алфавиту
const TACTIC_ORDER = [
  'Первоначальный доступ',
  'Выполнение',
  'Закрепление',
  'Повышение привилегий',
  'Обход защиты',
  'Доступ к учётным данным',
  'Разведка',
  'Боковое перемещение',
  'Сбор данных',
  'Командное управление',
  'Кража данных',
  'Воздействие',
]

// ─── Summary ──────────────────────────────────────────────────────────────────

function CoverageSummary({ coverages }: { coverages: VectorCoverage[] }) {
  const counts: Record<CoverageStatus, number> = {
    prevented: 0, detected: 0, partial: 0, available: 0, gap: 0,
  }
  for (const c of coverages) counts[c.status]++
  const total = coverages.length
  if (total === 0) return null

  return (
    <div className="space-y-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-green-600">{counts.prevented}</span>
          <span className="text-sm text-muted-foreground">из {total} векторов реально блокируется</span>
        </div>
        <div className="text-sm text-muted-foreground">
          обнаруживается <span className="font-medium text-sky-600">{counts.detected}</span>
          {' · '}частично <span className="font-medium text-amber-600">{counts.partial}</span>
          {' · '}не включено <span className="font-medium text-orange-600">{counts.available}</span>
          {' · '}нет контроля <span className="font-medium text-rose-600">{counts.gap}</span>
        </div>
      </div>

      {/* Стековая полоса */}
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {STATUS_ORDER.map(s => counts[s] > 0 && (
          <div key={s} className={STATUS_CONFIG[s].bar} style={{ width: `${(counts[s] / total) * 100}%` }} />
        ))}
      </div>

      {/* Легенда — что означает каждый статус для защиты */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {STATUS_ORDER.map(s => (
          <div key={s} className="flex items-start gap-1.5 text-xs">
            <span className={cn('mt-0.5 flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium', STATUS_CONFIG[s].badge)}>
              {STATUS_CONFIG[s].icon}
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{STATUS_CONFIG[s].label}.</span> {STATUS_CONFIG[s].hint}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Parameter name lookup ────────────────────────────────────────────────────

function useParameterNames() {
  const { data: mappings = [] } = trpc.coverage.listControlMappings.useQuery()
  const byId = new Map<string, { name: string; category: string }>()
  for (const m of mappings as { parameter: { id: string; name: string; category: string }; threatVectors: unknown[] }[]) {
    byId.set(m.parameter.id, { name: m.parameter.name, category: m.parameter.category })
  }
  return byId
}

// ─── Vector row ───────────────────────────────────────────────────────────────

function VectorRow({
  vector,
  coverage,
  paramNames,
}: {
  vector: ThreatVector
  coverage: VectorCoverage | undefined
  paramNames: Map<string, { name: string; category: string }>
}) {
  const [expanded, setExpanded] = useState(false)
  const status = coverage?.status ?? 'gap'
  const cfg = STATUS_CONFIG[status]
  const matches = coverage?.matches ?? []
  const available = coverage?.available ?? []
  const expandable = matches.length > 0 || available.length > 0 || !!vector.description

  return (
    <>
      <tr
        className={cn('border-b', expandable && 'cursor-pointer hover:bg-accent/30')}
        onClick={() => expandable && setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {expandable
              ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)
              : <span className="w-3.5" />}
            <span className="text-sm">{vector.name}</span>
            {vector.mitreTechniqueRef && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                {vector.mitreTechniqueRef}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={cn('flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', cfg.badge)}>
            {cfg.icon}{cfg.label}
          </span>
        </td>
      </tr>
      {expanded && expandable && (
        <tr className="border-b bg-muted/20">
          <td colSpan={2} className="px-8 py-3">
            <div className="space-y-2.5">
              {vector.description && (
                <p className="text-xs text-muted-foreground">{vector.description}</p>
              )}

              {matches.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Работающие контроли:</p>
                  {matches.map(m => {
                    const param = paramNames.get(m.parameterId)
                    return (
                      <div key={m.mappingId} className="flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', STRENGTH_COLOR[m.coverageStrength] ?? 'bg-gray-100 text-gray-600')}>
                          {STRENGTH_LABELS[m.coverageStrength] ?? m.coverageStrength}
                        </span>
                        <span className="text-xs">{param ? param.name : m.parameterId}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {available.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                    <ShieldOff className="h-3.5 w-3.5" />
                    Можно закрыть — включите в политике:
                  </p>
                  {available.map(m => {
                    const param = paramNames.get(m.parameterId)
                    return (
                      <div key={m.mappingId} className="flex items-center gap-2 opacity-80">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', STRENGTH_COLOR[m.coverageStrength] ?? 'bg-gray-100 text-gray-600')}>
                          {STRENGTH_LABELS[m.coverageStrength] ?? m.coverageStrength}
                        </span>
                        <span className="text-xs">{param ? param.name : m.parameterId}</span>
                        <span className="text-xs text-muted-foreground">— сейчас выключено</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {matches.length === 0 && available.length === 0 && (
                <p className="flex items-center gap-1 text-xs font-medium text-rose-600">
                  <ShieldX className="h-3.5 w-3.5" />
                  Вне зоны действия KESL — требуется другой инструмент защиты.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Tactic section ───────────────────────────────────────────────────────────

function TacticSection({
  tactic,
  vectors,
  coverageMap,
  paramNames,
  filterStatus,
}: {
  tactic: string
  vectors: ThreatVector[]
  coverageMap: Map<string, VectorCoverage>
  paramNames: Map<string, { name: string; category: string }>
  filterStatus: CoverageStatus | 'all'
}) {
  const filtered = filterStatus === 'all'
    ? vectors
    : vectors.filter(v => (coverageMap.get(v.id)?.status ?? 'gap') === filterStatus)

  if (filtered.length === 0) return null

  // Мини-сводка по тактике: сколько блокируется из всех
  const prevented = vectors.filter(v => coverageMap.get(v.id)?.status === 'prevented').length

  return (
    <tbody>
      <tr className="bg-muted/40">
        <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tactic}
        </td>
        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
          блокируется {prevented}/{vectors.length}
        </td>
      </tr>
      {filtered.map(v => (
        <VectorRow
          key={v.id}
          vector={v}
          coverage={coverageMap.get(v.id)}
          paramNames={paramNames}
        />
      ))}
    </tbody>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function CoveragePage() {
  const { data: envs = [] } = trpc.groups.listEnvironments.useQuery()
  const typedEnvs = envs as Array<{ id: string; name: string }>
  const [envId, setEnvId] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [filterStatus, setFilterStatus] = useState<CoverageStatus | 'all'>('all')

  const effectiveEnvId = envId || typedEnvs[0]?.id || ''

  const { data: policies = [] } = trpc.policies.listForEnvironment.useQuery(
    { environmentId: effectiveEnvId },
    { enabled: !!effectiveEnvId },
  )
  const typedPolicies = policies as { id: string; name: string; application: { name: string; version: string }; targetGroup: { name: string } | null }[]

  const { data: report, isLoading } = trpc.coverage.reportForPolicy.useQuery(
    { policyId, environmentId: effectiveEnvId },
    { enabled: !!policyId && !!effectiveEnvId },
  )

  const coverageMap = new Map<string, VectorCoverage>()
  for (const c of (report?.coverage ?? []) as VectorCoverage[]) {
    coverageMap.set(c.vectorId, c)
  }

  const threatVectors = (report?.threatVectors ?? []) as ThreatVector[]
  const presentTactics = [...new Set(threatVectors.map(v => v.tactic))]
  const tactics = [
    ...TACTIC_ORDER.filter(t => presentTactics.includes(t)),
    ...presentTactics.filter(t => !TACTIC_ORDER.includes(t)),
  ]
  const paramNames = useParameterNames()

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Select
          value={effectiveEnvId}
          options={typedEnvs.map(e => ({ value: e.id, label: e.name }))}
          onChange={e => { setEnvId(e.target.value); setPolicyId('') }}
          className="w-52"
        />
        <Select
          value={policyId}
          placeholder="— выберите политику —"
          options={typedPolicies.map(p => ({
            value: p.id,
            label: `${p.name} — ${p.application.name} ${p.application.version} / ${p.targetGroup?.name ?? 'без группы'}`,
          }))}
          onChange={e => setPolicyId(e.target.value)}
          className="w-96"
        />
        {report && (
          <Select
            value={filterStatus}
            options={[
              { value: 'all', label: 'Все векторы' },
              { value: 'prevented', label: 'Только блокируется' },
              { value: 'detected', label: 'Только обнаруживается' },
              { value: 'partial', label: 'Только частично' },
              { value: 'available', label: 'Только не включено' },
              { value: 'gap', label: 'Только нет контроля' },
            ]}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="w-56"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!policyId && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Выберите политику для анализа покрытия атак</p>
          </div>
        )}

        {policyId && isLoading && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Вычисляется покрытие…</p>
          </div>
        )}

        {report && !isLoading && (
          <div className="space-y-3">
            <CoverageSummary coverages={(report.coverage ?? []) as VectorCoverage[]} />

            <div className="flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
              <span>
                Матрица считается по <span className="font-medium text-foreground">действующей</span> политике
                (с учётом наследования). «Блокируется» — то, что реально остановлено; «обнаруживается» — видно,
                но не блокируется; «не включено» — KESL умеет, но параметр выключен (чините настройкой);
                «нет контроля» — техника вне зоны действия EPP, нужен другой рубеж защиты.
                Оценка по официальной документации KESL 12.4 и модели MITRE ATT&CK, без завышения.
              </span>
            </div>

            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left text-sm font-medium">Вектор атаки (MITRE ATT&CK)</th>
                    <th className="w-44 px-3 py-2 text-left text-sm font-medium">Статус</th>
                  </tr>
                </thead>
                {tactics.map(tactic => (
                  <TacticSection
                    key={tactic}
                    tactic={tactic}
                    vectors={threatVectors.filter(v => v.tactic === tactic)}
                    coverageMap={coverageMap}
                    paramNames={paramNames}
                    filterStatus={filterStatus}
                  />
                ))}
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Эффективных настроек политики: {report.effectiveSettingsCount}.
              Нажмите на вектор, чтобы увидеть работающие контроли, выключенные возможности и рекомендации.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
