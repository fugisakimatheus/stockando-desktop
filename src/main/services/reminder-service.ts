/**
 * ReminderService — CRUD and lifecycle operations for reminders.
 *
 * All operations are company-scoped. Enforces:
 * - Only active reminders can be dismissed or completed
 * - Reminders are ordered by due date ascending by default
 * - Pagination for list queries
 * - Badge count for active reminders
 */

import { and, asc, count, eq } from 'drizzle-orm'

import { BusinessRuleError, NotFoundError } from '../api/errors'
import { reminders } from '../db/schema'
import { getDb } from '../server'
import type { CreateReminderInput, PaginatedResult, ReminderListFilters, ReminderListItem } from '../types/phase4-types'
import { REMINDER_STATUSES } from '../types/phase4-types'

/**
 * Lists reminders for the given company with optional filters.
 *
 * Supports filtering by status and entityType.
 * Results are ordered by due date ascending and paginated.
 */
export async function list(
  companyId: number,
  filters: ReminderListFilters
): Promise<PaginatedResult<ReminderListItem>> {
  const db = getDb()

  const conditions = [eq(reminders.companyId, companyId)]

  if (filters.status) {
    conditions.push(eq(reminders.status, filters.status))
  }

  if (filters.entityType) {
    conditions.push(eq(reminders.entityType, filters.entityType))
  }

  const whereClause = and(...conditions)

  const [totalResult] = await db.select({ value: count() }).from(reminders).where(whereClause)

  const total = totalResult?.value ?? 0

  const rows = await db
    .select({
      id: reminders.id,
      entityType: reminders.entityType,
      entityId: reminders.entityId,
      entitySummary: reminders.entitySummary,
      message: reminders.message,
      dueDate: reminders.dueDate,
      status: reminders.status,
      ruleId: reminders.ruleId,
      createdAt: reminders.createdAt
    })
    .from(reminders)
    .where(whereClause)
    .orderBy(asc(reminders.dueDate))
    .limit(filters.limit)
    .offset(filters.offset)

  return {
    data: rows as ReminderListItem[],
    total,
    limit: filters.limit,
    offset: filters.offset
  }
}

/**
 * Returns the count of active reminders for the given company.
 * Used for the navigation badge indicator.
 */
export async function countActive(companyId: number): Promise<number> {
  const db = getDb()

  const [result] = await db
    .select({ value: count() })
    .from(reminders)
    .where(and(eq(reminders.companyId, companyId), eq(reminders.status, REMINDER_STATUSES.active)))

  return result?.value ?? 0
}

/**
 * Dismisses an active reminder.
 *
 * Validates:
 * - Reminder exists and belongs to the company
 * - Reminder is currently in "active" status
 *
 * @throws NotFoundError if the reminder does not exist or does not belong to the company
 * @throws BusinessRuleError if the reminder is not in "active" status
 */
export async function dismiss(companyId: number, id: number): Promise<ReminderListItem> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Reminder not found')
  }

  if (existing.status !== REMINDER_STATUSES.active) {
    throw new BusinessRuleError(
      `Cannot dismiss reminder with status "${existing.status}". Only active reminders can be dismissed.`
    )
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(reminders)
    .set({
      status: REMINDER_STATUSES.dismissed,
      dismissedAt: now,
      updatedAt: now
    })
    .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))
    .returning({
      id: reminders.id,
      entityType: reminders.entityType,
      entityId: reminders.entityId,
      entitySummary: reminders.entitySummary,
      message: reminders.message,
      dueDate: reminders.dueDate,
      status: reminders.status,
      ruleId: reminders.ruleId,
      createdAt: reminders.createdAt
    })

  return updated as ReminderListItem
}

/**
 * Marks an active reminder as completed.
 *
 * Validates:
 * - Reminder exists and belongs to the company
 * - Reminder is currently in "active" status
 *
 * @throws NotFoundError if the reminder does not exist or does not belong to the company
 * @throws BusinessRuleError if the reminder is not in "active" status
 */
export async function complete(companyId: number, id: number): Promise<ReminderListItem> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Reminder not found')
  }

  if (existing.status !== REMINDER_STATUSES.active) {
    throw new BusinessRuleError(
      `Cannot complete reminder with status "${existing.status}". Only active reminders can be completed.`
    )
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(reminders)
    .set({
      status: REMINDER_STATUSES.completed,
      completedAt: now,
      updatedAt: now
    })
    .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))
    .returning({
      id: reminders.id,
      entityType: reminders.entityType,
      entityId: reminders.entityId,
      entitySummary: reminders.entitySummary,
      message: reminders.message,
      dueDate: reminders.dueDate,
      status: reminders.status,
      ruleId: reminders.ruleId,
      createdAt: reminders.createdAt
    })

  return updated as ReminderListItem
}

/**
 * Creates a new reminder with status "active".
 *
 * Used by the automation service when a create_reminder action is triggered,
 * or for manual reminder creation.
 */
export async function create(companyId: number, input: CreateReminderInput): Promise<ReminderListItem> {
  const db = getDb()

  const now = new Date().toISOString()

  const [created] = await db
    .insert(reminders)
    .values({
      companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      entitySummary: input.entitySummary,
      message: input.message,
      dueDate: input.dueDate,
      status: REMINDER_STATUSES.active,
      ruleId: input.ruleId ?? null,
      createdAt: now,
      updatedAt: now
    })
    .returning({
      id: reminders.id,
      entityType: reminders.entityType,
      entityId: reminders.entityId,
      entitySummary: reminders.entitySummary,
      message: reminders.message,
      dueDate: reminders.dueDate,
      status: reminders.status,
      ruleId: reminders.ruleId,
      createdAt: reminders.createdAt
    })

  return created as ReminderListItem
}
