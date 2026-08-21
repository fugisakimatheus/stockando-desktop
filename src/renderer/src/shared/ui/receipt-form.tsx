import { cn } from '@shared/lib/cn'
import { PackageCheckIcon } from 'lucide-react'
import { type FormEvent, useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Textarea } from './textarea'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptFormItem {
  id: number // purchaseOrderItemId
  productName: string
  productSku: string
  orderedQuantity: number
  receivedQuantity: number // already received
  remainingQuantity: number // ordered - received
}

interface ReceiptFormProps {
  items: ReceiptFormItem[]
  warehouses: { id: number; name: string }[]
  onSubmit: (data: {
    items: { purchaseOrderItemId: number; receivedQuantity: number; warehouseId: number }[]
    notes?: string
  }) => void
  disabled?: boolean
}

interface ItemEntryState {
  quantity: string
  warehouseId: string
  error?: string
}

// ---------------------------------------------------------------------------
// ReceiptForm
// ---------------------------------------------------------------------------

function ReceiptForm({ items, warehouses, onSubmit, disabled = false }: ReceiptFormProps): React.JSX.Element {
  const [entries, setEntries] = useState<Record<number, ItemEntryState>>(() => {
    const initial: Record<number, ItemEntryState> = {}
    for (const item of items) {
      initial[item.id] = { quantity: '', warehouseId: '' }
    }
    return initial
  })
  const [notes, setNotes] = useState('')

  const updateEntry = useCallback((itemId: number, field: keyof ItemEntryState, value: string) => {
    setEntries((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value, error: undefined }
    }))
  }, [])

  const hasAnyQuantityEntered = useMemo(() => {
    return Object.values(entries).some((entry) => {
      const qty = Number(entry.quantity)
      return !Number.isNaN(qty) && qty > 0
    })
  }, [entries])

  const isSubmitDisabled = disabled || !hasAnyQuantityEntered

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      let hasErrors = false
      const updatedEntries = { ...entries }

      for (const item of items) {
        const entry = entries[item.id]
        if (!entry) continue

        const qty = Number(entry.quantity)

        // Skip items with no quantity entered
        if (!entry.quantity.trim()) continue

        // Validate quantity
        if (Number.isNaN(qty) || qty <= 0) {
          updatedEntries[item.id] = { ...entry, error: 'Quantidade deve ser maior que zero' }
          hasErrors = true
          continue
        }

        if (qty > item.remainingQuantity) {
          updatedEntries[item.id] = {
            ...entry,
            error: `Quantidade não pode exceder ${item.remainingQuantity}`
          }
          hasErrors = true
          continue
        }

        // Validate warehouse
        if (!entry.warehouseId) {
          updatedEntries[item.id] = { ...entry, error: 'Selecione um armazém' }
          hasErrors = true
        }
      }

      if (hasErrors) {
        setEntries(updatedEntries)
        return
      }

      // Build submission data
      const submissionItems: { purchaseOrderItemId: number; receivedQuantity: number; warehouseId: number }[] = []

      for (const item of items) {
        const entry = entries[item.id]
        if (!entry) continue

        const qty = Number(entry.quantity)
        if (!entry.quantity.trim() || Number.isNaN(qty) || qty <= 0) continue

        submissionItems.push({
          purchaseOrderItemId: item.id,
          receivedQuantity: qty,
          warehouseId: Number(entry.warehouseId)
        })
      }

      if (submissionItems.length === 0) return

      onSubmit({
        items: submissionItems,
        notes: notes.trim() || undefined
      })
    },
    [entries, items, notes, onSubmit]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Item rows */}
      <div className="space-y-3">
        {items.map((item) => {
          const isFullyReceived = item.remainingQuantity <= 0
          const entry = entries[item.id]

          return (
            <div
              key={item.id}
              className={cn(
                'rounded-xl border border-border/80 p-4 transition-colors dark:border-white/10',
                isFullyReceived
                  ? 'bg-muted/50 opacity-60 dark:bg-muted/20'
                  : 'bg-gradient-to-br from-primary/2 via-transparent to-transparent dark:from-primary/4'
              )}
            >
              {/* Product info header */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">SKU: {item.productSku}</p>
                </div>

                {isFullyReceived && (
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <PackageCheckIcon className="size-3" />
                    Completo
                  </div>
                )}
              </div>

              {/* Quantity summary */}
              <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
                <span>
                  Pedido: <span className="font-medium text-foreground">{item.orderedQuantity}</span>
                </span>
                <span>
                  Recebido: <span className="font-medium text-foreground">{item.receivedQuantity}</span>
                </span>
                <span>
                  Restante: <span className="font-medium text-foreground">{item.remainingQuantity}</span>
                </span>
              </div>

              {/* Input fields - only show for items not fully received */}
              {!isFullyReceived && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`receipt-qty-${item.id}`} className="text-xs">
                      Quantidade a receber
                    </Label>
                    <Input
                      id={`receipt-qty-${item.id}`}
                      type="number"
                      min={0}
                      max={item.remainingQuantity}
                      step="any"
                      placeholder={`Máx: ${item.remainingQuantity}`}
                      value={entry?.quantity ?? ''}
                      onChange={(e) => updateEntry(item.id, 'quantity', e.target.value)}
                      disabled={disabled}
                      aria-invalid={!!entry?.error}
                      aria-describedby={entry?.error ? `receipt-error-${item.id}` : undefined}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor={`receipt-wh-${item.id}`} className="text-xs">
                      Armazém destino
                    </Label>
                    <Select
                      selectedKey={entry?.warehouseId || null}
                      onSelectionChange={(key) => updateEntry(item.id, 'warehouseId', key ? String(key) : '')}
                      placeholder="Selecione..."
                      aria-label={`Armazém para ${item.productName}`}
                      isDisabled={disabled}
                    >
                      <SelectTrigger id={`receipt-wh-${item.id}`} size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh) => (
                          <SelectItem key={wh.id} id={String(wh.id)} textValue={wh.name}>
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {entry?.error && (
                    <p id={`receipt-error-${item.id}`} className="col-span-full text-xs text-destructive" role="alert">
                      {entry.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Notes field */}
      <div className="grid gap-1.5">
        <Label htmlFor="receipt-notes" className="text-xs">
          Notas (opcional)
        </Label>
        <Textarea
          id="receipt-notes"
          placeholder="Observações sobre o recebimento..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" isDisabled={isSubmitDisabled}>
          <PackageCheckIcon className="size-4" data-icon="inline-start" />
          Registrar recebimento
        </Button>
      </div>
    </form>
  )
}

export { ReceiptForm }
export type { ReceiptFormItem, ReceiptFormProps }
