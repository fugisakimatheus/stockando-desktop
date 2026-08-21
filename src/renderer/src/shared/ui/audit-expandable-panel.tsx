import { useAuditHistory, useAuditPreview } from '@shared/hooks/use-audit'
import { cn } from '@shared/lib/cn'
import { ChevronDownIcon, ChevronUpIcon, HistoryIcon } from 'lucide-react'
import { useState } from 'react'

import { AuditEntryCard } from './audit-entry-card'
import { Button } from './button'
import { Spinner } from './spinner'

interface AuditExpandablePanelProps {
  companyId: number
  entityType: string
  entityId: string
  className?: string
}

const PAGE_SIZE = 10

function AuditExpandablePanel({
  companyId,
  entityType,
  entityId,
  className
}: AuditExpandablePanelProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [offset, setOffset] = useState(0)

  const previewQuery = useAuditPreview(companyId, entityType, entityId)
  const historyQuery = useAuditHistory(companyId, entityType, entityId, {
    limit: PAGE_SIZE,
    offset
  })

  const isPreviewLoading = previewQuery.isLoading
  const previewEntries = previewQuery.data ?? []

  const historyEntries = historyQuery.data?.data ?? []
  const historyTotal = historyQuery.data?.total ?? 0
  const isHistoryLoading = historyQuery.isLoading

  const entries = expanded ? historyEntries : previewEntries
  const hasMore = expanded && offset + PAGE_SIZE < historyTotal

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/50 p-4 dark:border-white/10 dark:bg-card/30',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Histórico de Alterações</h3>
        </div>

        {previewEntries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setExpanded(!expanded)
              setOffset(0)
            }}
          >
            {expanded ? (
              <>
                <ChevronUpIcon className="size-3.5" />
                <span className="ml-1">Recolher</span>
              </>
            ) : (
              <>
                <ChevronDownIcon className="size-3.5" />
                <span className="ml-1">Ver tudo</span>
              </>
            )}
          </Button>
        )}
      </div>

      {isPreviewLoading && (
        <div className="flex items-center justify-center py-4">
          <Spinner className="size-5" />
        </div>
      )}

      {!isPreviewLoading && entries.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
      )}

      {!isPreviewLoading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <AuditEntryCard
              key={entry.id}
              entry={{
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                userName: entry.userName,
                createdAt: entry.createdAt,
                details: entry.details
              }}
            />
          ))}
        </div>
      )}

      {expanded && isHistoryLoading && (
        <div className="mt-3 flex items-center justify-center">
          <Spinner className="size-4" />
        </div>
      )}

      {expanded && !isHistoryLoading && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {Math.min(offset + PAGE_SIZE, historyTotal)} de {historyTotal} registros
          </span>
          <div className="flex gap-2">
            {offset > 0 && (
              <Button variant="outline" size="sm" onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Anterior
              </Button>
            )}
            {hasMore && (
              <Button variant="outline" size="sm" onPress={() => setOffset(offset + PAGE_SIZE)}>
                Próximos
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { AuditExpandablePanel }
export type { AuditExpandablePanelProps }
