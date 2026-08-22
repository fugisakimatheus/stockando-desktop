import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { FileSpreadsheetIcon, FileTextIcon } from 'lucide-react'
import { match } from 'ts-pattern'

type ExportFormat = 'csv' | 'pdf'

interface ExportFormatSelectorProps {
  value: ExportFormat
  onChange: (format: ExportFormat) => void
  onExport?: () => void
  isExporting?: boolean
  className?: string
}

const FORMAT_OPTIONS: { format: ExportFormat; label: string; description: string; icon: typeof FileTextIcon }[] = [
  {
    format: 'csv',
    label: 'CSV',
    description: 'Planilha compatível com Excel',
    icon: FileSpreadsheetIcon
  },
  {
    format: 'pdf',
    label: 'PDF',
    description: 'Documento formatado para impressão',
    icon: FileTextIcon
  }
]

function getFormatLabel(format: ExportFormat): string {
  return match(format)
    .with('csv', () => 'CSV')
    .with('pdf', () => 'PDF')
    .exhaustive()
}

function ExportFormatSelector({
  value,
  onChange,
  onExport,
  isExporting = false,
  className
}: ExportFormatSelectorProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-2 gap-2">
        {FORMAT_OPTIONS.map((option) => {
          const isSelected = value === option.format
          const Icon = option.icon

          return (
            <button
              key={option.format}
              type="button"
              onClick={() => onChange(option.format)}
              aria-pressed={isSelected}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all',
                isSelected
                  ? 'border-primary/30 bg-primary/8 shadow-[0_4px_12px_rgba(15,23,42,0.06)] dark:border-primary/40 dark:bg-primary/12'
                  : 'border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 hover:border-primary/20 hover:bg-primary/5 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:hover:border-primary/25'
              )}
            >
              <Icon
                className={cn('size-5', isSelected ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className={cn('text-sm font-medium', isSelected ? 'text-primary' : 'text-foreground')}>
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </button>
          )
        })}
      </div>

      {onExport && (
        <Button
          variant="default"
          size="lg"
          onPress={onExport}
          isLoading={isExporting}
          isDisabled={isExporting}
          className="w-full"
        >
          Exportar como {getFormatLabel(value)}
        </Button>
      )}
    </div>
  )
}

export { ExportFormatSelector, getFormatLabel }
export type { ExportFormatSelectorProps, ExportFormat }
