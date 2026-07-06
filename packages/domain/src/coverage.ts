import type { EffectiveSettingsMap } from './policy.js'

// ─── Input types (no Prisma import) ──────────────────────────────────────────

export interface ControlMappingRow {
  id: string
  parameterId: string
  requiredState: { value: unknown }
  coverageStrength: 'prevents' | 'detects' | 'partial' | 'compensating'
  threatVectors: { id: string }[]
}

export interface ThreatVectorRow {
  id: string
  tactic: string
  name: string
}

// ─── Output types ─────────────────────────────────────────────────────────────

// Честная 5-уровневая модель. Разница между уровнями — принципиальная для
// защитника, а не косметическая:
//   prevented — контроль реально БЛОКИРУЕТ технику в текущей политике;
//   detected  — контроль ВИДИТ технику (событие/алерт), но НЕ блокирует;
//   partial   — покрыты лишь некоторые варианты/условия техники;
//   available — KESL УМЕЕТ это закрыть, но в этой политике параметр ВЫКЛЮЧЕН
//               (устраняется настройкой — это не дыра продукта, а дыра конфигурации);
//   gap       — в KESL НЕТ контроля под эту технику (нужен другой инструмент:
//               EDR, PAM, сегментация сети, аудит).
export type CoverageStatus = 'prevented' | 'detected' | 'partial' | 'available' | 'gap'

export interface CoverageMatch {
  mappingId: string
  parameterId: string
  coverageStrength: string
  /** Требуемое значение реально выставлено в действующей политике. */
  satisfied: boolean
}

export interface VectorCoverage {
  vectorId: string
  status: CoverageStatus
  /** Контроли, которые реально работают в этой политике. */
  matches: CoverageMatch[]
  /** Контроли KESL под эту технику, которые СУЩЕСТВУЮТ, но сейчас выключены. */
  available: CoverageMatch[]
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

// Считаем значение параметра "выставленным как требуется", если действующее
// значение равно требуемому. Для булевых требований true — включённость.
function isSatisfied(effectiveValue: unknown, requiredValue: unknown): boolean {
  return effectiveValue === requiredValue
}

/**
 * Рассчитывает статус покрытия для каждого вектора угрозы по действующим
 * настройкам политики.
 *
 * Приоритет статуса: prevented > detected > partial > available > gap.
 * Важно: наличие у вектора кандидатов-контролей (даже выключенных) отличает
 * "не включено" (available, чинится настройкой) от "нет контроля" (gap, нужен
 * другой инструмент). Именно это отличает рабочий инструмент от отчётной фикции.
 */
export function computePolicyCoverage(
  effectiveSettings: EffectiveSettingsMap,
  controlMappings: ControlMappingRow[],
  threatVectors: ThreatVectorRow[],
): VectorCoverage[] {
  const mappingsByVector = new Map<string, ControlMappingRow[]>()
  for (const mapping of controlMappings) {
    for (const tv of mapping.threatVectors) {
      if (!mappingsByVector.has(tv.id)) mappingsByVector.set(tv.id, [])
      mappingsByVector.get(tv.id)!.push(mapping)
    }
  }

  return threatVectors.map(vector => {
    const candidateMappings = mappingsByVector.get(vector.id) ?? []
    const matches: CoverageMatch[] = []
    const available: CoverageMatch[] = []

    for (const mapping of candidateMappings) {
      const effective = effectiveSettings[mapping.parameterId]
      const satisfied = effective !== undefined
        && isSatisfied(effective.value, mapping.requiredState.value)
      const record: CoverageMatch = {
        mappingId: mapping.id,
        parameterId: mapping.parameterId,
        coverageStrength: mapping.coverageStrength,
        satisfied,
      }
      if (satisfied) matches.push(record)
      else available.push(record)
    }

    const hasPrevents = matches.some(m => m.coverageStrength === 'prevents')
    const hasDetects = matches.some(m => m.coverageStrength === 'detects')
    const hasPartial = matches.some(
      m => m.coverageStrength === 'partial' || m.coverageStrength === 'compensating',
    )

    let status: CoverageStatus
    if (hasPrevents) status = 'prevented'
    else if (hasDetects) status = 'detected'
    else if (hasPartial) status = 'partial'
    else if (candidateMappings.length > 0) status = 'available'
    else status = 'gap'

    return { vectorId: vector.id, status, matches, available }
  })
}
