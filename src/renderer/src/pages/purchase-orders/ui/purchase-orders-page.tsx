import { useActiveCompany } from '@shared/hooks/use-active-company'
import { usePurchaseOrders } from '@shared/hooks/use-purchase-orders'
import type { PurchaseOrderListFilters, PurchaseOrderListItem } from '@shared/hooks/use-purchase-orders'
import { useSuppliers } from '@shared/hooks/use-suppliers'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { StatusBadge } from '@shared/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { id: 'all', name: 'Todos os status' },
  { id: 'draft', name: 'Rascunho' },
  { id: 'sent', name: 'Enviado' },
  { id: 'partially_received', name: 'Parc. Recebido' },
  { id: 'received', name: 'Recebido' },
  { id: 'cancelled', name: 'Cancelado' }
] as const

const PAYMENT_STATUS_OPTIONS = [
  { id: 'all', name: 'Todos pagamentos' },
  { id: 'unpaid', name: 'Não Pago' },
  { id: 'partially_paid', name: 'Parc. Pago' },
  { id: 'paid', name: 'Pago' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(dateStr))
}

// ---------------------------------------------------------------------------
// PurchaseOrdersPage
// ---------------------------------------------------------------------------

function PurchaseOrdersPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1
  const navigate = useNavigate()

  const [filters, setFilters] = useState<PurchaseOrderListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    supplierId: undefined,
    status: undefined,
    paymentStatus: undefined
  })

  const purchaseOrdersQuery = usePurchaseOrders(companyId, filters)
  const suppliersQuery = useSuppliers(companyId, { limit: 100, offset: 0 })

  const purchaseOrders = purchaseOrdersQuery.data?.data ?? []
  const total = purchaseOrdersQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function handleSearchChange(value: string): void {
    setFilters((prev) => ({ ...prev, search: value, offset: 0 }))
  }

  function handleSupplierChange(key: React.Key | null): void {
    const supplierId = key === 'all' || key === null ? undefined : Number(key)
    setFilters((prev) => ({ ...prev, supplierId, offset: 0 }))
  }

  function handleStatusChange(key: React.Key | null): void {
    const status = key === 'all' || key === null ? undefined : (String(key) as PurchaseOrderListFilters['status'])
    setFilters((prev) => ({ ...prev, status, offset: 0 }))
  }

  function handlePaymentStatusChange(key: React.Key | null): void {
    const paymentStatus =
      key === 'all' || key === null ? undefined : (String(key) as PurchaseOrderListFilters['paymentStatus'])
    setFilters((prev) => ({ ...prev, paymentStatus, offset: 0 }))
  }

  function handlePrevious(): void {
    setFilters((prev) => ({ ...prev, offset: Math.max(0, prev.offset - PAGE_SIZE) }))
  }

  function handleNext(): void {
    setFilters((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }))
  }

  function handleRowClick(poId: number): void {
    navigate({ to: '/purchase-orders/$id' as string, params: { id: String(poId) } })
  }

  function handleNewPurchaseOrder(): void {
    navigate({ to: '/purchase-orders/$id' as string, params: { id: 'new' } })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasActiveFilters = filters.search || filters.supplierId || filters.status || filters.paymentStatus

  return (
    <PageShell
      title="Pedidos de Compra"
      description="Gerencie pedidos de compra, recebimentos e pagamentos."
      actions={
        <Button onPress={handleNewPurchaseOrder} className="gap-1.5">
          <Plus className="size-4" />
          Novo pedido
        </Button>
      }
    >
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por número do pedido..."
        >
          <Select
            selectedKey={filters.supplierId?.toString() ?? 'all'}
            onSelectionChange={handleSupplierChange}
            aria-label="Filtrar por fornecedor"
            placeholder="Fornecedor"
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="all" textValue="Todos fornecedores">
                Todos fornecedores
              </SelectItem>
              {(suppliersQuery.data?.data ?? []).map((supplier) => (
                <SelectItem key={supplier.id} id={String(supplier.id)} textValue={supplier.name}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            selectedKey={filters.status ?? 'all'}
            onSelectionChange={handleStatusChange}
            aria-label="Filtrar por status"
            placeholder="Status"
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            selectedKey={filters.paymentStatus ?? 'all'}
            onSelectionChange={handlePaymentStatusChange}
            aria-label="Filtrar por pagamento"
            placeholder="Pagamento"
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>

        {purchaseOrdersQuery.isLoading && <LoadingState message="Carregando pedidos de compra..." />}

        {purchaseOrdersQuery.isError && (
          <ErrorState
            title="Erro ao carregar pedidos"
            description="Não foi possível buscar a lista de pedidos de compra. Tente novamente."
            onRetry={() => purchaseOrdersQuery.refetch()}
          />
        )}

        {purchaseOrdersQuery.isSuccess && purchaseOrders.length === 0 && (
          <EmptyState
            icon={<ClipboardList />}
            title="Nenhum pedido de compra encontrado"
            description={
              hasActiveFilters
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece criando o primeiro pedido de compra.'
            }
            action={
              !hasActiveFilters ? (
                <Button variant="outline" onPress={handleNewPurchaseOrder} className="gap-1.5">
                  <Plus className="size-4" />
                  Criar pedido de compra
                </Button>
              ) : undefined
            }
          />
        )}

        {purchaseOrdersQuery.isSuccess && purchaseOrders.length > 0 && (
          <>
            <Table aria-label="Lista de pedidos de compra">
              <TableHeader>
                <TableHead isRowHeader>Número</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Entrega Prevista</TableHead>
                <TableHead>Criado em</TableHead>
              </TableHeader>
              <TableBody items={purchaseOrders}>
                {(po: PurchaseOrderListItem) => (
                  <TableRow key={po.id} id={po.id} className="cursor-pointer" onAction={() => handleRowClick(po.id)}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{po.orderNumber}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{po.supplierName}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={po.status} variant="purchaseOrder" />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{formatCurrency(po.totalAmount)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={po.paymentStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{formatDate(po.expectedDeliveryDate)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 dark:border-white/6">
              <p className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? 'pedido' : 'pedidos'} · Página {currentPage} de {totalPages}
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

export { PurchaseOrdersPage }
