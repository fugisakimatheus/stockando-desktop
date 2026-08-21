/**
 * Typed API client helpers for audit log endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types
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

interface AuditLogItem {
  id: number
  entityType: string
  entityId: string
  action: string
  userId: number | null
  userName: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

interface AuditListFilters extends Pagination {
  entityType?: string
  action?: string
  userId?: number
  startDate?: string
  endDate?: string
}

// ---------------------------------------------------------------------------
// Helpers
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
// Audit Logs API
// ---------------------------------------------------------------------------

function getAuditHistory(
  companyId: number,
  entityType: string,
  entityId: string,
  pagination: Pagination
): Promise<PaginatedResult<AuditLogItem>> {
  const query = buildQueryString(pagination)
  return apiClient<PaginatedResult<AuditLogItem>>(`/audit-logs/${entityType}/${entityId}${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getAuditPreview(companyId: number, entityType: string, entityId: string): Promise<AuditLogItem[]> {
  return apiClient<AuditLogItem[]>(`/audit-logs/${entityType}/${entityId}/preview`, {
    headers: companyHeaders(companyId)
  })
}

function getCompanyAuditLogs(companyId: number, filters: AuditListFilters): Promise<PaginatedResult<AuditLogItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<AuditLogItem>>(`/audit-logs${query}`, {
    headers: companyHeaders(companyId)
  })
}

export { getAuditHistory, getAuditPreview, getCompanyAuditLogs }
export type { AuditLogItem, AuditListFilters }
