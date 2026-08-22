import { ApiError } from '@shared/api'
import type {
  CreateSalesOrderInput,
  OrderItemInput,
  SalesOrderDetailItem,
  SalesOrderStatus,
  UpdateSalesOrderInput
} from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCustomers } from '@shared/hooks/use-customers'
import { useSalesOrderPayments, useRegisterSalesOrderPayment } from '@shared/hooks/use-payments'
import type { RegisterPaymentInput } from '@shared/hooks/use-payments'
import { useProducts } from '@shared/hooks/use-products'
import {
  useCreateSalesOrder,
  useSalesOrderDetail,
  useTransitionSalesOrderStatus,
  useUpdateSalesOrder
} from '@shared/hooks/use-sales-orders'
import { AttachmentPanel } from '@shared/ui/attachment-panel'
import { AuditExpandablePanel } from '@shared/ui/audit-expandable-panel'
import { Button } from '@shared/ui/button'
import { DocumentItemsEditor } from '@shared/ui/document-items-editor'
import type { DocumentItemRow, ProductOption } from '@shared/ui/document-items-editor'
import { ErrorState } from '@shared/ui/error-state'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { PaymentForm } from '@shared/ui/payment-form'
import type { RegisterPaymentFormData } from '@shared/ui/payment-form'
import { PaymentHistory } from '@shared/ui/payment-history'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { StatusBadge } from '@shared/ui/status-badge'
import { StatusTransitionActions } from '@shared/ui/status-transition-actions'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = [
  { id: 1, name: 'Transferência Bancária' },
  { id: 2, name: 'PIX' },
  { id: 3, name: 'Boleto' },
  { id: 4, name: 'Cartão de Crédito' },
  { id: 5, name: 'Dinheiro' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function isEditable(status: SalesOrderStatus): boolean {
  return status === 'draft'
}

function canRegisterPayment(status: SalesOrderStatus): boolean {
  return status === 'confirmed' || status === 'partially_fulfilled' || status === 'fulfilled'
}

function mapDetailItemsToRows(items: SalesOrderDetailItem[]): DocumentItemRow[] {
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

function mapRowsToInput(rows: DocumentItemRow[]): OrderItemInput[] {
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
// SalesOrderDetailPage
// ---------------------------------------------------------------------------

function SalesOrderDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()
  const isNew = id === 'new'
  const orderId = isNew ? undefined : Number(id)

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  // Data hooks
  const detailQuery = useSalesOrderDetail(companyId, orderId)
  const createOrder = useCreateSalesOrder(companyId)
  const updateOrder = useUpdateSalesOrder(companyId)
  const transitionStatus = useTransitionSalesOrderStatus(companyId)
  const productsQuery = useProducts(companyId, { limit: 500, offset: 0 })
  const customersQuery = useCustomers(companyId, { limit: 500, offset: 0 })

  // Payment hooks (only fetch when orderId is defined)
  const paymentsQuery = useSalesOrderPayments(companyId, orderId)
  const registerPayment = useRegisterSalesOrderPayment(companyId, orderId ?? 0)

  // Local form state
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [notes, setNotes] = useState<string>('')
  const [items, setItems] = useState<DocumentItemRow[]>([])

  // Product options for the editor
  const productOptions: ProductOption[] = useMemo(() => {
    const data = productsQuery.data?.data ?? []
    return data.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))
  }, [productsQuery.data])

  // Customer options
  const customers = customersQuery.data?.data ?? []

  // Sync form state when detail data loads
  useEffect(() => {
    if (detailQuery.data) {
      const order = detailQuery.data
      setCustomerId(order.customerId)
      setNotes('')
      setItems(mapDetailItemsToRows(order.items))
    }
  }, [detailQuery.data])

  // Derived state
  const salesOrder = detailQuery.data
  const canEdit = isNew || (salesOrder ? isEditable(salesOrder.status) : false)
  const isSaving = createOrder.isPending || updateOrder.isPending
  const isTransitioning = transitionStatus.isPending

  // Document total (live calculation)
  const documentTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [items])

  // Payment summary
  const paymentSummary = paymentsQuery.data

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (!customerId) {
      toast.error('Selecione um cliente para o pedido de venda.')
      return
    }

    const itemInputs = mapRowsToInput(items)
    if (itemInputs.length === 0) {
      toast.error('Adicione pelo menos um item ao pedido.')
      return
    }

    if (isNew) {
      const input: CreateSalesOrderInput = {
        customerId,
        items: itemInputs
      }

      createOrder.mutate(input, {
        onSuccess: (data) => {
          toast.success('Pedido de venda criado com sucesso')
          navigate({ to: '/sales-orders/$id' as string, params: { id: String(data.id) } })
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao criar pedido de venda. Tente novamente.')
          }
        }
      })
    } else if (orderId) {
      const input: UpdateSalesOrderInput & { id: number } = {
        id: orderId,
        customerId,
        items: itemInputs
      }

      updateOrder.mutate(input, {
        onSuccess: () => {
          toast.success('Pedido de venda atualizado com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao atualizar pedido de venda. Tente novamente.')
          }
        }
      })
    }
  }, [customerId, items, isNew, orderId, createOrder, updateOrder, navigate])

  const handleTransition = useCallback(
    (targetStatus: string) => {
      if (!orderId) return

      transitionStatus.mutate(
        { id: orderId, status: targetStatus as SalesOrderStatus },
        {
          onSuccess: () => {
            toast.success('Status do pedido atualizado')
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
    [orderId, transitionStatus]
  )

  const handleRegisterPayment = useCallback(
    (formData: RegisterPaymentFormData) => {
      if (!orderId) return

      const input: RegisterPaymentInput = {
        paymentMethodId: formData.paymentMethodId,
        amount: formData.amount,
        transactionReference: formData.transactionReference ?? null,
        paidAt: formData.paidAt
      }

      registerPayment.mutate(input, {
        onSuccess: () => {
          toast.success('Pagamento registrado com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao registrar pagamento. Tente novamente.')
          }
        }
      })
    },
    [orderId, registerPayment]
  )

  function handleCustomerChange(key: React.Key | null): void {
    if (key === null) return
    setCustomerId(Number(key))
  }

  function handleBack(): void {
    navigate({ to: '/sales-orders' as string })
  }

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (!isNew && detailQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando pedido de venda..." />
      </PageShell>
    )
  }

  if (!isNew && detailQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar pedido de venda"
          description="Não foi possível buscar os detalhes do pedido. Tente novamente."
          onRetry={() => detailQuery.refetch()}
        />
      </PageShell>
    )
  }

  if (!isNew && !salesOrder) {
    return (
      <PageShell>
        <ErrorState title="Pedido não encontrado" description="O pedido de venda solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pageTitle = isNew ? 'Novo pedido de venda' : `Pedido ${salesOrder?.orderNumber ?? ''}`
  const pageDescription = isNew
    ? 'Crie um novo pedido de venda para um cliente.'
    : (salesOrder?.customerName ?? undefined)

  const showPaymentSection = !isNew && salesOrder && canRegisterPayment(salesOrder.status)

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
      {!isNew && salesOrder && (
        <PageSection>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <StatusBadge status={salesOrder.status} variant="salesOrder" />
            </div>

            <StatusTransitionActions
              documentType="salesOrder"
              currentStatus={salesOrder.status}
              onTransition={handleTransition}
              disabled={isTransitioning}
            />
          </div>
        </PageSection>
      )}

      {/* Customer and metadata */}
      <PageSection title="Dados do pedido">
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

          {/* Document total (read-only summary) */}
          {!isNew && salesOrder && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total</label>
              <p className="flex h-9 items-center text-lg font-semibold text-foreground tabular-nums">
                {formatCurrency(documentTotal)}
              </p>
            </div>
          )}

          {/* Payment status summary */}
          {!isNew && salesOrder && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pagamento</label>
              <p className="flex h-9 items-center text-sm font-medium text-foreground">
                <StatusBadge status={salesOrder.paymentStatus} />
              </p>
            </div>
          )}
        </div>

        {/* Notes (visible on creation) */}
        {isNew && (
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              rows={2}
              className="w-full rounded-xl border border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)]"
              aria-label="Observações"
              placeholder="Observações internas sobre o pedido..."
            />
          </div>
        )}
      </PageSection>

      {/* Items editor */}
      <PageSection title="Itens do pedido">
        <DocumentItemsEditor
          items={items}
          onChange={setItems}
          products={productOptions}
          priceField="unitPrice"
          disabled={!canEdit}
        />
      </PageSection>

      {/* Payment section */}
      {showPaymentSection && paymentSummary && (
        <PageSection title="Pagamentos">
          <PaymentHistory
            payments={paymentSummary.payments.map((p) => ({
              ...p,
              paidAt: p.paidAt ?? p.createdAt
            }))}
            documentTotal={paymentSummary.documentTotal}
            totalPaid={paymentSummary.totalPaid}
            remainingBalance={paymentSummary.remainingBalance}
          />

          {paymentSummary.remainingBalance > 0 && (
            <div className="mt-6">
              <h4 className="mb-3 text-sm font-medium text-foreground">Registrar pagamento</h4>
              <PaymentForm
                remainingBalance={paymentSummary.remainingBalance}
                paymentMethods={PAYMENT_METHODS}
                onSubmit={handleRegisterPayment}
                disabled={registerPayment.isPending}
              />
            </div>
          )}
        </PageSection>
      )}

      {/* Attachments panel */}
      {!isNew && orderId && (
        <PageSection>
          <AttachmentPanel companyId={companyId} entityType="sales_order" entityId={String(orderId)} />
        </PageSection>
      )}

      {/* Audit history panel */}
      {!isNew && orderId && (
        <PageSection>
          <AuditExpandablePanel companyId={companyId} entityType="sales_order" entityId={String(orderId)} />
        </PageSection>
      )}
    </PageShell>
  )
}

export { SalesOrderDetailPage }
