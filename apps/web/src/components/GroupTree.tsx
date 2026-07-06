import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Shield, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { GroupTreeNode } from '@ksc/domain'

interface GroupTreeItemProps {
  node: GroupTreeNode
  depth?: number
  selectedId?: string
  onSelect?: (node: GroupTreeNode) => void
}

function GroupTreeItem({ node, depth = 0, selectedId, onSelect }: GroupTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedId

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent text-accent-foreground font-medium',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) setExpanded(v => !v)
          onSelect?.(node)
        }}
      >
        {hasChildren ? (
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {expanded && hasChildren ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="flex-1 truncate text-left">{node.name}</span>

        <span className="flex shrink-0 gap-1">
          {node.agentPolicyId && (
            <Bot className="h-3.5 w-3.5 text-blue-500" aria-label="Политика агента" />
          )}
          {node.keslPolicyId && (
            <Shield className="h-3.5 w-3.5 text-green-600" aria-label="Политика KESL" />
          )}
        </span>
      </button>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child: GroupTreeNode) => (
            <GroupTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface GroupTreeProps {
  nodes: GroupTreeNode[]
  selectedId?: string
  onSelect?: (node: GroupTreeNode) => void
  className?: string
}

export function GroupTree({ nodes, selectedId, onSelect, className }: GroupTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-6 text-sm text-muted-foreground', className)}>
        Групп нет — создайте первую среду
      </div>
    )
  }

  return (
    <div className={cn('space-y-0.5', className)}>
      {nodes.map(node => (
        <GroupTreeItem
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

export type { GroupTreeNode }
