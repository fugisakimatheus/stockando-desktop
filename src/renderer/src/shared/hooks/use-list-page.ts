/**
 * Composite hook for paginated list pages.
 *
 * Encapsulates the repeated pattern found across 10+ list pages:
 * 1. Filter state management (search, category, status, etc.)
 * 2. Pagination state (offset/limit/currentPage/totalPages)
 * 3. Query execution with filters
 * 4. Mutation error handling with field-level awareness
 *
 * Reduces ~30 lines of boilerplate per page to a single hook call.
 *
 * @example
 * ```tsx
 * function ProductsPage() {
 *   const companyId = useCompanyId()
 *
 *   const {
 *     filters,
 *     setFilter,
 *     resetFilters,
 *     pagination,
 *     query,
 *     items,
 *     fieldErrors,
 *     setFieldErrors,
 *     handleMutationError,
 *   } = useListPage({
 *     companyId,
 *     defaultFilters: { search: '', categoryId: undefined, status: undefined },
 *     pageSize: 20,
 *     queryHook: useProducts,
 *   })
 *
 *   return (
 *     <PageShell title="Produtos">
 *       <FilterBar value={filters.search} onSearch={(v) => setFilter('search', v)} />
 *       <QueryState query={query} empty={(d) => d.data.length === 0}>
 *         {(data) => <ProductsTable data={data.data} />}
 *       </QueryState>
 *       <PaginationControls {...pagination} />
 *     </PageShell>
 *   )
 * }
 * ```
 */

import { useMutationHandlers } from '@shared/lib/mutation-handlers'
import type { MutationHandlers } from '@shared/lib/mutation-handlers'
import type { UseQueryResult } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { usePaginationControlled } from './use-pagination'
import type { PaginationState } from './use-pagination'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaginationFilters {
  limit: number
  offset: number
}

interface UseListPageOptions<TFilters extends PaginationFilters, TData> {
  /** Active company ID. */
  companyId: number
  /** Default filter values (excluding limit/offset which are managed internally). */
  defaultFilters: Omit<TFilters, 'limit' | 'offset'>
  /** Number of items per page. Defaults to 20. */
  pageSize?: number
  /** The query hook to call with (companyId, filters). */
  queryHook: (companyId: number, filters: TFilters) => UseQueryResult<TData>
}

interface UseListPageResult<TFilters extends PaginationFilters, TData> {
  /** Current filter state (includes limit/offset). */
  filters: TFilters
  /** Update a single filter value. Resets offset to 0 automatically. */
  setFilter: <K extends keyof Omit<TFilters, 'limit' | 'offset'>>(key: K, value: TFilters[K]) => void
  /** Update multiple filter values at once. Resets offset to 0. */
  setFilters: (patch: Partial<Omit<TFilters, 'limit' | 'offset'>>) => void
  /** Reset all filters to defaults and offset to 0. */
  resetFilters: () => void
  /** Pagination state and navigation handlers. */
  pagination: {
    state: PaginationState
    goToNextPage: () => void
    goToPreviousPage: () => void
    goToPage: (page: number) => void
    resetPage: () => void
  }
  /** The raw TanStack Query result. */
  query: UseQueryResult<TData>
  /** Per-field validation errors from mutations. */
  fieldErrors: Record<string, string>
  /** Setter for field errors (pass to form components). */
  setFieldErrors: (errors: Record<string, string>) => void
  /** Clears all field errors. */
  clearFieldErrors: () => void
  /** Mutation error handler (from useMutationHandlers). */
  handleMutationError: MutationHandlers['handleMutationError']
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useListPage<TFilters extends PaginationFilters, TData extends { total: number }>(
  options: UseListPageOptions<TFilters, TData>
): UseListPageResult<TFilters, TData> {
  const { companyId, defaultFilters, pageSize = 20, queryHook } = options

  // --- Filter state ---
  const [filters, setFiltersState] = useState<TFilters>({
    ...defaultFilters,
    limit: pageSize,
    offset: 0
  } as TFilters)

  const setFilter = useCallback(<K extends keyof Omit<TFilters, 'limit' | 'offset'>>(key: K, value: TFilters[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value, offset: 0 }))
  }, [])

  const setFilters = useCallback((patch: Partial<Omit<TFilters, 'limit' | 'offset'>>) => {
    setFiltersState((prev) => ({ ...prev, ...patch, offset: 0 }))
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState({ ...defaultFilters, limit: pageSize, offset: 0 } as TFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize])

  // --- Pagination ---
  const handleOffsetChange = useCallback((offset: number) => {
    setFiltersState((prev) => ({ ...prev, offset }))
  }, [])

  const query = queryHook(companyId, filters)

  const { paginationState, goToNextPage, goToPreviousPage, goToPage, resetPage } = usePaginationControlled({
    total: query.data?.total ?? 0,
    offset: filters.offset,
    pageSize,
    onOffsetChange: handleOffsetChange
  })

  const pagination = useMemo(
    () => ({
      state: paginationState,
      goToNextPage,
      goToPreviousPage,
      goToPage,
      resetPage
    }),
    [paginationState, goToNextPage, goToPreviousPage, goToPage, resetPage]
  )

  // --- Field errors & mutation handlers ---
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({})
  }, [])

  const { handleMutationError } = useMutationHandlers({ setFieldErrors })

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    pagination,
    query,
    fieldErrors,
    setFieldErrors,
    clearFieldErrors,
    handleMutationError
  }
}

export { useListPage }
export type { PaginationFilters, UseListPageOptions, UseListPageResult }
