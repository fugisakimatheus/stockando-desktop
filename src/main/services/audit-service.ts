/**
 * AuditService — logs entity changes and queries audit history.
 *
 * Provides:
 * - `logAudit(entry)` — standalone audit insert (backward-compatible)
 * - `log(tx, entry)` — transactional audit insert within caller's transaction
 * - `historyForEntity(companyId, entityType, entityId, pagination)` — paginated history for a specific entity
 * - `previewForEntity(companyId, entityType, entityId)` — last 5 entries for compact display
 * - `listForCompany(companyId, filters)` — company-wide audit list with filtering
 *
 * All queries join with the users table to resolve userName for display.
 * All queries enforce company scoping.
 *
 * Requirements: 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.4
 */

import { and, count, desc, eq, gte, lte } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import type * as schema from '../db/schema'
import { auditLogs, users } from '../db/schema'
import { getDb } from '../server'
import type { AuditListFilters, AuditLogItem, PaginatedResult, Pagination } from '../types/finance'
import type { AuditLogEntry } from './types'

// ---------------------------------------------------------------------------
// Transaction type alias
// ---------------------------------------------------------------------------

type DrizzleTx = BetterSQLite3Database<typeof schema>

// ---------------------------------------------------------------------------
// Public API — Standalone (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Inserts an audit log entry into the `audit_logs` table.
 *
 * Sets `createdAt` to the current ISO timestamp automatically.
 * Uses the global db instance (not transactional).
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  const db = getDb()

  await db.insert(auditLogs).values({
    companyId: entry.companyId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    userId: entry.userId ?? null,
    details: entry.details ?? null,
    createdAt: new Date().toISOString()
  })
}

// ---------------------------------------------------------------------------
// Public API — Transactional
// ---------------------------------------------------------------------------

/**
 * Inserts an audit log entry within the caller's transaction context.
 *
 * Use this when the audit entry must be part of a larger atomic operation
 * (e.g., installment settlement, fiscal document creation).
 */
export async function log(tx: DrizzleTx, entry: AuditLogEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    companyId: entry.companyId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    userId: entry.userId ?? null,
    details: entry.details ?? null,
    createdAt: new Date().toISOString()
  })
}

// ---------------------------------------------------------------------------
// Public API — Query
// ---------------------------------------------------------------------------

/**
 * Returns paginated audit history for a specific entity, ordered by createdAt DESC.
 *
 * Joins with users table to resolve userName. Enforces company scoping.
 */
export async function historyForEntity(
  companyId: number,
  entityType: string,
  entityId: string,
  pagination: Pagination
): Promise<PaginatedResult<AuditLogItem>> {
  const db = getDb()

  const conditions = and(
    eq(auditLogs.companyId, companyId),
    eq(auditLogs.entityType, entityType),
    eq(auditLogs.entityId, entityId)
  )

  const [totalResult] = await db.select({ value: count() }).from(auditLogs).where(conditions)

  const total = totalResult?.value ?? 0

  const rows = await db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      userId: auditLogs.userId,
      userName: users.name,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(conditions)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset)

  const data: AuditLogItem[] = rows.map(mapRowToAuditLogItem)

  return {
    data,
    total,
    limit: pagination.limit,
    offset: pagination.offset
  }
}

/**
 * Returns the most recent 5 audit entries for a specific entity.
 *
 * Compact preview for lazy-loaded audit panels. Enforces company scoping.
 */
export async function previewForEntity(
  companyId: number,
  entityType: string,
  entityId: string
): Promise<AuditLogItem[]> {
  const db = getDb()

  const rows = await db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      userId: auditLogs.userId,
      userName: users.name,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(eq(auditLogs.companyId, companyId), eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId))
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(5)
    .offset(0)

  return rows.map(mapRowToAuditLogItem)
}

/**
 * Returns paginated company-wide audit log with optional filtering.
 *
 * Supports filtering by entityType, action, userId, and date range (startDate/endDate).
 * Joins with users table to resolve userName. Enforces company scoping.
 */
export async function listForCompany(
  companyId: number,
  filters: AuditListFilters
): Promise<PaginatedResult<AuditLogItem>> {
  const db = getDb()

  const conditions = buildFilterConditions(companyId, filters)

  const [totalResult] = await db.select({ value: count() }).from(auditLogs).where(conditions)

  const total = totalResult?.value ?? 0

  const rows = await db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      userId: auditLogs.userId,
      userName: users.name,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(conditions)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit)
    .offset(filters.offset)

  const data: AuditLogItem[] = rows.map(mapRowToAuditLogItem)

  return {
    data,
    total,
    limit: filters.limit,
    offset: filters.offset
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the combined WHERE conditions for listForCompany based on filters.
 */
function buildFilterConditions(companyId: number, filters: AuditListFilters) {
  const parts = [eq(auditLogs.companyId, companyId)]

  if (filters.entityType) {
    parts.push(eq(auditLogs.entityType, filters.entityType))
  }

  if (filters.action) {
    parts.push(eq(auditLogs.action, filters.action))
  }

  if (filters.userId) {
    parts.push(eq(auditLogs.userId, filters.userId))
  }

  if (filters.startDate) {
    parts.push(gte(auditLogs.createdAt, filters.startDate))
  }

  if (filters.endDate) {
    parts.push(lte(auditLogs.createdAt, filters.endDate))
  }

  return and(...parts)
}

/**
 * Maps a raw query row to the AuditLogItem interface.
 *
 * Parses the JSON details field into a Record<string, unknown> or null.
 */
function mapRowToAuditLogItem(row: {
  id: number
  entityType: string
  entityId: string
  action: string
  userId: number | null
  userName: string | null
  details: string | null
  createdAt: string
}): AuditLogItem {
  let parsedDetails: Record<string, unknown> | null = null

  if (row.details) {
    try {
      parsedDetails = JSON.parse(row.details) as Record<string, unknown>
    } catch {
      parsedDetails = null
    }
  }

  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    userId: row.userId,
    userName: row.userName,
    details: parsedDetails,
    createdAt: row.createdAt
  }
}
