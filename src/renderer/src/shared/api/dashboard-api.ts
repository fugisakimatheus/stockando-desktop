/**
 * Typed API client helpers for dashboard endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

type DashboardPeriod =
  | { type: 'current_month' }
  | { type: 'last_30_days' }
  | { type: 'custom'; startDate: string; endDate: string }

interface DashboardMetrics {
  totalSales: number
  totalPurchases: number
  totalReceivables: number
  totalPayables: number
  totalOverdueReceivables: number
  totalOverduePayables: number
  currentInventoryValue: number
  lowStockProductCount: number
}

interface DashboardAggregateSet {
  companyId: number
  period: DashboardPeriod
  lastUpdatedAt: string
  metrics: DashboardMetrics
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

function buildPeriodQuery(period: DashboardPeriod): string {
  const parts: string[] = [`periodType=${encodeURIComponent(period.type)}`]

  if (period.type === 'custom') {
    parts.push(`startDate=${encodeURIComponent(period.startDate)}`)
    parts.push(`endDate=${encodeURIComponent(period.endDate)}`)
  }

  return `?${parts.join('&')}`
}

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

/**
 * Fetches cached dashboard aggregates for the given company and period.
 */
function getDashboardAggregates(companyId: number, period: DashboardPeriod): Promise<DashboardAggregateSet> {
  const query = buildPeriodQuery(period)
  return apiClient<DashboardAggregateSet>(`/dashboard/aggregates${query}`, {
    headers: companyHeaders(companyId)
  })
}

/**
 * Forces a recomputation of dashboard aggregates for the given company and period.
 */
function refreshDashboardAggregates(companyId: number, period: DashboardPeriod): Promise<DashboardAggregateSet> {
  return apiClient<DashboardAggregateSet>('/dashboard/aggregates/refresh', {
    method: 'POST',
    body: {
      periodType: period.type,
      ...(period.type === 'custom' ? { startDate: period.startDate, endDate: period.endDate } : {})
    },
    headers: companyHeaders(companyId)
  })
}

export { getDashboardAggregates, refreshDashboardAggregates }
export type { DashboardAggregateSet, DashboardMetrics, DashboardPeriod }
