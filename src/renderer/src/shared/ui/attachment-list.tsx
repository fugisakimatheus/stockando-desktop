import { cn } from '@shared/lib/cn'
import { FileIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { Button } from './button'
import { ConfirmDialog } from './confirm-dialog'

interface AttachmentRecord {
  id: number
  entityType: string
  entityId: string
  fileName: string
  filePath: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string
}

interface AttachmentListProps {
  attachments: AttachmentRecord[]
  onDelete?: (id: number) => void
  className?: string
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileTypeLabel(mimeType: string | null): string {
  if (!mimeType) return 'Arquivo'
  if (mimeType.startsWith('image/')) return 'Imagem'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('xml')) return 'XML'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Planilha'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Documento'
  return 'Arquivo'
}

function AttachmentList({ attachments, onDelete, className }: AttachmentListProps): React.JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  return (
    <>
      <div className={cn('space-y-1.5', className)}>
        {attachments.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">Nenhum anexo encontrado.</p>
        )}

        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-sm dark:border-white/5 dark:bg-card/30"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 dark:bg-muted/40">
              <FileIcon className="size-4 text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{attachment.fileName}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{getFileTypeLabel(attachment.mimeType)}</span>
                <span className="text-border">·</span>
                <span>{formatFileSize(attachment.fileSize)}</span>
              </div>
            </div>

            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Excluir ${attachment.fileName}`}
                onPress={() => setDeleteTarget(attachment.id)}
                className="shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2Icon className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Excluir anexo"
        description="Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget !== null && onDelete) {
            onDelete(deleteTarget)
          }
          setDeleteTarget(null)
        }}
      />
    </>
  )
}

export { AttachmentList, formatFileSize }
export type { AttachmentListProps, AttachmentRecord as AttachmentListRecord }
