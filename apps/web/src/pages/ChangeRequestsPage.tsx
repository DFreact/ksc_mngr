import { useState } from 'react'
import {
  Plus, Trash2, ChevronRight, FileText, CheckCircle2,
  Clock, XCircle, RotateCcw, Send, ThumbsUp, ThumbsDown,
  FilePen, CheckCheck,
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
import { DiffViewer, type DiffEntry } from '@/components/DiffViewer'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type CRStatus = 'draft' | 'in_review' | 'approved' | 'applied' | 'rejected' | 'rolled_back'

interface CRSummary {
  id: string
  title: string
  authorId: string
  status: CRStatus
  relatedTicket: string | null
  createdAt: string
  _count: { revisions: number; approvals: number }
}

interface RevisionRow {
  id: string
  entityType: string
  entityId: string
  entityName: string
  diff: unknown
  createdAt: string
}

interface ApprovalRow {
  id: string
  approverId: string
  decision: string | null
  comment: string | null
  decidedAt: string | null
  createdAt: string
}

interface CRDetail {
  id: string
  title: string
  description: string | null
  authorId: string
  status: CRStatus
  relatedTicket: string | null
  createdAt: string
  revisions: RevisionRow[]
  approvals: ApprovalRow[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<CRStatus, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }> = {
  draft:       { label: 'Черновик',    icon: FilePen,     variant: 'secondary', color: 'text-muted-foreground' },
  in_review:   { label: 'На проверке', icon: Clock,       variant: 'default',   color: 'text-blue-500' },
  approved:    { label: 'Утверждена',  icon: CheckCircle2,variant: 'default',   color: 'text-green-600' },
  applied:     { label: 'Применена',   icon: CheckCheck,  variant: 'default',   color: 'text-green-700' },
  rejected:    { label: 'Отклонена',   icon: XCircle,     variant: 'destructive',color: 'text-red-500' },
  rolled_back: { label: 'Откат',       icon: RotateCcw,   variant: 'outline',   color: 'text-amber-500' },
}

// Valid transitions + labels + icons
const ACTIONS: Record<CRStatus, Array<{ toStatus: CRStatus; label: string; icon: React.ElementType; variant: 'default' | 'outline' | 'destructive' }>> = {
  draft:       [{ toStatus: 'in_review',  label: 'Отправить на проверку', icon: Send,      variant: 'default' }],
  in_review:   [
    { toStatus: 'draft',    label: 'Вернуть на доработку', icon: FilePen,    variant: 'outline' },
    { toStatus: 'approved', label: 'Утвердить',             icon: ThumbsUp,   variant: 'default' },
    { toStatus: 'rejected', label: 'Отклонить',             icon: ThumbsDown, variant: 'destructive' },
  ],
  approved:    [
    { toStatus: 'applied',  label: 'Пометить как применённую', icon: CheckCheck, variant: 'default' },
    { toStatus: 'rejected', label: 'Отклонить',                icon: ThumbsDown, variant: 'destructive' },
  ],
  applied:     [{ toStatus: 'rolled_back', label: 'Откатить', icon: RotateCcw, variant: 'destructive' }],
  rejected:    [],
  rolled_back: [],
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateDialog({
  open, onOpenChange, environmentId, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; environmentId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [ticket, setTicket] = useState('')

  const create = trpc.changeRequests.create.useMutation({
    onSuccess: () => { onCreated(); onOpenChange(false); setTitle(''); setDescription(''); setAuthorId(''); setTicket('') },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Новая заявка на изменение</DialogTitle>
          <DialogDescription>Черновик — можно редактировать до отправки на проверку.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Заголовок *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Что меняем?" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Описание</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Зачем / почему / риски" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Автор *</label>
              <Input value={authorId} onChange={e => setAuthorId(e.target.value)} placeholder="Иванов И.И." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Тикет / номер задачи</label>
              <Input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="JIRA-1234" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!title.trim() || !authorId.trim() || create.isPending}
            onClick={() => create.mutate({ environmentId, title, description: description || undefined, authorId, relatedTicket: ticket || undefined })}
          >
            {create.isPending ? 'Создание…' : 'Создать черновик'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add revision dialog ──────────────────────────────────────────────────────

function AddRevisionDialog({
  open, onOpenChange, changeRequestId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; changeRequestId: string; onSaved: () => void }) {
  const [entityType, setEntityType] = useState('policy')
  const [entityId, setEntityId] = useState('')
  const [entityName, setEntityName] = useState('')
  const [diffJson, setDiffJson] = useState('[{"field":"","before":null,"after":null}]')

  const addRev = trpc.changeRequests.addRevision.useMutation({
    onSuccess: () => { onSaved(); onOpenChange(false) },
  })

  function submit() {
    try {
      const diff = JSON.parse(diffJson) as DiffEntry[]
      addRev.mutate({ changeRequestId, entityType, entityId, entityName, diff })
    } catch {
      alert('Некорректный JSON в поле diff')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Добавить ревизию</DialogTitle>
          <DialogDescription>Опишите, что именно изменилось в конкретной сущности.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Тип сущности</label>
              <Select
                value={entityType}
                onChange={e => setEntityType(e.target.value)}
                options={[
                  { value: 'policy', label: 'Политика' },
                  { value: 'group', label: 'Группа' },
                  { value: 'automation', label: 'Автоматизация' },
                  { value: 'task', label: 'Задача' },
                  { value: 'discovery', label: 'Опрос сети' },
                  { value: 'other', label: 'Другое' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Название *</label>
              <Input value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="Политика KESL — Прод" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ID сущности</label>
            <Input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="cuid или произвольный ключ" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Diff (JSON)</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              rows={6}
              value={diffJson}
              onChange={e => setDiffJson(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Формат: <code>[{`{"field":"имя","before":"было","after":"стало"}`}]</code></p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!entityName.trim() || addRev.isPending} onClick={submit}>
            {addRev.isPending ? 'Добавление…' : 'Добавить ревизию'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add approval dialog ──────────────────────────────────────────────────────

function AddApprovalDialog({
  open, onOpenChange, changeRequestId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; changeRequestId: string; onSaved: () => void }) {
  const [approverId, setApproverId] = useState('')
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [comment, setComment] = useState('')

  const add = trpc.changeRequests.addApproval.useMutation({
    onSuccess: () => { onSaved(); onOpenChange(false); setApproverId(''); setComment('') },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Решение по заявке</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Утверждающий *</label>
            <Input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="Петров П.П." />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Решение</label>
            <div className="flex gap-2">
              {(['approved', 'rejected'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecision(d)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                    decision === d
                      ? d === 'approved' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-input text-muted-foreground hover:bg-muted',
                  )}
                >
                  {d === 'approved' ? '✓ Утвердить' : '✗ Отклонить'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Комментарий</label>
            <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!approverId.trim() || add.isPending}
            variant={decision === 'rejected' ? 'destructive' : 'default'}
            onClick={() => add.mutate({ changeRequestId, approverId, decision, comment: comment || undefined })}
          >
            {add.isPending ? 'Сохранение…' : 'Зафиксировать решение'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ id, onClose, onRefreshList }: { id: string; onClose: () => void; onRefreshList: () => void }) {
  const [addRevOpen, setAddRevOpen] = useState(false)
  const [addApprovalOpen, setAddApprovalOpen] = useState(false)

  const { data: rawDetail, refetch } = trpc.changeRequests.get.useQuery({ id })
  const detail = rawDetail as CRDetail | undefined

  const transition = trpc.changeRequests.transition.useMutation({
    onSuccess: () => { void refetch(); onRefreshList() },
  })

  if (!detail) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Загрузка…</div>
  )

  const statusCfg = STATUS_CFG[detail.status]
  const StatusIcon = statusCfg.icon
  const actions = ACTIONS[detail.status]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant={statusCfg.variant} className="flex items-center gap-1 text-xs">
              <StatusIcon className={cn('h-3 w-3', statusCfg.color)} />
              {statusCfg.label}
            </Badge>
            {detail.relatedTicket && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{detail.relatedTicket}</span>
            )}
          </div>
          <h2 className="text-base font-semibold leading-snug">{detail.title}</h2>
          {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}
          <p className="text-xs text-muted-foreground">Автор: {detail.authorId} · {new Date(detail.createdAt).toLocaleDateString('ru-RU')}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 px-5 py-4">
          {/* Workflow actions */}
          {actions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Действия</p>
              <div className="flex flex-wrap gap-2">
                {actions.map(a => {
                  const Icon = a.icon
                  return (
                    <Button
                      key={a.toStatus}
                      size="sm"
                      variant={a.variant}
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: detail.id, toStatus: a.toStatus })}
                    >
                      <Icon className="mr-1.5 h-3.5 w-3.5" />
                      {a.label}
                    </Button>
                  )
                })}
                {(detail.status === 'in_review' || detail.status === 'approved') && (
                  <Button size="sm" variant="outline" onClick={() => setAddApprovalOpen(true)}>
                    <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                    Зафиксировать решение
                  </Button>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Revisions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ревизии ({detail.revisions.length})
              </p>
              {detail.status === 'draft' && (
                <Button size="sm" variant="outline" onClick={() => setAddRevOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Добавить
                </Button>
              )}
            </div>
            {detail.revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет ревизий — добавьте, что именно изменилось.</p>
            ) : (
              <div className="space-y-2">
                {detail.revisions.map(rev => (
                  <div key={rev.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{rev.entityName}</span>
                      <Badge variant="outline" className="text-[10px]">{rev.entityType}</Badge>
                    </div>
                    <DiffViewer diff={(rev.diff as DiffEntry[]) ?? []} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Approvals */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Решения ({detail.approvals.length})
            </p>
            {detail.approvals.length === 0 ? (
              <p className="text-xs text-muted-foreground">Решений нет.</p>
            ) : (
              <div className="space-y-2">
                {detail.approvals.map(a => (
                  <div key={a.id} className={cn(
                    'flex items-start gap-3 rounded-lg border p-3',
                    a.decision === 'approved' && 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10',
                    a.decision === 'rejected' && 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10',
                  )}>
                    <div className="mt-0.5">
                      {a.decision === 'approved'
                        ? <ThumbsUp className="h-4 w-4 text-green-600" />
                        : <ThumbsDown className="h-4 w-4 text-red-500" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.approverId}</p>
                      {a.comment && <p className="text-sm text-muted-foreground">{a.comment}</p>}
                      {a.decidedAt && (
                        <p className="text-xs text-muted-foreground">{new Date(a.decidedAt).toLocaleString('ru-RU')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <AddRevisionDialog
        open={addRevOpen}
        onOpenChange={setAddRevOpen}
        changeRequestId={detail.id}
        onSaved={() => void refetch()}
      />
      <AddApprovalDialog
        open={addApprovalOpen}
        onOpenChange={setAddApprovalOpen}
        changeRequestId={detail.id}
        onSaved={() => void refetch()}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ALL_STATUSES: CRStatus[] = ['draft', 'in_review', 'approved', 'applied', 'rejected', 'rolled_back']

export function ChangeRequestsPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<CRStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: environments } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  const { data: rawList, refetch } = trpc.changeRequests.list.useQuery(
    { environmentId: activeEnvId, status: filterStatus || undefined },
    { enabled: !!activeEnvId },
  )
  const list = (rawList as CRSummary[] | undefined) ?? []

  const deleteReq = trpc.changeRequests.delete.useMutation({
    onSuccess: () => { void refetch(); if (selectedId) setSelectedId(null) },
  })

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
        {/* Status filter tabs */}
        <div className="flex overflow-hidden rounded-md border border-input text-xs">
          <button
            type="button"
            onClick={() => setFilterStatus('')}
            className={cn('px-3 py-1.5 transition-colors', filterStatus === '' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            Все
          </button>
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CFG[s]
            const Icon = cfg.icon
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 transition-colors',
                  filterStatus === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!activeEnvId}>
          <Plus className="mr-1.5 h-4 w-4" />
          Новая заявка
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: list */}
        <div className={cn('flex flex-col border-r', selectedId ? 'w-80 shrink-0' : 'flex-1')}>
          <ScrollArea className="flex-1">
            {list.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                {activeEnvId ? 'Заявок нет.' : 'Выберите среду.'}
              </div>
            ) : (
              <div>
                {list.map((cr, idx) => {
                  const cfg = STATUS_CFG[cr.status]
                  const Icon = cfg.icon
                  const isSelected = selectedId === cr.id
                  return (
                    <div key={cr.id}>
                      {idx > 0 && <Separator />}
                      <button
                        type="button"
                        onClick={() => setSelectedId(prev => prev === cr.id ? null : cr.id)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                          isSelected && 'bg-primary/5',
                        )}
                      >
                        <div className={cn('mt-0.5 shrink-0', cfg.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-sm font-medium">{cr.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{cr.authorId}</span>
                            {cr.relatedTicket && <span className="font-mono">{cr.relatedTicket}</span>}
                            <span>·</span>
                            <span>{cr._count.revisions} рев.</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(cr.createdAt).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                        {(cr.status === 'draft' || cr.status === 'rejected') && (
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={e => { e.stopPropagation(); deleteReq.mutate({ id: cr.id }) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isSelected && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: detail */}
        {selectedId && (
          <div className="flex-1 overflow-hidden">
            <DetailPanel
              id={selectedId}
              onClose={() => setSelectedId(null)}
              onRefreshList={() => void refetch()}
            />
          </div>
        )}
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        environmentId={activeEnvId}
        onCreated={() => void refetch()}
      />
    </div>
  )
}
