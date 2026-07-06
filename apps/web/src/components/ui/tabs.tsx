import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
}
const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('Tabs component must wrap TabsList / TabsContent')
  return ctx
}

interface TabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const active = value ?? internal
  const setActive = (tab: string) => {
    setInternal(tab)
    onValueChange?.(tab)
  }
  return (
    <TabsContext.Provider value={{ activeTab: active, setActiveTab: setActive }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  className?: string
  children: React.ReactNode
  disabled?: boolean
}

function TabsTrigger({ value, className, children, disabled }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabs()
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === value}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        activeTab === value
          ? 'bg-background text-foreground shadow-sm'
          : 'hover:bg-background/50',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  className?: string
  children: React.ReactNode
}

function TabsContent({ value, className, children }: TabsContentProps) {
  const { activeTab } = useTabs()
  if (activeTab !== value) return null
  return <div className={cn('mt-2', className)}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
