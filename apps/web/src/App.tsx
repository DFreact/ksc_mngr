import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient } from '@/lib/trpc'
import { GroupsPage } from '@/pages/GroupsPage'
import { PoliciesPage } from '@/pages/PoliciesPage'
import { ComparisonPage } from '@/pages/ComparisonPage'
import { TasksPage } from '@/pages/TasksPage'
import { AutomationsPage } from '@/pages/AutomationsPage'
import { DiscoveryPage } from '@/pages/DiscoveryPage'
import { ChangeRequestsPage } from '@/pages/ChangeRequestsPage'
import { InfrastructurePage } from '@/pages/InfrastructurePage'
import { CoveragePage } from '@/pages/CoveragePage'
import { Shield, Layers, Settings, BookOpen, GitCompare, ListChecks, Zap, Radar, GitPullRequest, Server, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
  component: React.ReactNode
}

const navItems: NavItem[] = [
  {
    id: 'groups',
    label: 'Группы',
    icon: <Layers className="h-5 w-5" />,
    component: <GroupsPage />,
  },
  {
    id: 'policies',
    label: 'Политики',
    icon: <Shield className="h-5 w-5" />,
    component: <PoliciesPage />,
  },
  {
    id: 'compare',
    label: 'Сравнение',
    icon: <GitCompare className="h-5 w-5" />,
    component: <ComparisonPage />,
  },
  {
    id: 'tasks',
    label: 'Задачи',
    icon: <ListChecks className="h-5 w-5" />,
    component: <TasksPage />,
  },
  {
    id: 'automations',
    label: 'Автоматизации',
    icon: <Zap className="h-5 w-5" />,
    component: <AutomationsPage />,
  },
  {
    id: 'discovery',
    label: 'Обнаружение',
    icon: <Radar className="h-5 w-5" />,
    component: <DiscoveryPage />,
  },
  {
    id: 'changes',
    label: 'Изменения',
    icon: <GitPullRequest className="h-5 w-5" />,
    component: <ChangeRequestsPage />,
  },
  {
    id: 'infrastructure',
    label: 'Инфраструктура',
    icon: <Server className="h-5 w-5" />,
    component: <InfrastructurePage />,
  },
  {
    id: 'coverage',
    label: 'Покрытие атак',
    icon: <Target className="h-5 w-5" />,
    component: <CoveragePage />,
  },
  {
    id: 'catalog',
    label: 'Каталоги',
    icon: <Settings className="h-5 w-5" />,
    component: (
      <Placeholder title="Каталоги параметров" description="Справочники ParameterCatalog, EventCatalog, DeviceTypeCatalog." />
    ),
  },
  {
    id: 'docs',
    label: 'Документы',
    icon: <BookOpen className="h-5 w-5" />,
    component: (
      <Placeholder title="Документация" description="Change Management, DocumentCard и генерируемые отчёты — шаги 5-7." />
    ),
  },
]

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function AppShell() {
  const [activeId, setActiveId] = useState('groups')
  const active = navItems.find(n => n.id === activeId)!

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-16 flex-col border-r bg-card">
        <div className="flex h-14 items-center justify-center border-b">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 py-2">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => setActiveId(item.id)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                activeId === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {item.icon}
            </button>
          ))}
        </nav>
        <div className="border-t p-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
            KSC
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b px-6">
          <h2 className="text-base font-medium">{active.label}</h2>
        </header>
        <div className="flex-1 overflow-auto">{active.component}</div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </trpc.Provider>
  )
}
