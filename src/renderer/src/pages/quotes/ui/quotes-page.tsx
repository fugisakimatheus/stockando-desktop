import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCustomers } from '@shared/hooks/use-customers'
import { useQuotes } from '@shared/hooks/use-quotes'
import type { QuoteListFilters, QuoteListItem, QuoteStatus } from '@shared/hooks/use-quotes'
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
  { id: 'sent', name: 'Enviado' },
  { id: 'accepted', name: 'Aceito' },
  { id: 'rejected', name: 'Rejeitado' },
  { id: 'converted', name: 'Convertido' },
  { id: 'cancelled', name: 'Cancelado' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(dateString))
}

// ---------------------------------------------------------------------------
// QuotesPage
// ---------------------------------------------------------------------------

function QuotesPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1
  const navigate = useNavigate()

  const [filters, setFilters] = useState<QuoteListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    status: undefined,
    customerId: undefined
  })

  const quotesQuery = useQuotes(companyId, filters)
  const customersQuery = useCustomers(companyId, { limit: 200, offset: 0 })

  const quotes = quotesQuery.data?.data ?? []
  const total = quotesQuery.data?.total ?? 0
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

  function handleStatusChange(key: React.Key | null): void {
    const status = key === 'all' || key === null ? undefined : (String(key) as QuoteStatus)
    setFilters((prev) => ({ ...prev, status, offset: 0 }))
  }

  function handleCustomerChange(key: React.Key | null): void {
    const customerId = key === 'all' || key === null ? undefined : Number(key)
    setFilters((prev) => ({ ...prev, customerId, offset: 0 }))
  }

  function handlePrevious(): void {
    setFilters((prev) => ({ ...prev, offset: Math.max(0, prev.offset - PAGE_SIZE) }))
  }

  function handleNext(): void {
    setFilters((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }))
  }

  function handleRowClick(quoteId: number): void {
    navigate({ to: '/quotes/$id' as string, params: { id: String(quoteId) } })
  }

  function handleNewQuote(): void {
    navigate({ to: '/quotes/$id' as string, params: { id: 'new' } })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasActiveFilters = filters.search || filters.status || filters.customerId

  return (
    <PageShell
      title="Orçamentos"
      description="Gerencie propostas comerciais para seus clientes."
      actions={
        <Button onPress={handleNewQuote} className="gap-1.5">
          <Plus className="size-4" />
          Novo orçamento
        </Button>
      }
    >
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por número do orçamento..."
        >
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
        </FilterBar>

        {quotesQuery.isLoading && <LoadingState message="Carregando orçamentos..." />}

        {quotesQuery.isError && (
          <ErrorState
            title="Erro ao carregar orçamentos"
            description="Não foi possível buscar a lista de orçamentos. Tente novamente."
            onRetry={() => quotesQuery.refetch()}
          />
        )}

        {quotesQuery.isSuccess && quotes.length === 0 && (
          <EmptyState
            icon={<FileText />}
            title="Nenhum orçamento encontrado"
            description={
              hasActiveFilters
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece criando o primeiro orçamento para um cliente.'
            }
            action={
              !hasActiveFilters ? (
                <Button variant="outline" onPress={handleNewQuote} className="gap-1.5">
                  <Plus className="size-4" />
                  Criar orçamento
                </Button>
              ) : undefined
            }
          />
        )}

        {quotesQuery.isSuccess && quotes.length > 0 && (
          <>
            <Table aria-label="Lista de orçamentos">
              <TableHeader>
                <TableHead isRowHeader>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Válido até</TableHead>
                <TableHead>Criado em</TableHead>
              </TableHeader>
              <TableBody items={quotes}>
                {(quote: QuoteListItem) => (
                  <TableRow
                    key={quote.id}
                    id={quote.id}
                    className="cursor-pointer"
                    onAction={() => handleRowClick(quote.id)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{quote.quoteNumber}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{quote.customerName}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={quote.status} variant="quote" />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{formatCurrency(quote.totalAmount)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{formatDate(quote.validUntil)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(quote.createdAt)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 dark:border-white/6">
              <p className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? 'orçamento' : 'orçamentos'} · Página {currentPage} de {totalPages}
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

export { QuotesPage }
