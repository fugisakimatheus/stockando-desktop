import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCustomers } from '@shared/hooks/use-customers'
import { useSalesOrders } from '@shared/hooks/use-sales-orders'
import type { SalesOrderListFilters, SalesOrderListItem, SalesOrderStatus } from '@shared/hooks/use-sales-orders'
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
import { ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { id: 'all', name: 'Todos os status' },
  { id: 'draft', name: 'Rascunho' },
  { id: 'confirmed', name: 'Confirmado' },
  { id: 'partially_fulfilled', name: 'Parc. Atendido' },
  { id: 'fulfilled', name: 'Atendido' },
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
// SalesOrdersPage
// ---------------------------------------------------------------------------

function SalesOrdersPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1
  const navigate = useNavigate()

  const [filters, setFilters] = useState<SalesOrderListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    customerId: undefined,
    status: undefined,
    paymentStatus: undefined
  })

  const salesOrdersQuery = useSalesOrders(companyId, filters)
  const customersQuery = useCustomers(companyId, { limit: 200, offset: 0 })

  const salesOrders = salesOrdersQuery.data?.data ?? []
  const total = salesOrdersQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  const customers = customersQuery.data?.data ?? []

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function handleSearchChange(value: string): void {
    setFilters((prev) => ({ ...prev, search: value, offset: 0 }))
  }

  function handleCustomerChange(key: React.Key | null): void {
    const customerId = key === 'all' || key === null ? undefined : Number(key)
    setFilters((prev) => ({ ...prev, customerId, offset: 0 }))
  }

  function handleStatusChange(key: React.Key | null): void {
    const status = key === 'all' || key === null ? undefined : (String(key) as SalesOrderStatus)
    setFilters((prev) => ({ ...prev, status, offset: 0 }))
  }

  function handlePaymentStatusChange(key: React.Key | null): void {
    const paymentStatus =
      key === 'all' || key === null ? undefined : (String(key) as SalesOrderListFilters['paymentStatus'])
    setFilters((prev) => ({ ...prev, paymentStatus, offset: 0 }))
  }

  function handlePrevious(): void {
    setFilters((prev) => ({ ...prev, offset: Math.max(0, prev.offset - PAGE_SIZE) }))
  }

  function handleNext(): void {
    setFilters((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }))
  }

  function handleRowClick(orderId: number): void {
    navigate({ to: '/sales-orders/$id' as string, params: { id: String(orderId) } })
  }

  function handleNewOrder(): void {
    navigate({ to: '/sales-orders/$id' as string, params: { id: 'new' } })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasActiveFilters = filters.search || filters.customerId || filters.status || filters.paymentStatus

  return (
    <PageShell
      title="Pedidos de Venda"
      description="Gerencie pedidos de venda, status e pagamentos."
      actions={
        <Button onPress={handleNewOrder} className="gap-2">
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
            selectedKey={filters.customerId?.toString() ?? 'all'}
            onSelectionChange={handleCustomerChange}
            aria-label="Filtrar por cliente"
            placeholder="Cliente"
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="all" textValue="Todos os clientes">
                Todos os clientes
              </SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer.id} id={String(customer.id)} textValue={customer.name}>
                  {customer.name}
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
            <SelectTrigger className="w-44">
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

        {salesOrdersQuery.isLoading && <LoadingState message="Carregando pedidos de venda..." />}

        {salesOrdersQuery.isError && (
          <ErrorState
            title="Erro ao carregar pedidos"
            description="Não foi possível buscar a lista de pedidos de venda. Tente novamente."
            onRetry={() => salesOrdersQuery.refetch()}
          />
        )}

        {salesOrdersQuery.isSuccess && salesOrders.length === 0 && (
          <EmptyState
            icon={<FileText />}
            title="Nenhum pedido de venda encontrado"
            description={
              hasActiveFilters
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece criando o primeiro pedido de venda para um cliente.'
            }
            action={
              !hasActiveFilters ? (
                <Button onPress={handleNewOrder} className="gap-2">
                  <Plus className="size-4" />
                  Criar pedido de venda
                </Button>
              ) : undefined
            }
          />
        )}

        {salesOrdersQuery.isSuccess && salesOrders.length > 0 && (
          <>
            <Table aria-label="Lista de pedidos de venda">
              <TableHeader>
                <TableRow>
                  <TableHead isRowHeader>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody items={salesOrders}>
                {(order: SalesOrderListItem) => (
                  <TableRow
                    key={order.id}
                    id={order.id}
                    className="cursor-pointer"
                    onAction={() => handleRowClick(order.id)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{order.customerName ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} variant="salesOrder" />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{formatCurrency(order.totalAmount)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.paymentStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? 'pedido' : 'pedidos'} • Página {currentPage} de {totalPages}
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

export { SalesOrdersPage }
