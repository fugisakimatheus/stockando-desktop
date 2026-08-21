import { listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } from '@shared/api'
import type {
  Supplier,
  SupplierDetail,
  SupplierListItem,
  SupplierListFilters,
  CreateSupplierInput,
  UpdateSupplierInput,
  PaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const supplierKeys = {
  all: (companyId: number) => [companyId, 'suppliers'] as const,
  lists: (companyId: number) => [...supplierKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: SupplierListFilters) => [...supplierKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...supplierKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...supplierKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of suppliers for the given company,
 * supporting filtering by status and search term.
 */
function useSuppliers(companyId: number, filters: SupplierListFilters) {
  return useQuery({
    queryKey: supplierKeys.list(companyId, filters),
    queryFn: () => listSuppliers(companyId, filters)
  })
}

/**
 * Fetches a single supplier detail with purchase order count.
 * Only enabled when supplierId is defined.
 */
function useSupplierDetail(companyId: number, supplierId: number | undefined) {
  return useQuery({
    queryKey: supplierKeys.detail(companyId, supplierId ?? 0),
    queryFn: () => getSupplier(companyId, supplierId as number),
    enabled: supplierId !== undefined
  })
}

/**
 * Mutation to create a new supplier.
 * Invalidates the suppliers list cache on success.
 */
function useCreateSupplier(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing supplier.
 * Invalidates the suppliers list and detail cache on success.
 */
function useUpdateSupplier(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateSupplierInput & { id: number }) => updateSupplier(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a supplier.
 * Invalidates the suppliers list cache on success.
 */
function useDeleteSupplier(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteSupplier(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.all(companyId) })
    }
  })
}

export { supplierKeys, useSuppliers, useSupplierDetail, useCreateSupplier, useUpdateSupplier, useDeleteSupplier }
export type {
  Supplier,
  SupplierDetail,
  SupplierListItem,
  SupplierListFilters,
  CreateSupplierInput,
  UpdateSupplierInput,
  PaginatedResult
}
