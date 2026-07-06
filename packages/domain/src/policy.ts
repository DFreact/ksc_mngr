import type { JsonValue } from './types.js'

// ─── Input types (mirror Prisma shapes, no Prisma import) ─────────────────────

export interface PolicyRow {
  id: string
  applicationId: string
  targetGroupId: string | null
  status: 'active' | 'inactive' | 'out_of_office'
  inheritFromParent: boolean
  forceInheritToChildren: boolean
}

export interface PolicySettingRow {
  policyId: string
  parameterId: string
  value: JsonValue
  forced: boolean   // zamochek — this value cannot be overridden by children when inheritance is active
  inherited: boolean
}

export interface GroupRow {
  id: string
  parentId: string | null
}

// ─── Output types ─────────────────────────────────────────────────────────────

export type EffectiveSource = 'own' | 'inherited'

export interface EffectiveSetting {
  parameterId: string
  value: JsonValue
  source: EffectiveSource
  /** True when a parent policy has forced=true on this parameter AND inheritance is active */
  lockedFromAbove: boolean
  /** The group from which the effective value originates */
  sourceGroupId: string | null
  sourcePolicyId: string | null
}

export type EffectiveSettingsMap = Record<string, EffectiveSetting>

// ─── Resolution algorithm ─────────────────────────────────────────────────────

interface AncestorLink {
  policy: PolicyRow
  settings: Map<string, PolicySettingRow>
  groupId: string
}

function buildAncestorChain(
  targetPolicy: PolicyRow,
  allPolicies: PolicyRow[],
  allSettings: PolicySettingRow[],
  groups: GroupRow[],
): AncestorLink[] {
  // Index structures
  const groupById = new Map(groups.map(g => [g.id, g]))
  const settingsByPolicy = new Map<string, Map<string, PolicySettingRow>>()
  for (const s of allSettings) {
    if (!settingsByPolicy.has(s.policyId)) settingsByPolicy.set(s.policyId, new Map())
    settingsByPolicy.get(s.policyId)!.set(s.parameterId, s)
  }

  // Active policies for this application indexed by group
  const activePolicyByGroup = new Map<string, PolicyRow>()
  for (const p of allPolicies) {
    if (p.applicationId === targetPolicy.applicationId && p.status === 'active' && p.targetGroupId) {
      activePolicyByGroup.set(p.targetGroupId, p)
    }
  }

  const chain: AncestorLink[] = []

  if (!targetPolicy.targetGroupId) return chain

  let currentGroupId: string | null = groupById.get(targetPolicy.targetGroupId)?.parentId ?? null

  while (currentGroupId) {
    const ancestor = activePolicyByGroup.get(currentGroupId)
    if (ancestor) {
      chain.push({
        policy: ancestor,
        settings: settingsByPolicy.get(ancestor.id) ?? new Map(),
        groupId: currentGroupId,
      })
    }
    currentGroupId = groupById.get(currentGroupId)?.parentId ?? null
  }

  return chain // [nearest ancestor, ..., root ancestor]
}

/**
 * Compute effective settings for a policy, walking up the group tree to apply
 * inheritance rules from sections 12 and 13 of the data model.
 *
 * Pure function — no DB access, no side effects.
 */
export function resolveEffectiveSettings(
  targetPolicyId: string,
  allPolicies: PolicyRow[],
  allSettings: PolicySettingRow[],
  groups: GroupRow[],
): EffectiveSettingsMap {
  const target = allPolicies.find(p => p.id === targetPolicyId)
  if (!target) return {}

  const settingsByPolicy = new Map<string, Map<string, PolicySettingRow>>()
  for (const s of allSettings) {
    if (!settingsByPolicy.has(s.policyId)) settingsByPolicy.set(s.policyId, new Map())
    settingsByPolicy.get(s.policyId)!.set(s.parameterId, s)
  }

  const ownSettings = settingsByPolicy.get(targetPolicyId) ?? new Map<string, PolicySettingRow>()
  const chain = buildAncestorChain(target, allPolicies, allSettings, groups)

  const result: EffectiveSettingsMap = {}

  // 1. Seed with own settings
  for (const [parameterId, setting] of ownSettings) {
    result[parameterId] = {
      parameterId,
      value: setting.value,
      source: 'own',
      lockedFromAbove: false,
      sourceGroupId: target.targetGroupId,
      sourcePolicyId: target.id,
    }
  }

  // 2. Walk up the ancestor chain (nearest first), applying forced overrides
  let childInherits = target.inheritFromParent

  for (const { policy: ancestor, settings: ancestorSettings, groupId } of chain) {
    // force_inherit_to_children on the ancestor overrides child's inherit switch
    const effectiveInheritance = childInherits || ancestor.forceInheritToChildren

    if (!effectiveInheritance) {
      // This child is not inheriting → stop walking further up
      break
    }

    for (const [parameterId, setting] of ancestorSettings) {
      if (!setting.forced) continue

      // Ancestor has this parameter locked → it overrides child's value
      result[parameterId] = {
        parameterId,
        value: setting.value,
        source: 'inherited',
        lockedFromAbove: true,
        sourceGroupId: groupId,
        sourcePolicyId: ancestor.id,
      }
    }

    // Prepare for next ancestor level: the ancestor's inheritFromParent flag governs
    // whether we continue past the ancestor's parent
    childInherits = ancestor.inheritFromParent
  }

  return result
}

/**
 * True if the given parameterId is effectively locked for this policy
 * (inherited from a parent with forced=true and inheritance is active).
 */
export function isLockedFromAbove(
  parameterId: string,
  effective: EffectiveSettingsMap,
): boolean {
  return effective[parameterId]?.lockedFromAbove === true
}
