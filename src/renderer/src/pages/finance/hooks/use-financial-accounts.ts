import {
  listFinancialAccounts,
  getFinancialAccountDetail,
  getFinancialOverview,
  listFinancialTransactions
} from '@shared/api'
import type {
  Pagination,
  FinancialAccountListItem,
  FinancialAccountDetail,
  FinancialOverview,
  TransactionListResult
} from '@shared/api'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const financialAccountKeys = {
  all: (companyId: number) => [companyId, 'financial-accounts'] as const,
  lists: (companyId: number) => [...financialAccountKeys.all(companyId), 'list'] as const,
  details: (companyId: number) => [...financialAccountKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...financialAccountKeys.details(companyId), id] as const,
  overview: (companyId: number) => [...financialAccountKeys.all(companyId), 'overview'] as const
}

const financialTransactionKeys = {
  all: (companyId: number) => [companyId, 'financial-transactions'] as const,
  forAccount: (companyId: number, accountId: number) =>
    [...financialTransactionKeys.all(companyId), accountId] as const,
  list: (companyId: number, accountId: number, pagination: Pagination) =>
    [...financialTransactionKeys.forAccount(companyId, accountId), pagination] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all financial accounts for the given company.
 */
function useFinancialAccounts(companyId: number) {
  return useQuery({
    queryKey: financialAccountKeys.lists(companyId),
    queryFn: () => listFinancialAccounts(companyId)
  })
}

/**
 * Fetches a single financial account detail.
 * Only enabled when id is defined.
 */
function useFinancialAccountDetail(companyId: number, id: number | undefined) {
  return useQuery({
    queryKey: financialAccountKeys.detail(companyId, id ?? 0),
    queryFn: () => getFinancialAccountDetail(companyId, id as number),
    enabled: id !== undefined
  })
}

/**
 * Fetches the financial overview (receivables, payables, overdue) for the company.
 */
function useFinancialOverview(companyId: number) {
  return useQuery({
    queryKey: financialAccountKeys.overview(companyId),
    queryFn: () => getFinancialOverview(companyId)
  })
}

/**
 * Fetches a paginated list of financial transactions for a specific account.
 */
function useFinancialTransactions(companyId: number, accountId: number, pagination: Pagination) {
  return useQuery({
    queryKey: financialTransactionKeys.list(companyId, accountId, pagination),
    queryFn: () => listFinancialTransactions(companyId, accountId, pagination)
  })
}

export {
  financialAccountKeys,
  financialTransactionKeys,
  useFinancialAccounts,
  useFinancialAccountDetail,
  useFinancialOverview,
  useFinancialTransactions
}
export type { FinancialAccountListItem, FinancialAccountDetail, FinancialOverview, TransactionListResult, Pagination }
