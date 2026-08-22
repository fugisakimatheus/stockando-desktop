/**
 * Reusable pagination hook that encapsulates offset-based pagination math.
 *
 * Extracted from 10+ list pages that all repeated the same:
 * - PAGE_SIZE constant
 * - currentPage / totalPages / hasPrevious / hasNext calculations
 * - handlePrevious / handleNext / resetPage handlers
 *
 * Two usage modes:
 *
 * 1. **Standalone** — hook manages its own offset state internally.
 * 2. **Controlled** — hook computes pagination from an external offset (e.g., from
 *    a filter state), and provides handlers that call your setter.
 *
 * @example Standalone mode
 * ```ts
 * const { pagination, paginationState, goToNextPage, goToPreviousPage, resetPage } =
 *   usePagination({ total: productsQuery.data?.total ?? 0 })
 *
 * const filters = { search, categoryId, ...pagination }
 * ```
 *
 * @example Controlled mode (offset lives in parent filter state)
 * ```ts
 * const [filters, setFilters] = useState({ offset: 0, limit: 20, search: '' })
 *
 * const { paginationState, goToNextPage, goToPreviousPage, resetPage } =
 *   usePaginationControlled({
 *     total: query.data?.total ?? 0,
 *     offset: filters.offset,
 *     pageSize: filters.limit,
 *     onOffsetChange: (offset) => setFilters((prev) => ({ ...prev, offset })),
 *   })
 * ```
 */

import { useCallback, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

interface PaginationState {
  /** Current page number (1-indexed). */
  currentPage: number
  /** Total number of pages. */
  totalPages: number
  /** Whether there's a previous page. */
  hasPrevious: boolean
  /** Whether there's a next page. */
  hasNext: boolean
  /** Total number of records. */
  total: number
}

// ---------------------------------------------------------------------------
// Standalone Mode
// ---------------------------------------------------------------------------

interface UsePaginationOptions {
  /** Total number of records (usually from the API response). */
  total: number
  /** Number of items per page. Defaults to 20. */
  pageSize?: number
}

interface UsePaginationResult {
  /** Offset + limit for passing to API filters. */
  pagination: { offset: number; limit: number }
  /** Computed pagination state for display. */
  paginationState: PaginationState
  /** Navigate to the next page. */
  goToNextPage: () => void
  /** Navigate to the previous page. */
  goToPreviousPage: () => void
  /** Navigate to a specific page (1-indexed). */
  goToPage: (page: number) => void
  /** Reset offset back to 0 (e.g., when filters change). */
  resetPage: () => void
}

function usePagination(options: UsePaginationOptions): UsePaginationResult {
  const { total, pageSize = 20 } = options
  const [offset, setOffset] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.floor(offset / pageSize) + 1
  const hasPrevious = offset > 0
  const hasNext = offset + pageSize < total

  const goToNextPage = useCallback(() => {
    setOffset((prev) => prev + pageSize)
  }, [pageSize])

  const goToPreviousPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - pageSize))
  }, [pageSize])

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages))
      setOffset((clamped - 1) * pageSize)
    },
    [pageSize, totalPages]
  )

  const resetPage = useCallback(() => {
    setOffset(0)
  }, [])

  const paginationState = useMemo<PaginationState>(
    () => ({ currentPage, totalPages, hasPrevious, hasNext, total }),
    [currentPage, totalPages, hasPrevious, hasNext, total]
  )

  return {
    pagination: { offset, limit: pageSize },
    paginationState,
    goToNextPage,
    goToPreviousPage,
    goToPage,
    resetPage
  }
}

// ---------------------------------------------------------------------------
// Controlled Mode (offset managed externally, e.g., in a filter state)
// ---------------------------------------------------------------------------

interface UsePaginationControlledOptions {
  /** Total number of records. */
  total: number
  /** Current offset value (from external state). */
  offset: number
  /** Page size / limit. Defaults to 20. */
  pageSize?: number
  /** Callback to update the offset in external state. */
  onOffsetChange: (offset: number) => void
}

interface UsePaginationControlledResult {
  /** Computed pagination state for display. */
  paginationState: PaginationState
  /** Navigate to the next page. */
  goToNextPage: () => void
  /** Navigate to the previous page. */
  goToPreviousPage: () => void
  /** Navigate to a specific page (1-indexed). */
  goToPage: (page: number) => void
  /** Reset offset back to 0. */
  resetPage: () => void
}

function usePaginationControlled(options: UsePaginationControlledOptions): UsePaginationControlledResult {
  const { total, offset, pageSize = 20, onOffsetChange } = options

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.floor(offset / pageSize) + 1
  const hasPrevious = offset > 0
  const hasNext = offset + pageSize < total

  const goToNextPage = useCallback(() => {
    onOffsetChange(offset + pageSize)
  }, [offset, pageSize, onOffsetChange])

  const goToPreviousPage = useCallback(() => {
    onOffsetChange(Math.max(0, offset - pageSize))
  }, [offset, pageSize, onOffsetChange])

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages))
      onOffsetChange((clamped - 1) * pageSize)
    },
    [pageSize, totalPages, onOffsetChange]
  )

  const resetPage = useCallback(() => {
    onOffsetChange(0)
  }, [onOffsetChange])

  const paginationState = useMemo<PaginationState>(
    () => ({ currentPage, totalPages, hasPrevious, hasNext, total }),
    [currentPage, totalPages, hasPrevious, hasNext, total]
  )

  return {
    paginationState,
    goToNextPage,
    goToPreviousPage,
    goToPage,
    resetPage
  }
}

export { usePagination, usePaginationControlled }
export type {
  PaginationState,
  UsePaginationControlledOptions,
  UsePaginationControlledResult,
  UsePaginationOptions,
  UsePaginationResult
}
