/**
 * Typed API client helpers for fiscal document endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import type { AttachmentRecord } from './attachments-api'
import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface Pagination {
  limit: number
  offset: number
}

interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

const FISCAL_DOCUMENT_STATUSES = {
  draft: 'draft',
  authorized: 'authorized',
  cancelled: 'cancelled',
  denied: 'denied'
} as const

type FiscalDocumentStatus = (typeof FISCAL_DOCUMENT_STATUSES)[keyof typeof FISCAL_DOCUMENT_STATUSES]

const FISCAL_DOCUMENT_TYPES = {
  nfe: 'NF-e',
  nfce: 'NFC-e'
} as const

type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[keyof typeof FISCAL_DOCUMENT_TYPES]

interface FiscalDocumentListFilters extends Pagination {
  documentType?: FiscalDocumentType
  status?: FiscalDocumentStatus
  customerId?: number
  startDate?: string
  endDate?: string
  search?: string
}

interface FiscalDocumentListItem {
  id: number
  documentType: FiscalDocumentType
  documentNumber: string
  series: string
  accessKey: string | null
  customerName: string | null
  status: FiscalDocumentStatus
  totalAmount: number
  issueDate: string
  createdAt: string
}

interface FiscalDocumentItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  taxAmount: number
  totalAmount: number
}

interface FiscalDocumentEvent {
  id: number
  eventType: string
  protocolNumber: string | null
  justification: string | null
  eventDate: string
  createdAt: string
}

interface FiscalDocumentDetail {
  id: number
  companyId: number
  orderId: number | null
  customerId: number | null
  customerName: string | null
  digitalCertificateId: number | null
  taxRuleId: number | null
  documentType: FiscalDocumentType
  documentNumber: string
  series: string
  accessKey: string | null
  protocolNumber: string | null
  issueDate: string
  status: FiscalDocumentStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  authorizedAt: string | null
  cancelledAt: string | null
  cancellationJustification: string | null
  items: FiscalDocumentItem[]
  events: FiscalDocumentEvent[]
  orderNumber: string | null
}

interface CreateFiscalDocumentInput {
  orderId: number
  documentType: FiscalDocumentType
  series: string
  taxRuleId?: number
  digitalCertificateId?: number
  issueDate: string
}

interface AuthorizeFiscalInput {
  accessKey: string
  protocolNumber: string
  xmlContent: string
  authorizedAt: string
}

interface CancelFiscalInput {
  protocolNumber: string
  justification: string
  cancelledAt: string
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
// Fiscal Documents API
// ---------------------------------------------------------------------------

function listFiscalDocuments(
  companyId: number,
  filters: FiscalDocumentListFilters
): Promise<PaginatedResult<FiscalDocumentListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<FiscalDocumentListItem>>(`/fiscal-documents${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getFiscalDocumentDetail(companyId: number, id: number): Promise<FiscalDocumentDetail> {
  return apiClient<FiscalDocumentDetail>(`/fiscal-documents/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createFiscalDocument(companyId: number, input: CreateFiscalDocumentInput): Promise<FiscalDocumentDetail> {
  return apiClient<FiscalDocumentDetail>('/fiscal-documents', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function authorizeFiscalDocument(
  companyId: number,
  id: number,
  input: AuthorizeFiscalInput
): Promise<FiscalDocumentDetail> {
  return apiClient<FiscalDocumentDetail>(`/fiscal-documents/${id}/authorize`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function cancelFiscalDocument(companyId: number, id: number, input: CancelFiscalInput): Promise<FiscalDocumentDetail> {
  return apiClient<FiscalDocumentDetail>(`/fiscal-documents/${id}/cancel`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function generateDanfe(companyId: number, id: number): Promise<AttachmentRecord> {
  return apiClient<AttachmentRecord>(`/fiscal-documents/${id}/danfe`, {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

function getFiscalDocumentXml(companyId: number, id: number): Promise<string> {
  return apiClient<string>(`/fiscal-documents/${id}/xml`, {
    headers: companyHeaders(companyId)
  })
}

function searchFiscalByAccessKey(companyId: number, accessKey: string): Promise<FiscalDocumentDetail | null> {
  const query = buildQueryString({ accessKey })
  return apiClient<FiscalDocumentDetail | null>(`/fiscal-documents/search-by-key${query}`, {
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  listFiscalDocuments,
  getFiscalDocumentDetail,
  createFiscalDocument,
  authorizeFiscalDocument,
  cancelFiscalDocument,
  generateDanfe,
  getFiscalDocumentXml,
  searchFiscalByAccessKey,
  FISCAL_DOCUMENT_STATUSES,
  FISCAL_DOCUMENT_TYPES
}

export type {
  Pagination as FiscalPagination,
  PaginatedResult as FiscalPaginatedResult,
  FiscalDocumentStatus,
  FiscalDocumentType,
  FiscalDocumentListFilters,
  FiscalDocumentListItem,
  FiscalDocumentItem,
  FiscalDocumentEvent,
  FiscalDocumentDetail,
  CreateFiscalDocumentInput,
  AuthorizeFiscalInput,
  CancelFiscalInput
}
