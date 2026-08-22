import { ApiError } from '@shared/api'
import type { CreateCustomerInput, CustomerListFilters, CustomerListItem, UpdateCustomerInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCreateCustomer, useCustomers, useDeleteCustomer, useUpdateCustomer } from '@shared/hooks/use-customers'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CustomerFormDialog } from './customer-form-dialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'active') {
    return <Badge variant="secondary">Ativo</Badge>
  }
  return <Badge variant="outline">Inativo</Badge>
}

// ---------------------------------------------------------------------------
// CustomersPage
// ---------------------------------------------------------------------------

function CustomersPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  const [filters, setFilters] = useState<CustomerListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    status: undefined
  })

  const customersQuery = useCustomers(companyId, filters)
  const createCustomer = useCreateCustomer(companyId)
  const updateCustomer = useUpdateCustomer(companyId)
  const deleteCustomer = useDeleteCustomer(companyId)

  const customers = customersQuery.data?.data ?? []
  const total = customersQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerListItem | null>(null)
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerListItem | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function handleSearchChange(value: string): void {
    setFilters((prev) => ({ ...prev, search: value, offset: 0 }))
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

  function handleCreate(input: CreateCustomerInput): void {
    setFieldErrors({})
    createCustomer.mutate(input, {
      onSuccess: () => {
        toast.success('Cliente criado com sucesso')
        setIsCreateOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError && error.code === 'CONFLICT') {
          setFieldErrors({ documentNumber: 'Já existe um cliente com este CPF/CNPJ.' })
        } else {
          toast.error('Erro ao criar cliente. Tente novamente.')
        }
      }
    })
  }

  function handleUpdate(input: UpdateCustomerInput & { id: number }): void {
    setFieldErrors({})
    updateCustomer.mutate(input, {
      onSuccess: () => {
        toast.success('Cliente atualizado com sucesso')
        setEditingCustomer(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao atualizar cliente. Tente novamente.')
        }
      }
    })
  }

  function handleDelete(): void {
    if (!deletingCustomer) return

    deleteCustomer.mutate(deletingCustomer.id, {
      onSuccess: () => {
        toast.success('Cliente excluído com sucesso')
        setDeletingCustomer(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
          toast.error('Este cliente possui documentos associados e não pode ser excluído.')
        } else {
          toast.error('Erro ao excluir cliente. Tente novamente.')
        }
        setDeletingCustomer(null)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Clientes"
      description="Gerencie os clientes cadastrados no sistema."
      actions={
        <Button onPress={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Novo cliente
        </Button>
      }
    >
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por nome ou CPF/CNPJ..."
        />

        {customersQuery.isLoading && <LoadingState message="Carregando clientes..." />}

        {customersQuery.isError && (
          <ErrorState
            title="Erro ao carregar clientes"
            description="Não foi possível buscar a lista de clientes. Tente novamente."
            onRetry={() => customersQuery.refetch()}
          />
        )}

        {customersQuery.isSuccess && customers.length === 0 && (
          <EmptyState
            icon={<Users />}
            title="Nenhum cliente encontrado"
            description={
              filters.search
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece adicionando o primeiro cliente ao sistema.'
            }
            action={
              !filters.search ? (
                <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
                  <Plus className="size-4" />
                  Adicionar cliente
                </Button>
              ) : undefined
            }
          />
        )}

        {customersQuery.isSuccess && customers.length > 0 && (
          <>
            <Table aria-label="Lista de clientes">
              <TableHeader>
                <TableHead isRowHeader>Nome</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableHeader>
              <TableBody items={customers}>
                {(customer: CustomerListItem) => (
                  <TableRow key={customer.id} id={customer.id}>
                    <TableCell>
                      <span className="font-medium text-foreground">{customer.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{customer.documentNumber ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{customer.email ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{customer.phone ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${customer.name}`}
                          onPress={() => {
                            setFieldErrors({})
                            setEditingCustomer(customer)
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir ${customer.name}`}
                          onPress={() => setDeletingCustomer(customer)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 dark:border-white/6">
              <p className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? 'cliente' : 'clientes'} · Página {currentPage} de {totalPages}
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

      {/* Create Customer Dialog */}
      <CustomerFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setFieldErrors({})
        }}
        mode="create"
        onSubmitCreate={handleCreate}
        isLoading={createCustomer.isPending}
        fieldErrors={fieldErrors}
      />

      {/* Edit Customer Dialog */}
      <CustomerFormDialog
        open={!!editingCustomer}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCustomer(null)
            setFieldErrors({})
          }
        }}
        mode="edit"
        onSubmitUpdate={handleUpdate}
        isLoading={updateCustomer.isPending}
        fieldErrors={fieldErrors}
        customer={editingCustomer}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingCustomer}
        onOpenChange={(open) => {
          if (!open) setDeletingCustomer(null)
        }}
        title="Excluir cliente"
        description={`Tem certeza que deseja excluir o cliente "${deletingCustomer?.name}"? Clientes com cotações ou pedidos associados não podem ser excluídos.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={deleteCustomer.isPending}
      />
    </PageShell>
  )
}

export { CustomersPage }
