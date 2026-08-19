import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { NotFoundError, ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as UnitOfMeasureService from '../services/unit-of-measure-service'

/**
 * Zod schema for the create unit of measure request body.
 */
const createUnitSchema = z
  .object({
    name: z.string().min(1, 'Unit name is required').max(100),
    symbol: z.string().min(1, 'Symbol is required').max(10)
  })
  .strict()

/**
 * Zod schema for the update unit of measure request body.
 */
const updateUnitSchema = z
  .object({
    name: z.string().min(1, 'Unit name is required').max(100).optional(),
    symbol: z.string().min(1, 'Symbol is required').max(10).optional(),
    status: z.enum(['active', 'inactive']).optional()
  })
  .strict()

/**
 * Extracts and validates the company ID from the x-company-id request header.
 * Throws ValidationError if missing or invalid.
 */
function extractCompanyId(request: { headers: Record<string, string | string[] | undefined> }): number {
  const raw = request.headers['x-company-id']
  const value = Array.isArray(raw) ? raw[0] : raw

  if (!value) {
    throw new ValidationError('Missing x-company-id header')
  }

  const companyId = Number.parseInt(value, 10)

  if (Number.isNaN(companyId) || companyId <= 0) {
    throw new ValidationError('Invalid x-company-id header')
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

/**
 * Registers unit of measure management routes:
 *
 * - `GET /api/units-of-measure` — list all units for the active company
 * - `POST /api/units-of-measure` — create a new unit
 * - `PUT /api/units-of-measure/:id` — update a unit
 * - `DELETE /api/units-of-measure/:id` — delete a unit (if unreferenced)
 */
export function registerUnitOfMeasureRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/units-of-measure
   * Returns all units of measure for the active company.
   */
  fastify.get('/api/units-of-measure', async (request) => {
    const companyId = extractCompanyId(request)

    const units = await UnitOfMeasureService.list(companyId)

    return ok(units)
  })

  /**
   * POST /api/units-of-measure
   * Creates a new unit of measure for the active company.
   *
   * Request body:
   * - name: string (required)
   * - symbol: string (required)
   *
   * On success, returns the new unit with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate name, the service throws ConflictError (409).
   */
  fastify.post('/api/units-of-measure', async (request, reply) => {
    const companyId = extractCompanyId(request)

    const parsed = createUnitSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid unit of measure data', mapZodFieldErrors(flat.fieldErrors))
    }

    const unit = await UnitOfMeasureService.create(companyId, parsed.data)

    reply.status(201)
    return ok(unit)
  })

  /**
   * PUT /api/units-of-measure/:id
   * Updates an existing unit of measure.
   *
   * Request body:
   * - name: string (optional)
   * - symbol: string (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated unit.
   * On validation failure, returns 400.
   * On not found, returns 404.
   * On duplicate name, returns 409.
   */
  fastify.put<{ Params: { id: string } }>('/api/units-of-measure/:id', async (request) => {
    const companyId = extractCompanyId(request)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new NotFoundError('Unit of measure not found')
    }

    const parsed = updateUnitSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid unit of measure data', mapZodFieldErrors(flat.fieldErrors))
    }

    const unit = await UnitOfMeasureService.update(companyId, id, parsed.data)

    return ok(unit)
  })

  /**
   * DELETE /api/units-of-measure/:id
   * Deletes a unit of measure if it is not referenced by any products.
   *
   * On success, returns 204 with no content.
   * On not found, returns 404.
   * On referenced by products, returns 422 (EntityReferencedError).
   */
  fastify.delete<{ Params: { id: string } }>('/api/units-of-measure/:id', async (request, reply) => {
    const companyId = extractCompanyId(request)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new NotFoundError('Unit of measure not found')
    }

    await UnitOfMeasureService.deleteUnit(companyId, id)

    reply.status(204)
    return
  })
}
