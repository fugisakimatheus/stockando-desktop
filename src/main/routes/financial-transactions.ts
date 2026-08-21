import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as FinancialTransactionService from '../services/financial-transaction-service'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for list query parameters (limit/offset pagination).
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
})

/**
 * Zod schema for the accountId route parameter.
 */
const accountIdParamSchema = z.object({
  accountId: z.coerce.number().int().positive()
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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers financial transaction routes:
 *
 * - `GET /api/financial-transactions/account/:accountId` — paginated transaction list with running balance
 */
export function registerFinancialTransactionRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/financial-transactions/account/:accountId
   * Returns a paginated list of financial transactions for the given account
   * with running balance computation.
   */
  fastify.get('/api/financial-transactions/account/:accountId', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const paramsParsed = accountIdParamSchema.safeParse(request.params)

    if (!paramsParsed.success) {
      throw new ValidationError(
        'Invalid account ID',
        mapZodFieldErrors(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>)
      )
    }

    const queryParsed = listQuerySchema.safeParse(request.query)

    if (!queryParsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        mapZodFieldErrors(queryParsed.error.flatten().fieldErrors as Record<string, string[]>)
      )
    }

    const { accountId } = paramsParsed.data
    const { limit, offset } = queryParsed.data

    const result = await FinancialTransactionService.listForAccount(companyId, accountId, {
      limit,
      offset
    })

    return ok(result)
  })
}
