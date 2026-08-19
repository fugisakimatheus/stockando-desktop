import { ApiError } from '@shared/api'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Textarea } from '@shared/ui/textarea'
import { Loader2Icon } from 'lucide-react'
import { type FormEvent, useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useRecordTransfer } from '../../stock/hooks/use-stock'
import { useWarehouses } from '../../warehouses/hooks/use-warehouses'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransferFormFields {
  productId: string
  sourceWarehouseId: string
  destinationWarehouseId: string
  quantity: string
  notes: string
}

type FieldErrors = Partial<Record<string, string>>

// ---------------------------------------------------------------------------
// TransferForm
// ---------------------------------------------------------------------------

function TransferForm({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }): React.JSX.Element {
  const [fields, setFields] = useState<TransferFormFields>({
    productId: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    quantity: '',
    notes: ''
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const { data: warehouses } = useWarehouses(COMPANY_ID)
  const recordTransfer = useRecordTransfer(COMPANY_ID)

  const resetForm = useCallback(() => {
    setFields({
      productId: '',
      sourceWarehouseId: '',
      destinationWarehouseId: '',
      quantity: '',
      notes: ''
    })
    setFieldErrors({})
    setGeneralError(null)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = useCallback(
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

      if (!fields.sourceWarehouseId) {
        errors.sourceWarehouseId = 'Armazém de origem é obrigatório'
      }

      if (!fields.destinationWarehouseId) {
        errors.destinationWarehouseId = 'Armazém de destino é obrigatório'
      }

      if (
        fields.sourceWarehouseId &&
        fields.destinationWarehouseId &&
        fields.sourceWarehouseId === fields.destinationWarehouseId
      ) {
        errors.destinationWarehouseId = 'O armazém de destino deve ser diferente do de origem'
      }

      if (!fields.quantity.trim()) {
        errors.quantity = 'Quantidade é obrigatória'
      } else if (Number.isNaN(Number(fields.quantity)) || Number(fields.quantity) <= 0) {
        errors.quantity = 'Quantidade deve ser maior que zero'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }

      recordTransfer.mutate(
        {
          productId: Number(fields.productId),
          sourceWarehouseId: Number(fields.sourceWarehouseId),
          destinationWarehouseId: Number(fields.destinationWarehouseId),
          quantity: Number(fields.quantity),
          notes: fields.notes.trim() || undefined
        },
        {
          onSuccess: () => {
            toast.success('Transferência registrada com sucesso')
            handleClose()
          },
          onError: (error) => {
            if (error instanceof ApiError && error.fields) {
              setFieldErrors(error.fields)
            } else if (error instanceof ApiError) {
              setGeneralError(error.message)
            } else {
              setGeneralError('Ocorreu um erro inesperado. Tente novamente.')
            }
          }
        }
      )
    },
    [fields, recordTransfer, handleClose]
  )

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      className="sm:max-w-md"
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle>Nova transferência</DialogTitle>
        <DialogDescription>
          Transfira produtos entre armazéns. A origem e o destino devem ser diferentes.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="grid gap-4">
        {generalError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/10"
          >
            {generalError}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="transfer-product-id">
            ID do Produto <span className="text-destructive">*</span>
          </Label>
          <Input
            id="transfer-product-id"
            type="number"
            min={1}
            placeholder="Ex: 1"
            value={fields.productId}
            onChange={(e) => setFields((prev) => ({ ...prev, productId: e.target.value }))}
            aria-invalid={!!fieldErrors.productId}
            aria-describedby={fieldErrors.productId ? 'transfer-product-id-error' : undefined}
            autoFocus
          />
          {fieldErrors.productId && (
            <p id="transfer-product-id-error" className="text-xs text-destructive">
              {fieldErrors.productId}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="transfer-source-warehouse">
            Armazém de origem <span className="text-destructive">*</span>
          </Label>
          <Select
            selectedKey={fields.sourceWarehouseId || null}
            onSelectionChange={(key) =>
              setFields((prev) => ({
                ...prev,
                sourceWarehouseId: key ? String(key) : ''
              }))
            }
            placeholder="Selecione o armazém de origem"
            aria-label="Armazém de origem"
            aria-invalid={!!fieldErrors.sourceWarehouseId}
            aria-describedby={fieldErrors.sourceWarehouseId ? 'transfer-source-warehouse-error' : undefined}
          >
            <SelectTrigger id="transfer-source-warehouse">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((wh) => (
                <SelectItem key={wh.id} id={String(wh.id)} textValue={`${wh.name} (${wh.code})`}>
                  {wh.name} ({wh.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.sourceWarehouseId && (
            <p id="transfer-source-warehouse-error" className="text-xs text-destructive">
              {fieldErrors.sourceWarehouseId}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="transfer-destination-warehouse">
            Armazém de destino <span className="text-destructive">*</span>
          </Label>
          <Select
            selectedKey={fields.destinationWarehouseId || null}
            onSelectionChange={(key) =>
              setFields((prev) => ({
                ...prev,
                destinationWarehouseId: key ? String(key) : ''
              }))
            }
            placeholder="Selecione o armazém de destino"
            aria-label="Armazém de destino"
            aria-invalid={!!fieldErrors.destinationWarehouseId}
            aria-describedby={fieldErrors.destinationWarehouseId ? 'transfer-destination-warehouse-error' : undefined}
          >
            <SelectTrigger id="transfer-destination-warehouse">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((wh) => (
                <SelectItem key={wh.id} id={String(wh.id)} textValue={`${wh.name} (${wh.code})`}>
                  {wh.name} ({wh.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.destinationWarehouseId && (
            <p id="transfer-destination-warehouse-error" className="text-xs text-destructive">
              {fieldErrors.destinationWarehouseId}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="transfer-quantity">
            Quantidade <span className="text-destructive">*</span>
          </Label>
          <Input
            id="transfer-quantity"
            type="number"
            min={1}
            placeholder="Ex: 10"
            value={fields.quantity}
            onChange={(e) => setFields((prev) => ({ ...prev, quantity: e.target.value }))}
            aria-invalid={!!fieldErrors.quantity}
            aria-describedby={fieldErrors.quantity ? 'transfer-quantity-error' : undefined}
          />
          {fieldErrors.quantity && (
            <p id="transfer-quantity-error" className="text-xs text-destructive">
              {fieldErrors.quantity}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="transfer-notes">Notas</Label>
          <Textarea
            id="transfer-notes"
            placeholder="Observações sobre a transferência (opcional)"
            value={fields.notes}
            onChange={(e) => setFields((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={recordTransfer.isPending}>
            Cancelar
          </DialogClose>
          <Button type="submit" isDisabled={recordTransfer.isPending}>
            {recordTransfer.isPending && <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />}
            Registrar transferência
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

export { TransferForm }
