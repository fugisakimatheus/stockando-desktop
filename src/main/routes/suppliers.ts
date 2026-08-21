import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as SupplierService from '../services/supplier-service'

/**
 * Zod schema for the create-supplier request body.
 */
const createSupplierSchema = z
  .object({
    name: z.string().min(1, 'Supplier name is required').max(200),
    documentNumber: z.string().min(1, 'Document number is required').max(50),
    tradeName: z.string().max(200).optional().nullable(),
    email: z.string().email('Invalid email format').max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable()
  })
  .strict()

/**
 * Zod schema for the update-supplier request body.
 */
const updateSupplierSchema = z
  .object({
    name: z.string().min(1, 'Supplier name is required').max(200).optional(),
    tradeName: z.string().max(200).optional().nullable(),
    email: z.string().email('Invalid email format').max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
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
 * Registers supplier management routes:
 *
 * - `GET /api/suppliers` — paginated supplier list with search and status filter
 * - `POST /api/suppliers` — create a new supplier
 * - `GET /api/suppliers/:id` — supplier detail with purchase order count
 * - `PUT /api/suppliers/:id` — update a supplier
 * - `DELETE /api/suppliers/:id` — delete a supplier (if unreferenced)
 */
export function registerSupplierRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/suppliers
   * Returns a paginated list of suppliers for the active company with optional filters.
   *
   * Query parameters:
   * - limit (default 20)
   * - offset (default 0)
   * - search (optional: matches name or documentNumber)
   * - status (optional: 'active' | 'inactive')
   */
  fastify.get('/api/suppliers', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const query = request.query as Record<string, string | undefined>

    const limit = parseIntParam(query.limit) ?? 20
    const offset = parseIntParam(query.offset) ?? 0
    const status = query.status
    const search = query.search

    const result = await SupplierService.list(companyId, {
      limit,
      offset,
      ...(status !== undefined && { status }),
      ...(search !== undefined && { search })
    })

    return ok(result)
  })

  /**
   * POST /api/suppliers
   * Creates a new supplier for the active company.
   *
   * Request body:
   * - name: string (required)
   * - documentNumber: string (required)
   * - tradeName: string (optional)
   * - email: string (optional)
   * - phone: string (optional)
   * - address: string (optional)
   *
   * On success, returns the new supplier record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate documentNumber, the global error handler returns 409.
   */
  fastify.post('/api/suppliers', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createSupplierSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid supplier data', mapZodFieldErrors(flat.fieldErrors))
    }

    const supplier = await SupplierService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'supplier',
      entityId: String(supplier.id),
      action: 'create'
    })

    reply.status(201)
    return ok(supplier)
  })

  /**
   * GET /api/suppliers/:id
   * Returns full supplier details with purchase order count.
   */
  fastify.get<{ Params: { id: string } }>('/api/suppliers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid supplier ID', { id: 'Supplier ID must be a valid integer' })
    }

    const supplier = await SupplierService.detail(companyId, id)

    return ok(supplier)
  })

  /**
   * PUT /api/suppliers/:id
   * Updates an existing supplier.
   *
   * Request body:
   * - name: string (optional)
   * - tradeName: string | null (optional)
   * - email: string | null (optional)
   * - phone: string | null (optional)
   * - address: string | null (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated supplier record.
   * On validation failure, returns 400 with field-level errors.
   * On supplier not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/suppliers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid supplier ID', { id: 'Supplier ID must be a valid integer' })
    }

    const parsed = updateSupplierSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid supplier data', mapZodFieldErrors(flat.fieldErrors))
    }

    const supplier = await SupplierService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'supplier',
      entityId: String(supplier.id),
      action: 'update'
    })

    return ok(supplier)
  })

  /**
   * DELETE /api/suppliers/:id
   * Deletes a supplier if it is not referenced by any purchase orders.
   *
   * On success, returns 200 with success envelope.
   * On supplier not found, returns 404.
   * On referenced by purchase orders, returns 422.
   */
  fastify.delete<{ Params: { id: string } }>('/api/suppliers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid supplier ID', { id: 'Supplier ID must be a valid integer' })
    }

    await SupplierService.deleteSupplier(companyId, id)

    await logAudit({
      companyId,
      entityType: 'supplier',
      entityId: String(id),
      action: 'delete'
    })

    return ok(null)
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
