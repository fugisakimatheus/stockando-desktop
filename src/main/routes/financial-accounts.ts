import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as FinancialAccountService from '../services/financial-account-service'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for the :id route parameter.
 */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers financial account routes:
 *
 * - `GET /api/financial-accounts` — list accounts for active company
 * - `GET /api/financial-accounts/overview` — financial overview (receivables, payables, overdue)
 * - `GET /api/financial-accounts/:id` — account detail with summary
 */
export function registerFinancialAccountRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/financial-accounts
   * Returns all active financial accounts for the active company.
   */
  fastify.get('/api/financial-accounts', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const accounts = await FinancialAccountService.list(companyId)

    return ok(accounts)
  })

  /**
   * GET /api/financial-accounts/overview
   * Returns financial overview with receivables, payables, and overdue totals.
   *
   * NOTE: Registered BEFORE :id to prevent Fastify from matching "overview" as a param.
   */
  fastify.get('/api/financial-accounts/overview', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const overview = await FinancialAccountService.overview(companyId)

    return ok(overview)
  })

  /**
   * GET /api/financial-accounts/:id
   * Returns detailed information for a specific financial account.
   */
  fastify.get('/api/financial-accounts/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = idParamSchema.safeParse(request.params)

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const mapped: Record<string, string> = {}
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages && messages.length > 0) {
          mapped[field] = messages[0]
        }
      }
      throw new ValidationError('Invalid route parameters', mapped)
    }

    const { id } = parsed.data

    const account = await FinancialAccountService.detail(companyId, id)

    return ok(account)
  })
}
