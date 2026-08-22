import { cn } from '@shared/lib/cn'
import { AlertCircleIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

import { Tooltip, TooltipTrigger } from './tooltip'

interface ImportRowError {
  column: string
  message: string
}

interface ImportRowValidation {
  rowNumber: number
  status: 'valid' | 'invalid'
  data: Record<string, string>
  errors: ImportRowError[]
}

interface ImportPreviewProps extends ComponentPropsWithoutRef<'div'> {
  rows: ImportRowValidation[]
  columns: string[]
}

function ImportPreview({ rows, columns, className, ...props }: ImportPreviewProps) {
  return (
    <div
      data-slot="import-preview"
      className={cn('overflow-hidden rounded-2xl border border-border/70 bg-background', className)}
      {...props}
    >
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/60 backdrop-blur-sm dark:bg-muted/40">
            <tr>
              <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">#</th>
              <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap text-foreground">
                Status
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground"
                >
                  {col}
                </th>
              ))}
              <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className={cn(
                  'border-b transition-colors last:border-0',
                  row.status === 'invalid'
                    ? 'bg-destructive/4 hover:bg-destructive/8 dark:bg-destructive/6 dark:hover:bg-destructive/10'
                    : 'hover:bg-muted/50'
                )}
              >
                <td className="p-2 align-middle whitespace-nowrap text-muted-foreground tabular-nums">
                  {row.rowNumber}
                </td>
                <td className="p-2 text-center align-middle">
                  {row.status === 'valid' ? (
                    <CheckCircle2Icon className="mx-auto size-4 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <XCircleIcon className="mx-auto size-4 text-destructive" />
                  )}
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={cn(
                      'max-w-[200px] truncate p-2 align-middle whitespace-nowrap',
                      row.errors.some((e) => e.column === col) &&
                        'text-destructive underline decoration-destructive/40 decoration-wavy underline-offset-2'
                    )}
                  >
                    {row.data[col] ?? ''}
                  </td>
                ))}
                <td className="p-2 align-middle">
                  {row.errors.length > 0 ? <RowErrorIndicator errors={row.errors} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowErrorIndicator({ errors }: { errors: ImportRowError[] }) {
  const errorSummary = errors.map((e) => `${e.column}: ${e.message}`).join('\n')

  return (
    <TooltipTrigger>
      <span className="inline-flex cursor-default items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive dark:bg-destructive/20">
        <AlertCircleIcon className="size-3" />
        {errors.length} {errors.length === 1 ? 'error' : 'errors'}
      </span>
      <Tooltip placement="left" className="max-w-sm whitespace-pre-wrap">
        {errorSummary}
      </Tooltip>
    </TooltipTrigger>
  )
}

export { ImportPreview }
export type { ImportPreviewProps, ImportRowValidation, ImportRowError }
