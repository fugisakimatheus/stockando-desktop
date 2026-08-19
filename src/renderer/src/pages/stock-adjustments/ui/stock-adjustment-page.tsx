import { ApiError } from '@shared/api'
import type { AdjustmentInput, AdjustmentType, Warehouse } from '@shared/api'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Textarea } from '@shared/ui/textarea'
import { ChevronLeft, ChevronRight, ClipboardList, Loader2Icon } from 'lucide-react'
import { type FormEvent, useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useWarehouses } from '../../warehouses/hooks/use-warehouses'
import { useStockAdjustments, useCreateStockAdjustment } from '../hooks/use-stock-adjustments'
import type { StockAdjustment } from '../hooks/use-stock-adjustments'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1
const PAGE_SIZE = 20

const ADJUSTMENT_TYPE_OPTIONS = [
  { id: 'increase', name: 'Aumento' },
  { id: 'decrease', name: 'Diminuição' },
  { id: 'correction', name: 'Correção' }
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdjustmentFormFields {
  productId: string
  warehouseId: string
  adjustmentType: AdjustmentType | ''
  quantity: string
  unitCost: string
  reason: string
  notes: string
}

type FieldErrors = Partial<Record<string, string>>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString))
}

function adjustmentTypeLabel(type: string): string {
  switch (type) {
    case 'increase':
      return 'Aumento'
    case 'decrease':
      return 'Diminuição'
    case 'correction':
      return 'Correção'
    default:
      return type
  }
}

function AdjustmentTypeBadge({ type }: { type: string }): React.JSX.Element {
  switch (type) {
    case 'increase':
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Aumento
        </Badge>
      )
    case 'decrease':
      return (
        <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Diminuição
        </Badge>
      )
    case 'correction':
      return (
        <Badge className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
          Correção
        </Badge>
      )
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

// ---------------------------------------------------------------------------
// StockAdjustmentPage
// ---------------------------------------------------------------------------

function StockAdjustmentPage(): React.JSX.Element {
  // Form state
  const [fields, setFields] = useState<AdjustmentFormFields>({
    productId: '',
    warehouseId: '',
    adjustmentType: '',
    quantity: '',
    unitCost: '',
    reason: '',
    notes: ''
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  // Pagination state for history
  const [offset, setOffset] = useState(0)

  // Queries and mutations
  const { data: warehouses } = useWarehouses(COMPANY_ID)
  const adjustmentsQuery = useStockAdjustments(COMPANY_ID, { limit: PAGE_SIZE, offset })
  const createAdjustment = useCreateStockAdjustment(COMPANY_ID)

  const adjustments = adjustmentsQuery.data?.data ?? []
  const total = adjustmentsQuery.data?.total ?? 0
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  // ---------------------------------------------------------------------------
  // Form Validation is inlined in handleFormSubmit
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Form Submission
  // ---------------------------------------------------------------------------

  const handleFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setFieldErrors({})
      setGeneralError(null)

      const errors: FieldErrors = {}

      if (!fields.productId.trim()) {
        errors.productId = 'ID do produto é obrigatório'
      } else if (Number.isNaN(Number(fields.productId)) || Number(fields.productId) <= 0) {
        errors.productId = 'ID do produto deve ser um número positivo'
      }

      if (!fields.warehouseId) {
        errors.warehouseId = 'Armazém é obrigatório'
      }

      if (!fields.adjustmentType) {
        errors.adjustmentType = 'Tipo de ajuste é obrigatório'
      }

      if (!fields.quantity.trim()) {
        errors.quantity = 'Quantidade é obrigatória'
      } else if (Number.isNaN(Number(fields.quantity)) || Number(fields.quantity) <= 0) {
        errors.quantity = 'Quantidade deve ser um número positivo'
      }

      if (!fields.reason.trim()) {
        errors.reason = 'Motivo é obrigatório'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }

      // Open confirmation dialog
      setIsConfirmOpen(true)
    },
    [fields]
  )

  const handleConfirm = useCallback(() => {
    const input: AdjustmentInput = {
      productId: Number(fields.productId),
      warehouseId: Number(fields.warehouseId),
      adjustmentType: fields.adjustmentType as AdjustmentType,
      quantity: Number(fields.quantity),
      reason: fields.reason.trim(),
      createdByUserId: 1
    }

    if (fields.unitCost.trim()) {
      input.unitCost = Number(fields.unitCost)
    }

    if (fields.notes.trim()) {
      input.notes = fields.notes.trim()
    }

    createAdjustment.mutate(input, {
      onSuccess: () => {
        toast.success('Ajuste de estoque registrado com sucesso')
        setIsConfirmOpen(false)
        setFields({
          productId: '',
          warehouseId: '',
          adjustmentType: '',
          quantity: '',
          unitCost: '',
          reason: '',
          notes: ''
        })
        setFieldErrors({})
        setGeneralError(null)
      },
      onError: (error) => {
        setIsConfirmOpen(false)
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError) {
          setGeneralError(error.message)
        } else {
          setGeneralError('Ocorreu um erro inesperado. Tente novamente.')
        }
      }
    })
  }, [fields, createAdjustment])

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  function handlePrevious(): void {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE))
  }

  function handleNext(): void {
    setOffset((prev) => prev + PAGE_SIZE)
  }

  // ---------------------------------------------------------------------------
  // Helpers for confirmation dialog description
  // ---------------------------------------------------------------------------

  function getWarehouseName(warehouseId: string): string {
    const wh = warehouses?.find((w: Warehouse) => w.id === Number(warehouseId))
    return wh ? `${wh.name} (${wh.code})` : `ID ${warehouseId}`
  }

  const confirmDescription = fields.adjustmentType
    ? `Tipo: ${adjustmentTypeLabel(fields.adjustmentType)}\nProduto ID: ${fields.productId}\nArmazém: ${getWarehouseName(fields.warehouseId)}\nQuantidade: ${fields.quantity}\nMotivo: ${fields.reason}`
    : ''

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Ajustes de Estoque"
      description="Registre ajustes de inventário e consulte o histórico de correções."
    >
      {/* Adjustment Form */}
      <PageSection
        title="Novo ajuste"
        description="Preencha os dados do ajuste. Uma confirmação será solicitada antes do envio."
      >
        <form onSubmit={handleFormSubmit} className="grid gap-4">
          {generalError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/10"
            >
              {generalError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Product ID */}
            <div className="grid gap-2">
              <Label htmlFor="adj-product-id">
                ID do Produto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adj-product-id"
                type="number"
                min={1}
                placeholder="Ex: 1"
                value={fields.productId}
                onChange={(e) => setFields((prev) => ({ ...prev, productId: e.target.value }))}
                aria-invalid={!!fieldErrors.productId}
                aria-describedby={fieldErrors.productId ? 'adj-product-id-error' : undefined}
              />
              {fieldErrors.productId && (
                <p id="adj-product-id-error" className="text-xs text-destructive">
                  {fieldErrors.productId}
                </p>
              )}
            </div>

            {/* Warehouse */}
            <div className="grid gap-2">
              <Label htmlFor="adj-warehouse">
                Armazém <span className="text-destructive">*</span>
              </Label>
              <Select
                selectedKey={fields.warehouseId || null}
                onSelectionChange={(key) => setFields((prev) => ({ ...prev, warehouseId: key ? String(key) : '' }))}
                aria-label="Selecionar armazém"
                aria-invalid={!!fieldErrors.warehouseId}
                placeholder="Selecione um armazém"
              >
                <SelectTrigger id="adj-warehouse" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((wh: Warehouse) => (
                    <SelectItem key={wh.id} id={String(wh.id)} textValue={`${wh.name} (${wh.code})`}>
                      {wh.name} ({wh.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.warehouseId && <p className="text-xs text-destructive">{fieldErrors.warehouseId}</p>}
            </div>

            {/* Adjustment Type */}
            <div className="grid gap-2">
              <Label htmlFor="adj-type">
                Tipo de ajuste <span className="text-destructive">*</span>
              </Label>
              <Select
                selectedKey={fields.adjustmentType || null}
                onSelectionChange={(key) =>
                  setFields((prev) => ({
                    ...prev,
                    adjustmentType: key ? (String(key) as AdjustmentType) : ''
                  }))
                }
                aria-label="Selecionar tipo de ajuste"
                aria-invalid={!!fieldErrors.adjustmentType}
                placeholder="Selecione o tipo"
              >
                <SelectTrigger id="adj-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.adjustmentType && <p className="text-xs text-destructive">{fieldErrors.adjustmentType}</p>}
            </div>

            {/* Quantity */}
            <div className="grid gap-2">
              <Label htmlFor="adj-quantity">
                Quantidade <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adj-quantity"
                type="number"
                min={1}
                placeholder="Ex: 10"
                value={fields.quantity}
                onChange={(e) => setFields((prev) => ({ ...prev, quantity: e.target.value }))}
                aria-invalid={!!fieldErrors.quantity}
                aria-describedby={fieldErrors.quantity ? 'adj-quantity-error' : undefined}
              />
              {fieldErrors.quantity && (
                <p id="adj-quantity-error" className="text-xs text-destructive">
                  {fieldErrors.quantity}
                </p>
              )}
            </div>

            {/* Unit Cost (optional) */}
            <div className="grid gap-2">
              <Label htmlFor="adj-unit-cost">Custo unitário</Label>
              <Input
                id="adj-unit-cost"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ex: 15.50"
                value={fields.unitCost}
                onChange={(e) => setFields((prev) => ({ ...prev, unitCost: e.target.value }))}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="grid gap-2">
            <Label htmlFor="adj-reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="adj-reason"
              placeholder="Ex: Contagem física divergente"
              value={fields.reason}
              onChange={(e) => setFields((prev) => ({ ...prev, reason: e.target.value }))}
              aria-invalid={!!fieldErrors.reason}
              aria-describedby={fieldErrors.reason ? 'adj-reason-error' : undefined}
            />
            {fieldErrors.reason && (
              <p id="adj-reason-error" className="text-xs text-destructive">
                {fieldErrors.reason}
              </p>
            )}
          </div>

          {/* Notes (optional) */}
          <div className="grid gap-2">
            <Label htmlFor="adj-notes">Observações</Label>
            <Textarea
              id="adj-notes"
              placeholder="Observações adicionais (opcional)"
              value={fields.notes}
              onChange={(e) => setFields((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" isDisabled={createAdjustment.isPending}>
              {createAdjustment.isPending && <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />}
              Registrar ajuste
            </Button>
          </div>
        </form>
      </PageSection>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Confirmar ajuste de estoque"
        description={confirmDescription}
        confirmLabel="Confirmar ajuste"
        cancelLabel="Cancelar"
        onConfirm={handleConfirm}
        isLoading={createAdjustment.isPending}
      />

      {/* Adjustment History */}
      <PageSection title="Histórico de ajustes" description="Ajustes de estoque realizados recentemente.">
        {adjustmentsQuery.isLoading && <LoadingState message="Carregando histórico..." />}

        {adjustmentsQuery.isError && (
          <ErrorState
            title="Erro ao carregar histórico"
            description="Não foi possível buscar os ajustes. Tente novamente."
            onRetry={() => adjustmentsQuery.refetch()}
          />
        )}

        {adjustmentsQuery.isSuccess && adjustments.length === 0 && (
          <EmptyState
            icon={<ClipboardList />}
            title="Nenhum ajuste registrado"
            description="Ainda não há ajustes de estoque. Registre o primeiro usando o formulário acima."
          />
        )}

        {adjustmentsQuery.isSuccess && adjustments.length > 0 && (
          <>
            <Table aria-label="Histórico de ajustes de estoque">
              <TableHeader>
                <TableRow>
                  <TableHead isRowHeader>ID</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto ID</TableHead>
                  <TableHead>Armazém ID</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody items={adjustments}>
                {(adjustment: StockAdjustment) => (
                  <TableRow key={adjustment.id} id={adjustment.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{adjustment.id}</span>
                    </TableCell>
                    <TableCell>
                      <AdjustmentTypeBadge type={adjustment.adjustmentType} />
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{adjustment.productId}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{adjustment.warehouseId}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{adjustment.quantity}</span>
                    </TableCell>
                    <TableCell>
                      <span className="max-w-[200px] truncate text-sm">{adjustment.reason}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(adjustment.createdAt)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? 'ajuste' : 'ajustes'} • Página {currentPage} de {totalPages}
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

export { StockAdjustmentPage }
