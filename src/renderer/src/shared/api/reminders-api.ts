/**
 * Typed API client helpers for reminder endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface ReminderListItem {
  id: number
  entityType: string
  entityId: string
  entitySummary: string
  message: string
  dueDate: string
  status: 'active' | 'dismissed' | 'completed'
  ruleId: number | null
  createdAt: string
}

interface ReminderListFilters {
  status?: 'active' | 'dismissed' | 'completed'
  entityType?: string
  limit?: number
  offset?: number
}

interface ActiveReminderCount {
  count: number
}

interface ReminderListResult {
  data: ReminderListItem[]
  total: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

function buildQuery(filters: ReminderListFilters): string {
  const parts: string[] = []
  if (filters.status) parts.push(`status=${encodeURIComponent(filters.status)}`)
  if (filters.entityType) parts.push(`entityType=${encodeURIComponent(filters.entityType)}`)
  if (filters.limit != null) parts.push(`limit=${filters.limit}`)
  if (filters.offset != null) parts.push(`offset=${filters.offset}`)
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ---------------------------------------------------------------------------
// Reminders API
// ---------------------------------------------------------------------------

/**
 * Lists reminders for the active company with optional filters.
 */
function listReminders(companyId: number, filters: ReminderListFilters): Promise<ReminderListResult> {
  return apiClient<ReminderListResult>(`/reminders${buildQuery(filters)}`, {
    headers: companyHeaders(companyId)
  })
}

/**
 * Gets the count of active reminders for badge display.
 */
function getActiveReminderCount(companyId: number): Promise<ActiveReminderCount> {
  return apiClient<ActiveReminderCount>('/reminders/count', {
    headers: companyHeaders(companyId)
  })
}

/**
 * Dismisses an active reminder.
 */
function dismissReminder(companyId: number, id: number): Promise<ReminderListItem> {
  return apiClient<ReminderListItem>(`/reminders/${id}/dismiss`, {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

/**
 * Marks a reminder as completed.
 */
function completeReminder(companyId: number, id: number): Promise<ReminderListItem> {
  return apiClient<ReminderListItem>(`/reminders/${id}/complete`, {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

export { listReminders, getActiveReminderCount, dismissReminder, completeReminder }
export type { ReminderListItem, ReminderListFilters, ActiveReminderCount }
