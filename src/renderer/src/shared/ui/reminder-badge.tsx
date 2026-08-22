import { cn } from '@shared/lib/cn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReminderBadgeProps {
  count: number
  className?: string
}

// ---------------------------------------------------------------------------
// ReminderBadge
// ---------------------------------------------------------------------------

function ReminderBadge({ count, className }: ReminderBadgeProps): React.JSX.Element | null {
  if (count <= 0) return null

  return (
    <span
      data-slot="reminder-badge"
      aria-label={`${count} lembrete${count > 1 ? 's' : ''} ativo${count > 1 ? 's' : ''}`}
      className={cn(
        'inline-flex size-5 animate-in items-center justify-center rounded-full bg-gradient-to-br from-destructive to-destructive/80 text-[10px] font-semibold text-destructive-foreground shadow-[0_2px_8px_rgba(15,23,42,0.12)] zoom-in-75 fade-in',
        count > 0 && 'animate-pulse',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export { ReminderBadge }
export type { ReminderBadgeProps }
