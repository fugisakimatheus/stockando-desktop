import { useProducts } from '@pages/products/hooks/use-products'
import { useWarehouses } from '@pages/warehouses/hooks/use-warehouses'
import { ApiError } from '@shared/api'
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderDetailItem,
  PurchaseOrderItemInput,
  PurchaseOrderStatus,
  UpdatePurchaseOrderInput
} from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { usePurchaseOrderPayments, useRegisterPurchaseOrderPayment } from '@shared/hooks/use-payments'
import type { RegisterPaymentInput } from '@shared/hooks/use-payments'
import {
  useCreatePurchaseOrder,
  usePurchaseOrderDetail,
  useRecordReceipt,
  useTransitionPurchaseOrderStatus,
  useUpdatePurchaseOrder
} from '@shared/hooks/use-purchase-orders'
import { useSuppliers } from '@shared/hooks/use-suppliers'
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
import { ReceiptForm } from '@shared/ui/receipt-form'
import type { ReceiptFormItem } from '@shared/ui/receipt-form'
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

function isEditable(status: PurchaseOrderStatus): boolean {
  return status === 'draft'
}

function canReceiveReceipt(status: PurchaseOrderStatus): boolean {
  return status === 'sent' || status === 'partially_received'
}

function canRegisterPayment(status: PurchaseOrderStatus): boolean {
  return status === 'sent' || status === 'partially_received' || status === 'received'
}

function mapDetailItemsToRows(items: PurchaseOrderDetailItem[]): DocumentItemRow[] {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitCost,
    discountAmount: item.discountAmount,
    lineTotal: item.totalAmount
  }))
}

function mapRowsToInput(rows: DocumentItemRow[]): PurchaseOrderItemInput[] {
  return rows
    .filter((row) => row.productId > 0)
    .map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
      unitCost: row.unitPrice,
      discountAmount: row.discountAmount
    }))
}

function mapItemsToReceiptForm(items: PurchaseOrderDetailItem[]): ReceiptFormItem[] {
  return items.map((item) => ({
    id: item.id,
    productName: item.productName,
    productSku: item.productSku,
    orderedQuantity: item.quantity,
    receivedQuantity: item.receivedQuantity,
    remainingQuantity: item.quantity - item.receivedQuantity
  }))
}

// ---------------------------------------------------------------------------
// PurchaseOrderDetailPage
// ---------------------------------------------------------------------------

function PurchaseOrderDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()
  const isNew = id === 'new'
  const purchaseOrderId = isNew ? undefined : Number(id)

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  // Data hooks
  const detailQuery = usePurchaseOrderDetail(companyId, purchaseOrderId)
  const createPO = useCreatePurchaseOrder(companyId)
  const updatePO = useUpdatePurchaseOrder(companyId)
  const transitionStatus = useTransitionPurchaseOrderStatus(companyId)
  const recordReceipt = useRecordReceipt(companyId)
  const productsQuery = useProducts(companyId, { limit: 500, offset: 0 })
  const suppliersQuery = useSuppliers(companyId, { limit: 500, offset: 0 })
  const warehousesQuery = useWarehouses(companyId)

  // Payment hooks (only fetch when purchaseOrderId is defined)
  const paymentsQuery = usePurchaseOrderPayments(companyId, purchaseOrderId)
  const registerPayment = useRegisterPurchaseOrderPayment(companyId, purchaseOrderId ?? 0)

  // Local form state
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('')
  const [items, setItems] = useState<DocumentItemRow[]>([])

  // Product options for the editor
  const productOptions: ProductOption[] = useMemo(() => {
    const data = productsQuery.data?.data ?? []
    return data.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))
  }, [productsQuery.data])

  // Supplier options
  const suppliers = suppliersQuery.data?.data ?? []

  // Warehouses for receipt form
  const warehouses = useMemo(() => {
    const data = warehousesQuery.data ?? []
    return data.map((w) => ({ id: w.id, name: w.name }))
  }, [warehousesQuery.data])

  // Sync form state when detail data loads
  useEffect(() => {
    if (detailQuery.data) {
      const po = detailQuery.data
      setSupplierId(po.supplierId)
      setExpectedDeliveryDate(po.expectedDeliveryDate ?? '')
      setItems(mapDetailItemsToRows(po.items))
    }
  }, [detailQuery.data])

  // Derived state
  const purchaseOrder = detailQuery.data
  const canEdit = isNew || (purchaseOrder ? isEditable(purchaseOrder.status) : false)
  const isSaving = createPO.isPending || updatePO.isPending
  const isTransitioning = transitionStatus.isPending
  const isRecording = recordReceipt.isPending

  // Document total (live calculation)
  const documentTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [items])

  // Receipt form items
  const receiptItems = useMemo(() => {
    if (!purchaseOrder) return []
    return mapItemsToReceiptForm(purchaseOrder.items)
  }, [purchaseOrder])

  // Payment summary
  const paymentSummary = paymentsQuery.data

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (!supplierId) {
      toast.error('Selecione um fornecedor para o pedido de compra.')
      return
    }

    const itemInputs = mapRowsToInput(items)
    if (itemInputs.length === 0) {
      toast.error('Adicione pelo menos um item ao pedido.')
      return
    }

    if (isNew) {
      const input: CreatePurchaseOrderInput = {
        supplierId,
        expectedDeliveryDate: expectedDeliveryDate || null,
        items: itemInputs
      }

      createPO.mutate(input, {
        onSuccess: (data) => {
          toast.success('Pedido de compra criado com sucesso')
          navigate({ to: '/purchase-orders/$id' as string, params: { id: String(data.id) } })
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao criar pedido de compra. Tente novamente.')
          }
        }
      })
    } else if (purchaseOrderId) {
      const input: UpdatePurchaseOrderInput & { id: number } = {
        id: purchaseOrderId,
        supplierId,
        expectedDeliveryDate: expectedDeliveryDate || null,
        items: itemInputs
      }

      updatePO.mutate(input, {
        onSuccess: () => {
          toast.success('Pedido de compra atualizado com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message)
          } else {
            toast.error('Erro ao atualizar pedido de compra. Tente novamente.')
          }
        }
      })
    }
  }, [supplierId, items, expectedDeliveryDate, isNew, purchaseOrderId, createPO, updatePO, navigate])

  const handleTransition = useCallback(
    (targetStatus: string) => {
      if (!purchaseOrderId) return

      transitionStatus.mutate(
        { id: purchaseOrderId, status: targetStatus as PurchaseOrderStatus },
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
    [purchaseOrderId, transitionStatus]
  )

  const handleRecordReceipt = useCallback(
    (data: {
      items: { purchaseOrderItemId: number; receivedQuantity: number; warehouseId: number }[]
      notes?: string
    }) => {
      if (!purchaseOrderId) return

      recordReceipt.mutate(
        { id: purchaseOrderId, ...data },
        {
          onSuccess: () => {
            toast.success('Recebimento registrado com sucesso')
          },
          onError: (error) => {
            if (error instanceof ApiError) {
              toast.error(error.message)
            } else {
              toast.error('Erro ao registrar recebimento. Tente novamente.')
            }
          }
        }
      )
    },
    [purchaseOrderId, recordReceipt]
  )

  const handleRegisterPayment = useCallback(
    (formData: RegisterPaymentFormData) => {
      if (!purchaseOrderId) return

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
    [purchaseOrderId, registerPayment]
  )

  function handleSupplierChange(key: React.Key | null): void {
    if (key === null) return
    setSupplierId(Number(key))
  }

  function handleBack(): void {
    navigate({ to: '/purchase-orders' as string })
  }

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (!isNew && detailQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando pedido de compra..." />
      </PageShell>
    )
  }

  if (!isNew && detailQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar pedido de compra"
          description="Não foi possível buscar os detalhes do pedido. Tente novamente."
          onRetry={() => detailQuery.refetch()}
        />
      </PageShell>
    )
  }

  if (!isNew && !purchaseOrder) {
    return (
      <PageShell>
        <ErrorState title="Pedido não encontrado" description="O pedido de compra solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pageTitle = isNew ? 'Novo pedido de compra' : `Pedido ${purchaseOrder?.orderNumber ?? ''}`
  const pageDescription = isNew
    ? 'Crie um novo pedido de compra para um fornecedor.'
    : (purchaseOrder?.supplierName ?? undefined)

  const showReceiptSection = !isNew && purchaseOrder && canReceiveReceipt(purchaseOrder.status)
  const showPaymentSection = !isNew && purchaseOrder && canRegisterPayment(purchaseOrder.status)

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
      {!isNew && purchaseOrder && (
        <PageSection>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <StatusBadge status={purchaseOrder.status} variant="purchaseOrder" />
            </div>

            <StatusTransitionActions
              documentType="purchaseOrder"
              currentStatus={purchaseOrder.status}
              onTransition={handleTransition}
              disabled={isTransitioning}
            />
          </div>
        </PageSection>
      )}

      {/* Supplier and metadata */}
      <PageSection title="Dados do pedido">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Supplier selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fornecedor</label>
            <Select
              selectedKey={supplierId?.toString() ?? null}
              onSelectionChange={handleSupplierChange}
              aria-label="Selecionar fornecedor"
              placeholder="Selecione um fornecedor"
              isDisabled={!canEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} id={String(supplier.id)} textValue={supplier.name}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Expected delivery date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Entrega prevista</label>
            <input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              disabled={!canEdit}
              className="h-9 w-full rounded-xl border border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)]"
              aria-label="Data de entrega prevista"
            />
          </div>

          {/* Document total (read-only summary) */}
          {!isNew && purchaseOrder && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total</label>
              <p className="flex h-9 items-center text-lg font-semibold text-foreground tabular-nums">
                {formatCurrency(documentTotal)}
              </p>
            </div>
          )}
        </div>
      </PageSection>

      {/* Items editor */}
      <PageSection title="Itens do pedido">
        <DocumentItemsEditor
          items={items}
          onChange={setItems}
          products={productOptions}
          priceField="unitCost"
          disabled={!canEdit}
        />

        {/* Received vs ordered quantities (when not in draft) */}
        {!isNew && purchaseOrder && purchaseOrder.status !== 'draft' && (
          <div className="mt-4 rounded-xl border border-border/70 dark:border-white/10">
            <div className="grid grid-cols-[1fr_5rem_5rem_5rem] gap-2 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground dark:border-white/10">
              <span>Produto</span>
              <span className="text-right">Pedido</span>
              <span className="text-right">Recebido</span>
              <span className="text-right">Restante</span>
            </div>
            <ul className="divide-y divide-border/50 dark:divide-white/5">
              {purchaseOrder.items.map((item) => {
                const remaining = item.quantity - item.receivedQuantity
                const isComplete = remaining <= 0
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[1fr_5rem_5rem_5rem] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.productSku}</p>
                    </div>
                    <span className="text-right text-sm text-foreground tabular-nums">{item.quantity}</span>
                    <span className="text-right text-sm text-emerald-600 tabular-nums dark:text-emerald-400">
                      {item.receivedQuantity}
                    </span>
                    <span
                      className={`text-right text-sm tabular-nums ${isComplete ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}
                    >
                      {remaining}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </PageSection>

      {/* Receipt recording section */}
      {showReceiptSection && (
        <PageSection title="Registrar recebimento">
          <ReceiptForm
            items={receiptItems}
            warehouses={warehouses}
            onSubmit={handleRecordReceipt}
            disabled={isRecording}
          />
        </PageSection>
      )}

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
      {!isNew && purchaseOrderId && (
        <PageSection>
          <AttachmentPanel companyId={companyId} entityType="purchase_order" entityId={String(purchaseOrderId)} />
        </PageSection>
      )}

      {/* Audit history panel */}
      {!isNew && purchaseOrderId && (
        <PageSection>
          <AuditExpandablePanel companyId={companyId} entityType="purchase_order" entityId={String(purchaseOrderId)} />
        </PageSection>
      )}
    </PageShell>
  )
}

export { PurchaseOrderDetailPage }
