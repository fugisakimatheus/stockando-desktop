import { cn } from '@shared/lib/cn'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { Button } from './button'

// === Types ===

interface DocumentItemRow {
  id?: number
  productId: number
  productName?: string
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
}

interface ProductOption {
  id: number
  name: string
  sku: string
}

interface DocumentItemsEditorProps {
  items: DocumentItemRow[]
  onChange: (items: DocumentItemRow[]) => void
  products: ProductOption[]
  priceField?: 'unitPrice' | 'unitCost'
  disabled?: boolean
}

// === Utility ===

function computeLineTotal(quantity: number, unitPrice: number, discountAmount: number): number {
  const raw = quantity * unitPrice - discountAmount
  return Math.round((raw + Number.EPSILON) * 100) / 100
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// === Memoized Item Row ===

interface ItemRowProps {
  item: DocumentItemRow
  index: number
  products: ProductOption[]
  priceLabel: string
  disabled: boolean
  onUpdate: (index: number, field: keyof DocumentItemRow, value: number) => void
  onRemove: (index: number) => void
}

function isInvalidQuantity(value: number): boolean {
  return value <= 0 || Number.isNaN(value)
}

function isInvalidPrice(value: number): boolean {
  return value <= 0 || Number.isNaN(value)
}

function isInvalidDiscount(value: number): boolean {
  return value < 0 || Number.isNaN(value)
}

const ItemRow = React.memo(function ItemRow({
  item,
  index,
  products,
  priceLabel,
  disabled,
  onUpdate,
  onRemove
}: ItemRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_5rem_6rem_6rem_6rem_2.5rem] items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2 transition-colors dark:border-white/8 dark:bg-card/30',
        disabled && 'opacity-60'
      )}
    >
      {/* Product select */}
      <select
        value={item.productId}
        disabled={disabled}
        onChange={(e) => onUpdate(index, 'productId', Number(e.target.value))}
        className={cn(
          'h-8 w-full truncate rounded-lg border border-border/70 bg-background px-2 text-sm transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-background/60',
          item.productId === 0 && 'text-muted-foreground'
        )}
        aria-label={`Produto linha ${index + 1}`}
      >
        <option value={0} disabled>
          Selecione...
        </option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.sku})
          </option>
        ))}
      </select>

      {/* Quantity */}
      <input
        type="number"
        min={0.01}
        step="any"
        value={item.quantity || ''}
        disabled={disabled}
        onChange={(e) => onUpdate(index, 'quantity', Number.parseFloat(e.target.value) || 0)}
        className={cn(
          'h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-right text-sm tabular-nums transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-background/60',
          isInvalidQuantity(item.quantity) && 'border-destructive/60 ring-1 ring-destructive/20'
        )}
        aria-label={`Quantidade linha ${index + 1}`}
        aria-invalid={isInvalidQuantity(item.quantity)}
      />

      {/* Unit Price / Unit Cost */}
      <input
        type="number"
        min={0.01}
        step="any"
        value={item.unitPrice || ''}
        disabled={disabled}
        onChange={(e) => onUpdate(index, 'unitPrice', Number.parseFloat(e.target.value) || 0)}
        className={cn(
          'h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-right text-sm tabular-nums transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-background/60',
          isInvalidPrice(item.unitPrice) && 'border-destructive/60 ring-1 ring-destructive/20'
        )}
        aria-label={`${priceLabel} linha ${index + 1}`}
        aria-invalid={isInvalidPrice(item.unitPrice)}
      />

      {/* Discount */}
      <input
        type="number"
        min={0}
        step="any"
        value={item.discountAmount || ''}
        disabled={disabled}
        onChange={(e) => onUpdate(index, 'discountAmount', Number.parseFloat(e.target.value) || 0)}
        className={cn(
          'h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-right text-sm tabular-nums transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-background/60',
          isInvalidDiscount(item.discountAmount) && 'border-destructive/60 ring-1 ring-destructive/20'
        )}
        aria-label={`Desconto linha ${index + 1}`}
        aria-invalid={isInvalidDiscount(item.discountAmount)}
      />

      {/* Line Total (read-only) */}
      <span className="text-right text-sm font-medium text-foreground tabular-nums">
        {formatCurrency(item.lineTotal)}
      </span>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon-xs"
        isDisabled={disabled}
        onPress={() => onRemove(index)}
        aria-label={`Remover linha ${index + 1}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
})

// === Main Component ===

function DocumentItemsEditor({
  items,
  onChange,
  products,
  priceField = 'unitPrice',
  disabled = false
}: DocumentItemsEditorProps): React.JSX.Element {
  const priceLabel = priceField === 'unitCost' ? 'Custo unit.' : 'Preço unit.'

  const documentTotal = React.useMemo(() => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [items])

  const handleUpdate = React.useCallback(
    (index: number, field: keyof DocumentItemRow, value: number) => {
      const updated = items.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, [field]: value }

        // If product changed, update the productName
        if (field === 'productId') {
          const product = products.find((p) => p.id === value)
          next.productName = product?.name
        }

        // Recompute line total for value-affecting fields
        if (field === 'quantity' || field === 'unitPrice' || field === 'discountAmount') {
          next.lineTotal = computeLineTotal(next.quantity, next.unitPrice, next.discountAmount)
        }

        return next
      })
      onChange(updated)
    },
    [items, onChange, products]
  )

  const handleRemove = React.useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index))
    },
    [items, onChange]
  )

  const handleAdd = React.useCallback(() => {
    const newItem: DocumentItemRow = {
      productId: 0,
      quantity: 1,
      unitPrice: 0,
      discountAmount: 0,
      lineTotal: 0
    }
    onChange([...items, newItem])
  }, [items, onChange])

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="grid grid-cols-[1fr_5rem_6rem_6rem_6rem_2.5rem] items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <span>Produto</span>
        <span className="text-right">Qtd.</span>
        <span className="text-right">{priceLabel}</span>
        <span className="text-right">Desconto</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {/* Item rows */}
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <ItemRow
            key={item.id ?? `new-${index}`}
            item={item}
            index={index}
            products={products}
            priceLabel={priceLabel}
            disabled={disabled}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
          />
        ))}
      </div>

      {/* Add button */}
      {!disabled && (
        <Button variant="outline" size="sm" onPress={handleAdd} className="w-fit">
          <PlusIcon data-icon="inline-start" className="size-3.5" />
          Adicionar item
        </Button>
      )}

      {/* Document total */}
      <div className="mt-2 flex items-center justify-end gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 dark:border-white/8 dark:bg-muted/20">
        <span className="text-sm font-medium text-muted-foreground">Total do documento</span>
        <span className="text-base font-semibold text-foreground tabular-nums">{formatCurrency(documentTotal)}</span>
      </div>
    </div>
  )
}

export { DocumentItemsEditor }
export type { DocumentItemRow, DocumentItemsEditorProps, ProductOption }
