import { getAuditHistory, getAuditPreview, getCompanyAuditLogs } from '@shared/api'
import type { AuditLogItem, AuditListFilters, PaginatedResult, Pagination } from '@shared/api'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const auditKeys = {
  all: (companyId: number) => [companyId, 'audit-logs'] as const,
  histories: (companyId: number) => [...auditKeys.all(companyId), 'history'] as const,
  history: (companyId: number, entityType: string, entityId: string, pagination: Pagination) =>
    [...auditKeys.histories(companyId), entityType, entityId, pagination] as const,
  previews: (companyId: number) => [...auditKeys.all(companyId), 'preview'] as const,
  preview: (companyId: number, entityType: string, entityId: string) =>
    [...auditKeys.previews(companyId), entityType, entityId] as const,
  companyLists: (companyId: number) => [...auditKeys.all(companyId), 'company-list'] as const,
  companyList: (companyId: number, filters: AuditListFilters) =>
    [...auditKeys.companyLists(companyId), filters] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches paginated audit history for a specific entity.
 * Only enabled when entityId is defined and non-empty.
 */
function useAuditHistory(companyId: number, entityType: string, entityId: string, pagination: Pagination) {
  return useQuery({
    queryKey: auditKeys.history(companyId, entityType, entityId, pagination),
    queryFn: () => getAuditHistory(companyId, entityType, entityId, pagination),
    enabled: entityId !== ''
  })
}

/**
 * Fetches the most recent 5 audit entries for an entity (compact preview).
 * Only enabled when entityId is defined and non-empty.
 */
function useAuditPreview(companyId: number, entityType: string, entityId: string) {
  return useQuery({
    queryKey: auditKeys.preview(companyId, entityType, entityId),
    queryFn: () => getAuditPreview(companyId, entityType, entityId),
    enabled: entityId !== ''
  })
}

/**
 * Fetches company-wide audit logs with filtering support.
 */
function useCompanyAuditLogs(companyId: number, filters: AuditListFilters) {
  return useQuery({
    queryKey: auditKeys.companyList(companyId, filters),
    queryFn: () => getCompanyAuditLogs(companyId, filters)
  })
}

export { auditKeys, useAuditHistory, useAuditPreview, useCompanyAuditLogs }
export type { AuditLogItem, AuditListFilters, PaginatedResult, Pagination }
