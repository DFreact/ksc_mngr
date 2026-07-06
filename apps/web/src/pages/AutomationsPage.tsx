import { useState } from 'react'
import {
  Plus, Trash2, Pencil, ArrowRight, Tag, Play, List, Radar,
  CheckCircle2, PauseCircle,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  ConditionBuilder, emptyGroup,
  type ConditionGroup, type CriteriaMeta,
} from '@/components/ConditionBuilder'
import { cn } from '@/lib/utils'

// ─── Local flat types ─────────────────────────────────────────────────────────

interface RuleRow {
  id: string
  kind: string
  name: string
  priority: number
  enabled: boolean
  condition: unknown
  action: unknown
}

// ─── Kind config ──────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  moving_rule:      { label: 'Перемещение',      icon: ArrowRight, color: 'text-blue-500' },
  tagging_rule:     { label: 'Тегирование',       icon: Tag,        color: 'text-green-500' },
  task_trigger:     { label: 'Триггер задачи',    icon: Play,       color: 'text-orange-500' },
  device_selection: { label: 'Выборка устройств', icon: List,       color: 'text-purple-500' },
  discovery_poll:   { label: 'Опрос сети',        icon: Radar,      color: 'text-teal-500' },
}

// ─── Action summary ───────────────────────────────────────────────────────────

function ActionSummary({ action }: { action: unknown }) {
  if (!action || typeof action !== 'object') return <span className="text-muted-foreground">—</span>
  const a = action as Record<string, unknown>
  if (a.type === 'move_to_group') return <span>→ {String(a.groupName ?? a.groupId ?? '?')}</span>
  if (a.type === 'assign_tag') return <span>#{String(a.tagName ?? '?')}</span>
  if (a.type === 'run_task') return <span>Задача: {String(a.templateId ?? '?')}</span>
  if (a.type === 'named_selection') return <span>"{String(a.selectionName ?? '?')}"</span>
  return <span>{String(a.type)}</span>
}

// ─── Rule form (inside dialog) ────────────────────────────────────────────────

interface RuleFormState {
  name: string
  kind: string
  priority: number
  condition: ConditionGroup
  actionType: string
  actionValue: string  // groupId / tagName / templateId / selectionName
}

function defaultForm(): RuleFormState {
  return {
    name: '',
    kind: 'moving_rule',
    priority: 100,
    condition: emptyGroup(),
    actionType: 'move_to_group',
    actionValue: '',
  }
}

const KIND_TO_ACTION: Record<string, string> = {
  moving_rule:      'move_to_group',
  tagging_rule:     'assign_tag',
  task_trigger:     'run_task',
  device_selection: 'named_selection',
  discovery_poll:   'notify',
}

const ACTION_VALUE_LABELS: Record<string, string> = {
  move_to_group:    'ID группы назначения',
  assign_tag:       'Имя тега',
  run_task:         'ID шаблона задачи',
  named_selection:  'Имя выборки',
  notify:           '',
}

interface RuleDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: RuleFormState
  environmentId: string
  editId?: string
  onSaved: () => void
}

function RuleDialog({ open, onOpenChange, initial, environmentId, editId, onSaved }: RuleDialogProps) {
  const [form, setForm] = useState<RuleFormState>(initial ?? defaultForm())

  const { data: rawCriteria } = trpc.catalog.listCriteria.useQuery()
  const criteriaList = (rawCriteria as CriteriaMeta[] | undefined) ?? []

  const create = trpc.automations.create.useMutation({ onSuccess: () => { onSaved(); onOpenChange(false) } })
  const update = trpc.automations.update.useMutation({ onSuccess: () => { onSaved(); onOpenChange(false) } })

  function buildAction() {
    const type = form.actionType as 'move_to_group' | 'assign_tag' | 'run_task' | 'named_selection' | 'notify'
    if (type === 'move_to_group') return { type, groupId: form.actionValue }
    if (type === 'assign_tag') return { type, tagName: form.actionValue }
    if (type === 'run_task') return { type, templateId: form.actionValue }
    if (type === 'named_selection') return { type, selectionName: form.actionValue }
    return { type: 'notify' as const }
  }

  function submit() {
    if (!form.name.trim()) return
    const payload = {
      name: form.name,
      priority: form.priority,
      condition: form.condition,
      action: buildAction(),
    }
    if (editId) {
      update.mutate({ ruleId: editId, ...payload })
    } else {
      create.mutate({
        environmentId,
        kind: form.kind as 'moving_rule' | 'tagging_rule' | 'task_trigger' | 'device_selection' | 'discovery_poll',
        ...payload,
        enabled: true,
      })
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{editId ? 'Редактировать правило' : 'Новое правило'}</DialogTitle>
          <DialogDescription>Условие срабатывания и действие.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-1">
          <div className="space-y-4 pb-2">
            {/* Name + kind + priority */}
            <div className="grid grid-cols-[1fr_180px_80px] gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Название</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Имя правила"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Тип</label>
                <Select
                  value={form.kind}
                  onChange={e => {
                    const kind = e.target.value
                    setForm(f => ({ ...f, kind, actionType: KIND_TO_ACTION[kind] ?? 'notify', actionValue: '' }))
                  }}
                  options={Object.entries(KIND_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
                  disabled={!!editId}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Приоритет</label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value, 10) || 100 }))}
                />
              </div>
            </div>

            {/* Condition builder */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Условие</label>
              <ConditionBuilder
                value={form.condition}
                onChange={condition => setForm(f => ({ ...f, condition }))}
                criteriaList={criteriaList}
              />
            </div>

            {/* Action */}
            {form.actionType !== 'notify' && ACTION_VALUE_LABELS[form.actionType] && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Действие: {ACTION_VALUE_LABELS[form.actionType]}</label>
                <Input
                  value={form.actionValue}
                  onChange={e => setForm(f => ({ ...f, actionValue: e.target.value }))}
                  placeholder={ACTION_VALUE_LABELS[form.actionType]}
                />
              </div>
            )}
            {form.actionType === 'notify' && (
              <p className="text-xs text-muted-foreground">Действие: уведомление (без дополнительных параметров)</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={!form.name.trim() || isPending}>
            {isPending ? 'Сохранение…' : editId ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [filterKind, setFilterKind] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  type AutomationKind = 'moving_rule' | 'tagging_rule' | 'task_trigger' | 'device_selection' | 'discovery_poll'
  const kindFilter = filterKind ? filterKind as AutomationKind : undefined
  const { data: rawRules, refetch } = trpc.automations.list.useQuery(
    { environmentId: activeEnvId, kind: kindFilter },
    { enabled: !!activeEnvId },
  )
  const rules = (rawRules as RuleRow[] | undefined) ?? []

  const toggleEnabled = trpc.automations.toggleEnabled.useMutation({ onSuccess: () => void refetch() })
  const deleteRule = trpc.automations.delete.useMutation({
    onSuccess: () => { setDeletingId(null); void refetch() },
  })

  function openCreate() {
    setEditingRule(null)
    setDialogOpen(true)
  }

  function openEdit(rule: RuleRow) {
    setEditingRule(rule)
    setDialogOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-6 py-3">
        <Select
          className="w-44"
          value={activeEnvId}
          onChange={e => setSelectedEnvId(e.target.value)}
          options={(environments ?? []).map(e => ({ value: e.id, label: e.name }))}
        />
        <Select
          className="w-48"
          value={filterKind}
          onChange={e => setFilterKind(e.target.value)}
          options={[
            { value: '', label: 'Все типы' },
            ...Object.entries(KIND_CONFIG).map(([v, c]) => ({ value: v, label: c.label })),
          ]}
        />
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate} disabled={!activeEnvId}>
          <Plus className="mr-1.5 h-4 w-4" />
          Новое правило
        </Button>
      </div>

      {/* Rules list */}
      <div className="flex-1 overflow-auto p-6">
        {rules.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {activeEnvId ? 'Правила не найдены.' : 'Выберите среду.'}
          </div>
        ) : (
          <div className="rounded-lg border">
            {rules.map((rule, idx) => {
              const cfg = KIND_CONFIG[rule.kind] ?? KIND_CONFIG.moving_rule
              const Icon = cfg.icon
              return (
                <div key={rule.id}>
                  {idx > 0 && <Separator />}
                  <div className={cn(
                    'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30',
                    !rule.enabled && 'opacity-60',
                  )}>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={v => toggleEnabled.mutate({ ruleId: rule.id, enabled: v })}
                    />
                    <div className={cn('shrink-0', cfg.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{rule.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{cfg.label}</Badge>
                        {rule.enabled
                          ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                          : <PauseCircle className="h-3 w-3 text-muted-foreground" />
                        }
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Приоритет {rule.priority}</span>
                        <span>·</span>
                        <ActionSummary action={rule.action} />
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => openEdit(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingId(rule.id)}
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

      {/* Create/edit dialog */}
      <RuleDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditingRule(null) }}
        environmentId={activeEnvId}
        editId={editingRule?.id}
        initial={editingRule ? {
          name: editingRule.name,
          kind: editingRule.kind,
          priority: editingRule.priority,
          condition: (editingRule.condition as ConditionGroup) ?? emptyGroup(),
          actionType: (editingRule.action as Record<string, string> | null)?.type ?? 'notify',
          actionValue: (editingRule.action as Record<string, string> | null)?.groupId
            ?? (editingRule.action as Record<string, string> | null)?.tagName
            ?? (editingRule.action as Record<string, string> | null)?.templateId
            ?? (editingRule.action as Record<string, string> | null)?.selectionName
            ?? '',
        } : undefined}
        onSaved={() => void refetch()}
      />

      {/* Delete confirm */}
      <Dialog open={!!deletingId} onOpenChange={v => { if (!v) setDeletingId(null) }}>
        <DialogContent onClose={() => setDeletingId(null)}>
          <DialogHeader>
            <DialogTitle>Удалить правило?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingId(null)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={deleteRule.isPending}
              onClick={() => deletingId && deleteRule.mutate({ ruleId: deletingId })}
            >
              {deleteRule.isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
