import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as AuditService from '../services/audit-service'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for pagination query parameters (limit/offset).
 */
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})

/**
 * Zod schema for company-wide audit log listing with optional filters.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers audit log routes:
 *
 * - `GET /api/audit-logs` — company-wide audit log with filters
 * - `GET /api/audit-logs/:entityType/:entityId/preview` — last 5 entries compact
 * - `GET /api/audit-logs/:entityType/:entityId` — paginated audit history for entity
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
export function registerAuditLogRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/audit-logs
   * Returns paginated company-wide audit log with optional filtering.
   *
   * Query parameters:
   * - limit: number (default 20, max 100)
   * - offset: number (default 0)
   * - entityType: string (optional)
   * - action: string (optional)
   * - userId: number (optional)
   * - startDate: string (optional, ISO date)
   * - endDate: string (optional, ISO date)
   */
  fastify.get('/api/audit-logs', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = listQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const mapped: Record<string, string> = {}
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages && messages.length > 0) {
          mapped[field] = messages[0]
        }
      }
      throw new ValidationError('Invalid query parameters', mapped)
    }

    const { limit, offset, entityType, action, userId, startDate, endDate } = parsed.data

    const result = await AuditService.listForCompany(companyId, {
      limit,
      offset,
      entityType,
      action,
      userId,
      startDate,
      endDate
    })

    return ok(result)
  })

  /**
   * GET /api/audit-logs/:entityType/:entityId/preview
   * Returns the most recent 5 audit entries for a specific entity.
   * Compact preview for lazy-loaded audit panels.
   */
  fastify.get<{ Params: { entityType: string; entityId: string } }>(
    '/api/audit-logs/:entityType/:entityId/preview',
    async (request) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const { entityType, entityId } = request.params

      if (!entityType) {
        throw new ValidationError('Invalid route parameters', {
          entityType: 'entityType is required'
        })
      }

      if (!entityId) {
        throw new ValidationError('Invalid route parameters', {
          entityId: 'entityId is required'
        })
      }

      const result = await AuditService.previewForEntity(companyId, entityType, entityId)

      return ok(result)
    }
  )

  /**
   * GET /api/audit-logs/:entityType/:entityId
   * Returns paginated audit history for a specific entity, ordered by createdAt DESC.
   *
   * Query parameters:
   * - limit: number (default 20, max 100)
   * - offset: number (default 0)
   */
  fastify.get<{ Params: { entityType: string; entityId: string } }>(
    '/api/audit-logs/:entityType/:entityId',
    async (request) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const { entityType, entityId } = request.params

      if (!entityType) {
        throw new ValidationError('Invalid route parameters', {
          entityType: 'entityType is required'
        })
      }

      if (!entityId) {
        throw new ValidationError('Invalid route parameters', {
          entityId: 'entityId is required'
        })
      }

      const parsed = paginationSchema.safeParse(request.query)

      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        const mapped: Record<string, string> = {}
        for (const [field, messages] of Object.entries(fieldErrors)) {
          if (messages && messages.length > 0) {
            mapped[field] = messages[0]
          }
        }
        throw new ValidationError('Invalid query parameters', mapped)
      }

      const { limit, offset } = parsed.data

      const result = await AuditService.historyForEntity(companyId, entityType, entityId, {
        limit,
        offset
      })

      return ok(result)
    }
  )
}
