import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from '@shared/api'
import type {
  Customer,
  CustomerDetail,
  CustomerListItem,
  CustomerListFilters,
  CreateCustomerInput,
  UpdateCustomerInput,
  PaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const customerKeys = {
  all: (companyId: number) => [companyId, 'customers'] as const,
  lists: (companyId: number) => [...customerKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: CustomerListFilters) => [...customerKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...customerKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...customerKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of customers for the given company,
 * supporting filtering by status and search term.
 */
function useCustomers(companyId: number, filters: CustomerListFilters) {
  return useQuery({
    queryKey: customerKeys.list(companyId, filters),
    queryFn: () => listCustomers(companyId, filters)
  })
}

/**
 * Fetches a single customer detail with quote and sales order counts.
 * Only enabled when customerId is defined.
 */
function useCustomerDetail(companyId: number, customerId: number | undefined) {
  return useQuery({
    queryKey: customerKeys.detail(companyId, customerId ?? 0),
    queryFn: () => getCustomer(companyId, customerId as number),
    enabled: customerId !== undefined
  })
}

/**
 * Mutation to create a new customer.
 * Invalidates the customers list cache on success.
 */
function useCreateCustomer(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing customer.
 * Invalidates the customers list and detail cache on success.
 */
function useUpdateCustomer(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateCustomerInput & { id: number }) => updateCustomer(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a customer.
 * Invalidates the customers list cache on success.
 */
function useDeleteCustomer(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteCustomer(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(companyId) })
    }
  })
}

export { customerKeys, useCustomers, useCustomerDetail, useCreateCustomer, useUpdateCustomer, useDeleteCustomer }
export type {
  Customer,
  CustomerDetail,
  CustomerListItem,
  CustomerListFilters,
  CreateCustomerInput,
  UpdateCustomerInput,
  PaginatedResult
}
