import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 w-max max-w-xs rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
            positionClasses[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export { Tooltip }
