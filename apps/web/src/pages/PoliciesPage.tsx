import { useState } from 'react'
import { Shield, Bot, Plus, Layers, CheckCircle, PauseCircle, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { GroupTree } from '@/components/GroupTree'
import { PolicyEditor } from '@/components/PolicyEditor'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { GroupTreeNode } from '@/components/GroupTree'

const STATUS_ICON = {
  active: CheckCircle,
  inactive: PauseCircle,
  out_of_office: AlertTriangle,
}
const STATUS_LABEL = {
  active: 'Активна',
  inactive: 'Неактивна',
  out_of_office: 'Не в офисе',
}

export function PoliciesPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<GroupTreeNode | null>(null)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newPolicyName, setNewPolicyName] = useState('')
  const [newPolicyAppId, setNewPolicyAppId] = useState('')

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  const { data: tree } = trpc.groups.tree.useQuery(
    { environmentId: activeEnvId },
    { enabled: !!activeEnvId },
  )

  const { data: groupPolicies, isLoading: policiesLoading } = trpc.policies.listForGroup.useQuery(
    { groupId: selectedGroup?.id ?? '' },
    { enabled: !!selectedGroup },
  )

  const { data: applications } = trpc.catalog.listApplications.useQuery()
  const createPolicy = trpc.policies.create.useMutation()
  const utils = trpc.useUtils()

  function handleCreatePolicy() {
    if (!selectedGroup || !newPolicyName || !newPolicyAppId) return
    createPolicy.mutate(
      { groupId: selectedGroup.id, applicationId: newPolicyAppId, name: newPolicyName },
      {
        onSuccess: p => {
          setCreateOpen(false)
          setNewPolicyName('')
          setSelectedPolicyId(p.id)
          void utils.policies.listForGroup.invalidate({ groupId: selectedGroup.id })
          void utils.groups.tree.invalidate({ environmentId: activeEnvId })
        },
      },
    )
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* ── Column 1: Environment selector + Group tree ────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r">
        {/* Environment selector */}
        <div className="border-b p-3">
          <div className="flex flex-wrap gap-1">
            {environments?.map(env => (
              <Badge
                key={env.id}
                variant={env.id === activeEnvId ? 'default' : 'outline'}
                className="cursor-pointer select-none text-xs"
                onClick={() => {
                  setSelectedEnvId(env.id)
                  setSelectedGroup(null)
                  setSelectedPolicyId(null)
                }}
              >
                {env.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-2">
            <GroupTree
              nodes={tree ?? []}
              selectedId={selectedGroup?.id}
              onSelect={g => {
                setSelectedGroup(g)
                setSelectedPolicyId(null)
              }}
            />
          </ScrollArea>
        </div>
      </div>

      {/* ── Column 2: Policy list for selected group ───────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-medium">
            {selectedGroup ? selectedGroup.name : 'Группа не выбрана'}
          </span>
          {selectedGroup && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 p-2">
          {!selectedGroup && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Выберите группу в дереве слева
            </p>
          )}

          {selectedGroup && policiesLoading && (
            <p className="px-2 py-4 text-xs text-muted-foreground">Загрузка…</p>
          )}

          {selectedGroup && !policiesLoading && groupPolicies?.length === 0 && (
            <div className="space-y-2 px-2 py-4">
              <p className="text-xs text-muted-foreground">Политик нет</p>
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Создать политику
              </Button>
            </div>
          )}

          {groupPolicies?.map(p => {
            const isAgent = p.application.name === 'Агент администрирования'
            const StatusIcon = STATUS_ICON[p.status as keyof typeof STATUS_ICON] ?? CheckCircle
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPolicyId(p.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  selectedPolicyId === p.id && 'bg-accent text-accent-foreground',
                )}
              >
                {isAgent
                  ? <Bot className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  : <Shield className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                }
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StatusIcon className="h-3 w-3" />
                    {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}
                  </div>
                </div>
              </button>
            )
          })}
        </ScrollArea>
      </div>

      {/* ── Column 3: Policy editor ────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {selectedPolicyId ? (
          <PolicyEditor key={selectedPolicyId} policyId={selectedPolicyId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Shield className="h-16 w-16 opacity-15" />
            <p className="text-sm">Выберите политику из списка слева</p>
            {selectedGroup && (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Создать политику
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Create policy dialog ───────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onClose={() => setCreateOpen(false)}>
          <DialogHeader>
            <DialogTitle>Создать политику</DialogTitle>
            <DialogDescription>
              Новая политика для группы «{selectedGroup?.name}»
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Название</label>
              <Input
                autoFocus
                placeholder="Например: KESL — Серверы"
                value={newPolicyName}
                onChange={e => setNewPolicyName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Приложение</label>
              <Select
                value={newPolicyAppId}
                options={
                  applications?.map(a => ({
                    value: a.id,
                    label: `${a.name} ${a.version}`,
                  })) ?? []
                }
                placeholder="Выберите приложение"
                onChange={e => setNewPolicyAppId(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!newPolicyName.trim() || !newPolicyAppId || createPolicy.isPending}
              onClick={handleCreatePolicy}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
