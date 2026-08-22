/**
 * Factory for creating typed TanStack Query hooks with consistent patterns.
 *
 * Eliminates the repetitive boilerplate across 15+ hook files by generating
 * standardized useList, useDetail, useCreate, useUpdate, useDelete hooks
 * from a declarative config.
 *
 * Supports three capabilities:
 * - **Simple**: flat list (no filters/pagination) — e.g., categories, units
 * - **Paginated**: filtered list with PaginatedResult<T> — e.g., products, customers
 * - **Status Transitions**: typed mutation for status changes — e.g., orders, quotes
 *
 * @example Simple domain (categories)
 * ```ts
 * const { keys, useList, useCreate, useUpdate, useDelete } = createSimpleQueryHooks({
 *   domain: 'categories',
 *   list: (companyId) => listCategories(companyId),
 *   create: (companyId, input) => createCategory(companyId, input),
 *   update: (companyId, id, data) => updateCategory(companyId, id, data),
 *   delete: (companyId, id) => deleteCategory(companyId, id),
 * })
 * ```
 *
 * @example Paginated domain with status transition (sales-orders)
 * ```ts
 * const { keys, useList, useDetail, useCreate, useUpdate, useTransition } =
 *   createPaginatedQueryHooks({
 *     domain: 'sales-orders',
 *     list: (companyId, filters) => listSalesOrders(companyId, filters),
 *     detail: (companyId, id) => getSalesOrder(companyId, id),
 *     create: (companyId, input) => createSalesOrder(companyId, input),
 *     update: (companyId, id, data) => updateSalesOrder(companyId, id, data),
 *     transition: (companyId, id, status) => transitionStatus(companyId, id, status),
 *   })
 * ```
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory builder
// ---------------------------------------------------------------------------

interface SimpleQueryKeys {
  all: (companyId: number) => readonly [number, string]
  list: (companyId: number) => readonly [number, string, 'list']
}

interface PaginatedQueryKeys<TFilters> {
  all: (companyId: number) => readonly [number, string]
  lists: (companyId: number) => readonly [number, string, 'list']
  list: (companyId: number, filters: TFilters) => readonly [number, string, 'list', TFilters]
  details: (companyId: number) => readonly [number, string, 'detail']
  detail: (companyId: number, id: number) => readonly [number, string, 'detail', number]
}

function createSimpleKeys(domain: string): SimpleQueryKeys {
  return {
    all: (companyId: number) => [companyId, domain] as const,
    list: (companyId: number) => [companyId, domain, 'list'] as const
  }
}

function createPaginatedKeys<TFilters>(domain: string): PaginatedQueryKeys<TFilters> {
  const all = (companyId: number) => [companyId, domain] as const
  const lists = (companyId: number) => [companyId, domain, 'list'] as const
  const list = (companyId: number, filters: TFilters) => [companyId, domain, 'list', filters] as const
  const details = (companyId: number) => [companyId, domain, 'detail'] as const
  const detail = (companyId: number, id: number) => [companyId, domain, 'detail', id] as const

  return { all, lists, list, details, detail }
}

// ---------------------------------------------------------------------------
// Mutation callback types (allow callers to hook into success/error per-call)
// ---------------------------------------------------------------------------

/**
 * Optional callbacks that can be passed to any generated mutation hook.
 * These are called AFTER the factory's built-in invalidation logic.
 */
interface MutationCallbacks<TData, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: Error, variables: TVariables) => void
}

// ---------------------------------------------------------------------------
// Simple CRUD hooks (flat list, no pagination/filters)
// ---------------------------------------------------------------------------

interface SimpleHooksConfig<TItem, TCreate, TUpdate> {
  /** Cache domain key (e.g., 'categories', 'units-of-measure') */
  domain: string
  /** Fetch all items for a company */
  list: (companyId: number) => Promise<TItem[]>
  /** Create a new item */
  create?: (companyId: number, input: TCreate) => Promise<TItem>
  /** Update an existing item (id + partial data) */
  update?: (companyId: number, id: number, data: TUpdate) => Promise<TItem>
  /** Delete an item by ID */
  delete?: (companyId: number, id: number) => Promise<void>
  /** Additional query keys to invalidate on mutations */
  additionalInvalidations?: readonly string[]
}

interface SimpleHooksResult<TItem, TCreate, TUpdate> {
  keys: SimpleQueryKeys
  useList: (companyId: number) => UseQueryResult<TItem[]>
  useCreate: (
    companyId: number,
    callbacks?: MutationCallbacks<TItem, TCreate>
  ) => UseMutationResult<TItem, Error, TCreate>
  useUpdate: (
    companyId: number,
    callbacks?: MutationCallbacks<TItem, TUpdate & { id: number }>
  ) => UseMutationResult<TItem, Error, TUpdate & { id: number }>
  useDelete: (companyId: number, callbacks?: MutationCallbacks<void, number>) => UseMutationResult<void, Error, number>
}

function createSimpleQueryHooks<TItem, TCreate = never, TUpdate = never>(
  config: SimpleHooksConfig<TItem, TCreate, TUpdate>
): SimpleHooksResult<TItem, TCreate, TUpdate> {
  const keys = createSimpleKeys(config.domain)

  function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, companyId: number): void {
    queryClient.invalidateQueries({ queryKey: keys.all(companyId) })
    if (config.additionalInvalidations) {
      for (const domain of config.additionalInvalidations) {
        queryClient.invalidateQueries({ queryKey: [companyId, domain] })
      }
    }
  }

  function useList(companyId: number) {
    return useQuery({
      queryKey: keys.list(companyId),
      queryFn: () => config.list(companyId)
    })
  }

  function useCreate(companyId: number, callbacks?: MutationCallbacks<TItem, TCreate>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: (input: TCreate) => {
        if (!config.create) throw new Error(`create not configured for ${config.domain}`)
        return config.create(companyId, input)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  function useUpdate(companyId: number, callbacks?: MutationCallbacks<TItem, TUpdate & { id: number }>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: ({ id, ...data }: TUpdate & { id: number }) => {
        if (!config.update) throw new Error(`update not configured for ${config.domain}`)
        return config.update(companyId, id, data as TUpdate)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  function useDelete(companyId: number, callbacks?: MutationCallbacks<void, number>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: (id: number) => {
        if (!config.delete) throw new Error(`delete not configured for ${config.domain}`)
        return config.delete(companyId, id)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  return { keys, useList, useCreate, useUpdate, useDelete }
}

// ---------------------------------------------------------------------------
// Paginated CRUD hooks (filtered list + detail + optional status transition)
// ---------------------------------------------------------------------------

interface PaginatedHooksConfig<
  TListItem,
  TDetail,
  TFilters,
  TCreate,
  TUpdate,
  TCreateResponse = unknown,
  TUpdateResponse = unknown,
  TStatus extends string = string
> {
  /** Cache domain key (e.g., 'products', 'customers') */
  domain: string
  /** Fetch a paginated/filtered list */
  list: (
    companyId: number,
    filters: TFilters
  ) => Promise<{ data: TListItem[]; total: number; limit: number; offset: number }>
  /** Fetch a single detail record */
  detail?: (companyId: number, id: number) => Promise<TDetail>
  /** Create a new record */
  create?: (companyId: number, input: TCreate) => Promise<TCreateResponse>
  /** Update an existing record */
  update?: (companyId: number, id: number, data: TUpdate) => Promise<TUpdateResponse>
  /** Delete a record by ID */
  delete?: (companyId: number, id: number) => Promise<void>
  /** Status transition mutation (for order/quote workflows) */
  transition?: (companyId: number, id: number, status: TStatus) => Promise<TDetail | void>
  /** Additional query keys to invalidate on mutations (e.g., stock also invalidates stock-movements) */
  additionalInvalidations?: readonly string[]
}

interface PaginatedHooksResult<
  TListItem,
  TDetail,
  TFilters,
  TCreate,
  TUpdate,
  TCreateResponse = unknown,
  TUpdateResponse = unknown,
  TStatus extends string = string
> {
  keys: PaginatedQueryKeys<TFilters>
  useList: (
    companyId: number,
    filters: TFilters
  ) => UseQueryResult<{ data: TListItem[]; total: number; limit: number; offset: number }>
  useDetail: (companyId: number, id: number | undefined) => UseQueryResult<TDetail>
  useCreate: (
    companyId: number,
    callbacks?: MutationCallbacks<TCreateResponse, TCreate>
  ) => UseMutationResult<TCreateResponse, Error, TCreate>
  useUpdate: (
    companyId: number,
    callbacks?: MutationCallbacks<TUpdateResponse, TUpdate & { id: number }>
  ) => UseMutationResult<TUpdateResponse, Error, TUpdate & { id: number }>
  useDelete: (companyId: number, callbacks?: MutationCallbacks<void, number>) => UseMutationResult<void, Error, number>
  useTransition: (
    companyId: number,
    callbacks?: MutationCallbacks<TDetail | void, { id: number; status: TStatus }>
  ) => UseMutationResult<TDetail | void, Error, { id: number; status: TStatus }>
}

function createPaginatedQueryHooks<
  TListItem,
  TDetail = TListItem,
  TFilters = object,
  TCreate = never,
  TUpdate = never,
  TCreateResponse = unknown,
  TUpdateResponse = unknown,
  TStatus extends string = string
>(
  config: PaginatedHooksConfig<
    TListItem,
    TDetail,
    TFilters,
    TCreate,
    TUpdate,
    TCreateResponse,
    TUpdateResponse,
    TStatus
  >
): PaginatedHooksResult<TListItem, TDetail, TFilters, TCreate, TUpdate, TCreateResponse, TUpdateResponse, TStatus> {
  const keys = createPaginatedKeys<TFilters>(config.domain)

  function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, companyId: number): void {
    queryClient.invalidateQueries({ queryKey: keys.all(companyId) })
    if (config.additionalInvalidations) {
      for (const domain of config.additionalInvalidations) {
        queryClient.invalidateQueries({ queryKey: [companyId, domain] })
      }
    }
  }

  function useList(companyId: number, filters: TFilters) {
    return useQuery({
      queryKey: keys.list(companyId, filters),
      queryFn: () => config.list(companyId, filters)
    })
  }

  function useDetail(companyId: number, id: number | undefined) {
    return useQuery({
      queryKey: keys.detail(companyId, id ?? 0),
      queryFn: () => {
        if (!config.detail) throw new Error(`detail not configured for ${config.domain}`)
        return config.detail(companyId, id as number)
      },
      enabled: id !== undefined
    })
  }

  function useCreate(companyId: number, callbacks?: MutationCallbacks<TCreateResponse, TCreate>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: (input: TCreate) => {
        if (!config.create) throw new Error(`create not configured for ${config.domain}`)
        return config.create(companyId, input)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  function useUpdate(companyId: number, callbacks?: MutationCallbacks<TUpdateResponse, TUpdate & { id: number }>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: ({ id, ...data }: TUpdate & { id: number }) => {
        if (!config.update) throw new Error(`update not configured for ${config.domain}`)
        return config.update(companyId, id, data as TUpdate)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  function useDelete(companyId: number, callbacks?: MutationCallbacks<void, number>) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: (id: number) => {
        if (!config.delete) throw new Error(`delete not configured for ${config.domain}`)
        return config.delete(companyId, id)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  function useTransition(
    companyId: number,
    callbacks?: MutationCallbacks<TDetail | void, { id: number; status: TStatus }>
  ) {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: ({ id, status }: { id: number; status: TStatus }) => {
        if (!config.transition) throw new Error(`transition not configured for ${config.domain}`)
        return config.transition(companyId, id, status)
      },
      onSuccess: (data, variables) => {
        invalidateAll(queryClient, companyId)
        callbacks?.onSuccess?.(data, variables)
      },
      onError: (error, variables) => {
        callbacks?.onError?.(error, variables)
      }
    })
  }

  return { keys, useList, useDetail, useCreate, useUpdate, useDelete, useTransition }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { createPaginatedQueryHooks, createSimpleQueryHooks }
export type {
  MutationCallbacks,
  PaginatedHooksConfig,
  PaginatedHooksResult,
  PaginatedQueryKeys,
  SimpleHooksConfig,
  SimpleHooksResult,
  SimpleQueryKeys
}
