import { ApiError } from '@shared/api'
import type { CreateSupplierInput, UpdateSupplierInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCreateSupplier, useDeleteSupplier, useSuppliers, useUpdateSupplier } from '@shared/hooks/use-suppliers'
import type { SupplierListFilters, SupplierListItem } from '@shared/hooks/use-suppliers'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { id: 'all', name: 'Todos os status' },
  { id: 'active', name: 'Ativo' },
  { id: 'inactive', name: 'Inativo' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Supplier Form Dialog
// ---------------------------------------------------------------------------

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  onSubmit: (input: CreateSupplierInput | (UpdateSupplierInput & { id: number })) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  supplier?: SupplierListItem | null
}

function SupplierFormDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
  isLoading,
  fieldErrors,
  supplier
}: SupplierFormDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setName(supplier?.name ?? '')
    setDocumentNumber(supplier?.documentNumber ?? '')
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
    if (!documentNumber.trim()) {
      errors.documentNumber = 'O CNPJ/CPF é obrigatório.'
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors)
      return
    }

    setLocalErrors({})

    if (mode === 'create') {
      onSubmit({
        name: name.trim(),
        documentNumber: documentNumber.trim(),
        tradeName: tradeName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null
      })
    } else if (supplier) {
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
        <DialogTitle>{mode === 'create' ? 'Novo fornecedor' : 'Editar fornecedor'}</DialogTitle>
        <DialogDescription>
          {mode === 'create'
            ? 'Preencha os dados para cadastrar um novo fornecedor.'
            : 'Atualize as informações do fornecedor.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="supplier-name">Nome *</Label>
          <Input
            id="supplier-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Distribuidora ABC"
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier-document-number">CNPJ/CPF *</Label>
          <Input
            id="supplier-document-number"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            placeholder="Ex: 12.345.678/0001-90"
            aria-invalid={!!errors.documentNumber}
            disabled={mode === 'edit'}
          />
          <FieldError message={errors.documentNumber} />
          {mode === 'edit' && (
            <p className="text-xs text-muted-foreground">O documento não pode ser alterado após o cadastro.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier-trade-name">Nome fantasia</Label>
          <Input
            id="supplier-trade-name"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            placeholder="Ex: ABC Distribuidora"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier-email">E-mail</Label>
          <Input
            id="supplier-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contato@exemplo.com"
            aria-invalid={!!errors.email}
          />
          <FieldError message={errors.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier-phone">Telefone</Label>
          <Input
            id="supplier-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier-address">Endereço</Label>
          <Input
            id="supplier-address"
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
          {mode === 'create' ? 'Cadastrar' : 'Salvar'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// SuppliersPage
// ---------------------------------------------------------------------------

function SuppliersPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1

  const [filters, setFilters] = useState<SupplierListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    status: undefined
  })

  const suppliersQuery = useSuppliers(companyId, filters)
  const createSupplier = useCreateSupplier(companyId)
  const updateSupplier = useUpdateSupplier(companyId)
  const deleteSupplier = useDeleteSupplier(companyId)

  const suppliers = suppliersQuery.data?.data ?? []
  const total = suppliersQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierListItem | null>(null)
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierListItem | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function handleSearchChange(value: string): void {
    setFilters((prev) => ({ ...prev, search: value, offset: 0 }))
  }

  function handleStatusChange(key: React.Key | null): void {
    const status = key === 'all' || key === null ? undefined : String(key)
    setFilters((prev) => ({ ...prev, status, offset: 0 }))
  }

  function handlePrevious(): void {
    setFilters((prev) => ({ ...prev, offset: Math.max(0, prev.offset - PAGE_SIZE) }))
  }

  function handleNext(): void {
    setFilters((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }))
  }

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------

  function handleCreate(input: CreateSupplierInput | (UpdateSupplierInput & { id: number })): void {
    setFieldErrors({})
    createSupplier.mutate(input as CreateSupplierInput, {
      onSuccess: () => {
        toast.success('Fornecedor criado com sucesso')
        setIsCreateOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError && error.code === 'CONFLICT') {
          setFieldErrors({ documentNumber: 'Já existe um fornecedor com este CNPJ/CPF.' })
        } else {
          toast.error('Erro ao criar fornecedor. Tente novamente.')
        }
      }
    })
  }

  function handleUpdate(input: CreateSupplierInput | (UpdateSupplierInput & { id: number })): void {
    setFieldErrors({})
    updateSupplier.mutate(input as UpdateSupplierInput & { id: number }, {
      onSuccess: () => {
        toast.success('Fornecedor atualizado com sucesso')
        setEditingSupplier(null)
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

  function handleDelete(): void {
    if (!deletingSupplier) return

    deleteSupplier.mutate(deletingSupplier.id, {
      onSuccess: () => {
        toast.success('Fornecedor excluído com sucesso')
        setDeletingSupplier(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'ENTITY_REFERENCED') {
          toast.error('Não é possível excluir este fornecedor pois existem pedidos de compra vinculados.')
        } else {
          toast.error('Erro ao excluir fornecedor. Tente novamente.')
        }
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Fornecedores"
      description="Cadastre e gerencie os fornecedores do negócio."
      actions={
        <Button onPress={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Novo fornecedor
        </Button>
      }
    >
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por nome ou CNPJ..."
        >
          <Select
            selectedKey={filters.status ?? 'all'}
            onSelectionChange={handleStatusChange}
            aria-label="Filtrar por status"
            placeholder="Status"
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>

        {suppliersQuery.isLoading && <LoadingState message="Carregando fornecedores..." />}

        {suppliersQuery.isError && (
          <ErrorState
            title="Erro ao carregar fornecedores"
            description="Não foi possível buscar a lista de fornecedores. Tente novamente."
            onRetry={() => suppliersQuery.refetch()}
          />
        )}

        {suppliersQuery.isSuccess && suppliers.length === 0 && (
          <EmptyState
            icon={<Truck />}
            title="Nenhum fornecedor encontrado"
            description={
              filters.search || filters.status
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece adicionando o primeiro fornecedor ao cadastro.'
            }
            action={
              !filters.search && !filters.status ? (
                <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
                  <Plus className="size-4" />
                  Adicionar fornecedor
                </Button>
              ) : undefined
            }
          />
        )}

        {suppliersQuery.isSuccess && suppliers.length > 0 && (
          <>
            <Table aria-label="Lista de fornecedores">
              <TableHeader>
                <TableHead isRowHeader>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Nome fantasia</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableHeader>
              <TableBody items={suppliers}>
                {(supplier: SupplierListItem) => (
                  <TableRow key={supplier.id} id={supplier.id}>
                    <TableCell>
                      <span className="font-medium text-foreground">{supplier.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{supplier.documentNumber}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{supplier.tradeName ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{supplier.email ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={supplier.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${supplier.name}`}
                          onPress={() => {
                            setFieldErrors({})
                            setEditingSupplier(supplier)
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir ${supplier.name}`}
                          onPress={() => setDeletingSupplier(supplier)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 dark:border-white/6">
              <p className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? 'fornecedor' : 'fornecedores'} · Página {currentPage} de {totalPages}
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

      {/* Create Supplier Dialog */}
      <SupplierFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setFieldErrors({})
        }}
        mode="create"
        onSubmit={handleCreate}
        isLoading={createSupplier.isPending}
        fieldErrors={fieldErrors}
      />

      {/* Edit Supplier Dialog */}
      <SupplierFormDialog
        open={!!editingSupplier}
        onOpenChange={(open) => {
          if (!open) {
            setEditingSupplier(null)
            setFieldErrors({})
          }
        }}
        mode="edit"
        onSubmit={handleUpdate}
        isLoading={updateSupplier.isPending}
        fieldErrors={fieldErrors}
        supplier={editingSupplier}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingSupplier}
        onOpenChange={(open) => {
          if (!open) setDeletingSupplier(null)
        }}
        title="Excluir fornecedor"
        description={`Tem certeza que deseja excluir o fornecedor "${deletingSupplier?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={deleteSupplier.isPending}
      />
    </PageShell>
  )
}

export { SuppliersPage }
