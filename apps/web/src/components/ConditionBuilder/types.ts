export interface ConditionLeaf {
  criteriaKey: string
  op: string
  value: unknown
}

export interface ConditionGroup {
  operator: 'and' | 'or'
  rules: Array<ConditionLeaf | ConditionGroup>
}

export function isGroup(rule: ConditionLeaf | ConditionGroup): rule is ConditionGroup {
  return 'operator' in rule && 'rules' in rule
}

export interface CriteriaMeta {
  id: string
  criteriaKey: string
  group: string
  valueType: string
  operatorOptions: unknown // string[]
  description: string | null
}

export const OPERATOR_LABELS: Record<string, string> = {
  equals: '=',
  not_equals: '≠',
  contains: 'содержит',
  not_contains: 'не содержит',
  starts_with: 'начинается с',
  ends_with: 'оканчивается на',
  in_range: 'в диапазоне',
  not_in_range: 'не в диапазоне',
  greater_than: '>',
  less_than: '<',
  member_of: 'входит в',
  not_member_of: 'не входит в',
}

export const GROUP_LABELS: Record<string, string> = {
  network: 'Сеть',
  ad: 'Active Directory',
  application: 'Приложения',
  protection: 'Защита',
  virtualisation: 'Виртуализация',
}

export function emptyGroup(): ConditionGroup {
  return { operator: 'and', rules: [] }
}

export function emptyLeaf(): ConditionLeaf {
  return { criteriaKey: '', op: 'equals', value: '' }
}
