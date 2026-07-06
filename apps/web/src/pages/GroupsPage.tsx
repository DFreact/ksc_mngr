import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { GroupTree } from '@/components/GroupTree'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Layers, Plus, RefreshCw, Shield, Bot, Pencil, Trash2, FolderPlus } from 'lucide-react'
import type { GroupTreeNode } from '@/components/GroupTree'

export function GroupsPage() {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<GroupTreeNode | null>(null)

  // Dialog state
  const [addChildOpen, setAddChildOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renameDraft, setRenameDraft] = useState('')

  const { data: environments, isLoading: envsLoading } = trpc.groups.listEnvironments.useQuery()
  const activeEnvId = selectedEnvId ?? environments?.[0]?.id ?? ''

  const { data: tree, isLoading: treeLoading, refetch } = trpc.groups.tree.useQuery(
    { environmentId: activeEnvId },
    { enabled: !!activeEnvId },
  )

  const createEnv = trpc.groups.createEnvironment.useMutation({
    onSuccess: d => setSelectedEnvId(d.id),
  })
  const createGroup = trpc.groups.createGroup.useMutation()
  const renameGroup = trpc.groups.renameGroup.useMutation()
  const deleteGroup = trpc.groups.deleteGroup.useMutation()
  const utils = trpc.useUtils()

  function invalidateTree() {
    void utils.groups.tree.invalidate({ environmentId: activeEnvId })
  }

  function handleAddChild() {
    if (!selectedGroup || !newGroupName.trim()) return
    createGroup.mutate(
      { environmentId: activeEnvId, parentId: selectedGroup.id, name: newGroupName.trim() },
      {
        onSuccess: () => {
          setAddChildOpen(false)
          setNewGroupName('')
          invalidateTree()
        },
      },
    )
  }

  function handleRename() {
    if (!selectedGroup || !renameDraft.trim()) return
    renameGroup.mutate(
      { groupId: selectedGroup.id, name: renameDraft.trim() },
      {
        onSuccess: () => {
          setRenameOpen(false)
          invalidateTree()
        },
      },
    )
  }

  function handleDelete() {
    if (!selectedGroup) return
    deleteGroup.mutate(
      { groupId: selectedGroup.id },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false)
          setSelectedGroup(null)
          invalidateTree()
        },
      },
    )
  }

  const activeEnv = environments?.find(e => e.id === activeEnvId)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Группы администрирования</h1>
          <p className="text-sm text-muted-foreground">Дерево групп KSC — структура и политики</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={treeLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${treeLoading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      <Separator />

      {/* Environment switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Среда:</span>
        {envsLoading ? (
          <span className="text-sm text-muted-foreground">Загрузка…</span>
        ) : environments?.length === 0 ? (
          <Button
            size="sm"
            onClick={() => createEnv.mutate({ name: 'Основная', description: 'Основная организация' })}
            disabled={createEnv.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Создать среду
          </Button>
        ) : (
          <>
            {environments?.map(env => (
              <Badge
                key={env.id}
                variant={env.id === activeEnvId ? 'default' : 'outline'}
                className="cursor-pointer select-none"
                onClick={() => {
                  setSelectedEnvId(env.id)
                  setSelectedGroup(null)
                }}
              >
                {env.name}
              </Badge>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                const name = prompt('Название новой среды:')
                if (name) createEnv.mutate({ name })
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Tree panel */}
        <Card className="flex w-72 shrink-0 flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              {activeEnv?.name ?? 'Группы'}
            </CardTitle>
            <CardDescription className="text-xs">
              <Bot className="mr-1 inline h-3 w-3 text-blue-500" />Агент&nbsp;&nbsp;
              <Shield className="mr-1 inline h-3 w-3 text-green-600" />KESL
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 pb-4">
            <ScrollArea className="h-full px-3">
              {treeLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Загрузка…
                </div>
              ) : (
                <GroupTree
                  nodes={tree ?? []}
                  selectedId={selectedGroup?.id}
                  onSelect={setSelectedGroup}
                />
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="flex-1">
          {selectedGroup ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selectedGroup.name}</CardTitle>
                    {selectedGroup.description && (
                      <CardDescription>{selectedGroup.description}</CardDescription>
                    )}
                  </div>
                  {/* Group action buttons */}
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      title="Добавить дочернюю группу"
                      onClick={() => { setNewGroupName(''); setAddChildOpen(true) }}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      title="Переименовать"
                      onClick={() => { setRenameDraft(selectedGroup.name); setRenameOpen(true) }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      title="Удалить группу"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">ID</span>
                    <p className="mt-1 font-mono text-xs">{selectedGroup.id}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Дочерних групп</span>
                    <p className="mt-1">{selectedGroup.children.length}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Политика агента</span>
                    <p className="mt-1">
                      {selectedGroup.agentPolicyId ? (
                        <Badge variant="secondary">
                          <Bot className="mr-1 h-3 w-3" />Привязана
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Политика KESL</span>
                    <p className="mt-1">
                      {selectedGroup.keslPolicyId ? (
                        <Badge variant="secondary">
                          <Shield className="mr-1 h-3 w-3" />Привязана
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Редактор политик доступен на вкладке «Политики» в боковом меню.
                </p>
              </CardContent>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Layers className="h-12 w-12 opacity-20" />
              <p className="text-sm">Выберите группу в дереве слева</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <Dialog open={addChildOpen} onOpenChange={setAddChildOpen}>
        <DialogContent onClose={() => setAddChildOpen(false)}>
          <DialogHeader>
            <DialogTitle>Добавить дочернюю группу</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Название группы"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddChild()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChildOpen(false)}>Отмена</Button>
            <Button disabled={!newGroupName.trim() || createGroup.isPending} onClick={handleAddChild}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent onClose={() => setRenameOpen(false)}>
          <DialogHeader>
            <DialogTitle>Переименовать группу</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameDraft}
            onChange={e => setRenameDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Отмена</Button>
            <Button disabled={!renameDraft.trim() || renameGroup.isPending} onClick={handleRename}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent onClose={() => setDeleteConfirmOpen(false)}>
          <DialogHeader>
            <DialogTitle>Удалить группу?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Группа «{selectedGroup?.name}» и все её дочерние группы будут удалены. Это действие необратимо.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={deleteGroup.isPending}
              onClick={handleDelete}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
