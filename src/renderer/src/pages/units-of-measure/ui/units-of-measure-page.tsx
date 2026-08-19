import { ApiError } from '@shared/api'
import type { UnitOfMeasure } from '@shared/api'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCreateUnit, useDeleteUnit, useUnitsOfMeasure, useUpdateUnit } from '../hooks/use-units-of-measure'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Field Error Component
// ---------------------------------------------------------------------------

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

// ---------------------------------------------------------------------------
// Unit Form Dialog
// ---------------------------------------------------------------------------

interface UnitFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit?: UnitOfMeasure | null
  onSubmit: (data: { name: string; symbol: string }) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
}

function UnitFormDialog({
  open,
  onOpenChange,
  unit,
  onSubmit,
  isLoading,
  fieldErrors
}: UnitFormDialogProps): React.JSX.Element {
  const [name, setName] = useState(unit?.name ?? '')
  const [symbol, setSymbol] = useState(unit?.symbol ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const isEditing = Boolean(unit)

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setName('')
      setSymbol('')
      setLocalErrors({})
    } else if (unit) {
      setName(unit.name)
      setSymbol(unit.symbol)
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit(): void {
    const errors: Record<string, string> = {}

    if (!name.trim()) {
      errors.name = 'Nome é obrigatório'
    }
    if (!symbol.trim()) {
      errors.symbol = 'Símbolo é obrigatório'
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors)
      return
    }

    setLocalErrors({})
    onSubmit({ name: name.trim(), symbol: symbol.trim() })
  }

  const errors = { ...localErrors, ...fieldErrors }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Editar unidade' : 'Nova unidade de medida'}</DialogTitle>
        <DialogDescription>
          {isEditing
            ? 'Altere os dados da unidade de medida.'
            : 'Preencha os campos abaixo para criar uma nova unidade de medida.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="unit-name">Nome</Label>
          <Input
            id="unit-name"
            placeholder="Ex: Quilograma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit-symbol">Símbolo</Label>
          <Input
            id="unit-symbol"
            placeholder="Ex: kg"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            aria-invalid={Boolean(errors.symbol)}
          />
          <FieldError message={errors.symbol} />
        </div>
      </div>

      <DialogFooter>
        <DialogClose variant="outline" isDisabled={isLoading}>
          Cancelar
        </DialogClose>
        <Button onPress={handleSubmit} isLoading={isLoading}>
          {isEditing ? 'Salvar' : 'Criar'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Units of Measure Page
// ---------------------------------------------------------------------------

function UnitsOfMeasurePage(): React.JSX.Element {
  const { data: units, isLoading, isError, refetch } = useUnitsOfMeasure(COMPANY_ID)
  const createUnit = useCreateUnit(COMPANY_ID)
  const updateUnit = useUpdateUnit(COMPANY_ID)
  const deleteUnit = useDeleteUnit(COMPANY_ID)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UnitOfMeasure | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function handleCreate(): void {
    setEditingUnit(null)
    setFieldErrors({})
    setIsFormOpen(true)
  }

  function handleEdit(unit: UnitOfMeasure): void {
    setEditingUnit(unit)
    setFieldErrors({})
    setIsFormOpen(true)
  }

  function handleFormSubmit(data: { name: string; symbol: string }): void {
    setFieldErrors({})

    if (editingUnit) {
      updateUnit.mutate(
        { id: editingUnit.id, ...data },
        {
          onSuccess: () => {
            toast.success('Unidade atualizada com sucesso')
            setIsFormOpen(false)
            setEditingUnit(null)
          },
          onError: (error) => {
            if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields) {
              setFieldErrors(error.fields)
            } else if (error instanceof ApiError && error.code === 'CONFLICT') {
              setFieldErrors({ name: error.message })
            } else {
              toast.error('Erro ao atualizar unidade. Tente novamente.')
            }
          }
        }
      )
    } else {
      createUnit.mutate(data, {
        onSuccess: () => {
          toast.success('Unidade criada com sucesso')
          setIsFormOpen(false)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields) {
            setFieldErrors(error.fields)
          } else if (error instanceof ApiError && error.code === 'CONFLICT') {
            setFieldErrors({ name: error.message })
          } else {
            toast.error('Erro ao criar unidade. Tente novamente.')
          }
        }
      })
    }
  }

  function handleDeleteConfirm(): void {
    if (!deleteTarget) return

    deleteUnit.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Unidade excluída com sucesso')
        setDeleteTarget(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'ENTITY_REFERENCED') {
          toast.error('Não é possível excluir esta unidade pois está em uso por produtos.')
        } else {
          toast.error('Erro ao excluir unidade. Tente novamente.')
        }
        setDeleteTarget(null)
      }
    })
  }

  return (
    <PageShell
      title="Unidades de Medida"
      description="Gerencie as unidades de medida utilizadas nos produtos do catálogo."
      actions={
        <Button variant="outline" className="gap-2" onPress={handleCreate}>
          <Plus className="size-4" />
          Nova unidade
        </Button>
      }
    >
      <PageSection>
        {isLoading && <LoadingState message="Carregando unidades de medida..." />}

        {isError && (
          <ErrorState
            title="Erro ao carregar unidades"
            description="Não foi possível carregar as unidades de medida."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && units && units.length === 0 && (
          <EmptyState
            icon={<Ruler />}
            title="Nenhuma unidade cadastrada"
            description="Crie a primeira unidade de medida para começar a organizar os produtos."
            action={
              <Button variant="outline" className="gap-2" onPress={handleCreate}>
                <Plus className="size-4" />
                Nova unidade
              </Button>
            }
          />
        )}

        {!isLoading && !isError && units && units.length > 0 && (
          <Table aria-label="Unidades de medida">
            <TableHeader>
              <TableRow>
                <TableHead isRowHeader>Nome</TableHead>
                <TableHead>Símbolo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.name}</TableCell>
                  <TableCell>{unit.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={unit.status === 'active' ? 'secondary' : 'outline'}>
                      {unit.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${unit.name}`}
                        onPress={() => handleEdit(unit)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${unit.name}`}
                        onPress={() => setDeleteTarget(unit)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <UnitFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingUnit(null)
            setFieldErrors({})
          }
        }}
        unit={editingUnit}
        onSubmit={handleFormSubmit}
        isLoading={createUnit.isPending || updateUnit.isPending}
        fieldErrors={fieldErrors}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Excluir unidade de medida"
        description={`Tem certeza que deseja excluir a unidade "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteConfirm}
        variant="destructive"
        isLoading={deleteUnit.isPending}
      />
    </PageShell>
  )
}

export { UnitsOfMeasurePage }
