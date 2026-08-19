import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as StockService from '../services/stock-service'

/**
 * Zod schema for the reconcile request body.
 */
const reconcileSchema = z
  .object({
    productId: z.number().int().positive('productId must be a positive integer'),
    warehouseId: z.number().int().positive('warehouseId must be a positive integer')
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
 * Registers stock query and reconciliation routes:
 *
 * - `GET /api/stock/product/:productId` — stock balances per warehouse for a product
 * - `GET /api/stock/warehouse/:warehouseId` — paginated product stock at a warehouse
 * - `POST /api/stock/reconcile` — run reconciliation check for a product/warehouse pair
 */
export function registerStockRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/stock/product/:productId
   * Returns stock balances per warehouse for the given product within the active company.
   */
  fastify.get<{ Params: { productId: string } }>('/api/stock/product/:productId', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const productId = Number.parseInt(request.params.productId, 10)
    if (Number.isNaN(productId) || productId <= 0) {
      throw new ValidationError('Invalid product ID', {
        productId: 'productId must be a valid positive integer'
      })
    }

    const balances = await StockService.getProductBalances(companyId, productId)

    return ok(balances)
  })

  /**
   * GET /api/stock/warehouse/:warehouseId
   * Returns a paginated list of products with their stock at the specified warehouse.
   *
   * Query parameters:
   * - limit (default 20)
   * - offset (default 0)
   */
  fastify.get<{ Params: { warehouseId: string } }>('/api/stock/warehouse/:warehouseId', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const warehouseId = Number.parseInt(request.params.warehouseId, 10)
    if (Number.isNaN(warehouseId) || warehouseId <= 0) {
      throw new ValidationError('Invalid warehouse ID', {
        warehouseId: 'warehouseId must be a valid positive integer'
      })
    }

    const query = request.query as Record<string, string | undefined>
    const limit = parseIntParam(query.limit) ?? 20
    const offset = parseIntParam(query.offset) ?? 0

    const result = await StockService.getWarehouseOverview(companyId, warehouseId, { limit, offset })

    return ok(result)
  })

  /**
   * POST /api/stock/reconcile
   * Runs a reconciliation check comparing computed balance (from movements) against
   * the materialized stock record for a given product/warehouse pair.
   *
   * Request body:
   * - productId: number (required)
   * - warehouseId: number (required)
   *
   * Returns the reconciliation result with computed balance, materialized balance,
   * discrepancy, and isConsistent flag.
   */
  fastify.post('/api/stock/reconcile', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = reconcileSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid reconcile request', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await StockService.reconcile(companyId, parsed.data.productId, parsed.data.warehouseId)

    return ok(result)
  })
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Parses a string query parameter as an integer.
 * Returns undefined if the value is missing or not a valid integer.
 */
function parseIntParam(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
