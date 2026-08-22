import { getDashboardAggregates, refreshDashboardAggregates } from '@shared/api'
import type { DashboardAggregateSet, DashboardMetrics, DashboardPeriod } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const dashboardKeys = {
  all: (companyId: number) => [companyId, 'dashboard'] as const,
  aggregates: (companyId: number) => [...dashboardKeys.all(companyId), 'aggregates'] as const,
  aggregate: (companyId: number, period: DashboardPeriod) => [...dashboardKeys.aggregates(companyId), period] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches cached dashboard aggregates for the given company and period.
 * Staleness is handled server-side (returns cached data if fresh, computes if stale).
 * Only enabled when companyId is a positive integer.
 */
function useDashboardAggregates(companyId: number, period: DashboardPeriod) {
  return useQuery({
    queryKey: dashboardKeys.aggregate(companyId, period),
    queryFn: () => getDashboardAggregates(companyId, period),
    enabled: companyId > 0
  })
}

/**
 * Mutation to force recomputation of dashboard aggregates.
 * Invalidates all dashboard aggregate queries on success so the UI
 * re-fetches fresh data.
 */
function useRefreshDashboard(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (period: DashboardPeriod) => refreshDashboardAggregates(companyId, period),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.aggregates(companyId) })
    }
  })
}

export { dashboardKeys, useDashboardAggregates, useRefreshDashboard }
export type { DashboardAggregateSet, DashboardMetrics, DashboardPeriod }
