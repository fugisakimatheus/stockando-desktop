import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from '@shared/api'
import type {
  Product,
  ProductDetail,
  ProductListItem,
  ProductListFilters,
  CreateProductInput,
  UpdateProductInput,
  PaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const productKeys = {
  all: (companyId: number) => [companyId, 'products'] as const,
  lists: (companyId: number) => [...productKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: ProductListFilters) => [...productKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...productKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...productKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of products for the given company,
 * supporting filtering by category, status, and search term.
 */
function useProducts(companyId: number, filters: ProductListFilters) {
  return useQuery({
    queryKey: productKeys.list(companyId, filters),
    queryFn: () => listProducts(companyId, filters)
  })
}

/**
 * Fetches a single product detail with resolved category name and unit symbol.
 * Only enabled when productId is defined.
 */
function useProductDetail(companyId: number, productId: number | undefined) {
  return useQuery({
    queryKey: productKeys.detail(companyId, productId ?? 0),
    queryFn: () => getProduct(companyId, productId as number),
    enabled: productId !== undefined
  })
}

/**
 * Mutation to create a new product.
 * Invalidates the products list cache on success.
 */
function useCreateProduct(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing product.
 * Invalidates the products list and detail cache on success.
 */
function useUpdateProduct(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateProductInput & { id: number }) => updateProduct(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a product.
 * Invalidates the products list cache on success.
 */
function useDeleteProduct(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteProduct(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all(companyId) })
    }
  })
}

export { productKeys, useProducts, useProductDetail, useCreateProduct, useUpdateProduct, useDeleteProduct }
export type {
  Product,
  ProductDetail,
  ProductListItem,
  ProductListFilters,
  CreateProductInput,
  UpdateProductInput,
  PaginatedResult
}
