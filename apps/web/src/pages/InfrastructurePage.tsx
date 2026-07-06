import { useState } from 'react'
import {
  Server, Shield, Cloud, Database, Plus, Trash2, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Shared env selector ──────────────────────────────────────────────────────

const ENVS = [
  { value: 'env-prod', label: 'Production' },
  { value: 'env-dev', label: 'Development' },
  { value: 'env-test', label: 'Testing' },
]

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'servers', label: 'Серверы', icon: <Server className="h-4 w-4" /> },
  { id: 'rbac', label: 'RBAC', icon: <Shield className="h-4 w-4" /> },
  { id: 'ksn', label: 'KSN', icon: <Cloud className="h-4 w-4" /> },
  { id: 'backup', label: 'Резервирование', icon: <Database className="h-4 w-4" /> },
] as const

type TabId = (typeof TABS)[number]['id']

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServerNode {
  id: string
  name: string
  role: string
  osKind: string
  parentId: string | null
  connectionAddress: string | null
  notes: string | null
  children: ServerNode[]
}

interface RoleGrant {
  id: string
  rights: unknown
  functionalArea: { id: string; name: string; group: string }
}

interface RoleDefinition {
  id: string
  name: string
  isPredefined: boolean
  description: string | null
  grants: RoleGrant[]
}

interface UserAssignment {
  id: string
  userRef: string
  scopeObjectId: string | null
  role: { id: string; name: string }
}

interface BackupPolicy {
  id: string
  schedule: unknown
  storageTarget: string
  storagePath: string | null
  passwordProtected: boolean
  retentionDays: number
  enabled: boolean
  notes: string | null
}

// ─── Servers Tab ─────────────────────────────────────────────────────────────

function RoleChip({ role }: { role: string }) {
  const map: Record<string, string> = {
    primary: 'bg-blue-100 text-blue-700',
    secondary: 'bg-purple-100 text-purple-700',
    virtual: 'bg-amber-100 text-amber-700',
  }
  return <Badge className={cn('text-xs', map[role] ?? '')}>{role}</Badge>
}

function ServerNodeRow({ node, depth = 0 }: { node: ServerNode; depth?: number }) {
  return (
    <>
      <div
        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
        style={{ paddingLeft: `${(depth + 1) * 16}px` }}
      >
        {depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <Server className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{node.name}</span>
        <RoleChip role={node.role} />
        <Badge variant="outline" className="text-xs">{node.osKind}</Badge>
        {node.connectionAddress && (
          <span className="text-xs text-muted-foreground">{node.connectionAddress}</span>
        )}
      </div>
      {node.children.map(child => (
        <ServerNodeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

interface ServerDialogProps {
  open: boolean
  onClose: () => void
  envId: string
  serverIds: { id: string; name: string }[]
}

function ServerDialog({ open, onClose, envId, serverIds }: ServerDialogProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('secondary')
  const [parentId, setParentId] = useState('')
  const [osKind, setOsKind] = useState('linux')
  const [address, setAddress] = useState('')

  const utils = trpc.useUtils()
  const create = trpc.infra.createServer.useMutation({
    onSuccess: () => { utils.infra.listServers.invalidate(); onClose() },
  })

  function submit() {
    create.mutate({
      name,
      role: role as 'primary' | 'secondary' | 'virtual',
      osKind: osKind as 'linux' | 'windows',
      environmentId: envId,
      parentId: parentId || undefined,
      connectionAddress: address || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Добавить сервер</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Имя сервера" value={name} onChange={e => setName(e.target.value)} />
          <Select
            value={role}
            options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'virtual', label: 'Virtual' },
            ]}
            onChange={e => setRole(e.target.value)}
          />
          <Select
            value={osKind}
            options={[
              { value: 'linux', label: 'Linux' },
              { value: 'windows', label: 'Windows' },
            ]}
            onChange={e => setOsKind(e.target.value)}
          />
          {serverIds.length > 0 && (
            <Select
              value={parentId}
              options={[
                { value: '', label: '— без родителя —' },
                ...serverIds.map(s => ({ value: s.id, label: s.name })),
              ]}
              onChange={e => setParentId(e.target.value)}
            />
          )}
          <Input placeholder="Адрес подключения (опционально)" value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ServersTab({ envId }: { envId: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const { data: nodes = [] } = trpc.infra.listServers.useQuery({ environmentId: envId })
  const utils = trpc.useUtils()
  const del = trpc.infra.deleteServer.useMutation({ onSuccess: () => utils.infra.listServers.invalidate() })

  const typedNodes = nodes as unknown as ServerNode[]
  const roots = typedNodes.filter(n => !n.parentId)
  const flat = typedNodes.map(n => ({ id: n.id, name: n.name }))

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Иерархия серверов администрирования</h3>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="mr-1 h-4 w-4" />Добавить
        </Button>
      </div>

      {roots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Серверы не настроены</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {roots.map(node => (
            <div key={node.id} className="group relative">
              <ServerNodeRow node={node} />
              <button
                onClick={() => del.mutate({ id: node.id })}
                className="absolute right-2 top-1.5 hidden rounded p-1 hover:bg-destructive/10 group-hover:flex"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ServerDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        envId={envId}
        serverIds={flat}
      />
    </div>
  )
}

// ─── RBAC Tab ─────────────────────────────────────────────────────────────────

type Rights = { read: boolean; write: boolean; execute: boolean; performOnSelections: boolean }

function RightsChip({ rights }: { rights: unknown }) {
  const r = rights as Rights | null
  if (!r) return <span className="text-xs text-muted-foreground">—</span>
  const parts = [
    r.read && 'R',
    r.write && 'W',
    r.execute && 'X',
    r.performOnSelections && 'S',
  ].filter(Boolean).join('')
  if (!parts) return <span className="text-xs text-muted-foreground">×</span>
  return <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono text-primary">{parts}</span>
}

function AssignUserDialog({ open, onClose, envId, roles }: {
  open: boolean; onClose: () => void; envId: string; roles: { id: string; name: string }[]
}) {
  const [userRef, setUserRef] = useState('')
  const [roleId, setRoleId] = useState('')
  const utils = trpc.useUtils()
  const add = trpc.infra.addUserAssignment.useMutation({
    onSuccess: () => { utils.infra.listUserAssignments.invalidate(); onClose() },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Назначить роль пользователю</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Пользователь (логин / UPN)" value={userRef} onChange={e => setUserRef(e.target.value)} />
          <Select
            value={roleId}
            placeholder="— выберите роль —"
            options={roles.map(r => ({ value: r.id, label: r.name }))}
            onChange={e => setRoleId(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => add.mutate({ environmentId: envId, userRef, roleId })}
            disabled={!userRef || !roleId || add.isPending}
          >
            Назначить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RbacTab({ envId }: { envId: string }) {
  const [showAssign, setShowAssign] = useState(false)
  const { data: roles = [] } = trpc.infra.listRoles.useQuery()
  const { data: areas = [] } = trpc.infra.listFunctionalAreas.useQuery()
  const { data: assignments = [] } = trpc.infra.listUserAssignments.useQuery({ environmentId: envId })
  const utils = trpc.useUtils()
  const del = trpc.infra.deleteUserAssignment.useMutation({ onSuccess: () => utils.infra.listUserAssignments.invalidate() })

  const typedRoles = roles as unknown as RoleDefinition[]
  const typedAssignments = assignments as unknown as UserAssignment[]
  const typedAreas = areas as { id: string; name: string; group: string }[]

  const areaGroups = [...new Set(typedAreas.map(a => a.group))]

  return (
    <div className="space-y-6 p-4">
      {/* Role matrix */}
      <div>
        <h3 className="mb-2 font-medium">Матрица ролей</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 bg-muted/80 px-2 py-2 text-left font-medium w-48">
                  Функциональная область
                </th>
                {typedRoles.map(r => (
                  <th key={r.id} className="px-2 py-2 font-medium text-center max-w-[80px]">
                    <span className="block truncate" title={r.name}>
                      {r.name.replace('Administration ', '').replace('Kaspersky Endpoint Security ', 'KES ')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areaGroups.map(group => (
                <>
                  <tr key={`grp-${group}`} className="bg-muted/20">
                    <td colSpan={typedRoles.length + 1} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </td>
                  </tr>
                  {typedAreas.filter(a => a.group === group).map(area => (
                    <tr key={area.id} className="border-b hover:bg-accent/30">
                      <td className="sticky left-0 bg-background px-2 py-1.5 font-medium">{area.name}</td>
                      {typedRoles.map(role => {
                        const grant = role.grants.find(g => g.functionalArea.id === area.id)
                        return (
                          <td key={role.id} className="px-2 py-1.5 text-center">
                            {grant ? <RightsChip rights={grant.rights} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">R=Read W=Write X=Execute S=performOnSelections</p>
      </div>

      {/* User assignments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Назначения пользователей</h3>
          <Button size="sm" onClick={() => setShowAssign(true)}>
            <Plus className="mr-1 h-4 w-4" />Назначить
          </Button>
        </div>
        {typedAssignments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Нет назначений</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {typedAssignments.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{a.userRef}</span>
                <Badge variant="outline">{a.role.name}</Badge>
                <button onClick={() => del.mutate({ id: a.id })} className="rounded p-1 hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AssignUserDialog
        open={showAssign}
        onClose={() => setShowAssign(false)}
        envId={envId}
        roles={typedRoles.map(r => ({ id: r.id, name: r.name }))}
      />
    </div>
  )
}

// ─── KSN Tab ─────────────────────────────────────────────────────────────────

function KsnTab({ envId }: { envId: string }) {
  const { data: existing } = trpc.infra.getKsn.useQuery({ environmentId: envId })
  const utils = trpc.useUtils()
  const upsert = trpc.infra.upsertKsn.useMutation({ onSuccess: () => utils.infra.getKsn.invalidate() })

  const [participationEnabled, setParticipationEnabled] = useState(() => existing?.participationEnabled ?? false)
  const [extendedModeEnabled, setExtendedModeEnabled] = useState(() => existing?.extendedModeEnabled ?? false)
  const [provider, setProvider] = useState(() => existing?.provider ?? 'global')
  const [allowDirectFallback, setAllowDirectFallback] = useState(() => existing?.allowDirectFallback ?? true)
  const [proxyHostRef, setProxyHostRef] = useState(() => existing?.proxyHostRef ?? 'admin_server')
  const [tcpPort, setTcpPort] = useState(() => existing?.tcpPort ?? 13111)
  const [udpEnabled, setUdpEnabled] = useState(() => existing?.udpEnabled ?? false)
  const [udpPort, setUdpPort] = useState(() => existing?.udpPort ?? 15111)

  function save() {
    upsert.mutate({
      environmentId: envId,
      participationEnabled,
      extendedModeEnabled,
      provider: provider as 'global' | 'private',
      allowDirectFallback,
      proxyHostRef: proxyHostRef as 'admin_server' | 'distribution_point',
      tcpPort,
      udpEnabled,
      udpPort,
    })
  }

  return (
    <div className="max-w-xl space-y-4 p-6">
      <h3 className="font-medium">Kaspersky Security Network (KSN)</h3>

      <div className="space-y-3 rounded-lg border p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm">Участие в KSN</span>
          <Switch checked={participationEnabled} onCheckedChange={setParticipationEnabled} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">Расширенный режим</span>
          <Switch checked={extendedModeEnabled} onCheckedChange={setExtendedModeEnabled} />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Провайдер</span>
          <Select
            value={provider}
            options={[
              { value: 'global', label: 'Глобальный KSN' },
              { value: 'private', label: 'Private KSN' },
            ]}
            onChange={e => setProvider(e.target.value)}
          />
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm">Прямой fallback при недоступности прокси</span>
          <Switch checked={allowDirectFallback} onCheckedChange={setAllowDirectFallback} />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Прокси-хост</span>
          <Select
            value={proxyHostRef}
            options={[
              { value: 'admin_server', label: 'Сервер администрирования' },
              { value: 'distribution_point', label: 'Точка распространения' },
            ]}
            onChange={e => setProxyHostRef(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">TCP порт</span>
          <Input type="number" value={tcpPort} onChange={e => setTcpPort(Number(e.target.value))} className="w-28" />
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm">UDP включён</span>
          <Switch checked={udpEnabled} onCheckedChange={setUdpEnabled} />
        </label>
        {udpEnabled && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">UDP порт</span>
            <Input type="number" value={udpPort} onChange={e => setUdpPort(Number(e.target.value))} className="w-28" />
          </div>
        )}
      </div>

      <Button onClick={save} disabled={upsert.isPending}>
        {upsert.isPending ? 'Сохраняется…' : 'Сохранить'}
      </Button>
      {upsert.isSuccess && (
        <div className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />Сохранено
        </div>
      )}
    </div>
  )
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────

function scheduleLabel(s: unknown): string {
  const sc = s as { type: string; intervalMinutes?: number; cron?: string } | null
  if (!sc) return '—'
  if (sc.type === 'interval') return `Каждые ${sc.intervalMinutes ?? '?'} мин`
  if (sc.type === 'cron') return `Cron: ${sc.cron}`
  return sc.type
}

function BackupDialog({ open, onClose, envId }: { open: boolean; onClose: () => void; envId: string }) {
  const [scheduleType, setScheduleType] = useState('interval')
  const [intervalMinutes, setIntervalMinutes] = useState(1440)
  const [cron, setCron] = useState('0 3 * * *')
  const [storageTarget, setStorageTarget] = useState('local_path')
  const [storagePath, setStoragePath] = useState('/var/ksc/backup')
  const [retentionDays, setRetentionDays] = useState(30)
  const [passwordProtected, setPasswordProtected] = useState(true)

  const utils = trpc.useUtils()
  const create = trpc.infra.createBackup.useMutation({
    onSuccess: () => { utils.infra.listBackup.invalidate(); onClose() },
  })

  function submit() {
    create.mutate({
      environmentId: envId,
      schedule: scheduleType === 'interval' ? { type: 'interval' as const, intervalMinutes } : { type: 'cron' as const, cron },
      storageTarget: storageTarget as 'local_path' | 's3' | 'azure',
      storagePath: storagePath || undefined,
      retentionDays,
      passwordProtected,
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Новая политика резервного копирования</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Расписание</span>
            <Select
              value={scheduleType}
              options={[
                { value: 'interval', label: 'По интервалу' },
                { value: 'cron', label: 'Cron' },
              ]}
              onChange={e => setScheduleType(e.target.value)}
            />
          </div>
          {scheduleType === 'interval' ? (
            <div className="flex items-center gap-3">
              <span className="text-sm w-32 shrink-0">Интервал (мин)</span>
              <Input type="number" value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm w-32 shrink-0">Cron</span>
              <Input value={cron} onChange={e => setCron(e.target.value)} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Хранилище</span>
            <Select
              value={storageTarget}
              options={[
                { value: 'local_path', label: 'Локальный путь' },
                { value: 's3', label: 'S3' },
                { value: 'azure', label: 'Azure Blob' },
              ]}
              onChange={e => setStorageTarget(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Путь / URL</span>
            <Input value={storagePath} onChange={e => setStoragePath(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Хранить (дней)</span>
            <Input type="number" value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={passwordProtected} onCheckedChange={setPasswordProtected} />
            <span className="text-sm">Защита паролем</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BackupTab({ envId }: { envId: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const { data: policies = [] } = trpc.infra.listBackup.useQuery({ environmentId: envId })
  const utils = trpc.useUtils()
  const del = trpc.infra.deleteBackup.useMutation({ onSuccess: () => utils.infra.listBackup.invalidate() })
  const toggle = trpc.infra.updateBackup.useMutation({ onSuccess: () => utils.infra.listBackup.invalidate() })

  const typedPolicies = policies as unknown as BackupPolicy[]

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Политики резервного копирования</h3>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="mr-1 h-4 w-4" />Создать
        </Button>
      </div>

      {typedPolicies.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Политики не настроены</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {typedPolicies.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-3">
              <Switch
                checked={p.enabled}
                onCheckedChange={v => toggle.mutate({ id: p.id, enabled: v })}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{scheduleLabel(p.schedule)}</p>
                <p className="text-xs text-muted-foreground">
                  {p.storageTarget} · {p.storagePath ?? '—'} · {p.retentionDays}д
                  {p.passwordProtected && ' · 🔒'}
                </p>
              </div>
              <button onClick={() => del.mutate({ id: p.id })} className="rounded p-1 hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BackupDialog open={showDialog} onClose={() => setShowDialog(false)} envId={envId} />
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function InfrastructurePage() {
  const [envId, setEnvId] = useState(ENVS[0].value)
  const [tab, setTab] = useState<TabId>('servers')

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Select
          value={envId}
          options={ENVS}
          onChange={e => setEnvId(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'servers' && <ServersTab envId={envId} />}
        {tab === 'rbac' && <RbacTab envId={envId} />}
        {tab === 'ksn' && <KsnTab envId={envId} />}
        {tab === 'backup' && <BackupTab envId={envId} />}
      </div>
    </div>
  )
}
