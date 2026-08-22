import { ApiError } from '@shared/api'
import type { CreateQuoteInput, QuoteDetailItem, QuoteItemInput, UpdateQuoteInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCustomers } from '@shared/hooks/use-customers'
import { useProducts } from '@shared/hooks/use-products'
import {
  useConvertQuoteToOrder,
  useCreateQuote,
  useQuoteDetail,
  useTransitionQuoteStatus,
  useUpdateQuote
} from '@shared/hooks/use-quotes'
import type { QuoteStatus } from '@shared/hooks/use-quotes'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { DocumentItemsEditor } from '@shared/ui/document-items-editor'
import type { DocumentItemRow, ProductOption } from '@shared/ui/document-items-editor'
import { ErrorState } from '@shared/ui/error-state'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { StatusBadge } from '@shared/ui/status-badge'
import { StatusTransitionActions } from '@shared/ui/status-transition-actions'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowRightLeft, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function isEditable(status: QuoteStatus): boolean {
  return status === 'draft' || status === 'sent'
}

function mapDetailItemsToRows(items: QuoteDetailItem[]): DocumentItemRow[] {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    lineTotal: item.totalAmount
  }))
}

function mapRowsToInput(rows: DocumentItemRow[]): QuoteItemInput[] {
  return rows
    .filter((row) => row.productId > 0)
    .map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      discountAmount: row.discountAmount
    }))
}

// ---------------------------------------------------------------------------
// QuoteDetailPage
// ---------------------------------------------------------------------------

function QuoteDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()
  const isNew = id === 'new'
  const quoteId = isNew ? undefined : Number(id)

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  // Data hooks
  const quoteQuery = useQuoteDetail(companyId, quoteId)
  const createQuote = useCreateQuote(companyId)
  const updateQuote = useUpdateQuote(companyId)
  const transitionStatus = useTransitionQuoteStatus(companyId)
  const convertToOrder = useConvertQuoteToOrder(companyId)
  const productsQuery = useProducts(companyId, { limit: 500, offset: 0 })
  const customersQuery = useCustomers(companyId, { limit: 500, offset: 0 })

  // Local form state
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [validUntil, setValidUntil] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [items, setItems] = useState<DocumentItemRow[]>([])
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false)

  // Product options for the editor
  const productOptions: ProductOption[] = useMemo(() => {
    const data = productsQuery.data?.data ?? []
    return data.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))
  }, [productsQuery.data])

  // Customer options
  const customers = customersQuery.data?.data ?? []

  // Sync form state when quote data loads
  useEffect(() => {
    if (quoteQuery.data) {
      const quote = quoteQuery.data
      setCustomerId(quote.customerId)
      setValidUntil(quote.validUntil ?? '')
      setNotes(quote.notes ?? '')
      setItems(mapDetailItemsToRows(quote.items))
    }
  }, [quoteQuery.data])

  // Derived state
  const quote = quoteQuery.data
  const canEdit = isNew || (quote ? isEditable(quote.status) : false)
  const isSaving = createQuote.isPending || updateQuote.isPending
  const isTransitioning = transitionStatus.isPending
  const isConverting = convertToOrder.isPending

  // Document total (live calculation)
  const documentTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [items])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (!customerId) {
      toast.error('Selecione um cliente para o orçamento.')
      return
    }

    const itemInputs = mapRowsToInput(items)
    if (itemInputs.length === 0) {
      toast.error('Adicione pelo menos um item ao orçamento.')
      return
    }

    if (isNew) {
      const input: CreateQuoteInput = {
        customerId,
        validUntil: validUntil || null,
        notes: notes || null,
        items: itemInputs
      }

      createQuote.mutate(input, {
        onSuccess: (data) => {
          toast.success('Orçamento criado com sucesso')
          navigate({ to: '/quotes/$id' as string, params: { id: String(data.id) } })
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao criar orçamento. Tente novamente.')
          }
        }
      })
    } else if (quoteId) {
      const input: UpdateQuoteInput & { id: number } = {
        id: quoteId,
        customerId,
        validUntil: validUntil || null,
        notes: notes || null,
        items: itemInputs
      }

      updateQuote.mutate(input, {
        onSuccess: () => {
          toast.success('Orçamento atualizado com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao atualizar orçamento. Tente novamente.')
          }
        }
      })
    }
  }, [customerId, items, validUntil, notes, isNew, quoteId, createQuote, updateQuote, navigate])

  const handleTransition = useCallback(
    (targetStatus: string) => {
      if (!quoteId) return

      transitionStatus.mutate(
        { id: quoteId, status: targetStatus as QuoteStatus },
        {
          onSuccess: () => {
            toast.success('Status do orçamento atualizado')
          },
          onError: (error) => {
            if (error instanceof ApiError) {
              toast.error(error.message)
            } else {
              toast.error('Erro ao alterar status. Tente novamente.')
            }
          }
        }
      )
    },
    [quoteId, transitionStatus]
  )

  const handleConvertToOrder = useCallback(() => {
    if (!quoteId) return

    convertToOrder.mutate(quoteId, {
      onSuccess: (result) => {
        toast.success('Orçamento convertido em pedido de venda com sucesso')
        setIsConvertDialogOpen(false)
        navigate({
          to: '/sales-orders/$id' as string,
          params: { id: String(result.salesOrder.id) }
        })
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          toast.error(error.message)
        } else {
          toast.error('Erro ao converter orçamento. Tente novamente.')
        }
      }
    })
  }, [quoteId, convertToOrder, navigate])

  function handleCustomerChange(key: React.Key | null): void {
    if (key === null) return
    setCustomerId(Number(key))
  }

  function handleBack(): void {
    navigate({ to: '/quotes' as string })
  }

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (!isNew && quoteQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando orçamento..." />
      </PageShell>
    )
  }

  if (!isNew && quoteQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar orçamento"
          description="Não foi possível buscar os detalhes do orçamento. Tente novamente."
          onRetry={() => quoteQuery.refetch()}
        />
      </PageShell>
    )
  }

  if (!isNew && !quote) {
    return (
      <PageShell>
        <ErrorState title="Orçamento não encontrado" description="O orçamento solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pageTitle = isNew ? 'Novo orçamento' : `Orçamento ${quote?.quoteNumber ?? ''}`
  const pageDescription = isNew ? 'Crie um novo orçamento para um cliente.' : (quote?.customerName ?? undefined)

  return (
    <PageShell
      title={pageTitle}
      description={pageDescription}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onPress={handleBack} className="gap-2">
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          {canEdit && (
            <Button onPress={handleSave} isLoading={isSaving} className="gap-2">
              <Save className="size-4" />
              Salvar
            </Button>
          )}
        </div>
      }
    >
      {/* Status and actions */}
      {!isNew && quote && (
        <PageSection>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <StatusBadge status={quote.status} variant="quote" />
            </div>

            <StatusTransitionActions
              documentType="quote"
              currentStatus={quote.status}
              onTransition={handleTransition}
              disabled={isTransitioning}
            />

            {quote.status === 'accepted' && (
              <Button
                variant="default"
                size="sm"
                onPress={() => setIsConvertDialogOpen(true)}
                isLoading={isConverting}
                className="gap-2"
              >
                <ArrowRightLeft className="size-3.5" />
                Converter em Pedido
              </Button>
            )}
          </div>
        </PageSection>
      )}

      {/* Customer and metadata */}
      <PageSection title="Dados do orçamento">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Customer selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <Select
              selectedKey={customerId?.toString() ?? null}
              onSelectionChange={handleCustomerChange}
              aria-label="Selecionar cliente"
              placeholder="Selecione um cliente"
              isDisabled={!canEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} id={String(customer.id)} textValue={customer.name}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valid until */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Válido até</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={!canEdit}
              className="h-9 w-full rounded-xl border border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)]"
              aria-label="Data de validade"
            />
          </div>

          {/* Document total (read-only summary) */}
          {!isNew && quote && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total</label>
              <p className="flex h-9 items-center text-lg font-semibold text-foreground tabular-nums">
                {formatCurrency(documentTotal)}
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Observações</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            rows={2}
            className="w-full rounded-xl border border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)]"
            aria-label="Observações"
            placeholder="Observações internas sobre o orçamento..."
          />
        </div>
      </PageSection>

      {/* Items editor */}
      <PageSection title="Itens do orçamento">
        <DocumentItemsEditor
          items={items}
          onChange={setItems}
          products={productOptions}
          priceField="unitPrice"
          disabled={!canEdit}
        />
      </PageSection>

      {/* Convert to order confirmation dialog */}
      <ConfirmDialog
        open={isConvertDialogOpen}
        onOpenChange={setIsConvertDialogOpen}
        title="Converter em Pedido de Venda"
        description="Ao converter este orçamento, um pedido de venda será criado com os mesmos itens e o status do orçamento será alterado para 'Convertido'. Deseja continuar?"
        confirmLabel="Sim, converter"
        cancelLabel="Cancelar"
        onConfirm={handleConvertToOrder}
        isLoading={isConverting}
      />
    </PageShell>
  )
}

export { QuoteDetailPage }
