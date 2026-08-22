import { cn } from '@shared/lib/cn'
import { AlertCircleIcon, CalendarIcon, CheckIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from './button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReminderStatus = 'active' | 'dismissed' | 'completed'

interface ReminderListItem {
  id: number
  entityType: string
  entityId: string
  entitySummary: string
  message: string
  dueDate: string
  status: ReminderStatus
  ruleId: number | null
  createdAt: string
}

interface ReminderCardProps {
  reminder: ReminderListItem
  onDismiss?: (id: number) => void
  onComplete?: (id: number) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(isoDate: string): { label: string; isOverdue: boolean } {
  const now = new Date()
  const due = new Date(isoDate)
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays)
    return {
      label: absDays === 1 ? '1 dia atrasado' : `${absDays} dias atrasado`,
      isOverdue: true
    }
  }

  if (diffDays === 0) {
    return { label: 'Vence hoje', isOverdue: false }
  }

  if (diffDays === 1) {
    return { label: 'Vence amanhã', isOverdue: false }
  }

  return { label: `Vence em ${diffDays} dias`, isOverdue: false }
}

// ---------------------------------------------------------------------------
// ReminderCard
// ---------------------------------------------------------------------------

function ReminderCard({ reminder, onDismiss, onComplete, className }: ReminderCardProps): React.JSX.Element {
  const { label: dueDateLabel, isOverdue } = useMemo(() => formatRelativeDate(reminder.dueDate), [reminder.dueDate])

  return (
    <div
      data-slot="reminder-card"
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-3 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.16)]',
        isOverdue && 'border-destructive/30 dark:border-destructive/40',
        className
      )}
    >
      {/* Entity context + due date */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{reminder.entitySummary}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="capitalize">{reminder.entityType}</span>
        </div>

        <div
          className={cn(
            'flex shrink-0 items-center gap-1 text-xs',
            isOverdue ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {isOverdue ? <AlertCircleIcon className="size-3" /> : <CalendarIcon className="size-3" />}
          <span>{dueDateLabel}</span>
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-foreground/90">{reminder.message}</p>

      {/* Actions */}
      {reminder.status === 'active' && (onDismiss || onComplete) ? (
        <div className="flex items-center gap-2 pt-1">
          {onComplete ? (
            <Button
              variant="secondary"
              size="xs"
              onPress={() => onComplete(reminder.id)}
              aria-label="Concluir lembrete"
            >
              <CheckIcon data-icon="inline-start" className="size-3" />
              Concluir
            </Button>
          ) : null}
          {onDismiss ? (
            <Button variant="ghost" size="xs" onPress={() => onDismiss(reminder.id)} aria-label="Dispensar lembrete">
              <XIcon data-icon="inline-start" className="size-3" />
              Dispensar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export { ReminderCard }
export type { ReminderCardProps, ReminderListItem }
