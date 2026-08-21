/**
 * Typed API client helpers for quote endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header.
 */

import type { PaginatedResult } from './catalog-api'
import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'cancelled'

interface QuoteListFilters {
  limit: number
  offset: number
  customerId?: number
  status?: QuoteStatus
  search?: string
}

interface QuoteListItem {
  id: number
  quoteNumber: string
  customerName: string
  status: QuoteStatus
  totalAmount: number
  validUntil: string | null
  createdAt: string
}

interface QuoteDetailItem {
  id: number
  quoteId: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

interface QuoteDetail {
  id: number
  companyId: number
  customerId: number
  customerName: string
  quoteNumber: string
  status: QuoteStatus
  validUntil: string | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  cancelledAt: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
  items: QuoteDetailItem[]
}

interface QuoteItemInput {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount?: number
}

interface CreateQuoteInput {
  customerId: number
  validUntil?: string | null
  notes?: string | null
  items: QuoteItemInput[]
}

interface UpdateQuoteInput {
  customerId?: number
  validUntil?: string | null
  notes?: string | null
  items?: QuoteItemInput[]
}

interface Quote {
  id: number
  companyId: number
  customerId: number
  quoteNumber: string
  status: QuoteStatus
  validUntil: string | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  cancelledAt: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ConvertedSalesOrderDetail {
  id: number
  companyId: number
  customerId: number
  customerName: string
  orderNumber: string
  status: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paymentStatus: string
  confirmedAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  items: {
    id: number
    orderId: number
    productId: number
    productName: string
    productSku: string
    quantity: number
    unitPrice: number
    discountAmount: number
    taxAmount: number
    totalAmount: number
    createdAt: string
  }[]
  payments: {
    id: number
    orderId: number
    paymentMethodId: number
    amount: number
    status: string
    transactionReference: string | null
    paidAt: string
    createdAt: string
  }[]
  totalPaid: number
  remainingBalance: number
}

interface ConvertQuoteResult {
  quote: Quote
  salesOrder: ConvertedSalesOrderDetail
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

function buildQueryString<T extends object>(params: T): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ---------------------------------------------------------------------------
// Quotes API
// ---------------------------------------------------------------------------

function listQuotes(companyId: number, filters: QuoteListFilters): Promise<PaginatedResult<QuoteListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<QuoteListItem>>(`/quotes${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getQuote(companyId: number, id: number): Promise<QuoteDetail> {
  return apiClient<QuoteDetail>(`/quotes/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createQuote(companyId: number, input: CreateQuoteInput): Promise<QuoteDetail> {
  return apiClient<QuoteDetail>('/quotes', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateQuote(companyId: number, id: number, input: UpdateQuoteInput): Promise<QuoteDetail> {
  return apiClient<QuoteDetail>(`/quotes/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function transitionQuoteStatus(companyId: number, id: number, status: QuoteStatus): Promise<Quote> {
  return apiClient<Quote>(`/quotes/${id}/status`, {
    method: 'PATCH',
    body: { status },
    headers: companyHeaders(companyId)
  })
}

function convertQuoteToOrder(companyId: number, id: number): Promise<ConvertQuoteResult> {
  return apiClient<ConvertQuoteResult>(`/quotes/${id}/convert`, {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { listQuotes, getQuote, createQuote, updateQuote, transitionQuoteStatus, convertQuoteToOrder }

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
  ConvertedSalesOrderDetail,
  ConvertQuoteResult
}
