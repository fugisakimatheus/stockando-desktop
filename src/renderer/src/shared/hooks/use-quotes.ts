import { listQuotes, getQuote, createQuote, updateQuote, transitionQuoteStatus, convertQuoteToOrder } from '@shared/api'
import type {
  QuoteStatus,
  QuoteListFilters,
  QuoteListItem,
  QuoteDetail,
  QuoteDetailItem,
  QuoteItemInput,
  CreateQuoteInput,
  UpdateQuoteInput,
  Quote,
  ConvertQuoteResult,
  PaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const quoteKeys = {
  all: (companyId: number) => [companyId, 'quotes'] as const,
  lists: (companyId: number) => [...quoteKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: QuoteListFilters) => [...quoteKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...quoteKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...quoteKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of quotes for the given company,
 * supporting filtering by customer, status, and search term.
 */
function useQuotes(companyId: number, filters: QuoteListFilters) {
  return useQuery({
    queryKey: quoteKeys.list(companyId, filters),
    queryFn: () => listQuotes(companyId, filters)
  })
}

/**
 * Fetches a single quote detail with items and customer name.
 * Only enabled when quoteId is defined.
 */
function useQuoteDetail(companyId: number, quoteId: number | undefined) {
  return useQuery({
    queryKey: quoteKeys.detail(companyId, quoteId ?? 0),
    queryFn: () => getQuote(companyId, quoteId as number),
    enabled: quoteId !== undefined
  })
}

/**
 * Mutation to create a new quote with items.
 * Invalidates the quotes list cache on success.
 */
function useCreateQuote(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateQuoteInput) => createQuote(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing quote.
 * Invalidates all quote caches on success.
 */
function useUpdateQuote(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateQuoteInput & { id: number }) => updateQuote(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to transition a quote's status.
 * Invalidates all quote caches on success.
 */
function useTransitionQuoteStatus(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: QuoteStatus }) => transitionQuoteStatus(companyId, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to convert an accepted quote into a sales order.
 * Invalidates quote caches and sales order caches on success.
 */
function useConvertQuoteToOrder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => convertQuoteToOrder(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: [companyId, 'sales-orders'] })
    }
  })
}

export {
  quoteKeys,
  useQuotes,
  useQuoteDetail,
  useCreateQuote,
  useUpdateQuote,
  useTransitionQuoteStatus,
  useConvertQuoteToOrder
}
export type {
  QuoteStatus,
  QuoteListFilters,
  QuoteListItem,
  QuoteDetail,
  QuoteDetailItem,
  QuoteItemInput,
  CreateQuoteInput,
  UpdateQuoteInput,
  Quote,
  ConvertQuoteResult,
  PaginatedResult
}
