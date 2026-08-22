import type { CreateProductInput, ProductListItem, UpdateProductInput } from '@shared/api'
import type { Category } from '@shared/hooks/use-categories'
import type { UnitOfMeasure } from '@shared/hooks/use-units-of-measure'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Switch } from '@shared/ui/switch'
import { Textarea } from '@shared/ui/textarea'
import { useCallback, useState } from 'react'

// ---------------------------------------------------------------------------
// Field Error
// ---------------------------------------------------------------------------

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductFormValues {
  sku: string
  name: string
  description: string
  barcode: string
  costPrice: string
  salePrice: string
  categoryId: number | null
  unitId: number | null
  trackInventory: boolean
}

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  categories: Category[]
  units: UnitOfMeasure[]
  onSubmitCreate?: (input: CreateProductInput) => void
  onSubmitUpdate?: (input: UpdateProductInput & { id: number }) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  /** Product being edited — required when mode is 'edit' */
  product?: ProductListItem | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialValues(product: ProductListItem | null | undefined): ProductFormValues {
  if (!product) {
    return {
      sku: '',
      name: '',
      description: '',
      barcode: '',
      costPrice: '',
      salePrice: '',
      categoryId: null,
      unitId: null,
      trackInventory: true
    }
  }

  return {
    sku: product.sku,
    name: product.name,
    description: '',
    barcode: '',
    costPrice: product.costPrice !== null ? String(product.costPrice) : '',
    salePrice: product.salePrice !== null ? String(product.salePrice) : '',
    categoryId: null,
    unitId: null,
    trackInventory: product.trackInventory
  }
}

function parsePrice(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed.replace(',', '.'))
  if (Number.isNaN(parsed) || parsed < 0) return undefined
  return parsed
}

// ---------------------------------------------------------------------------
// ProductFormDialog
// ---------------------------------------------------------------------------

function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  categories,
  units,
  onSubmitCreate,
  onSubmitUpdate,
  isLoading,
  fieldErrors,
  product
}: ProductFormDialogProps): React.JSX.Element {
  const [form, setForm] = useState<ProductFormValues>(() => getInitialValues(product))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setForm(getInitialValues(product))
    setLocalErrors({})
  }, [product])

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function updateField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}

    if (mode === 'create' && !form.sku.trim()) {
      errors.sku = 'O SKU é obrigatório.'
    }

    if (!form.name.trim()) {
      errors.name = 'O nome do produto é obrigatório.'
    }

    if (form.costPrice.trim()) {
      const parsed = Number(form.costPrice.replace(',', '.'))
      if (Number.isNaN(parsed) || parsed < 0) {
        errors.costPrice = 'Informe um valor numérico válido.'
      }
    }

    if (form.salePrice.trim()) {
      const parsed = Number(form.salePrice.replace(',', '.'))
      if (Number.isNaN(parsed) || parsed < 0) {
        errors.salePrice = 'Informe um valor numérico válido.'
      }
    }

    return errors
  }

  function handleSubmit(): void {
    const errors = validate()

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors)
      return
    }

    setLocalErrors({})

    if (mode === 'create' && onSubmitCreate) {
      const input: CreateProductInput = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        costPrice: parsePrice(form.costPrice),
        salePrice: parsePrice(form.salePrice),
        categoryId: form.categoryId ?? undefined,
        unitId: form.unitId ?? undefined,
        trackInventory: form.trackInventory
      }
      onSubmitCreate(input)
    }

    if (mode === 'edit' && onSubmitUpdate && product) {
      const input: UpdateProductInput & { id: number } = {
        id: product.id,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        costPrice: parsePrice(form.costPrice),
        salePrice: parsePrice(form.salePrice),
        categoryId: form.categoryId,
        unitId: form.unitId,
        trackInventory: form.trackInventory
      }
      onSubmitUpdate(input)
    }
  }

  const errors = { ...localErrors, ...fieldErrors }

  const title = mode === 'create' ? 'Novo produto' : 'Editar produto'
  const description =
    mode === 'create'
      ? 'Preencha os dados para criar um novo produto no catálogo.'
      : 'Altere os dados do produto selecionado.'
  const submitLabel = mode === 'create' ? 'Criar produto' : 'Salvar alterações'

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} showCloseButton={false} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {/* SKU — only on create */}
        {mode === 'create' && (
          <div className="space-y-1.5">
            <Label htmlFor="product-sku">SKU *</Label>
            <Input
              id="product-sku"
              value={form.sku}
              onChange={(e) => updateField('sku', e.target.value)}
              placeholder="Ex: PROD-001"
              aria-invalid={!!errors.sku}
            />
            <FieldError message={errors.sku} />
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="product-name">Nome *</Label>
          <Input
            id="product-name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Ex: Camiseta Básica"
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="product-description">Descrição</Label>
          <Textarea
            id="product-description"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Descrição do produto (opcional)"
          />
        </div>

        {/* Barcode */}
        <div className="space-y-1.5">
          <Label htmlFor="product-barcode">Código de barras</Label>
          <Input
            id="product-barcode"
            value={form.barcode}
            onChange={(e) => updateField('barcode', e.target.value)}
            placeholder="Ex: 7891234567890"
          />
          <FieldError message={errors.barcode} />
        </div>

        {/* Prices row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-cost-price">Preço de custo</Label>
            <Input
              id="product-cost-price"
              value={form.costPrice}
              onChange={(e) => updateField('costPrice', e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              aria-invalid={!!errors.costPrice}
            />
            <FieldError message={errors.costPrice} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-sale-price">Preço de venda</Label>
            <Input
              id="product-sale-price"
              value={form.salePrice}
              onChange={(e) => updateField('salePrice', e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              aria-invalid={!!errors.salePrice}
            />
            <FieldError message={errors.salePrice} />
          </div>
        </div>

        {/* Category select */}
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select
            placeholder="Selecione uma categoria"
            selectedKey={form.categoryId}
            onSelectionChange={(key) =>
              updateField('categoryId', key === null || key === 'none' ? null : (Number(key) as number | null))
            }
            aria-label="Categoria do produto"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="none" textValue="Nenhuma">
                Nenhuma
              </SelectItem>
              {categories
                .filter((cat) => cat.status === 'active')
                .map((cat) => (
                  <SelectItem key={cat.id} id={cat.id} textValue={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.categoryId} />
        </div>

        {/* Unit select */}
        <div className="space-y-1.5">
          <Label>Unidade de medida</Label>
          <Select
            placeholder="Selecione uma unidade"
            selectedKey={form.unitId}
            onSelectionChange={(key) =>
              updateField('unitId', key === null || key === 'none' ? null : (Number(key) as number | null))
            }
            aria-label="Unidade de medida do produto"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="none" textValue="Nenhuma">
                Nenhuma
              </SelectItem>
              {units
                .filter((u) => u.status === 'active')
                .map((unit) => (
                  <SelectItem key={unit.id} id={unit.id} textValue={`${unit.name} (${unit.symbol})`}>
                    {unit.name} ({unit.symbol})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.unitId} />
        </div>

        {/* Track inventory switch */}
        <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5">
          <div className="space-y-0.5">
            <Label htmlFor="product-track-inventory" className="text-sm font-medium">
              Controlar estoque
            </Label>
            <p className="text-xs text-muted-foreground">
              Habilitar movimentações de entrada e saída para este produto.
            </p>
          </div>
          <Switch
            id="product-track-inventory"
            isSelected={form.trackInventory}
            onChange={(val) => updateField('trackInventory', val)}
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose variant="outline" isDisabled={isLoading}>
          Cancelar
        </DialogClose>
        <Button onPress={handleSubmit} isLoading={isLoading}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export { ProductFormDialog }
export type { ProductFormDialogProps }
