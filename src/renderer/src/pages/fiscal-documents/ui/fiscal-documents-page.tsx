import type { FiscalDocumentStatus, FiscalDocumentType } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { FiscalStatusBadge } from '@shared/ui/fiscal-status-badge'
import { Input } from '@shared/ui/input'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'

import type { FiscalDocumentListFilters, FiscalDocumentListItem } from '../hooks/use-fiscal-documents'
import { useFiscalDocuments } from '../hooks/use-fiscal-documents'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const DOCUMENT_TYPE_OPTIONS = [
  { id: 'all', name: 'Todos os tipos' },
  { id: 'NF-e', name: 'NF-e' },
  { id: 'NFC-e', name: 'NFC-e' }
] as const

const STATUS_OPTIONS = [
  { id: 'all', name: 'Todos os status' },
  { id: 'draft', name: 'Rascunho' },
  { id: 'authorized', name: 'Autorizada' },
  { id: 'cancelled', name: 'Cancelada' },
  { id: 'denied', name: 'Denegada' }
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
// FiscalDocumentsPage
// ---------------------------------------------------------------------------

function FiscalDocumentsPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1
  const navigate = useNavigate()

  const [filters, setFilters] = useState<FiscalDocumentListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    documentType: undefined,
    status: undefined,
    startDate: undefined,
    endDate: undefined
  })

  const fiscalDocsQuery = useFiscalDocuments(companyId, filters)

  const fiscalDocs = fiscalDocsQuery.data?.data ?? []
  const total = fiscalDocsQuery.data?.total ?? 0
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

  function handleDocumentTypeChange(key: React.Key | null): void {
    const documentType = key === 'all' || key === null ? undefined : (String(key) as FiscalDocumentType)
    setFilters((prev) => ({ ...prev, documentType, offset: 0 }))
  }

  function handleStatusChange(key: React.Key | null): void {
    const status = key === 'all' || key === null ? undefined : (String(key) as FiscalDocumentStatus)
    setFilters((prev) => ({ ...prev, status, offset: 0 }))
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

  function handleRowClick(documentId: number): void {
    navigate({ to: '/fiscal-documents/$id' as string, params: { id: String(documentId) } })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasActiveFilters =
    filters.search || filters.documentType || filters.status || filters.startDate || filters.endDate

  return (
    <PageShell title="Documentos Fiscais" description="Gerencie notas fiscais eletrônicas (NF-e e NFC-e).">
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por número ou cliente..."
        >
          <Select
            selectedKey={filters.documentType ?? 'all'}
            onSelectionChange={handleDocumentTypeChange}
            aria-label="Filtrar por tipo"
            placeholder="Tipo"
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                  {opt.name}
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

          <Input
            type="date"
            value={filters.startDate ?? ''}
            onChange={handleStartDateChange}
            aria-label="Data inicial"
            className="w-36"
          />

          <Input
            type="date"
            value={filters.endDate ?? ''}
            onChange={handleEndDateChange}
            aria-label="Data final"
            className="w-36"
          />
        </FilterBar>

        {fiscalDocsQuery.isLoading && <LoadingState message="Carregando documentos fiscais..." />}

        {fiscalDocsQuery.isError && (
          <ErrorState
            title="Erro ao carregar documentos"
            description="Não foi possível buscar a lista de documentos fiscais. Tente novamente."
            onRetry={() => fiscalDocsQuery.refetch()}
          />
        )}

        {fiscalDocsQuery.isSuccess && fiscalDocs.length === 0 && (
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento fiscal encontrado"
            description={
              hasActiveFilters
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Os documentos fiscais emitidos aparecerão aqui.'
            }
          />
        )}

        {fiscalDocsQuery.isSuccess && fiscalDocs.length > 0 && (
          <>
            <Table aria-label="Lista de documentos fiscais">
              <TableHeader>
                <TableRow>
                  <TableHead isRowHeader>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Série</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Emissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody items={fiscalDocs}>
                {(doc: FiscalDocumentListItem) => (
                  <TableRow key={doc.id} id={doc.id} className="cursor-pointer" onAction={() => handleRowClick(doc.id)}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{doc.documentNumber}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{doc.documentType}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{doc.series}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{doc.customerName ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <FiscalStatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{formatCurrency(doc.totalAmount)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.issueDate)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? 'documento' : 'documentos'} • Página {currentPage} de {totalPages}
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

export { FiscalDocumentsPage }
