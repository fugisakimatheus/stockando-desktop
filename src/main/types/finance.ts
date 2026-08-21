/**
 * Shared type definitions for Phase 3 — Finance, Fiscal, and Auditability.
 *
 * Status types, API request/response interfaces, and utility types for the
 * financial control, fiscal compliance, and audit traceability layer.
 */

// ---------------------------------------------------------------------------
// Status Types
// ---------------------------------------------------------------------------

export const INSTALLMENT_STATUSES = {
  pending: 'pending',
  paid: 'paid',
  overdue: 'overdue' // derived, not persisted
} as const satisfies Record<string, string>

export type InstallmentStatus = 'pending' | 'paid'

export const FISCAL_DOCUMENT_STATUSES = {
  draft: 'draft',
  authorized: 'authorized',
  cancelled: 'cancelled',
  denied: 'denied'
} as const satisfies Record<string, string>

export type FiscalDocumentStatus = (typeof FISCAL_DOCUMENT_STATUSES)[keyof typeof FISCAL_DOCUMENT_STATUSES]

export const FISCAL_DOCUMENT_TYPES = {
  nfe: 'NF-e',
  nfce: 'NFC-e'
} as const satisfies Record<string, string>

export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[keyof typeof FISCAL_DOCUMENT_TYPES]

export const TRANSACTION_TYPES = {
  inbound: 'inbound',
  outbound: 'outbound'
} as const satisfies Record<string, string>

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]

export const ORDER_TYPES = {
  sales_order: 'sales_order',
  purchase_order: 'purchase_order'
} as const satisfies Record<string, string>

export type OrderType = (typeof ORDER_TYPES)[keyof typeof ORDER_TYPES]

export const FINANCIAL_STATUSES = {
  unpaid: 'unpaid',
  partially_paid: 'partially_paid',
  paid: 'paid'
} as const satisfies Record<string, string>

export type FinancialStatus = (typeof FINANCIAL_STATUSES)[keyof typeof FINANCIAL_STATUSES]

export const ATTACHMENT_ENTITY_TYPES = {
  sales_order: 'sales_order',
  purchase_order: 'purchase_order',
  fiscal_document: 'fiscal_document',
  payment: 'payment'
} as const satisfies Record<string, string>

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[keyof typeof ATTACHMENT_ENTITY_TYPES]

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Pagination {
  limit: number
  offset: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

export interface CreatePaymentPlanInput {
  orderType: OrderType
  orderId: number
  installments: InstallmentInput[]
}

export interface InstallmentInput {
  amount: number
  dueDate: string // ISO date
}

export interface SettleInstallmentInput {
  accountId: number
  transactionDate: string // ISO date
  description?: string
}

export interface CreateFiscalDocumentInput {
  orderId: number
  documentType: FiscalDocumentType
  series: string
  taxRuleId?: number
  digitalCertificateId?: number
  issueDate: string
}

export interface AuthorizeFiscalInput {
  accessKey: string // 44-digit string
  protocolNumber: string
  xmlContent: string
  authorizedAt: string
}

export interface CancelFiscalInput {
  protocolNumber: string
  justification: string
  cancelledAt: string
}

export interface CreateAttachmentInput {
  entityType: AttachmentEntityType
  entityId: string
  fileName: string
  filePath: string // temp path for upload
  mimeType: string
}

export interface CreateTransactionInput {
  accountId: number
  transactionType: TransactionType
  referenceType: string
  referenceId: string
  amount: number
  description?: string
  transactionDate: string
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface FinancialTransaction {
  id: number
  companyId: number
  accountId: number
  transactionType: TransactionType
  referenceType: string | null
  referenceId: string | null
  amount: number
  description: string | null
  transactionDate: string
  createdAt: string
}

export interface InstallmentSummary {
  orderId: number
  orderType: OrderType
  documentTotal: number
  totalExpected: number
  totalPaid: number
  totalOverdue: number
  remainingBalance: number
  financialStatus: FinancialStatus
  installments: InstallmentItem[]
}

export interface InstallmentItem {
  id: number
  installmentNumber: number
  amount: number
  dueDate: string
  status: InstallmentStatus
  isOverdue: boolean
  settledAt: string | null
  accountId: number | null
}

export interface SettlementResult {
  installment: InstallmentItem
  transaction: FinancialTransaction
  updatedSummary: InstallmentSummary
}

export interface FinancialOverview {
  totalReceivable: number
  totalPayable: number
  totalOverdueReceivables: number
  totalOverduePayables: number
  recentTransactions: FinancialTransaction[]
}

export interface FinancialAccountListItem {
  id: number
  name: string
  accountType: string
  bankName: string | null
  currentBalance: number
  status: string
}

export interface FinancialAccountDetail {
  id: number
  name: string
  accountType: string
  bankName: string | null
  initialBalance: number
  currentBalance: number
  status: string
  recentTransactionCount: number
}

export interface TransactionListResult {
  transactions: TransactionWithBalance[]
  total: number
  limit: number
  offset: number
}

export interface TransactionWithBalance {
  id: number
  transactionType: TransactionType
  referenceType: string | null
  referenceId: string | null
  amount: number
  description: string | null
  transactionDate: string
  runningBalance: number
  createdAt: string
}

export interface FiscalDocumentListItem {
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

export interface FiscalDocumentDetail {
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

export interface FiscalDocumentItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  taxAmount: number
  totalAmount: number
}

export interface FiscalDocumentEvent {
  id: number
  eventType: string
  protocolNumber: string | null
  justification: string | null
  eventDate: string
  createdAt: string
}

export interface AttachmentRecord {
  id: number
  entityType: string
  entityId: string
  fileName: string
  filePath: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string
}

export interface AuditLogItem {
  id: number
  entityType: string
  entityId: string
  action: string
  userId: number | null
  userName: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Filter Types
// ---------------------------------------------------------------------------

export interface AuditListFilters extends Pagination {
  entityType?: string
  action?: string
  userId?: number
  startDate?: string
  endDate?: string
}

export interface FiscalDocumentListFilters extends Pagination {
  documentType?: FiscalDocumentType
  status?: FiscalDocumentStatus
  customerId?: number
  startDate?: string
  endDate?: string
  search?: string
}
