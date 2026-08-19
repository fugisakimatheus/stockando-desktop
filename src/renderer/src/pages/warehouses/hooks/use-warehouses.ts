import { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '@shared/api'
import type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const warehouseKeys = {
  all: (companyId: number) => [companyId, 'warehouses'] as const,
  list: (companyId: number) => [...warehouseKeys.all(companyId), 'list'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all warehouses for the active company.
 *
 * Requirements: 4.4
 */
function useWarehouses(companyId: number) {
  return useQuery({
    queryKey: warehouseKeys.list(companyId),
    queryFn: () => listWarehouses(companyId),
    enabled: companyId > 0
  })
}

/**
 * Mutation to create a new warehouse.
 * Invalidates the warehouses cache on success.
 *
 * Requirements: 4.1, 10.3
 */
function useCreateWarehouse(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => createWarehouse(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing warehouse.
 * Invalidates the warehouses cache on success.
 *
 * Requirements: 4.3, 10.3
 */
function useUpdateWarehouse(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateWarehouseInput & { id: number }) => updateWarehouse(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a warehouse.
 * Invalidates the warehouses cache on success.
 *
 * Requirements: 4.4, 10.3
 */
function useDeleteWarehouse(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteWarehouse(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.all(companyId) })
    }
  })
}

export { warehouseKeys, useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse }
export type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput }
