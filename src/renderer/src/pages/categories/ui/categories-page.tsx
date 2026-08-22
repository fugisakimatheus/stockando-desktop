import { ApiError } from '@shared/api'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../hooks/use-categories'

// ---------------------------------------------------------------------------
// Field Error
// ---------------------------------------------------------------------------

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

// ---------------------------------------------------------------------------
// Create Category Dialog
// ---------------------------------------------------------------------------

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onSubmit: (input: CreateCategoryInput) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  title: string
  description: string
  submitLabel: string
  initialValues?: { name: string; parentCategoryId: number | null }
}

function CategoryFormDialog({
  open,
  onOpenChange,
  categories,
  onSubmit,
  isLoading,
  fieldErrors,
  title,
  description,
  submitLabel,
  initialValues
}: CategoryFormDialogProps): React.JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [parentCategoryId, setParentCategoryId] = useState<number | null>(initialValues?.parentCategoryId ?? null)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setName(initialValues?.name ?? '')
    setParentCategoryId(initialValues?.parentCategoryId ?? null)
    setLocalErrors({})
  }, [initialValues?.name, initialValues?.parentCategoryId])

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit(): void {
    const errors: Record<string, string> = {}

    if (!name.trim()) {
      errors.name = 'O nome da categoria é obrigatório.'
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors)
      return
    }

    setLocalErrors({})
    onSubmit({
      name: name.trim(),
      parentCategoryId: parentCategoryId ?? null
    })
  }

  const errors = { ...localErrors, ...fieldErrors }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Nome</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Eletrônicos"
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category-parent">Categoria pai (opcional)</Label>
          <Select
            placeholder="Nenhuma (raiz)"
            selectedKey={parentCategoryId}
            onSelectionChange={(key) => setParentCategoryId(key as number | null)}
            aria-label="Categoria pai"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id={null as unknown as number} textValue="Nenhuma (raiz)">
                Nenhuma (raiz)
              </SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} id={cat.id} textValue={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.parentCategoryId} />
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

// ---------------------------------------------------------------------------
// Categories Page
// ---------------------------------------------------------------------------

function CategoriesPage(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 1

  const { data: categories, isLoading, isError, refetch } = useCategories(companyId)
  const createCategory = useCreateCategory(companyId)
  const updateCategory = useUpdateCategory(companyId)
  const deleteCategory = useDeleteCategory(companyId)

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCreate(input: CreateCategoryInput): void {
    setFieldErrors({})
    createCategory.mutate(input, {
      onSuccess: () => {
        toast.success('Categoria criada com sucesso')
        setIsCreateOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError && error.code === 'CONFLICT') {
          setFieldErrors({ name: 'Já existe uma categoria com este nome.' })
        } else {
          toast.error('Erro ao criar categoria. Tente novamente.')
        }
      }
    })
  }

  function handleUpdate(input: CreateCategoryInput): void {
    if (!editingCategory) return

    setFieldErrors({})
    const updateInput: UpdateCategoryInput & { id: number } = {
      id: editingCategory.id,
      name: input.name,
      parentCategoryId: input.parentCategoryId
    }

    updateCategory.mutate(updateInput, {
      onSuccess: () => {
        toast.success('Categoria atualizada com sucesso')
        setEditingCategory(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError && error.code === 'CONFLICT') {
          setFieldErrors({ name: 'Já existe uma categoria com este nome.' })
        } else {
          toast.error('Erro ao atualizar categoria. Tente novamente.')
        }
      }
    })
  }

  function handleDelete(): void {
    if (!deletingCategory) return

    deleteCategory.mutate(deletingCategory.id, {
      onSuccess: () => {
        toast.success('Categoria excluída com sucesso')
        setDeletingCategory(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'ENTITY_REFERENCED') {
          toast.error('Não é possível excluir esta categoria pois existem produtos vinculados.')
        } else {
          toast.error('Erro ao excluir categoria. Tente novamente.')
        }
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getParentName(parentId: number | null): string | null {
    if (!parentId || !categories) return null
    const parent = categories.find((c) => c.id === parentId)
    return parent?.name ?? null
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <PageShell title="Categorias" description="Organize os produtos por categorias e subcategorias.">
        <LoadingState message="Carregando categorias..." />
      </PageShell>
    )
  }

  if (isError) {
    return (
      <PageShell title="Categorias" description="Organize os produtos por categorias e subcategorias.">
        <ErrorState
          title="Erro ao carregar categorias"
          description="Não foi possível carregar a lista de categorias. Verifique a conexão e tente novamente."
          onRetry={() => refetch()}
        />
      </PageShell>
    )
  }

  const categoryList = categories ?? []
  const isEmpty = categoryList.length === 0

  return (
    <PageShell
      title="Categorias"
      description="Organize os produtos por categorias e subcategorias."
      actions={
        <Button onPress={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Nova categoria
        </Button>
      }
    >
      <PageSection>
        {isEmpty ? (
          <EmptyState
            icon={<FolderTree />}
            title="Nenhuma categoria criada ainda"
            description="Crie categorias para organizar os produtos do catálogo."
            action={
              <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
                <Plus className="size-4" />
                Criar primeira categoria
              </Button>
            }
          />
        ) : (
          <Table aria-label="Lista de categorias">
            <TableHeader>
              <TableHead isRowHeader>Nome</TableHead>
              <TableHead>Categoria pai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableHeader>
            <TableBody>
              {categoryList.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {getParentName(category.parentCategoryId) ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.status === 'active' ? 'secondary' : 'outline'}>
                      {category.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${category.name}`}
                        onPress={() => {
                          setFieldErrors({})
                          setEditingCategory(category)
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${category.name}`}
                        onPress={() => setDeletingCategory(category)}
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

      {/* Create Dialog */}
      <CategoryFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setFieldErrors({})
        }}
        categories={categoryList}
        onSubmit={handleCreate}
        isLoading={createCategory.isPending}
        fieldErrors={fieldErrors}
        title="Nova categoria"
        description="Crie uma nova categoria para organizar os produtos."
        submitLabel="Criar categoria"
      />

      {/* Edit Dialog */}
      <CategoryFormDialog
        open={!!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategory(null)
            setFieldErrors({})
          }
        }}
        categories={categoryList.filter((c) => c.id !== editingCategory?.id)}
        onSubmit={handleUpdate}
        isLoading={updateCategory.isPending}
        fieldErrors={fieldErrors}
        title="Editar categoria"
        description="Altere os dados da categoria selecionada."
        submitLabel="Salvar alterações"
        initialValues={
          editingCategory
            ? { name: editingCategory.name, parentCategoryId: editingCategory.parentCategoryId }
            : undefined
        }
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingCategory}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null)
        }}
        title="Excluir categoria"
        description={`Tem certeza que deseja excluir a categoria "${deletingCategory?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={deleteCategory.isPending}
      />
    </PageShell>
  )
}

export { CategoriesPage }
