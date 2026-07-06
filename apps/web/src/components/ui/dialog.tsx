import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Close on Escape key
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  )
}

interface DialogContentProps {
  className?: string
  children: React.ReactNode
  onClose?: () => void
}

function DialogContent({ className, children, onClose }: DialogContentProps) {
  return (
    <div
      className={cn(
        'relative z-50 grid w-full max-w-lg gap-4 rounded-lg border bg-background p-6 shadow-lg',
        'animate-in fade-in-0 zoom-in-95',
        className,
      )}
      onClick={e => e.stopPropagation()}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Закрыть</span>
        </button>
      )}
      {children}
    </div>
  )
}

function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col space-y-1.5', className)}>{children}</div>
}

function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)}>{children}</h2>
}

function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}

function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}>
      {children}
    </div>
  )
}

// Convenience trigger wrapper — just a slot, state is managed by parent
function DialogTrigger({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <span onClick={onClick}>{children}</span>
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, Button }
