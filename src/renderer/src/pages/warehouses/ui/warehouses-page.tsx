import { ApiError } from '@shared/api'
import type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '@shared/api'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@shared/ui/dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageShell } from '@shared/ui/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Loader2Icon, PencilIcon, Plus, TrashIcon, Warehouse as WarehouseIcon } from 'lucide-react'
import { type FormEvent, useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from '../hooks/use-warehouses'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateFormFields {
  name: string
  code: string
  address: string
}

interface EditFormFields {
  name: string
  address: string
}

type FieldErrors = Partial<Record<string, string>>

// ---------------------------------------------------------------------------
// WarehousesPage
// ---------------------------------------------------------------------------

function WarehousesPage(): React.JSX.Element {
  const { data: warehouses, isLoading, isError, refetch } = useWarehouses(COMPANY_ID)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  return (
    <PageShell
      title="Armazéns"
      description="Gerencie os armazéns e locais de estoque da empresa."
      actions={
        <DialogTrigger isOpen={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Button className="gap-1.5">
            <Plus className="size-4" />
            Novo armazém
          </Button>
          <CreateWarehouseDialog onClose={() => setIsCreateOpen(false)} />
        </DialogTrigger>
      }
    >
      {isLoading && <LoadingState message="Carregando armazéns..." />}

      {isError && (
        <ErrorState
          title="Erro ao carregar armazéns"
          description="Não foi possível carregar a lista de armazéns. Verifique sua conexão e tente novamente."
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && warehouses && warehouses.length === 0 && (
        <EmptyState
          icon={<WarehouseIcon />}
          title="Nenhum armazém cadastrado"
          description="Cadastre seu primeiro armazém para começar a gerenciar o estoque."
          action={
            <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              Novo armazém
            </Button>
          }
        />
      )}

      {!isLoading && !isError && warehouses && warehouses.length > 0 && (
        <Table aria-label="Lista de armazéns">
          <TableHeader>
            <TableHead isRowHeader>Nome</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Endereço</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ações</TableHead>
          </TableHeader>
          <TableBody>
            {warehouses.map((warehouse) => (
              <TableRow key={warehouse.id}>
                <TableCell className="font-medium">{warehouse.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{warehouse.code}</code>
                </TableCell>
                <TableCell className="text-muted-foreground">{warehouse.address || '—'}</TableCell>
                <TableCell>
                  <Badge variant={warehouse.status === 'active' ? 'secondary' : 'outline'}>
                    {warehouse.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${warehouse.name}`}
                      onPress={() => setEditingWarehouse(warehouse)}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${warehouse.name}`}
                      onPress={() => {
                        setDeleteError(null)
                        setDeletingWarehouse(warehouse)
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Edit Dialog */}
      {editingWarehouse && (
        <EditWarehouseDialog warehouse={editingWarehouse} onClose={() => setEditingWarehouse(null)} />
      )}

      {/* Delete Confirmation */}
      <DeleteWarehouseConfirm
        warehouse={deletingWarehouse}
        deleteError={deleteError}
        onDeleteError={setDeleteError}
        onClose={() => {
          setDeletingWarehouse(null)
          setDeleteError(null)
        }}
      />
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// CreateWarehouseDialog
// ---------------------------------------------------------------------------

function CreateWarehouseDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [fields, setFields] = useState<CreateFormFields>({ name: '', code: '', address: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const createWarehouse = useCreateWarehouse(COMPANY_ID)

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setFieldErrors({})
      setGeneralError(null)

      const errors: FieldErrors = {}
      if (!fields.name.trim()) {
        errors.name = 'Nome é obrigatório'
      }
      if (!fields.code.trim()) {
        errors.code = 'Código é obrigatório'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }

      const input: CreateWarehouseInput = {
        name: fields.name.trim(),
        code: fields.code.trim()
      }

      if (fields.address.trim()) {
        input.address = fields.address.trim()
      }

      createWarehouse.mutate(input, {
        onSuccess: () => {
          toast.success('Armazém criado com sucesso')
          onClose()
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
      })
    },
    [fields, createWarehouse, onClose]
  )

  return (
    <Dialog className="sm:max-w-md" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Novo armazém</DialogTitle>
        <DialogDescription>Preencha os dados do armazém. O código é imutável após a criação.</DialogDescription>
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
          <Label htmlFor="warehouse-name">
            Nome <span className="text-destructive">*</span>
          </Label>
          <Input
            id="warehouse-name"
            placeholder="Ex: Depósito Central"
            value={fields.name}
            onChange={(e) => setFields((prev) => ({ ...prev, name: e.target.value }))}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'warehouse-name-error' : undefined}
            autoFocus
          />
          {fieldErrors.name && (
            <p id="warehouse-name-error" className="text-xs text-destructive">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="warehouse-code">
            Código <span className="text-destructive">*</span>
          </Label>
          <Input
            id="warehouse-code"
            placeholder="Ex: DEP-01"
            value={fields.code}
            onChange={(e) => setFields((prev) => ({ ...prev, code: e.target.value }))}
            aria-invalid={!!fieldErrors.code}
            aria-describedby={fieldErrors.code ? 'warehouse-code-error' : undefined}
          />
          {fieldErrors.code && (
            <p id="warehouse-code-error" className="text-xs text-destructive">
              {fieldErrors.code}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="warehouse-address">Endereço</Label>
          <Input
            id="warehouse-address"
            placeholder="Ex: Rua Principal, 123"
            value={fields.address}
            onChange={(e) => setFields((prev) => ({ ...prev, address: e.target.value }))}
            aria-invalid={!!fieldErrors.address}
            aria-describedby={fieldErrors.address ? 'warehouse-address-error' : undefined}
          />
          {fieldErrors.address && (
            <p id="warehouse-address-error" className="text-xs text-destructive">
              {fieldErrors.address}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={createWarehouse.isPending}>
            Cancelar
          </DialogClose>
          <Button type="submit" isDisabled={createWarehouse.isPending}>
            {createWarehouse.isPending && <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />}
            Criar armazém
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// EditWarehouseDialog
// ---------------------------------------------------------------------------

function EditWarehouseDialog({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }): React.JSX.Element {
  const [fields, setFields] = useState<EditFormFields>({
    name: warehouse.name,
    address: warehouse.address ?? ''
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const updateWarehouse = useUpdateWarehouse(COMPANY_ID)

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setFieldErrors({})
      setGeneralError(null)

      const errors: FieldErrors = {}
      if (!fields.name.trim()) {
        errors.name = 'Nome é obrigatório'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }

      const input: UpdateWarehouseInput & { id: number } = {
        id: warehouse.id,
        name: fields.name.trim(),
        address: fields.address.trim() || null
      }

      updateWarehouse.mutate(input, {
        onSuccess: () => {
          toast.success('Armazém atualizado com sucesso')
          onClose()
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
      })
    },
    [fields, warehouse.id, updateWarehouse, onClose]
  )

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="sm:max-w-md"
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle>Editar armazém</DialogTitle>
        <DialogDescription>Altere os dados do armazém. O código não pode ser alterado.</DialogDescription>
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
          <Label htmlFor="edit-warehouse-name">
            Nome <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-warehouse-name"
            placeholder="Ex: Depósito Central"
            value={fields.name}
            onChange={(e) => setFields((prev) => ({ ...prev, name: e.target.value }))}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'edit-warehouse-name-error' : undefined}
            autoFocus
          />
          {fieldErrors.name && (
            <p id="edit-warehouse-name-error" className="text-xs text-destructive">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-warehouse-code">Código</Label>
          <Input id="edit-warehouse-code" value={warehouse.code} disabled />
          <p className="text-xs text-muted-foreground">O código não pode ser alterado após a criação.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-warehouse-address">Endereço</Label>
          <Input
            id="edit-warehouse-address"
            placeholder="Ex: Rua Principal, 123"
            value={fields.address}
            onChange={(e) => setFields((prev) => ({ ...prev, address: e.target.value }))}
            aria-invalid={!!fieldErrors.address}
            aria-describedby={fieldErrors.address ? 'edit-warehouse-address-error' : undefined}
          />
          {fieldErrors.address && (
            <p id="edit-warehouse-address-error" className="text-xs text-destructive">
              {fieldErrors.address}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={updateWarehouse.isPending}>
            Cancelar
          </DialogClose>
          <Button type="submit" isDisabled={updateWarehouse.isPending}>
            {updateWarehouse.isPending && <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// DeleteWarehouseConfirm
// ---------------------------------------------------------------------------

function DeleteWarehouseConfirm({
  warehouse,
  deleteError,
  onDeleteError,
  onClose
}: {
  warehouse: Warehouse | null
  deleteError: string | null
  onDeleteError: (error: string | null) => void
  onClose: () => void
}): React.JSX.Element {
  const deleteWarehouse = useDeleteWarehouse(COMPANY_ID)

  const handleConfirm = useCallback(() => {
    if (!warehouse) return

    deleteWarehouse.mutate(warehouse.id, {
      onSuccess: () => {
        toast.success('Armazém excluído com sucesso')
        onClose()
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          onDeleteError(error.message)
        } else {
          onDeleteError('Ocorreu um erro inesperado. Tente novamente.')
        }
      }
    })
  }, [warehouse, deleteWarehouse, onClose, onDeleteError])

  return (
    <>
      <ConfirmDialog
        open={!!warehouse && !deleteError}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title="Excluir armazém"
        description={`Tem certeza que deseja excluir o armazém "${warehouse?.name ?? ''}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirm}
        variant="destructive"
        isLoading={deleteWarehouse.isPending}
      />

      {/* Error dialog when deletion fails (e.g., referenced warehouse) */}
      <Dialog
        isOpen={!!deleteError}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        showCloseButton={false}
        className="sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>Não foi possível excluir</DialogTitle>
          <DialogDescription>{deleteError}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose variant="outline" onPress={onClose}>
            Entendi
          </DialogClose>
        </DialogFooter>
      </Dialog>
    </>
  )
}

export { WarehousesPage }
