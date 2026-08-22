import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as ReminderService from '../services/reminder-service'
import { REMINDER_STATUSES } from '../types/phase4-types'
import type { ReminderStatus } from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Valid reminder statuses derived from the const object.
 */
const validStatuses = Object.values(REMINDER_STATUSES) as [ReminderStatus, ...ReminderStatus[]]

/**
 * Zod schema for GET /api/reminders query parameters.
 *
 * Supports optional status and entityType filters with pagination.
 */
const listQuerySchema = z.object({
  status: z.enum(validStatuses).optional(),
  entityType: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps Zod flat field errors to a single-message-per-field record.
 */
function mapZodFieldErrors(fieldErrors: Record<string, string[]>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages.length > 0) {
      mapped[field] = messages[0]
    }
  }
  return mapped
}

/**
 * Extracts and validates the companyId from the `x-company-id` request header.
 * Throws ValidationError if missing or not a valid positive integer.
 */
function extractCompanyId(headers: Record<string, string | string[] | undefined>): number {
  const raw = headers['x-company-id']
  const value = Array.isArray(raw) ? raw[0] : raw

  if (!value) {
    throw new ValidationError('Company context is required', {
      'x-company-id': 'x-company-id header is required'
    })
  }

  const companyId = Number.parseInt(value, 10)

  if (Number.isNaN(companyId) || companyId <= 0) {
    throw new ValidationError('Invalid company context', {
      'x-company-id': 'x-company-id header must be a positive integer'
    })
  }

  return companyId
}

/**
 * Parses and validates a path param as a positive integer.
 * Throws ValidationError if invalid.
 */
function parseIdParam(raw: string): number {
  const id = Number.parseInt(raw, 10)

  if (Number.isNaN(id) || id <= 0) {
    throw new ValidationError('Invalid reminder ID', {
      id: 'Reminder ID must be a positive integer'
    })
  }

  return id
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

/**
 * Registers reminder routes:
 *
 * - `GET /api/reminders` — list reminders with filters
 * - `GET /api/reminders/count` — count of active reminders
 * - `POST /api/reminders/:id/dismiss` — dismiss a reminder
 * - `POST /api/reminders/:id/complete` — mark as completed
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5, 16.1
 */
export function registerReminderRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/reminders
   *
   * Query parameters:
   * - status?: 'active' | 'dismissed' | 'completed'
   * - entityType?: string
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Returns a paginated list of reminders for the active company,
   * ordered by due date ascending.
   */
  fastify.get('/api/reminders', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = listQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid query parameters', mapZodFieldErrors(flat.fieldErrors))
    }

    const { status, entityType, limit, offset } = parsed.data

    const result = await ReminderService.list(companyId, {
      status,
      entityType,
      limit,
      offset
    })

    return ok(result)
  })

  /**
   * GET /api/reminders/count
   *
   * Returns the count of active reminders for the active company.
   * Used for the navigation badge indicator.
   */
  fastify.get('/api/reminders/count', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const count = await ReminderService.countActive(companyId)

    return ok({ count })
  })

  /**
   * POST /api/reminders/:id/dismiss
   *
   * Dismisses an active reminder. No request body required.
   * Returns the updated reminder record.
   *
   * @throws NotFoundError if the reminder does not exist or does not belong to the company
   * @throws BusinessRuleError if the reminder is not in "active" status
   */
  fastify.post<{ Params: { id: string } }>('/api/reminders/:id/dismiss', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = parseIdParam(request.params.id)

    const updated = await ReminderService.dismiss(companyId, id)

    return ok(updated)
  })

  /**
   * POST /api/reminders/:id/complete
   *
   * Marks an active reminder as completed. No request body required.
   * Returns the updated reminder record.
   *
   * @throws NotFoundError if the reminder does not exist or does not belong to the company
   * @throws BusinessRuleError if the reminder is not in "active" status
   */
  fastify.post<{ Params: { id: string } }>('/api/reminders/:id/complete', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = parseIdParam(request.params.id)

    const updated = await ReminderService.complete(companyId, id)

    return ok(updated)
  })
}
