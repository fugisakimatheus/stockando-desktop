import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportGroup<TData> {
  groupKey: string
  groupLabel: string
  subtotal: number
  count: number
  rows: TData[]
}

interface ReportSummary {
  totalAmount: number
  totalCount: number
  averageAmount: number
}

interface ReportTablePaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

interface ReportTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  groups?: ReportGroup<TData>[]
  summary?: ReportSummary
  pagination?: ReportTablePaginationProps
  formatCurrency?: (value: number) => string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultFormatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

function getSortIcon(isSorted: false | 'asc' | 'desc'): React.JSX.Element {
  return match(isSorted)
    .with('asc', () => <ChevronUpIcon className="size-3.5" aria-label="Ordenado ascendente" />)
    .with('desc', () => <ChevronDownIcon className="size-3.5" aria-label="Ordenado descendente" />)
    .with(false, () => <ChevronsUpDownIcon className="size-3.5 opacity-50" aria-label="Clique para ordenar" />)
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function ReportTablePagination({ page, pageSize, total, onPageChange }: ReportTablePaginationProps): React.JSX.Element {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canGoPrev = page > 1
  const canGoNext = page < totalPages

  const startRow = (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between border-t border-border/70 px-2 py-3 dark:border-white/10">
      <span className="text-xs text-muted-foreground">
        {total > 0 ? `${startRow}–${endRow} de ${total}` : 'Nenhum registro'}
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          isDisabled={!canGoPrev}
          onPress={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-8 text-center text-xs text-foreground">
          {page}/{totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          isDisabled={!canGoNext}
          onPress={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group Row
// ---------------------------------------------------------------------------

interface GroupRowProps {
  groupLabel: string
  subtotal: number
  count: number
  isExpanded: boolean
  onToggle: () => void
  colSpan: number
  formatCurrency: (value: number) => string
}

function GroupRow({
  groupLabel,
  subtotal,
  count,
  isExpanded,
  onToggle,
  colSpan,
  formatCurrency
}: GroupRowProps): React.JSX.Element {
  return (
    <tr
      className="cursor-pointer border-b bg-muted/30 transition-colors hover:bg-muted/50 dark:bg-muted/20 dark:hover:bg-muted/40"
      onClick={onToggle}
      role="row"
      aria-expanded={isExpanded}
    >
      <td colSpan={colSpan} className="p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn('size-4 text-muted-foreground transition-transform', !isExpanded && '-rotate-90')}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground">{groupLabel}</span>
            <span className="text-xs text-muted-foreground">({count} registros)</span>
          </div>
          <span className="text-sm font-medium text-foreground">{formatCurrency(subtotal)}</span>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Summary Footer
// ---------------------------------------------------------------------------

interface SummaryFooterProps {
  summary: ReportSummary
  colSpan: number
  formatCurrency: (value: number) => string
}

function SummaryFooter({ summary, colSpan, formatCurrency }: SummaryFooterProps): React.JSX.Element {
  return (
    <tr className="border-t-2 border-border/70 bg-muted/40 font-medium dark:border-white/10 dark:bg-muted/30">
      <td colSpan={colSpan} className="p-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              Total: <span className="text-foreground">{formatCurrency(summary.totalAmount)}</span>
            </span>
            <span className="text-muted-foreground">
              Registros: <span className="text-foreground">{summary.totalCount}</span>
            </span>
            <span className="text-muted-foreground">
              Média: <span className="text-foreground">{formatCurrency(summary.averageAmount)}</span>
            </span>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// ReportTable
// ---------------------------------------------------------------------------

function ReportTable<TData>({
  columns,
  data,
  groups,
  summary,
  pagination,
  formatCurrency = defaultFormatCurrency,
  className
}: ReportTableProps<TData>): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true
  })

  const toggleGroup = (groupKey: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const colSpan = columns.length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_35px_rgba(2,6,23,0.25)]',
        className
      )}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                  onClick={header.column.getToggleSortingHandler()}
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                >
                  <div className="flex items-center gap-1">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && getSortIcon(header.column.getIsSorted())}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {groups && groups.length > 0
            ? groups.map((group) => {
                const isExpanded = expandedGroups.has(group.groupKey)
                return (
                  <GroupRowSection
                    key={group.groupKey}
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.groupKey)}
                    columns={columns}
                    colSpan={colSpan}
                    formatCurrency={formatCurrency}
                    table={table}
                  />
                )
              })
            : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>

        {summary && (
          <tfoot>
            <SummaryFooter summary={summary} colSpan={colSpan} formatCurrency={formatCurrency} />
          </tfoot>
        )}
      </Table>

      {pagination && <ReportTablePagination {...pagination} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group Row Section (internal)
// ---------------------------------------------------------------------------

interface GroupRowSectionProps<TData> {
  group: ReportGroup<TData>
  isExpanded: boolean
  onToggle: () => void
  columns: ColumnDef<TData, unknown>[]
  colSpan: number
  formatCurrency: (value: number) => string
  table: ReturnType<typeof useReactTable<TData>>
}

function GroupRowSection<TData>({
  group,
  isExpanded,
  onToggle,
  colSpan,
  formatCurrency,
  table
}: GroupRowSectionProps<TData>): React.JSX.Element {
  return (
    <>
      <GroupRow
        groupLabel={group.groupLabel}
        subtotal={group.subtotal}
        count={group.count}
        isExpanded={isExpanded}
        onToggle={onToggle}
        colSpan={colSpan}
        formatCurrency={formatCurrency}
      />
      {isExpanded &&
        table
          .getRowModel()
          .rows.filter((row) => group.rows.includes(row.original))
          .map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
    </>
  )
}

export { ReportTable, ReportTablePagination }
export type { ReportTableProps, ReportTablePaginationProps, ReportGroup, ReportSummary }
