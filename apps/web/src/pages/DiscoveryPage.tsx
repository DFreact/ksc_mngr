import { useState } from 'react'
import { Plus, Trash2, Pencil, Globe, Network, Wifi, Info } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PollConfig {
  id: string
  pollType: string
  enabled: boolean
  schedule: unknown
  executor: string
  description: string | null
  targets: unknown
}

interface DomainTarget { address: string; directoryKind: string; authRef?: string }
interface IpTarget { start: string; end?: string; cidr?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POLL_CONFIG = {
  domain_controller: { label: 'Контроллер домена', icon: Globe, color: 'text-blue-500', tooltip: 'Опрос AD/Samba: структура OU, учётные записи, DNS-имена устройств в домене.' },
  ip_range:          { label: 'IP-диапазоны',       icon: Network, color: 'text-green-500', tooltip: 'ICMP-опрос + обратный DNS по диапазонам IP. Требует корректную обратную зону DNS.' },
  zeroconf:          { label: 'Zeroconf (IPv6)',     icon: Wifi, color: 'text-purple-500', tooltip: 'Zero-configuration опрос для IPv6-сетей. Только для точки распространения на Linux.' },
}

function scheduleLabel(schedule: unknown): string {
  if (!schedule || typeof schedule !== 'object') return '—'
  const s = schedule as Record<string, unknown>
  if (s.type === 'interval') return `каждые ${s.intervalMinutes ?? '?'} мин`
  if (s.type === 'cron') return `cron: ${s.cron ?? '?'}`
  return JSON.stringify(s)
}

// ─── Target editors ───────────────────────────────────────────────────────────

function DomainTargetEditor({
  targets,
  onChange,
}: {
  targets: DomainTarget[]
  onChange: (t: DomainTarget[]) => void
}) {
  function update(idx: number, patch: Partial<DomainTarget>) {
    const next = [...targets]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }
  function remove(idx: number) { onChange(targets.filter((_, i) => i !== idx)) }
  function add() { onChange([...targets, { address: '', directoryKind: 'active_directory' }]) }

  return (
    <div className="space-y-2">
      {targets.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={t.address}
            placeholder="адрес контроллера домена"
            onChange={e => update(idx, { address: e.target.value })}
          />
          <Select
            className="w-36"
            value={t.directoryKind}
            options={[
              { value: 'active_directory', label: 'Active Directory' },
              { value: 'samba', label: 'Samba 4' },
            ]}
            onChange={e => update(idx, { directoryKind: e.target.value })}
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Добавить контроллер
      </Button>
    </div>
  )
}

function IpRangeEditor({
  targets,
  onChange,
}: {
  targets: IpTarget[]
  onChange: (t: IpTarget[]) => void
}) {
  function update(idx: number, patch: Partial<IpTarget>) {
    const next = [...targets]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }
  function remove(idx: number) { onChange(targets.filter((_, i) => i !== idx)) }
  function add() { onChange([...targets, { start: '' }]) }

  return (
    <div className="space-y-2">
      {targets.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            className="w-44"
            value={t.start}
            placeholder="192.168.1.0 или CIDR"
            onChange={e => update(idx, { start: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            className="w-36"
            value={t.end ?? ''}
            placeholder="192.168.1.255"
            onChange={e => update(idx, { end: e.target.value || undefined })}
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Добавить диапазон
      </Button>
    </div>
  )
}

// ─── Config dialog ────────────────────────────────────────────────────────────

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  environmentId: string
  editConfig?: PollConfig
  onSaved: () => void
}

function ConfigDialog({ open, onOpenChange, environmentId, editConfig, onSaved }: ConfigDialogProps) {
  const [pollType, setPollType] = useState(editConfig?.pollType ?? 'domain_controller')
  const [scheduleType, setScheduleType] = useState<'interval' | 'cron'>(() => {
    const s = editConfig?.schedule as Record<string, unknown> | null
    return (s?.type as 'interval' | 'cron') ?? 'interval'
  })
  const [intervalMins, setIntervalMins] = useState(() => {
    const s = editConfig?.schedule as Record<string, unknown> | null
    return Number(s?.intervalMinutes ?? 60)
  })
  const [cron, setCron] = useState(() => {
    const s = editConfig?.schedule as Record<string, unknown> | null
    return String(s?.cron ?? '0 * * * *')
  })
  const [executor, setExecutor] = useState(editConfig?.executor ?? 'admin_server')
  const [description, setDescription] = useState(editConfig?.description ?? '')
  const [domainTargets, setDomainTargets] = useState<DomainTarget[]>(() =>
    pollType === 'domain_controller' ? (editConfig?.targets as DomainTarget[] ?? []) : []
  )
  const [ipTargets, setIpTargets] = useState<IpTarget[]>(() =>
    pollType === 'ip_range' ? (editConfig?.targets as IpTarget[] ?? []) : []
  )

  const createMut = trpc.discovery.create.useMutation({ onSuccess: () => { onSaved(); onOpenChange(false) } })
  const updateMut = trpc.discovery.update.useMutation({ onSuccess: () => { onSaved(); onOpenChange(false) } })

  function buildSchedule() {
    return scheduleType === 'interval'
      ? { type: 'interval' as const, intervalMinutes: intervalMins }
      : { type: 'cron' as const, cron }
  }

  function buildTargets(): unknown[] | undefined {
    if (pollType === 'domain_controller') return domainTargets
    if (pollType === 'ip_range') return ipTargets
    return undefined
  }

  function submit() {
    const payload = {
      schedule: buildSchedule(),
      executor,
      description: description || undefined,
      targets: buildTargets(),
    }
    if (editConfig) {
      updateMut.mutate({ configId: editConfig.id, ...payload })
    } else {
      createMut.mutate({
        environmentId,
        pollType: pollType as 'domain_controller' | 'ip_range' | 'zeroconf',
        ...payload,
        enabled: true,
      })
    }
  }

  const isPending = createMut.isPending || updateMut.isPending
  const cfg = POLL_CONFIG[pollType as keyof typeof POLL_CONFIG]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{editConfig ? 'Редактировать опрос' : 'Новый опрос сети'}</DialogTitle>
          {cfg && <DialogDescription className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            {cfg.tooltip}
          </DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Poll type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Метод обнаружения</label>
            <Select
              value={pollType}
              onChange={e => setPollType(e.target.value)}
              disabled={!!editConfig}
              options={Object.entries(POLL_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
            />
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Расписание</label>
            <div className="flex items-center gap-2">
              <Select
                className="w-36"
                value={scheduleType}
                onChange={e => setScheduleType(e.target.value as 'interval' | 'cron')}
                options={[
                  { value: 'interval', label: 'Интервал' },
                  { value: 'cron', label: 'Cron' },
                ]}
              />
              {scheduleType === 'interval' ? (
                <>
                  <Input
                    type="number"
                    className="w-24"
                    value={intervalMins}
                    onChange={e => setIntervalMins(parseInt(e.target.value, 10) || 60)}
                  />
                  <span className="text-sm text-muted-foreground">мин</span>
                </>
              ) : (
                <Input
                  value={cron}
                  onChange={e => setCron(e.target.value)}
                  placeholder="0 * * * *"
                  className="font-mono text-xs"
                />
              )}
            </div>
          </div>

          {/* Executor */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Исполнитель</label>
            <Select
              value={executor}
              onChange={e => setExecutor(e.target.value)}
              options={[
                { value: 'admin_server', label: 'Сервер администрирования' },
                { value: 'distribution_point', label: 'Точка распространения' },
              ]}
            />
          </div>

          {/* Targets by poll type */}
          {pollType === 'domain_controller' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Контроллеры домена</label>
              <DomainTargetEditor targets={domainTargets} onChange={setDomainTargets} />
            </div>
          )}
          {pollType === 'ip_range' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">IP-диапазоны</label>
              <IpRangeEditor targets={ipTargets} onChange={setIpTargets} />
            </div>
          )}
          {pollType === 'zeroconf' && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Zeroconf не требует ручной настройки диапазонов — сеть определяется автоматически.
              Доступно только при наличии точки распространения на Linux.
            </p>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Примечание (необязательно)</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание конфигурации" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? 'Сохранение…' : editConfig ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DiscoveryPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<PollConfig | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  const { data: rawConfigs, refetch } = trpc.discovery.list.useQuery(
    { environmentId: activeEnvId },
    { enabled: !!activeEnvId },
  )
  const configs = (rawConfigs as PollConfig[] | undefined) ?? []

  const toggleEnabled = trpc.discovery.toggleEnabled.useMutation({ onSuccess: () => void refetch() })
  const deleteConfig = trpc.discovery.delete.useMutation({
    onSuccess: () => { setDeletingId(null); void refetch() },
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-4 border-b bg-card px-6 py-3">
        <Select
          className="w-44"
          value={activeEnvId}
          onChange={e => setSelectedEnvId(e.target.value)}
          options={(environments ?? []).map(e => ({ value: e.id, label: e.name }))}
        />
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditingConfig(null); setDialogOpen(true) }} disabled={!activeEnvId}>
          <Plus className="mr-1.5 h-4 w-4" />
          Добавить опрос
        </Button>
      </div>

      {/* Configs list */}
      <div className="flex-1 overflow-auto p-6">
        {/* Info banner */}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <strong>KSC для Linux:</strong> доступны три метода обнаружения — опрос контроллера домена (AD/Samba),
          опрос IP-диапазонов (ICMP + reverse DNS), Zeroconf для IPv6. NetBIOS-опрос недоступен.
        </div>

        {configs.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {activeEnvId ? 'Опросы не настроены.' : 'Выберите среду.'}
          </div>
        ) : (
          <div className="rounded-lg border">
            {configs.map((cfg, idx) => {
              const pollCfg = POLL_CONFIG[cfg.pollType as keyof typeof POLL_CONFIG]
              const Icon = pollCfg?.icon ?? Globe
              return (
                <div key={cfg.id}>
                  {idx > 0 && <Separator />}
                  <div className={cn(
                    'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30',
                    !cfg.enabled && 'opacity-60',
                  )}>
                    <Switch
                      checked={cfg.enabled}
                      onCheckedChange={v => toggleEnabled.mutate({ configId: cfg.id, enabled: v })}
                    />
                    <div className={cn('shrink-0', pollCfg?.color ?? 'text-muted-foreground')}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{pollCfg?.label ?? cfg.pollType}</span>
                        {cfg.description && (
                          <Tooltip content={cfg.description}>
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                          </Tooltip>
                        )}
                        <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {cfg.enabled ? 'Активен' : 'Отключён'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{scheduleLabel(cfg.schedule)}</span>
                        <span>·</span>
                        <span>{cfg.executor === 'admin_server' ? 'Сервер администрирования' : 'Точка распространения'}</span>
                        {Array.isArray(cfg.targets) && cfg.targets.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{cfg.targets.length} цел{cfg.targets.length === 1 ? 'ь' : 'и'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="text-muted-foreground"
                        onClick={() => { setEditingConfig(cfg); setDialogOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingId(cfg.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Config dialog */}
      {activeEnvId && (
        <ConfigDialog
          open={dialogOpen}
          onOpenChange={v => { setDialogOpen(v); if (!v) setEditingConfig(null) }}
          environmentId={activeEnvId}
          editConfig={editingConfig ?? undefined}
          onSaved={() => void refetch()}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deletingId} onOpenChange={v => { if (!v) setDeletingId(null) }}>
        <DialogContent onClose={() => setDeletingId(null)}>
          <DialogHeader>
            <DialogTitle>Удалить конфигурацию опроса?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingId(null)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={deleteConfig.isPending}
              onClick={() => deletingId && deleteConfig.mutate({ configId: deletingId })}
            >
              {deleteConfig.isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
