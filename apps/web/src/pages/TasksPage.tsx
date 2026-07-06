import { useState } from 'react'
import { Plus, Trash2, PlayCircle, PauseCircle, Clock, Zap, Hand } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Local flat types ─────────────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  description: string | null
  defaultTriggerType: string | null
  application: { id: string; name: string; version: string }
}

interface TaskRow {
  id: string
  scopeType: string
  scopeId: string
  trigger: unknown
  params: unknown
  enabled: boolean
  createdAt: string
  template: Template
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Вручную',
  scheduled: 'По расписанию',
  on_app_launch: 'При запуске приложения',
  after_db_update: 'После обновления баз',
}

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  manual: Hand,
  scheduled: Clock,
  on_app_launch: PlayCircle,
  after_db_update: Zap,
}

function triggerType(trigger: unknown): string {
  if (trigger && typeof trigger === 'object' && 'type' in trigger) {
    return (trigger as { type: string }).type
  }
  return 'manual'
}

function TriggerBadge({ trigger }: { trigger: unknown }) {
  const type = triggerType(trigger)
  const Icon = TRIGGER_ICONS[type] ?? Hand
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {TRIGGER_LABELS[type] ?? type}
    </span>
  )
}

// ─── Create dialog ────────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  environmentId: string
  onCreated: () => void
}

function CreateTaskDialog({ open, onOpenChange, environmentId, onCreated }: CreateDialogProps) {
  const [templateId, setTemplateId] = useState('')
  const [scopeType, setScopeType] = useState<'group' | 'device_selection'>('group')
  const [scopeId, setScopeId] = useState('')
  const [triggerTypeVal, setTriggerTypeVal] = useState('manual')
  const [cron, setCron] = useState('0 3 * * *')

  const { data: rawTemplates } = trpc.catalog.listTaskTemplates.useQuery()
  const templates = (rawTemplates as Template[] | undefined) ?? []

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      onCreated()
      onOpenChange(false)
      setTemplateId('')
      setScopeId('')
      setTriggerTypeVal('manual')
      setCron('0 3 * * *')
    },
  })

  const selectedTemplate = templates.find(t => t.id === templateId)

  function submit() {
    if (!templateId || !scopeId) return
    create.mutate({
      environmentId,
      templateId,
      scopeType,
      scopeId,
      trigger: triggerTypeVal === 'scheduled'
        ? { type: 'scheduled' as const, cron }
        : { type: triggerTypeVal as 'manual' | 'on_app_launch' | 'after_db_update' },
      params: {},
      enabled: true,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Создать задачу</DialogTitle>
          <DialogDescription>
            Задача будет добавлена в выбранную среду.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Шаблон задачи</label>
            <Select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              options={[
                { value: '', label: 'Выберите шаблон…' },
                ...templates.map(t => ({
                  value: t.id,
                  label: `${t.name} (${t.application.name})`,
                })),
              ]}
            />
            {selectedTemplate?.description && (
              <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
            )}
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Область применения</label>
            <div className="flex gap-2">
              <Select
                className="w-40"
                value={scopeType}
                onChange={e => setScopeType(e.target.value as 'group' | 'device_selection')}
                options={[
                  { value: 'group', label: 'Группа' },
                  { value: 'device_selection', label: 'Выборка устройств' },
                ]}
              />
              <Input
                placeholder={scopeType === 'group' ? 'ID группы' : 'ID выборки'}
                value={scopeId}
                onChange={e => setScopeId(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Триггер</label>
            <Select
              value={triggerTypeVal}
              onChange={e => setTriggerTypeVal(e.target.value)}
              options={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label }))}
            />
            {triggerTypeVal === 'scheduled' && (
              <div className="flex items-center gap-2">
                <Input
                  value={cron}
                  onChange={e => setCron(e.target.value)}
                  placeholder="cron: 0 3 * * *"
                  className="font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">cron</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={submit}
            disabled={!templateId || !scopeId || create.isPending}
          >
            {create.isPending ? 'Создание…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function TasksPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  const { data: rawTasks, refetch } = trpc.tasks.listForEnvironment.useQuery(
    { environmentId: activeEnvId },
    { enabled: !!activeEnvId },
  )
  const tasks = (rawTasks as TaskRow[] | undefined) ?? []

  const toggleEnabled = trpc.tasks.toggleEnabled.useMutation({ onSuccess: () => void refetch() })
  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      setDeletingId(null)
      void refetch()
    },
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
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!activeEnvId}>
          <Plus className="mr-1.5 h-4 w-4" />
          Создать задачу
        </Button>
      </div>

      {/* Tasks list */}
      <div className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {activeEnvId ? 'Задачи не найдены. Создайте первую задачу.' : 'Выберите среду.'}
          </div>
        ) : (
          <div className="rounded-lg border">
            {tasks.map((task, idx) => {
              const tType = triggerType(task.trigger)
              return (
                <div key={task.id}>
                  {idx > 0 && <Separator />}
                  <div className={cn(
                    'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30',
                    !task.enabled && 'opacity-60',
                  )}>
                    {/* Left: enabled toggle */}
                    <Switch
                      checked={task.enabled}
                      onCheckedChange={v => toggleEnabled.mutate({ taskId: task.id, enabled: v })}
                    />

                    {/* Center: info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{task.template.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {task.template.application.name}
                        </Badge>
                        {!task.enabled && (
                          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                            <PauseCircle className="mr-1 h-2.5 w-2.5" />
                            Выключена
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <TriggerBadge trigger={task.trigger} />
                        {tType === 'scheduled' && (task.trigger as { cron?: string }).cron && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{(task.trigger as { cron: string }).cron}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>
                          Область: {task.scopeType === 'group' ? 'Группа' : 'Выборка'}{' '}
                          <span className="font-mono">{task.scopeId.slice(0, 8)}…</span>
                        </span>
                      </div>
                    </div>

                    {/* Right: delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingId(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {activeEnvId && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          environmentId={activeEnvId}
          onCreated={() => void refetch()}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deletingId} onOpenChange={v => { if (!v) setDeletingId(null) }}>
        <DialogContent onClose={() => setDeletingId(null)}>
          <DialogHeader>
            <DialogTitle>Удалить задачу?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingId(null)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={deleteTask.isPending}
              onClick={() => deletingId && deleteTask.mutate({ taskId: deletingId })}
            >
              {deleteTask.isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
