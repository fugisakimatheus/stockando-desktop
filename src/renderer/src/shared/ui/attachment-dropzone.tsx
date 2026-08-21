import { cn } from '@shared/lib/cn'
import { UploadCloudIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

interface FileSelection {
  fileName: string
  filePath: string
  mimeType: string
}

interface AttachmentDropzoneProps {
  onFileSelect: (file: FileSelection) => void
  maxSizeMB?: number
  className?: string
}

const DEFAULT_MAX_SIZE_MB = 10

function AttachmentDropzone({
  onFileSelect,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  className
}: AttachmentDropzoneProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxSizeBytes = maxSizeMB * 1024 * 1024

  const processFile = useCallback(
    (file: File) => {
      setError(null)

      if (file.size > maxSizeBytes) {
        setError(`O arquivo excede o limite de ${maxSizeMB} MB.`)
        return
      }

      onFileSelect({
        fileName: file.name,
        filePath: (file as File & { path?: string }).path ?? file.name,
        mimeType: file.type || 'application/octet-stream'
      })
    },
    [maxSizeBytes, maxSizeMB, onFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        processFile(file)
      }
      // Reset input to allow re-selecting the same file
      e.target.value = ''
    },
    [processFile]
  )

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Área para selecionar ou arrastar arquivo"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-colors',
          isDragOver
            ? 'border-primary/60 bg-primary/5 dark:border-primary/40 dark:bg-primary/10'
            : 'border-border/70 bg-muted/20 hover:border-primary/40 hover:bg-muted/40 dark:border-white/10 dark:bg-muted/10 dark:hover:border-primary/30 dark:hover:bg-muted/20'
        )}
      >
        <UploadCloudIcon
          className={cn('size-8 transition-colors', isDragOver ? 'text-primary' : 'text-muted-foreground')}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Arraste um arquivo ou clique para selecionar</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Tamanho máximo: {maxSizeMB} MB</p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <input ref={inputRef} type="file" className="hidden" onChange={handleInputChange} aria-hidden="true" />
    </div>
  )
}

export { AttachmentDropzone }
export type { AttachmentDropzoneProps, FileSelection }
