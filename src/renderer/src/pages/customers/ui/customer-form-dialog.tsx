import type { CreateCustomerInput, CustomerListItem, UpdateCustomerInput } from '@shared/api'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
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

interface CustomerFormValues {
  name: string
  documentNumber: string
  email: string
  phone: string
  address: string
  customerType: 'individual' | 'business'
}

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  onSubmitCreate?: (input: CreateCustomerInput) => void
  onSubmitUpdate?: (input: UpdateCustomerInput & { id: number }) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  customer?: CustomerListItem | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialValues(customer: CustomerListItem | null | undefined): CustomerFormValues {
  if (!customer) {
    return {
      name: '',
      documentNumber: '',
      email: '',
      phone: '',
      address: '',
      customerType: 'individual'
    }
  }

  return {
    name: customer.name,
    documentNumber: customer.documentNumber ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    address: '',
    customerType: 'individual'
  }
}

// ---------------------------------------------------------------------------
// CustomerFormDialog
// ---------------------------------------------------------------------------

function CustomerFormDialog({
  open,
  onOpenChange,
  mode,
  onSubmitCreate,
  onSubmitUpdate,
  isLoading,
  fieldErrors,
  customer
}: CustomerFormDialogProps): React.JSX.Element {
  const [form, setForm] = useState<CustomerFormValues>(() => getInitialValues(customer))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setForm(getInitialValues(customer))
    setLocalErrors({})
  }, [customer])

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function updateField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}

    if (!form.name.trim()) {
      errors.name = 'O nome do cliente é obrigatório.'
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Informe um email válido.'
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
      const input: CreateCustomerInput = {
        name: form.name.trim(),
        documentNumber: form.documentNumber.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        customerType: form.customerType
      }
      onSubmitCreate(input)
    }

    if (mode === 'edit' && onSubmitUpdate && customer) {
      const input: UpdateCustomerInput & { id: number } = {
        id: customer.id,
        name: form.name.trim(),
        documentNumber: form.documentNumber.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null
      }
      onSubmitUpdate(input)
    }
  }

  const errors = { ...localErrors, ...fieldErrors }

  const title = mode === 'create' ? 'Novo cliente' : 'Editar cliente'
  const description =
    mode === 'create' ? 'Preencha os dados para cadastrar um novo cliente.' : 'Altere os dados do cliente selecionado.'
  const submitLabel = mode === 'create' ? 'Criar cliente' : 'Salvar alterações'

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} showCloseButton={false} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="customer-name">Nome *</Label>
          <Input
            id="customer-name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Ex: João da Silva"
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        {/* Document Number */}
        <div className="space-y-1.5">
          <Label htmlFor="customer-document">CPF/CNPJ</Label>
          <Input
            id="customer-document"
            value={form.documentNumber}
            onChange={(e) => updateField('documentNumber', e.target.value)}
            placeholder="Ex: 000.000.000-00"
          />
          <FieldError message={errors.documentNumber} />
        </div>

        {/* Email and Phone row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="email@exemplo.com"
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Telefone</Label>
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="(00) 00000-0000"
            />
            <FieldError message={errors.phone} />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <Label htmlFor="customer-address">Endereço</Label>
          <Input
            id="customer-address"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="Rua, número, bairro, cidade"
          />
        </div>

        {/* Customer Type — only on create */}
        {mode === 'create' && (
          <div className="space-y-1.5">
            <Label>Tipo de cliente</Label>
            <Select
              selectedKey={form.customerType}
              onSelectionChange={(key) => updateField('customerType', key as 'individual' | 'business')}
              aria-label="Tipo de cliente"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="individual" textValue="Pessoa Física">
                  Pessoa Física
                </SelectItem>
                <SelectItem id="business" textValue="Pessoa Jurídica">
                  Pessoa Jurídica
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
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

export { CustomerFormDialog }
export type { CustomerFormDialogProps }
