import { trpc } from '@/lib/trpc'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Критическое',
  functional_failure: 'Отказ функционирования',
  warning: 'Предупреждение',
  informational: 'Информационное',
}

const SEVERITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  functional_failure: 'destructive',
  warning: 'default',
  informational: 'secondary',
}

interface EventRow {
  id: string
  component: string
  name: string
  severity: string
  availableChannels: unknown
  defaultStorageDays: number
  description: string | null
  application: { id: string; name: string; version: string }
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'E-mail',
  sms: 'SMS',
  exec: 'Исполнить',
  syslog: 'Syslog',
  'os-log-local': 'Журнал ОС (локальный)',
  'os-log-server': 'Журнал ОС (сервер)',
  snmp: 'SNMP',
}

interface EventSetting {
  eventId: string
  storageDays: number
  channels: unknown // Json → string[]
  enabled: boolean
  event: {
    id: string
    component: string
    name: string
    severity: string
    availableChannels: unknown // Json → string[]
    defaultStorageDays: number
  }
}

interface EventsTabProps {
  policyId: string
  applicationId: string
  eventSettings: EventSetting[]
  readOnly?: boolean
}

export function EventsTab({ policyId, applicationId, eventSettings, readOnly = false }: EventsTabProps) {
  const { data: rawEvents } = trpc.catalog.listEvents.useQuery({ applicationId })
  // Cast away tRPC deep generic — we only use the flat EventRow shape below
  const allEvents = rawEvents as EventRow[] | undefined
  const upsertEventSetting = trpc.policies.upsertEventSetting.useMutation()
  const utils = trpc.useUtils()

  function invalidate() {
    void utils.policies.get.invalidate({ policyId })
  }

  // Index own settings by eventId
  const ownIdx = new Map(eventSettings.map(s => [s.eventId, s]))

  // Group events by component
  const byComponent = new Map<string, EventRow[]>()
  for (const ev of allEvents ?? []) {
    if (!byComponent.has(ev.component)) byComponent.set(ev.component, [])
    byComponent.get(ev.component)!.push(ev)
  }

  if (!allEvents || allEvents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        События для этого приложения не найдены в каталоге.
      </div>
    )
  }

  const componentEntries: Array<[string, EventRow[]]> = Array.from(byComponent.entries())

  return (
    <div className="space-y-6">
      {componentEntries.map(([component, events]) => (
        <div key={component}>
          <div className="mb-2 px-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {component}
            </h3>
          </div>
          <div className="rounded-lg border">
            {(events ?? []).map((ev, idx) => {
              const own = ownIdx.get(ev.id)
              const enabled = own?.enabled ?? true
              const storageDays = own?.storageDays ?? ev.defaultStorageDays
              const channels = (own?.channels ?? ev.availableChannels) as string[]
              const availableChannels = ev.availableChannels as string[]

              return (
                <div key={ev.id}>
                  {idx > 0 && <Separator />}
                  <div
                    className={cn(
                      'group flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-muted/50',
                      !enabled && 'opacity-60',
                    )}
                  >
                    {/* Row 1: name + severity + enabled toggle */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{ev.name}</span>
                        <Badge variant={SEVERITY_VARIANT[ev.severity] ?? 'secondary'} className="shrink-0 text-xs">
                          {SEVERITY_LABELS[ev.severity] ?? ev.severity}
                        </Badge>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={readOnly}
                        onCheckedChange={v => {
                          upsertEventSetting.mutate(
                            { policyId, eventId: ev.id, enabled: v },
                            { onSuccess: invalidate },
                          )
                        }}
                      />
                    </div>

                    {/* Row 2: storage days + channels */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <span className="text-muted-foreground">Хранить (дней):</span>
                        <Input
                          type="number"
                          className="h-7 w-20 px-2 py-1 text-sm"
                          disabled={readOnly || !enabled}
                          value={storageDays}
                          onChange={e => {
                            const n = parseInt(e.target.value, 10)
                            if (!isNaN(n) && n >= 0) {
                              upsertEventSetting.mutate(
                                { policyId, eventId: ev.id, storageDays: n },
                                { onSuccess: invalidate },
                              )
                            }
                          }}
                        />
                      </label>

                      <div className="flex flex-wrap gap-1.5">
                        {availableChannels.map(ch => {
                          const active = channels.includes(ch)
                          return (
                            <button
                              key={ch}
                              type="button"
                              disabled={readOnly || !enabled}
                              onClick={() => {
                                const next = active
                                  ? channels.filter(c => c !== ch)
                                  : [...channels, ch]
                                upsertEventSetting.mutate(
                                  { policyId, eventId: ev.id, channels: next },
                                  { onSuccess: invalidate },
                                )
                              }}
                              className={cn(
                                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                                'disabled:cursor-not-allowed disabled:opacity-50',
                                active
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-input text-muted-foreground hover:border-primary/50',
                              )}
                            >
                              {CHANNEL_LABELS[ch] ?? ch}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
