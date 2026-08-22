import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { Input } from '@shared/ui/input'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useState } from 'react'

import { useStockMovements } from '../hooks/use-stock-movements'
import type { MovementListFilters, StockMovement } from '../hooks/use-stock-movements'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1
const PAGE_SIZE = 20

const MOVEMENT_TYPE_OPTIONS = [
  { id: 'all', name: 'Todos os tipos' },
  { id: 'inbound', name: 'Entrada' },
  { id: 'outbound', name: 'Saída' },
  { id: 'transfer_in', name: 'Transf. entrada' },
  { id: 'transfer_out', name: 'Transf. saída' },
  { id: 'adjustment', name: 'Ajuste' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString))
}

function MovementTypeBadge({ type }: { type: string }): React.JSX.Element {
  switch (type) {
    case 'inbound':
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Entrada
        </Badge>
      )
    case 'outbound':
      return (
        <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Saída
        </Badge>
      )
    case 'transfer_in':
      return (
        <Badge className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Transf. entrada
        </Badge>
      )
    case 'transfer_out':
      return (
        <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300">
          Transf. saída
        </Badge>
      )
    case 'adjustment':
      return (
        <Badge className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
          Ajuste
        </Badge>
      )
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

// ---------------------------------------------------------------------------
// StockMovementsPage
// ---------------------------------------------------------------------------

function StockMovementsPage(): React.JSX.Element {
  const [filters, setFilters] = useState<MovementListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    productId: undefined,
    warehouseId: undefined,
    movementType: undefined,
    startDate: undefined,
    endDate: undefined
  })

  const [productIdInput, setProductIdInput] = useState('')
  const [warehouseIdInput, setWarehouseIdInput] = useState('')

  const movementsQuery = useStockMovements(COMPANY_ID, filters)

  const movements = movementsQuery.data?.data ?? []
  const total = movementsQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  function handleSearchChange(value: string): void {
    void value
  }

  function handleMovementTypeChange(key: React.Key | null): void {
    const movementType =
      key === 'all' || key === null ? undefined : (String(key) as MovementListFilters['movementType'])
    setFilters((prev) => ({ ...prev, movementType, offset: 0 }))
  }

  function handleProductIdBlur(): void {
    const parsed = productIdInput ? Number(productIdInput) : undefined
    const productId = parsed && !Number.isNaN(parsed) ? parsed : undefined
    setFilters((prev) => ({ ...prev, productId, offset: 0 }))
  }

  function handleWarehouseIdBlur(): void {
    const parsed = warehouseIdInput ? Number(warehouseIdInput) : undefined
    const warehouseId = parsed && !Number.isNaN(parsed) ? parsed : undefined
    setFilters((prev) => ({ ...prev, warehouseId, offset: 0 }))
  }

  function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const startDate = e.target.value || undefined
    setFilters((prev) => ({ ...prev, startDate, offset: 0 }))
  }

  function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const endDate = e.target.value || undefined
    setFilters((prev) => ({ ...prev, endDate, offset: 0 }))
  }

  function handlePrevious(): void {
    setFilters((prev) => ({ ...prev, offset: Math.max(0, prev.offset - PAGE_SIZE) }))
  }

  function handleNext(): void {
    setFilters((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }))
  }

  const hasActiveFilters =
    filters.movementType !== undefined ||
    filters.productId !== undefined ||
    filters.warehouseId !== undefined ||
    filters.startDate !== undefined ||
    filters.endDate !== undefined

  return (
    <PageShell
      title="Movimentações de Estoque"
      description="Histórico completo de entradas, saídas, transferências e ajustes de estoque."
    >
      <PageSection>
        <FilterBar searchValue="" onSearchChange={handleSearchChange} searchPlaceholder="Buscar movimentações...">
          <Select
            selectedKey={filters.movementType ?? 'all'}
            onSelectionChange={handleMovementTypeChange}
            aria-label="Filtrar por tipo de movimentação"
            placeholder="Tipo"
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            value={productIdInput}
            onChange={(e) => setProductIdInput(e.target.value)}
            onBlur={handleProductIdBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleProductIdBlur()
            }}
            placeholder="Produto ID"
            className="h-8 w-28 border-transparent bg-background/80 text-sm shadow-none focus-visible:border-ring dark:border-transparent dark:bg-background/60"
            aria-label="Filtrar por ID do produto"
          />
          <Input
            type="number"
            value={warehouseIdInput}
            onChange={(e) => setWarehouseIdInput(e.target.value)}
            onBlur={handleWarehouseIdBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleWarehouseIdBlur()
            }}
            placeholder="Armazém ID"
            className="h-8 w-28 border-transparent bg-background/80 text-sm shadow-none focus-visible:border-ring dark:border-transparent dark:bg-background/60"
            aria-label="Filtrar por ID do armazém"
          />
          <Input
            type="date"
            value={filters.startDate ?? ''}
            onChange={handleStartDateChange}
            className="h-8 w-36 border-transparent bg-background/80 text-sm shadow-none focus-visible:border-ring dark:border-transparent dark:bg-background/60"
            aria-label="Data inicial"
          />
          <Input
            type="date"
            value={filters.endDate ?? ''}
            onChange={handleEndDateChange}
            className="h-8 w-36 border-transparent bg-background/80 text-sm shadow-none focus-visible:border-ring dark:border-transparent dark:bg-background/60"
            aria-label="Data final"
          />
        </FilterBar>

        {movementsQuery.isLoading && <LoadingState message="Carregando movimentações..." />}

        {movementsQuery.isError && (
          <ErrorState
            title="Erro ao carregar movimentações"
            description="Não foi possível buscar o histórico de movimentações. Tente novamente."
            onRetry={() => movementsQuery.refetch()}
          />
        )}

        {movementsQuery.isSuccess && movements.length === 0 && (
          <EmptyState
            icon={<History />}
            title="Nenhuma movimentação encontrada"
            description={
              hasActiveFilters
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Ainda não há movimentações de estoque registradas.'
            }
          />
        )}

        {movementsQuery.isSuccess && movements.length > 0 && (
          <>
            <Table aria-label="Histórico de movimentações de estoque">
              <TableHeader>
                <TableHead isRowHeader>ID</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Produto ID</TableHead>
                <TableHead>Armazém ID</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Custo unit.</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead>Data</TableHead>
              </TableHeader>
              <TableBody items={movements}>
                {(movement: StockMovement) => (
                  <TableRow key={movement.id} id={movement.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{movement.id}</span>
                    </TableCell>
                    <TableCell>
                      <MovementTypeBadge type={movement.movementType} />
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{movement.productId}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{movement.warehouseId}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium tabular-nums">{movement.quantity}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground tabular-nums">{formatCurrency(movement.unitCost)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {movement.referenceType && movement.referenceId
                          ? `${movement.referenceType}:${movement.referenceId}`
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {movement.notes ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(movement.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 dark:border-white/6">
              <p className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? 'movimentação' : 'movimentações'} · Página {currentPage} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={!hasPrevious}
                  onPress={handlePrevious}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={!hasNext}
                  onPress={handleNext}
                  aria-label="Próxima página"
                >
                  Próxima
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </PageSection>
    </PageShell>
  )
}

export { StockMovementsPage }
