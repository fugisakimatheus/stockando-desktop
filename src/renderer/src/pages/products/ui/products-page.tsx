import { useCategories } from '@pages/categories/hooks/use-categories'
import { useUnitsOfMeasure } from '@pages/units-of-measure/hooks/use-units-of-measure'
import { ApiError } from '@shared/api'
import type { CreateProductInput, UpdateProductInput } from '@shared/api'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FilterBar } from '@shared/ui/filter-bar'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { ChevronLeft, ChevronRight, Package, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCreateProduct, useProducts, useUpdateProduct } from '../hooks/use-products'
import type { ProductListFilters, ProductListItem } from '../hooks/use-products'
import { ProductFormDialog } from './product-form-dialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1
const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { id: 'all', name: 'Todos os status' },
  { id: 'active', name: 'Ativo' },
  { id: 'inactive', name: 'Inativo' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'active') {
    return <Badge variant="secondary">Ativo</Badge>
  }
  return <Badge variant="outline">Inativo</Badge>
}

// ---------------------------------------------------------------------------
// ProductsPage
// ---------------------------------------------------------------------------

function ProductsPage(): React.JSX.Element {
  const [filters, setFilters] = useState<ProductListFilters>({
    limit: PAGE_SIZE,
    offset: 0,
    search: '',
    categoryId: undefined,
    status: undefined
  })

  const productsQuery = useProducts(COMPANY_ID, filters)
  const categoriesQuery = useCategories(COMPANY_ID)
  const unitsQuery = useUnitsOfMeasure(COMPANY_ID)
  const createProduct = useCreateProduct(COMPANY_ID)
  const updateProduct = useUpdateProduct(COMPANY_ID)

  const products = productsQuery.data?.data ?? []
  const total = productsQuery.data?.total ?? 0
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasPrevious = filters.offset > 0
  const hasNext = filters.offset + PAGE_SIZE < total

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function handleSearchChange(value: string): void {
    setFilters((prev) => ({ ...prev, search: value, offset: 0 }))
  }

  function handleCategoryChange(key: React.Key | null): void {
    const categoryId = key === 'all' || key === null ? undefined : Number(key)
    setFilters((prev) => ({ ...prev, categoryId, offset: 0 }))
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

  function handleCreate(input: CreateProductInput): void {
    setFieldErrors({})
    createProduct.mutate(input, {
      onSuccess: () => {
        toast.success('Produto criado com sucesso')
        setIsCreateOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else if (error instanceof ApiError && error.code === 'CONFLICT') {
          setFieldErrors({ sku: 'Já existe um produto com este SKU.' })
        } else {
          toast.error('Erro ao criar produto. Tente novamente.')
        }
      }
    })
  }

  function handleUpdate(input: UpdateProductInput & { id: number }): void {
    setFieldErrors({})
    updateProduct.mutate(input, {
      onSuccess: () => {
        toast.success('Produto atualizado com sucesso')
        setEditingProduct(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao atualizar produto. Tente novamente.')
        }
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Produtos"
      description="Cadastre e organize a base de produtos do negócio."
      actions={
        <Button onPress={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Novo produto
        </Button>
      }
    >
      <PageSection>
        <FilterBar
          searchValue={filters.search ?? ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por nome ou SKU..."
        >
          <Select
            selectedKey={filters.categoryId?.toString() ?? 'all'}
            onSelectionChange={handleCategoryChange}
            aria-label="Filtrar por categoria"
            placeholder="Categoria"
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="all" textValue="Todas as categorias">
                Todas as categorias
              </SelectItem>
              {(categoriesQuery.data ?? []).map((cat) => (
                <SelectItem key={cat.id} id={String(cat.id)} textValue={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

        {productsQuery.isLoading && <LoadingState message="Carregando produtos..." />}

        {productsQuery.isError && (
          <ErrorState
            title="Erro ao carregar produtos"
            description="Não foi possível buscar a lista de produtos. Tente novamente."
            onRetry={() => productsQuery.refetch()}
          />
        )}

        {productsQuery.isSuccess && products.length === 0 && (
          <EmptyState
            icon={<Package />}
            title="Nenhum produto encontrado"
            description={
              filters.search || filters.categoryId || filters.status
                ? 'Nenhum resultado para os filtros aplicados. Tente ajustar sua busca.'
                : 'Comece adicionando o primeiro produto ao catálogo.'
            }
            action={
              !filters.search && !filters.categoryId && !filters.status ? (
                <Button onPress={() => setIsCreateOpen(true)} className="gap-2">
                  <Plus className="size-4" />
                  Adicionar produto
                </Button>
              ) : undefined
            }
          />
        )}

        {productsQuery.isSuccess && products.length > 0 && (
          <>
            <Table aria-label="Lista de produtos">
              <TableHeader>
                <TableRow>
                  <TableHead isRowHeader>SKU</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Preço custo</TableHead>
                  <TableHead>Preço venda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody items={products}>
                {(product: ProductListItem) => (
                  <TableRow key={product.id} id={product.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{product.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{product.categoryName ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{product.unitSymbol ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{formatCurrency(product.costPrice)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{formatCurrency(product.salePrice)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${product.name}`}
                        onPress={() => {
                          setFieldErrors({})
                          setEditingProduct(product)
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? 'produto' : 'produtos'} • Página {currentPage} de {totalPages}
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

      {/* Create Product Dialog */}
      <ProductFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setFieldErrors({})
        }}
        mode="create"
        categories={categoriesQuery.data ?? []}
        units={unitsQuery.data ?? []}
        onSubmitCreate={handleCreate}
        isLoading={createProduct.isPending}
        fieldErrors={fieldErrors}
      />

      {/* Edit Product Dialog */}
      <ProductFormDialog
        open={!!editingProduct}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProduct(null)
            setFieldErrors({})
          }
        }}
        mode="edit"
        categories={categoriesQuery.data ?? []}
        units={unitsQuery.data ?? []}
        onSubmitUpdate={handleUpdate}
        isLoading={updateProduct.isPending}
        fieldErrors={fieldErrors}
        product={editingProduct}
      />
    </PageShell>
  )
}

export { ProductsPage }
