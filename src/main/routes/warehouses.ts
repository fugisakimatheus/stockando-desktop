import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as WarehouseService from '../services/warehouse-service'

/**
 * Zod schema for the create-warehouse request body.
 */
const createWarehouseSchema = z
  .object({
    name: z.string().min(1, 'Warehouse name is required').max(200),
    code: z.string().min(1, 'Warehouse code is required').max(50),
    address: z.string().max(500).optional()
  })
  .strict()

/**
 * Zod schema for the update-warehouse request body.
 */
const updateWarehouseSchema = z
  .object({
    name: z.string().min(1, 'Warehouse name is required').max(200).optional(),
    address: z.string().max(500).optional().nullable(),
    status: z.enum(['active', 'inactive']).optional()
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
 * Registers warehouse management routes:
 *
 * - `GET /api/warehouses` — list all warehouses for the active company
 * - `POST /api/warehouses` — create a new warehouse
 * - `PUT /api/warehouses/:id` — update a warehouse
 * - `DELETE /api/warehouses/:id` — delete a warehouse (if no non-zero stock)
 */
export function registerWarehouseRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/warehouses
   * Returns all warehouses for the active company.
   */
  fastify.get('/api/warehouses', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const result = await WarehouseService.list(companyId)

    return ok(result)
  })

  /**
   * POST /api/warehouses
   * Creates a new warehouse for the active company.
   *
   * Request body:
   * - name: string (required)
   * - code: string (required)
   * - address: string (optional)
   *
   * On success, returns the new warehouse record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate code, the global error handler returns 409.
   */
  fastify.post('/api/warehouses', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createWarehouseSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid warehouse data', mapZodFieldErrors(flat.fieldErrors))
    }

    const warehouse = await WarehouseService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'warehouse',
      entityId: String(warehouse.id),
      action: 'create'
    })

    reply.status(201)
    return ok(warehouse)
  })

  /**
   * PUT /api/warehouses/:id
   * Updates an existing warehouse.
   *
   * Request body:
   * - name: string (optional)
   * - address: string | null (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated warehouse record.
   * On validation failure, returns 400 with field-level errors.
   * On warehouse not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/warehouses/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid warehouse ID', {
        id: 'Warehouse ID must be a valid integer'
      })
    }

    const parsed = updateWarehouseSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid warehouse data', mapZodFieldErrors(flat.fieldErrors))
    }

    const warehouse = await WarehouseService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'warehouse',
      entityId: String(warehouse.id),
      action: 'update'
    })

    return ok(warehouse)
  })

  /**
   * DELETE /api/warehouses/:id
   * Deletes a warehouse if it has no stock records with non-zero quantities.
   *
   * On success, returns 200 with success envelope.
   * On warehouse not found, returns 404.
   * On referenced by non-zero stock, returns 422.
   */
  fastify.delete<{ Params: { id: string } }>('/api/warehouses/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid warehouse ID', {
        id: 'Warehouse ID must be a valid integer'
      })
    }

    await WarehouseService.deleteWarehouse(companyId, id)

    return ok(null)
  })
}
