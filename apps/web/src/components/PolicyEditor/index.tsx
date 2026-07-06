import { useState } from 'react'
import { Shield, Bot, Lock, Unlock, AlertTriangle, CheckCircle, PauseCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { SettingsTab } from './SettingsTab'
import { EventsTab } from './EventsTab'
import { DevicesTab } from './DevicesTab'
import { ConfigTab } from './ConfigTab'
import { cn } from '@/lib/utils'
import type { EffectiveSettingsMap } from '@ksc/domain'

const STATUS_CONFIG = {
  active: { label: 'Активна', icon: CheckCircle, variant: 'default' as const, color: 'text-green-600' },
  inactive: { label: 'Неактивна', icon: PauseCircle, variant: 'secondary' as const, color: 'text-muted-foreground' },
  out_of_office: { label: 'Не в офисе', icon: AlertTriangle, variant: 'outline' as const, color: 'text-amber-500' },
}

interface PolicyEditorProps {
  policyId: string
  onClose?: () => void
}

export function PolicyEditor({ policyId, onClose }: PolicyEditorProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const { data: policy, isLoading } = trpc.policies.get.useQuery({ policyId })
  const { data: effectiveRaw } = trpc.policies.resolveEffective.useQuery({ policyId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effective = (effectiveRaw as any ?? {}) as EffectiveSettingsMap
  const updateMeta = trpc.policies.updateMeta.useMutation()
  const utils = trpc.useUtils()

  function invalidate() {
    void utils.policies.get.invalidate({ policyId })
    void utils.policies.resolveEffective.invalidate({ policyId })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Политика не найдена
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[policy.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active
  const StatusIcon = statusCfg.icon
  const isAgent = policy.application.name === 'Агент администрирования'

  // Break out of the Prisma Json recursive type by going through unknown
  interface FlatSetting { parameterId: string; value: unknown; forced: boolean }
  type AnySettings = Array<{ parameterId: string; value: unknown; forced: boolean }>
  const flatSettings = (policy.settings as unknown as AnySettings) satisfies FlatSetting[]
  const policyForSettings = {
    id: policy.id,
    applicationId: policy.applicationId,
    settings: flatSettings,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start gap-4 border-b px-6 py-4">
        <div className={cn('mt-1 shrink-0', isAgent ? 'text-blue-500' : 'text-green-600')}>
          {isAgent ? <Bot className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
        </div>

        <div className="flex-1 space-y-3">
          {/* Name row */}
          <div className="flex items-center gap-2">
            {editingName ? (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  updateMeta.mutate({ policyId, name: nameDraft }, { onSuccess: () => { invalidate(); setEditingName(false) } })
                }}
                className="flex items-center gap-2"
              >
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  className="h-7 text-base font-semibold"
                />
                <Button type="submit" size="sm" disabled={!nameDraft.trim()}>ОК</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>Отмена</Button>
              </form>
            ) : (
              <button
                type="button"
                className="text-base font-semibold hover:underline"
                onClick={() => { setNameDraft(policy.name); setEditingName(true) }}
              >
                {policy.name}
              </button>
            )}

            <Badge variant={statusCfg.variant} className="flex items-center gap-1 text-xs">
              <StatusIcon className={cn('h-3 w-3', statusCfg.color)} />
              {statusCfg.label}
            </Badge>
          </div>

          {/* Inheritance controls row */}
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <Tooltip content="Если включено, параметры с замочком из родительской политики будут действовать в этой политике (раздел 12.2а)">
              <label className="flex cursor-pointer items-center gap-2">
                <Switch
                  checked={policy.inheritFromParent}
                  onCheckedChange={v =>
                    updateMeta.mutate({ policyId, inheritFromParent: v }, { onSuccess: invalidate })
                  }
                />
                <span>Наследовать от родительской</span>
              </label>
            </Tooltip>

            <Tooltip content="Если включено, все дочерние политики принудительно наследуют заблокированные параметры этой политики и не могут отключить наследование (раздел 12.2б)">
              <label className={cn('flex cursor-pointer items-center gap-2', policy.forceInheritToChildren && 'text-orange-600')}>
                <Switch
                  checked={policy.forceInheritToChildren}
                  onCheckedChange={v =>
                    updateMeta.mutate({ policyId, forceInheritToChildren: v }, { onSuccess: invalidate })
                  }
                />
                {policy.forceInheritToChildren
                  ? <Lock className="h-3.5 w-3.5 text-orange-500" />
                  : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                }
                <span>Принудительная трансляция дочерним</span>
              </label>
            </Tooltip>

            {/* Status selector */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Статус:</span>
              <div className="flex gap-1">
                {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateMeta.mutate({ policyId, status: s }, { onSuccess: invalidate })}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs transition-colors',
                      policy.status === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Group + app info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{policy.application.name} {policy.application.version}</span>
            {policy.targetGroup && (
              <>
                <span>·</span>
                <span>Группа: {policy.targetGroup.name}</span>
              </>
            )}
          </div>
        </div>

        {onClose && (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs defaultValue="settings">
          <TabsList className="mb-4 w-full justify-start">
            <TabsTrigger value="settings">Настройки</TabsTrigger>
            <TabsTrigger value="events">События</TabsTrigger>
            {!isAgent && <TabsTrigger value="devices">Устройства</TabsTrigger>}
            <TabsTrigger value="config">Конфигурация</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsTab
              policy={policyForSettings}
              applicationId={policy.applicationId}
              effective={effective}
            />
          </TabsContent>

          <TabsContent value="events">
            <EventsTab
              policyId={policy.id}
              applicationId={policy.applicationId}
              eventSettings={policy.eventSettings as Parameters<typeof EventsTab>[0]['eventSettings']}
            />
          </TabsContent>

          {!isAgent && (
            <TabsContent value="devices">
              <DevicesTab policyId={policy.id} />
            </TabsContent>
          )}

          <TabsContent value="config">
            <ConfigTab policyId={policy.id} policyName={policy.name} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
