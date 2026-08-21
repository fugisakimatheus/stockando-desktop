import { useAttachments, useDeleteAttachment, useUploadAttachment } from '@shared/hooks/use-attachments'
import { cn } from '@shared/lib/cn'
import { ChevronDownIcon, ChevronUpIcon, PaperclipIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { FileSelection } from './attachment-dropzone'
import { AttachmentDropzone } from './attachment-dropzone'
import { AttachmentList } from './attachment-list'
import { Button } from './button'
import { Spinner } from './spinner'

interface AttachmentPanelProps {
  companyId: number
  entityType: string
  entityId: string
  className?: string
}

function AttachmentPanel({ companyId, entityType, entityId, className }: AttachmentPanelProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const attachmentsQuery = useAttachments(companyId, entityType, entityId)
  const uploadMutation = useUploadAttachment(companyId)
  const deleteMutation = useDeleteAttachment(companyId)

  const attachments = attachmentsQuery.data ?? []
  const isLoading = attachmentsQuery.isLoading
  const attachmentCount = attachments.length

  function handleFileSelect(file: FileSelection): void {
    uploadMutation.mutate(
      {
        entityType,
        entityId,
        fileName: file.fileName,
        filePath: file.filePath,
        mimeType: file.mimeType
      },
      {
        onSuccess: () => {
          toast.success('Anexo enviado com sucesso')
        },
        onError: () => {
          toast.error('Erro ao enviar anexo. Tente novamente.')
        }
      }
    )
  }

  function handleDelete(id: number): void {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Anexo excluído com sucesso')
      },
      onError: () => {
        toast.error('Erro ao excluir anexo. Tente novamente.')
      }
    })
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/50 p-4 dark:border-white/10 dark:bg-card/30',
        className
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            Anexos
            {attachmentCount > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({attachmentCount})</span>}
          </h3>
        </div>

        <Button variant="ghost" size="sm" onPress={() => setExpanded(!expanded)}>
          {expanded ? (
            <>
              <ChevronUpIcon className="size-3.5" />
              <span className="ml-1">Recolher</span>
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3.5" />
              <span className="ml-1">Expandir</span>
            </>
          )}
        </Button>
      </div>

      {/* Content - shown only when expanded */}
      {expanded && (
        <div className="space-y-4">
          {/* Dropzone for upload */}
          <AttachmentDropzone onFileSelect={handleFileSelect} />

          {/* Upload loading indicator */}
          {uploadMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              <span>Enviando arquivo...</span>
            </div>
          )}

          {/* Attachments list */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Spinner className="size-5" />
            </div>
          )}

          {!isLoading && <AttachmentList attachments={attachments} onDelete={handleDelete} />}
        </div>
      )}

      {/* Collapsed summary */}
      {!expanded && !isLoading && attachmentCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {attachmentCount} {attachmentCount === 1 ? 'arquivo anexado' : 'arquivos anexados'}
        </p>
      )}

      {!expanded && !isLoading && attachmentCount === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum anexo. Expanda para adicionar arquivos.</p>
      )}
    </div>
  )
}

export { AttachmentPanel }
export type { AttachmentPanelProps }
