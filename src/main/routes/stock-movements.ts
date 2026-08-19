import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as StockService from '../services/stock-service'
import type { MovementType } from '../services/types'
import { MOVEMENT_TYPES } from '../services/types'

/**
 * Zod schema for the inbound movement request body.
 */
const inboundSchema = z
  .object({
    productId: z.number().int().positive(),
    warehouseId: z.number().int().positive(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative().optional(),
    referenceType: z.string().max(50).optional(),
    referenceId: z.string().max(50).optional(),
    notes: z.string().max(500).optional()
  })
  .strict()

/**
 * Zod schema for the outbound movement request body.
 */
const outboundSchema = z
  .object({
    productId: z.number().int().positive(),
    warehouseId: z.number().int().positive(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative().optional(),
    referenceType: z.string().max(50).optional(),
    referenceId: z.string().max(50).optional(),
    notes: z.string().max(500).optional()
  })
  .strict()

/**
 * Zod schema for the transfer movement request body.
 */
const transferSchema = z
  .object({
    productId: z.number().int().positive(),
    sourceWarehouseId: z.number().int().positive(),
    destinationWarehouseId: z.number().int().positive(),
    quantity: z.number().positive(),
    notes: z.string().max(500).optional()
  })
  .strict()

/**
 * Valid movement types for filter validation.
 */
const validMovementTypes = new Set<string>(Object.values(MOVEMENT_TYPES))

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
 * Registers stock movement routes:
 *
 * - `GET /api/stock-movements` — paginated, filterable movement history
 * - `POST /api/stock-movements/inbound` — record an inbound movement
 * - `POST /api/stock-movements/outbound` — record an outbound movement
 * - `POST /api/stock-movements/transfer` — record a transfer between warehouses
 *
 * No PUT or DELETE endpoints — movements are immutable after creation.
 */
export function registerStockMovementRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/stock-movements
   * Returns a paginated and filterable list of stock movements for the active company.
   *
   * Query parameters:
   * - limit (default 20)
   * - offset (default 0)
   * - productId (optional)
   * - warehouseId (optional)
   * - movementType (optional: 'inbound' | 'outbound' | 'transfer_in' | 'transfer_out' | 'adjustment')
   * - startDate (optional: ISO date string)
   * - endDate (optional: ISO date string)
   */
  fastify.get('/api/stock-movements', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const query = request.query as Record<string, string | undefined>

    const limit = parseIntParam(query.limit) ?? 20
    const offset = parseIntParam(query.offset) ?? 0
    const productId = parseIntParam(query.productId)
    const warehouseId = parseIntParam(query.warehouseId)
    const movementType = query.movementType
    const startDate = query.startDate
    const endDate = query.endDate

    // Validate movementType if provided
    if (movementType !== undefined && !validMovementTypes.has(movementType)) {
      throw new ValidationError('Invalid movement type filter', {
        movementType: `Must be one of: ${Object.values(MOVEMENT_TYPES).join(', ')}`
      })
    }

    const result = await StockService.listMovements(companyId, {
      limit,
      offset,
      ...(productId !== undefined && { productId }),
      ...(warehouseId !== undefined && { warehouseId }),
      ...(movementType !== undefined && { movementType: movementType as MovementType }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate })
    })

    return ok(result)
  })

  /**
   * POST /api/stock-movements/inbound
   * Records an inbound stock movement for the active company.
   *
   * Request body:
   * - productId: number (required)
   * - warehouseId: number (required)
   * - quantity: number (required, must be positive)
   * - unitCost: number (optional)
   * - referenceType: string (optional)
   * - referenceId: string (optional)
   * - notes: string (optional)
   *
   * On success, returns the created movement record with status 201.
   */
  fastify.post('/api/stock-movements/inbound', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = inboundSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid inbound movement data', mapZodFieldErrors(flat.fieldErrors))
    }

    const movement = await StockService.recordInbound(companyId, parsed.data)

    reply.status(201)
    return ok(movement)
  })

  /**
   * POST /api/stock-movements/outbound
   * Records an outbound stock movement for the active company.
   *
   * Request body:
   * - productId: number (required)
   * - warehouseId: number (required)
   * - quantity: number (required, must be positive)
   * - unitCost: number (optional)
   * - referenceType: string (optional)
   * - referenceId: string (optional)
   * - notes: string (optional)
   *
   * On success, returns the created movement record with status 201.
   * On insufficient stock, returns 422.
   */
  fastify.post('/api/stock-movements/outbound', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = outboundSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid outbound movement data', mapZodFieldErrors(flat.fieldErrors))
    }

    const movement = await StockService.recordOutbound(companyId, parsed.data)

    reply.status(201)
    return ok(movement)
  })

  /**
   * POST /api/stock-movements/transfer
   * Records a stock transfer between two warehouses for the active company.
   *
   * Request body:
   * - productId: number (required)
   * - sourceWarehouseId: number (required)
   * - destinationWarehouseId: number (required)
   * - quantity: number (required, must be positive)
   * - notes: string (optional)
   *
   * On success, returns both movement records (source and destination) with status 201.
   * On same source/destination, returns 422.
   * On insufficient stock at source, returns 422.
   */
  fastify.post('/api/stock-movements/transfer', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = transferSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid transfer data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await StockService.recordTransfer(companyId, parsed.data)

    reply.status(201)
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
