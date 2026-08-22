import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as DashboardService from '../services/dashboard-service'
import type { DashboardPeriod } from '../types/phase4-types'

/**
 * Zod schema for the POST /api/dashboard/aggregates/refresh request body.
 */
const refreshSchema = z
  .object({
    periodType: z.enum(['current_month', 'last_30_days', 'custom']),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
  .strict()
  .refine(
    (data) => {
      if (data.periodType === 'custom') {
        return !!data.startDate && !!data.endDate
      }
      return true
    },
    { message: 'startDate and endDate are required when periodType is "custom"' }
  )

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
 * Throws ValidationError if missing or not a valid integer.
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
 * Parses the periodType query parameter (and optional startDate/endDate) into
 * a DashboardPeriod discriminated union.
 */
function parsePeriodFromQuery(query: Record<string, string | undefined>): DashboardPeriod {
  const periodType = query.periodType

  if (!periodType) {
    throw new ValidationError('Missing required query parameter', {
      periodType: 'periodType query parameter is required'
    })
  }

  if (periodType !== 'current_month' && periodType !== 'last_30_days' && periodType !== 'custom') {
    throw new ValidationError('Invalid period type', {
      periodType: 'periodType must be one of: current_month, last_30_days, custom'
    })
  }

  if (periodType === 'custom') {
    const { startDate, endDate } = query

    if (!startDate || !endDate) {
      throw new ValidationError('Custom period requires date range', {
        startDate: !startDate ? 'startDate is required when periodType is "custom"' : '',
        endDate: !endDate ? 'endDate is required when periodType is "custom"' : ''
      })
    }

    return { type: 'custom', startDate, endDate }
  }

  return { type: periodType }
}

/**
 * Builds a DashboardPeriod from a validated refresh body.
 */
function buildPeriodFromBody(body: { periodType: string; startDate?: string; endDate?: string }): DashboardPeriod {
  if (body.periodType === 'custom') {
    return { type: 'custom', startDate: body.startDate ?? '', endDate: body.endDate ?? '' }
  }

  return { type: body.periodType as 'current_month' | 'last_30_days' }
}

/**
 * Registers dashboard routes:
 *
 * - `GET /api/dashboard/aggregates` — return cached aggregates for active company and period
 * - `POST /api/dashboard/aggregates/refresh` — force recomputation of aggregates
 */
export function registerDashboardRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/dashboard/aggregates
   *
   * Query parameters:
   * - periodType: 'current_month' | 'last_30_days' | 'custom' (required)
   * - startDate: ISO date string (required when periodType is 'custom')
   * - endDate: ISO date string (required when periodType is 'custom')
   *
   * Returns cached dashboard aggregates for the active company and period.
   */
  fastify.get('/api/dashboard/aggregates', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)
    const query = request.query as Record<string, string | undefined>
    const period = parsePeriodFromQuery(query)

    const aggregates = await DashboardService.getAggregates(companyId, period)

    return ok(aggregates)
  })

  /**
   * POST /api/dashboard/aggregates/refresh
   *
   * Request body:
   * - periodType: 'current_month' | 'last_30_days' | 'custom' (required)
   * - startDate: ISO date string (required when periodType is 'custom')
   * - endDate: ISO date string (required when periodType is 'custom')
   *
   * Forces recomputation of dashboard aggregates regardless of cache freshness.
   */
  fastify.post('/api/dashboard/aggregates/refresh', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = refreshSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      // Include refinement-level errors if no field errors
      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          periodType: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid refresh request', fieldErrors)
    }

    const period = buildPeriodFromBody(parsed.data)
    const aggregates = await DashboardService.refreshAggregates(companyId, period)

    return ok(aggregates)
  })
}
