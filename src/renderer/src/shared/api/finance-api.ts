/**
 * Typed API client helpers for finance endpoints (installments, financial accounts,
 * financial transactions, and financial overview).
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface Pagination {
  limit: number
  offset: number
}

type TransactionType = 'inbound' | 'outbound'

interface FinancialAccountListItem {
  id: number
  name: string
  accountType: string
  bankName: string | null
  currentBalance: number
  status: string
}

interface FinancialAccountDetail {
  id: number
  name: string
  accountType: string
  bankName: string | null
  initialBalance: number
  currentBalance: number
  status: string
  recentTransactionCount: number
}

interface FinancialTransaction {
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

interface FinancialOverview {
  totalReceivable: number
  totalPayable: number
  totalOverdueReceivables: number
  totalOverduePayables: number
  recentTransactions: FinancialTransaction[]
}

interface TransactionWithBalance {
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

interface TransactionListResult {
  transactions: TransactionWithBalance[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Installment types
// ---------------------------------------------------------------------------

type OrderType = 'sales_order' | 'purchase_order'

type InstallmentStatus = 'pending' | 'paid'

type FinancialStatus = 'unpaid' | 'partially_paid' | 'paid'

interface InstallmentItem {
  id: number
  installmentNumber: number
  amount: number
  dueDate: string
  status: InstallmentStatus
  isOverdue: boolean
  settledAt: string | null
  accountId: number | null
}

interface InstallmentSummary {
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

interface CreatePaymentPlanInput {
  installments: { amount: number; dueDate: string }[]
}

interface SettleInstallmentInput {
  accountId: number
  transactionDate: string
  description?: string
}

interface SettlementResult {
  installment: InstallmentItem
  transaction: FinancialTransaction
  updatedSummary: InstallmentSummary
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Financial Accounts API
// ---------------------------------------------------------------------------

function listFinancialAccounts(companyId: number): Promise<FinancialAccountListItem[]> {
  return apiClient<FinancialAccountListItem[]>('/financial-accounts', {
    headers: companyHeaders(companyId)
  })
}

function getFinancialAccountDetail(companyId: number, id: number): Promise<FinancialAccountDetail> {
  return apiClient<FinancialAccountDetail>(`/financial-accounts/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function getFinancialOverview(companyId: number): Promise<FinancialOverview> {
  return apiClient<FinancialOverview>('/financial-accounts/overview', {
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Financial Transactions API
// ---------------------------------------------------------------------------

function listFinancialTransactions(
  companyId: number,
  accountId: number,
  pagination: Pagination
): Promise<TransactionListResult> {
  const params = new URLSearchParams({
    limit: String(pagination.limit),
    offset: String(pagination.offset)
  })
  return apiClient<TransactionListResult>(`/financial-transactions/account/${accountId}?${params}`, {
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Installments API
// ---------------------------------------------------------------------------

function listInstallments(companyId: number, orderType: OrderType, orderId: number): Promise<InstallmentSummary> {
  return apiClient<InstallmentSummary>(`/installments/order/${orderType}/${orderId}`, {
    headers: companyHeaders(companyId)
  })
}

function createPaymentPlan(
  companyId: number,
  orderType: OrderType,
  orderId: number,
  input: CreatePaymentPlanInput
): Promise<InstallmentSummary> {
  return apiClient<InstallmentSummary>(`/installments/order/${orderType}/${orderId}`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function settleInstallment(companyId: number, id: number, input: SettleInstallmentInput): Promise<SettlementResult> {
  return apiClient<SettlementResult>(`/installments/${id}/settle`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Installments
  listInstallments,
  createPaymentPlan,
  settleInstallment,
  // Financial Accounts
  listFinancialAccounts,
  getFinancialAccountDetail,
  getFinancialOverview,
  // Financial Transactions
  listFinancialTransactions
}

export type {
  // Status types
  OrderType,
  InstallmentStatus,
  FinancialStatus,
  TransactionType,
  // Installments
  InstallmentItem,
  InstallmentSummary,
  CreatePaymentPlanInput,
  SettleInstallmentInput,
  SettlementResult,
  // Financial Accounts
  FinancialAccountListItem,
  FinancialAccountDetail,
  // Financial Transactions
  FinancialTransaction,
  FinancialOverview,
  TransactionWithBalance,
  TransactionListResult
}
