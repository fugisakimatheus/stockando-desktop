import { ApiError } from '@shared/api'
import type { UpdateSupplierInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useSupplierDetail, useUpdateSupplier } from '@shared/hooks/use-suppliers'
import type { SupplierListItem } from '@shared/hooks/use-suppliers'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { useParams } from '@tanstack/react-router'
import { Pencil, ShoppingCart } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'active') {
    return <Badge variant="secondary">Ativo</Badge>
  }
  return <Badge variant="outline">Inativo</Badge>
}

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))
}

// ---------------------------------------------------------------------------
// Edit Supplier Dialog
// ---------------------------------------------------------------------------

interface EditSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: UpdateSupplierInput & { id: number }) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  supplier: SupplierListItem | null
}

function EditSupplierDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  fieldErrors,
  supplier
}: EditSupplierDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setName(supplier?.name ?? '')
    setTradeName(supplier?.tradeName ?? '')
    setEmail(supplier?.email ?? '')
    setPhone('')
    setAddress('')
    setLocalErrors({})
  }, [supplier])

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit(): void {
    const errors: Record<string, string> = {}

    if (!name.trim()) {
      errors.name = 'O nome do fornecedor é obrigatório.'
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors)
      return
    }

    setLocalErrors({})

    if (supplier) {
      onSubmit({
        id: supplier.id,
        name: name.trim(),
        tradeName: tradeName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null
      })
    }
  }

  const errors = { ...localErrors, ...fieldErrors }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Editar fornecedor</DialogTitle>
        <DialogDescription>Atualize as informações do fornecedor.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-supplier-name">Nome *</Label>
          <Input
            id="edit-supplier-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Distribuidora ABC"
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-supplier-trade-name">Nome fantasia</Label>
          <Input
            id="edit-supplier-trade-name"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            placeholder="Ex: ABC Distribuidora"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-supplier-email">E-mail</Label>
          <Input
            id="edit-supplier-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contato@exemplo.com"
            aria-invalid={!!errors.email}
          />
          <FieldError message={errors.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-supplier-phone">Telefone</Label>
          <Input
            id="edit-supplier-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-supplier-address">Endereço</Label>
          <Input
            id="edit-supplier-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, cidade..."
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose variant="outline" isDisabled={isLoading}>
          Cancelar
        </DialogClose>
        <Button onPress={handleSubmit} isLoading={isLoading}>
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// SupplierDetailPage
// ---------------------------------------------------------------------------

function SupplierDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const supplierId = id ? Number(id) : undefined

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1

  const supplierQuery = useSupplierDetail(companyId, supplierId)
  const updateSupplier = useUpdateSupplier(companyId)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Edit handler
  // ---------------------------------------------------------------------------

  function handleUpdate(input: UpdateSupplierInput & { id: number }): void {
    setFieldErrors({})
    updateSupplier.mutate(input, {
      onSuccess: () => {
        toast.success('Fornecedor atualizado com sucesso')
        setIsEditOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao atualizar fornecedor. Tente novamente.')
        }
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (supplierQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando fornecedor..." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (supplierQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar fornecedor"
          description="Não foi possível buscar os detalhes do fornecedor. Tente novamente."
          onRetry={() => supplierQuery.refetch()}
        />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  const supplier = supplierQuery.data
  if (!supplier) {
    return (
      <PageShell>
        <ErrorState title="Fornecedor não encontrado" description="O fornecedor solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const editableSupplier: SupplierListItem = {
    id: supplier.id,
    name: supplier.name,
    documentNumber: supplier.documentNumber,
    tradeName: supplier.tradeName,
    email: supplier.email,
    status: supplier.status
  }

  return (
    <PageShell
      title={supplier.name}
      description={supplier.tradeName ?? undefined}
      actions={
        <Button variant="outline" onPress={() => setIsEditOpen(true)} className="gap-1.5">
          <Pencil className="size-4" />
          Editar
        </Button>
      }
    >
      {/* Supplier Info */}
      <PageSection title="Informações do fornecedor">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Nome" value={supplier.name} />
          <DetailField label="CNPJ/CPF" value={supplier.documentNumber} />
          <DetailField label="Nome fantasia" value={supplier.tradeName ?? '—'} />
          <DetailField label="E-mail" value={supplier.email ?? '—'} />
          <DetailField label="Telefone" value={supplier.phone ?? '—'} />
          <DetailField label="Endereço" value={supplier.address ?? '—'} />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <StatusBadge status={supplier.status} />
          </div>
          <DetailField label="Cadastrado em" value={formatDate(supplier.createdAt)} />
          <DetailField label="Atualizado em" value={formatDate(supplier.updatedAt)} />
        </div>
      </PageSection>

      {/* Purchase Orders Summary */}
      <PageSection title="Resumo">
        <div className="flex items-center gap-3 rounded-lg border border-border/70 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {supplier.purchaseOrderCount}{' '}
              {supplier.purchaseOrderCount === 1 ? 'pedido de compra' : 'pedidos de compra'}
            </p>
            <p className="text-xs text-muted-foreground">Vinculados a este fornecedor</p>
          </div>
        </div>
      </PageSection>

      {/* Edit Dialog */}
      <EditSupplierDialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open)
          if (!open) setFieldErrors({})
        }}
        onSubmit={handleUpdate}
        isLoading={updateSupplier.isPending}
        fieldErrors={fieldErrors}
        supplier={editableSupplier}
      />
    </PageShell>
  )
}

export { SupplierDetailPage }
