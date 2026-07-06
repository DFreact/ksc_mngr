import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ShieldCheck, Timer } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Select } from '@/components/ui/select'
import { ListEditor, type ListTypeInfo } from './ListEditor'
import { cn } from '@/lib/utils'

// Контроль устройств (по документации KESL 12.4, статья 264143):
//  - режим доступа на тип устройства и на шину подключения;
//  - доверенные устройства по уникальному ID / маске с привязкой к пользователям;
//  - правила доступа с расписанием (для запоминающих устройств);
//  - временный доступ к заблокированному устройству по запросу пользователя.
// Клик по типу устройства раскрывает панель с его доверенными устройствами,
// временными доступами и правилами.

interface DeviceType {
  id: string
  catalogKey: string
  name: string
  section: string | null
  accessOptions: unknown
}

interface DevicesTabProps {
  policyId: string
  readOnly?: boolean
}

const SECTION_ORDER = [
  'Устройства и сети Wi-Fi',
  'Внешние устройства',
  'Сети Wi-Fi',
  'Прочие устройства',
  'Шины подключения',
]

// Правила доступа с расписанием применимы только к запоминающим устройствам
const STORAGE_SECTIONS = new Set(['Устройства и сети Wi-Fi'])

export function DevicesTab({ policyId, readOnly = false }: DevicesTabProps) {
  const { data: dc } = trpc.catalog.getDeviceControl.useQuery()
  const { data: rawListTypes } = trpc.catalog.listListTypes.useQuery()
  const { data: settings } = trpc.policies.listDeviceSettings.useQuery({ policyId })
  const setAccess = trpc.policies.setDeviceAccess.useMutation()
  const utils = trpc.useUtils()

  const deviceTypes = (dc?.deviceTypes ?? []) as unknown as DeviceType[]
  const meta = dc?.meta as { customRulesSchema: unknown } | null | undefined
  const listTypes = (rawListTypes ?? []) as unknown as ListTypeInfo[]

  const trustedListType = listTypes.find(lt => lt.id === 'trusted_devices')
  const tempAccessListType = listTypes.find(lt => lt.id === 'device_temporary_access')
  const customRulesListType = listTypes.find(lt => lt.id === 'device_control_custom_rules')

  const [expanded, setExpanded] = useState<string | null>(null)

  const accessByType = useMemo(
    () => new Map((settings ?? []).map(s => [s.deviceTypeId, s.access])),
    [settings],
  )

  const bySection = useMemo(() => {
    const map = new Map<string, DeviceType[]>()
    for (const dt of deviceTypes) {
      const key = dt.section ?? 'Прочие устройства'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(dt)
    }
    return Array.from(map.entries()).sort(
      (a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]),
    )
  }, [deviceTypes])

  if (deviceTypes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Каталог типов устройств пуст.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Матрица доступа: клик по типу раскрывает детали ─────────────── */}
      <div className="space-y-6">
        {bySection.map(([section, types]) => (
          <div key={section}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section}
            </h3>
            <div className="overflow-hidden rounded-lg border">
              {types.map((dt, idx) => {
                const options = (dt.accessOptions as string[]) ?? []
                const current = accessByType.get(dt.id) ?? options[0] ?? ''
                const isBus = dt.section === 'Шины подключения'
                const isExpanded = expanded === dt.id
                return (
                  <div key={dt.id} className={cn(idx > 0 && 'border-t')}>
                    <div className="flex items-center justify-between gap-4 px-4 py-2">
                      {isBus ? (
                        <span className="text-sm">{dt.name}</span>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-sm hover:text-primary"
                          onClick={() => setExpanded(isExpanded ? null : dt.id)}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                          {dt.name}
                        </button>
                      )}
                      <Select
                        className="h-8 w-52"
                        value={current}
                        disabled={readOnly}
                        options={options.map(o => ({ value: o, label: o }))}
                        onChange={e =>
                          setAccess.mutate(
                            { policyId, deviceTypeId: dt.id, access: e.target.value },
                            { onSuccess: () => void utils.policies.listDeviceSettings.invalidate({ policyId }) },
                          )
                        }
                      />
                    </div>

                    {/* ── Панель типа устройства ─────────────────────────── */}
                    {isExpanded && !isBus && (
                      <div className="space-y-5 border-t bg-muted/20 px-4 py-4">
                        {trustedListType && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                              Доверенные устройства — {dt.name}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Полный доступ по уникальному идентификатору или маске, независимо от режима выше.
                              Можно ограничить конкретными пользователями (пусто = все).
                            </p>
                            <ListEditor
                              policyId={policyId}
                              listType={trustedListType}
                              readOnly={readOnly}
                              title={null}
                              emptyText="Доверенных устройств этого типа нет"
                              prefill={{ device_type: dt.name }}
                              rowFilter={row => row.device_type === dt.name}
                              hideColumns={['device_type']}
                            />
                          </div>
                        )}

                        {tempAccessListType && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <Timer className="h-3.5 w-3.5 text-amber-600" />
                              Временный доступ — {dt.name}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Доступ к заблокированному устройству на ограниченный срок по запросу пользователя
                              (в KSC — «Предоставить доступ к устройству в автономном режиме»).
                            </p>
                            <ListEditor
                              policyId={policyId}
                              listType={tempAccessListType}
                              readOnly={readOnly}
                              title={null}
                              emptyText="Активных временных доступов нет"
                              prefill={{ device_type: dt.name }}
                              rowFilter={row => row.device_type === dt.name}
                              hideColumns={['device_type']}
                            />
                          </div>
                        )}

                        {customRulesListType && STORAGE_SECTIONS.has(dt.section ?? '') && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-muted-foreground">
                              Правила доступа с расписанием — {dt.name}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Кто и в какое время может работать с устройством (только для запоминающих устройств,
                              при режиме «Пользовательское»).
                            </p>
                            <ListEditor
                              policyId={policyId}
                              listType={customRulesListType}
                              readOnly={readOnly}
                              title={null}
                              emptyText="Правил нет"
                              prefill={{ device_type: dt.name }}
                              rowFilter={row => row.device_type === dt.name}
                              hideColumns={['device_type']}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Все правила и доступы (сводно) ──────────────────────────────── */}
      {meta && customRulesListType && (
        <div className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Все пользовательские правила
          </h3>
          <ListEditor
            policyId={policyId}
            listType={customRulesListType}
            readOnly={readOnly}
            title={null}
            emptyText="Правил нет — доступ определяется матрицей выше"
          />
        </div>
      )}
      {tempAccessListType && (
        <div className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Все временные доступы
          </h3>
          <ListEditor
            policyId={policyId}
            listType={tempAccessListType}
            readOnly={readOnly}
            title={null}
            emptyText="Активных временных доступов нет"
          />
        </div>
      )}
    </div>
  )
}

