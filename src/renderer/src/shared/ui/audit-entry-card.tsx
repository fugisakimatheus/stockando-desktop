import { cn } from '@shared/lib/cn'
import { HistoryIcon, UserIcon } from 'lucide-react'

interface AuditEntry {
  action: string
  entityType: string
  entityId: string
  userName: string | null
  createdAt: string
  details: Record<string, unknown> | null
}

interface AuditEntryCardProps {
  entry: AuditEntry
  className?: string
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'agora mesmo'
  if (diffMinutes < 60) return `há ${diffMinutes} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays}d`

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/:/g, ' → ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function AuditEntryCard({ entry, className }: AuditEntryCardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 text-sm dark:border-white/5 dark:bg-card/30',
        className
      )}
    >
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 dark:bg-muted/40">
        <HistoryIcon className="size-3.5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium text-foreground">{formatActionLabel(entry.action)}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {entry.userName && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="size-3" />
              {entry.userName}
            </span>
          )}
          <span className="text-border">·</span>
          <span className="truncate">
            {entry.entityType} #{entry.entityId}
          </span>
        </div>
      </div>
    </div>
  )
}

export { AuditEntryCard, formatRelativeTime }
export type { AuditEntryCardProps, AuditEntry }
