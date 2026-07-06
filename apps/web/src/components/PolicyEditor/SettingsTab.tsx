import { useMemo, useState } from 'react'
import { ChevronRight, ExternalLink, HelpCircle, MapPin, Pencil, Search, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SettingField } from '@/components/SettingField'
import { Separator } from '@/components/ui/separator'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { ListEditor, type ListTypeInfo } from './ListEditor'
import { cn } from '@/lib/utils'
import type { EffectiveSettingsMap } from '@ksc/domain'

// Flat shape of a ParameterCatalog row — avoids deep tRPC generic recursion in JSX
interface Param {
  id: string
  category: string
  subcategory: string | null
  group: string | null
  name: string
  valueType: string
  enumOptions: unknown
  unit: string | null
  defaultValue: unknown
  description: string | null
  purpose: string | null
  tradeoffsPros: unknown
  tradeoffsCons: unknown
  application: { id: string; name: string; version: string }
}

interface Mapping {
  excelSubcategory: string
  verified: boolean
  overridden: boolean
  docUrl: string | null
  note: string | null
  section: { id: string; name: string }
  component: { id: string; name: string }
}

interface Section {
  id: string
  name: string
  sortOrder: number
  components: Array<{ id: string; name: string; sortOrder: number }>
}

interface Policy {
  id: string
  applicationId: string
  settings: Array<{
    parameterId: string
    value: unknown
    forced: boolean
  }>
}

interface SettingsTabProps {
  policy: Policy
  applicationId: string
  effective: EffectiveSettingsMap
  readOnly?: boolean
}

const UNMAPPED_ID = '__unmapped'

// Списки, у которых свой UI на вкладке «Устройства»
const DEVICE_LIST_IDS = new Set(['device_control_custom_rules', 'device_temporary_access', 'trusted_devices'])

// Имя компонента в схемах списков ≠ имени в дереве разделов
const LIST_COMPONENT_ALIASES: Record<string, string> = {
  'Сетевой экран': 'Управление сетевым экраном',
}

export function SettingsTab({ policy, applicationId, effective, readOnly = false }: SettingsTabProps) {
  const { data: rawParams } = trpc.catalog.listParameters.useQuery({ applicationId })
  const { data: rawSections } = trpc.catalog.listSections.useQuery()
  const { data: rawMappings } = trpc.catalog.listSubcategoryMappings.useQuery()
  const { data: rawListTypes } = trpc.catalog.listListTypes.useQuery()
  const params = rawParams as Param[] | undefined
  const sections = (rawSections ?? []) as Section[]
  const mappings = (rawMappings ?? []) as unknown as Mapping[]
  const listTypes = (rawListTypes ?? []) as unknown as ListTypeInfo[]

  const upsertSetting = trpc.policies.upsertSetting.useMutation()
  const toggleLock = trpc.policies.toggleLock.useMutation()
  const utils = trpc.useUtils()

  const [selected, setSelected] = useState<string | null>(null) // "sectionId:componentId"
  const [search, setSearch] = useState('')
  const [onlyModified, setOnlyModified] = useState(false)

  function invalidate() {
    void utils.policies.get.invalidate({ policyId: policy.id })
    void utils.policies.resolveEffective.invalidate({ policyId: policy.id })
  }

  const mappingBySubcat = useMemo(
    () => new Map(mappings.map(m => [m.excelSubcategory, m])),
    [mappings],
  )

  const ownIdx = useMemo(
    () => new Map(policy.settings.map(s => [s.parameterId, s])),
    [policy.settings],
  )

  // Списки по имени компонента дерева (кроме устройств — у них своя вкладка)
  const listsByComponentName = useMemo(() => {
    const map = new Map<string, ListTypeInfo[]>()
    for (const lt of listTypes) {
      if (DEVICE_LIST_IDS.has(lt.id)) continue
      const compName = LIST_COMPONENT_ALIASES[lt.component ?? ''] ?? lt.component
      if (!compName) continue
      if (!map.has(compName)) map.set(compName, [])
      map.get(compName)!.push(lt)
    }
    return map
  }, [listTypes])

  // Фильтрация параметров: поиск + «только изменённые»
  const filteredParams = useMemo(() => {
    if (!params) return undefined
    const q = search.trim().toLowerCase()
    return params.filter(p => {
      if (onlyModified && !ownIdx.has(p.id)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.group ?? '').toLowerCase().includes(q) ||
        (p.subcategory ?? '').toLowerCase().includes(q)
      )
    })
  }, [params, search, onlyModified, ownIdx])

  // Дерево: раздел → компонент → подкатегория → группа → параметры.
  const tree = useMemo(() => {
    if (!filteredParams) return null
    type SubcatBlock = { subcategory: string | null; mapping: Mapping | null; groups: Map<string, Param[]> }
    type CompNode = { id: string; name: string; blocks: Map<string, SubcatBlock> }
    type SectNode = { id: string; name: string; components: Map<string, CompNode> }

    const bySection = new Map<string, SectNode>()

    const ensure = (sectId: string, sectName: string, compId: string, compName: string): CompNode => {
      let s = bySection.get(sectId)
      if (!s) { s = { id: sectId, name: sectName, components: new Map() }; bySection.set(sectId, s) }
      let c = s.components.get(compId)
      if (!c) { c = { id: compId, name: compName, blocks: new Map() }; s.components.set(compId, c) }
      return c
    }

    for (const p of filteredParams) {
      const mapping = p.subcategory ? mappingBySubcat.get(p.subcategory) ?? null : null
      const comp = mapping
        ? ensure(mapping.section.id, mapping.section.name, mapping.component.id, mapping.component.name)
        : ensure(UNMAPPED_ID, 'Раздел не сопоставлен', p.subcategory ?? p.category, p.subcategory ?? p.category)

      const blockKey = p.subcategory ?? p.category
      let block = comp.blocks.get(blockKey)
      if (!block) {
        block = { subcategory: p.subcategory, mapping, groups: new Map() }
        comp.blocks.set(blockKey, block)
      }
      const groupKey = p.group ?? 'Прочее'
      if (!block.groups.has(groupKey)) block.groups.set(groupKey, [])
      block.groups.get(groupKey)!.push(p)
    }

    // Порядок разделов/компонентов — как в section_map; несопоставленное — первым
    const ordered: SectNode[] = []
    const unmapped = bySection.get(UNMAPPED_ID)
    if (unmapped) ordered.push(unmapped)
    for (const s of sections) {
      const node = bySection.get(s.id)
      if (!node) continue
      const orderedComps = new Map<string, CompNode>()
      for (const c of s.components) {
        const cn = node.components.get(c.id)
        if (cn) orderedComps.set(c.id, cn)
      }
      ordered.push({ ...node, components: orderedComps })
    }
    return ordered
  }, [filteredParams, sections, mappingBySubcat])

  if (!params || params.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Параметры для этого приложения не найдены в каталоге.
      </div>
    )
  }
  if (!tree) return null

  // Активный компонент: выбранный (если он ещё виден после фильтрации) или первый
  const visibleKeys = tree.flatMap(s => Array.from(s.components.keys()).map(cid => `${s.id}:${cid}`))
  const activeKey = selected && visibleKeys.includes(selected) ? selected : visibleKeys[0] ?? null
  const [activeSectionId, activeComponentId] = activeKey?.split(':') ?? [null, null]
  const activeSection = tree.find(s => s.id === activeSectionId)
  const activeComponent = activeSection?.components.get(activeComponentId ?? '')
  const activeLists = activeComponent ? listsByComponentName.get(activeComponent.name) ?? [] : []

  return (
    <div className="space-y-4">
      {/* ── Поиск и фильтры ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 pr-8"
            placeholder="Поиск по параметрам…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={onlyModified} onCheckedChange={setOnlyModified} />
          <span>Только изменённые ({policy.settings.length})</span>
        </label>
        {(search || onlyModified) && (
          <span className="text-xs text-muted-foreground">
            Найдено параметров: {filteredParams?.length ?? 0}
          </span>
        )}
      </div>

      <div className="flex gap-6">
        {/* ── Левая навигация: дерево разделов как в консоли KSC ─────────── */}
        <nav className="w-64 shrink-0 space-y-4">
          {tree.map(sect => (
            <div key={sect.id}>
              <div className={cn(
                'mb-1 px-2 text-xs font-semibold uppercase tracking-wide',
                sect.id === UNMAPPED_ID ? 'text-amber-600' : 'text-muted-foreground',
              )}>
                {sect.name}
              </div>
              <div className="space-y-0.5">
                {Array.from(sect.components.values()).map(comp => {
                  const key = `${sect.id}:${comp.id}`
                  const paramCount = Array.from(comp.blocks.values())
                    .reduce((n, b) => n + Array.from(b.groups.values()).reduce((m, g) => m + g.length, 0), 0)
                  const listCount = (listsByComponentName.get(comp.name) ?? []).length
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(key)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        key === activeKey
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="truncate">{comp.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {paramCount}{listCount > 0 && ` +${listCount} сп.`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Контент выбранного компонента ────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">
          {!activeComponent && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {search || onlyModified ? 'Ничего не найдено по заданным условиям' : 'Выберите компонент слева'}
            </div>
          )}
          {activeComponent && Array.from(activeComponent.blocks.entries()).map(([blockKey, block]) => (
            <div key={blockKey} className="space-y-3">
              <BreadcrumbHeader
                block={block}
                blockKey={blockKey}
                sections={sections}
                isUnmappedSection={activeSectionId === UNMAPPED_ID}
                onOverridden={() => {
                  void utils.catalog.listSubcategoryMappings.invalidate()
                }}
              />

              {Array.from(block.groups.entries()).map(([groupName, groupParams]) => (
                <div key={groupName}>
                  <div className="mb-1.5 px-3">
                    <h4 className="text-xs font-semibold text-muted-foreground">{groupName}</h4>
                  </div>
                  <div className="rounded-lg border">
                    {groupParams.map((param, idx) => {
                      const own = ownIdx.get(param.id)
                      return (
                        <div key={param.id}>
                          {idx > 0 && <Separator />}
                          <SettingField
                            param={{
                              id: param.id,
                              name: param.name,
                              category: param.category,
                              valueType: param.valueType as 'bool' | 'enum' | 'number' | 'string' | 'list',
                              enumOptions: param.enumOptions as string[] | null,
                              unit: param.unit,
                              defaultValue: param.defaultValue,
                              description: param.description,
                              purpose: param.purpose,
                              tradeoffsPros: param.tradeoffsPros as string[] | null,
                              tradeoffsCons: param.tradeoffsCons as string[] | null,
                            }}
                            ownValue={own?.value as string | number | boolean | null | undefined}
                            forced={own?.forced ?? false}
                            effective={effective[param.id]}
                            readOnly={readOnly}
                            onValueChange={(parameterId, value) => {
                              upsertSetting.mutate(
                                { policyId: policy.id, parameterId, value, forced: own?.forced ?? false },
                                { onSuccess: invalidate },
                              )
                            }}
                            onForcedChange={(parameterId, forced) => {
                              if (own) {
                                toggleLock.mutate(
                                  { policyId: policy.id, parameterId, forced },
                                  { onSuccess: invalidate },
                                )
                              } else {
                                const currentValue = effective[parameterId]?.value ?? param.defaultValue ?? null
                                upsertSetting.mutate(
                                  { policyId: policy.id, parameterId, value: currentValue, forced },
                                  { onSuccess: invalidate },
                                )
                              }
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* ── Списки-таблицы этого компонента ─────────────────────────── */}
          {activeComponent && activeLists.length > 0 && (
            <div className="space-y-6 border-t pt-4">
              {activeLists.map(lt => (
                <ListEditor key={lt.id} policyId={policy.id} listType={lt} readOnly={readOnly} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Хлебные крошки «Найти в KSC: Раздел → Компонент» + флаг достоверности + правка привязки
function BreadcrumbHeader({
  block,
  blockKey,
  sections,
  isUnmappedSection,
  onOverridden,
}: {
  block: { subcategory: string | null; mapping: Mapping | null }
  blockKey: string
  sections: Section[]
  isUnmappedSection: boolean
  onOverridden: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [sectionId, setSectionId] = useState('')
  const [componentId, setComponentId] = useState('')
  const override = trpc.catalog.overrideSubcategoryMapping.useMutation()

  const m = block.mapping
  const canRemap = block.subcategory !== null // без subcategory привязывать не к чему

  const startEdit = () => {
    setSectionId(m?.section.id ?? sections[0]?.id ?? '')
    setComponentId(m?.component.id ?? '')
    setEditing(true)
  }

  const componentOptions = (sections.find(s => s.id === sectionId)?.components ?? [])
    .map(c => ({ value: c.id, label: c.name }))

  if (editing && canRemap) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">«{block.subcategory}» находится в:</span>
        <Select
          className="h-7 w-56"
          value={sectionId}
          options={sections.map(s => ({ value: s.id, label: s.name }))}
          onChange={e => {
            setSectionId(e.target.value)
            const first = sections.find(s => s.id === e.target.value)?.components[0]
            setComponentId(first?.id ?? '')
          }}
        />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Select
          className="h-7 w-56"
          value={componentId}
          options={componentOptions}
          onChange={e => setComponentId(e.target.value)}
        />
        <Button
          size="sm"
          className="h-7"
          disabled={!sectionId || !componentId || override.isPending}
          onClick={() => {
            override.mutate(
              { excelSubcategory: block.subcategory!, sectionId, componentId },
              { onSuccess: () => { setEditing(false); onOverridden() } },
            )
          }}
        >
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
          Отмена
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 text-xs text-muted-foreground">
      {isUnmappedSection ? (
        <>
          <MapPin className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium text-amber-600">«{blockKey}» — раздел не сопоставлен</span>
        </>
      ) : m ? (
        <>
          <span>Найти в KSC:</span>
          {m.docUrl ? (
            <a
              href={m.docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {m.section.name} <ChevronRight className="h-3 w-3" /> {m.component.name}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-medium text-foreground">
              {m.section.name} → {m.component.name}
            </span>
          )}
          {!m.verified && !m.overridden && (
            <Tooltip content={m.note ?? 'Раздел выведен по типовой структуре KES, сверьте с вашей консолью'}>
              <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <HelpCircle className="h-3 w-3" /> расположение уточняется
              </span>
            </Tooltip>
          )}
          {m.overridden && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600">
              уточнено вручную
            </span>
          )}
        </>
      ) : null}
      {canRemap && (
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={startEdit} title="Исправить привязку">
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
