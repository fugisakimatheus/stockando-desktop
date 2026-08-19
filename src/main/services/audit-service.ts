/**
 * AuditService — logs entity changes to the audit_logs table.
 *
 * Provides a single `logAudit` function that inserts an audit entry with
 * companyId, entityType, entityId, action, optional userId, and optional details.
 */

import { auditLogs } from '../db/schema'
import { getDb } from '../server'
import type { AuditLogEntry } from './types'

/**
 * Inserts an audit log entry into the `audit_logs` table.
 *
 * Sets `createdAt` to the current ISO timestamp automatically.
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
