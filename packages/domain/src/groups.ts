// Minimal interface matching the Prisma AdministrationGroup model.
// Domain layer must not import from @prisma/client directly.
interface Group {
  id: string
  name: string
  description: string | null
  parentId: string | null
  agentPolicyId: string | null
  keslPolicyId: string | null
}

export interface GroupTreeNode {
  id: string
  name: string
  description: string | null
  agentPolicyId: string | null
  keslPolicyId: string | null
  children: GroupTreeNode[]
}

/**
 * Build an in-memory tree from a flat list of groups.
 * All groups must belong to the same environment.
 */
export function buildGroupTree(groups: Group[]): GroupTreeNode[] {
  const byId = new Map<string, GroupTreeNode>(
    groups.map(g => [
      g.id,
      {
        id: g.id,
        name: g.name,
        description: g.description,
        agentPolicyId: g.agentPolicyId,
        keslPolicyId: g.keslPolicyId,
        children: [],
      },
    ]),
  )

  const roots: GroupTreeNode[] = []
  for (const g of groups) {
    const node = byId.get(g.id)!
    if (g.parentId && byId.has(g.parentId)) {
      byId.get(g.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
