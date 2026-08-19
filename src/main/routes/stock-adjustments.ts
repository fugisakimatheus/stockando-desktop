import { count, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { stockAdjustments } from '../db/schema'
import { getDb } from '../server'
import * as StockService from '../services/stock-service'

/**
 * Zod schema for the create-stock-adjustment request body.
 */
const createAdjustmentSchema = z
  .object({
    productId: z.number().int().positive('Product ID must be a positive integer'),
    warehouseId: z.number().int().positive('Warehouse ID must be a positive integer'),
    adjustmentType: z.enum(['increase', 'decrease', 'correction']),
    quantity: z.number().positive('Quantity must be a positive number'),
    unitCost: z.number().nonnegative().optional(),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000).optional(),
    createdByUserId: z.number().int().positive('User ID must be a positive integer')
  })
  .strict()

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
 * Registers stock adjustment routes:
 *
 * - `GET /api/stock-adjustments` — paginated adjustment history for the active company
 * - `POST /api/stock-adjustments` — create a new stock adjustment
 */
export function registerStockAdjustmentRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/stock-adjustments
   * Returns a paginated list of stock adjustments for the active company,
   * ordered by createdAt descending.
   *
   * Query parameters:
   * - limit (default: 20)
   * - offset (default: 0)
   */
  fastify.get('/api/stock-adjustments', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const query = request.query as Record<string, string | undefined>
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '20', 10) || 20, 1), 100)
    const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0)

    const db = getDb()
    const whereClause = eq(stockAdjustments.companyId, companyId)

    // Count query
    const [countResult] = await db.select({ total: count() }).from(stockAdjustments).where(whereClause)

    const total = countResult?.total ?? 0

    // Data query ordered by createdAt desc
    const data = await db
      .select()
      .from(stockAdjustments)
      .where(whereClause)
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(limit)
      .offset(offset)

    return ok({ data, total, limit, offset })
  })

  /**
   * POST /api/stock-adjustments
   * Creates a new stock adjustment.
   *
   * Request body:
   * - productId: number (required)
   * - warehouseId: number (required)
   * - adjustmentType: 'increase' | 'decrease' | 'correction' (required)
   * - quantity: number (required, positive)
   * - unitCost: number (optional)
   * - reason: string (required)
   * - notes: string (optional)
   * - createdByUserId: number (required)
   *
   * On success, returns the new adjustment record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On insufficient stock for decrease, returns 422.
   */
  fastify.post('/api/stock-adjustments', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createAdjustmentSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid adjustment data', mapZodFieldErrors(flat.fieldErrors))
    }

    const adjustment = await StockService.createAdjustment(companyId, parsed.data)

    reply.status(201)
    return ok(adjustment)
  })
}
