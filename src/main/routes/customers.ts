import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as CustomerService from '../services/customer-service'

/**
 * Zod schema for the create-customer request body.
 */
const createCustomerSchema = z
  .object({
    name: z.string().min(1, 'Customer name is required').max(200),
    documentNumber: z.string().max(50).optional().nullable(),
    email: z.string().email('Invalid email format').max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    customerType: z.enum(['individual', 'business']).optional()
  })
  .strict()

/**
 * Zod schema for the update-customer request body.
 */
const updateCustomerSchema = z
  .object({
    name: z.string().min(1, 'Customer name is required').max(200).optional(),
    documentNumber: z.string().max(50).optional().nullable(),
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
 * Registers customer management routes:
 *
 * - `GET /api/customers` — paginated customer list with search and status filter
 * - `POST /api/customers` — create a new customer
 * - `GET /api/customers/:id` — customer detail with quote/order counts
 * - `PUT /api/customers/:id` — update a customer
 * - `DELETE /api/customers/:id` — delete a customer (if unreferenced)
 */
export function registerCustomerRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/customers
   * Returns a paginated list of customers for the active company.
   *
   * Query params:
   * - limit (default: 20)
   * - offset (default: 0)
   * - search (optional)
   * - status (optional: 'active' | 'inactive')
   */
  fastify.get<{ Querystring: { limit?: string; offset?: string; search?: string; status?: string } }>(
    '/api/customers',
    async (request) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const limit = Math.max(1, Math.min(100, Number.parseInt(request.query.limit ?? '20', 10) || 20))
      const offset = Math.max(0, Number.parseInt(request.query.offset ?? '0', 10) || 0)
      const search = request.query.search || undefined
      const status = request.query.status || undefined

      const result = await CustomerService.list(companyId, { limit, offset, search, status })

      return ok(result)
    }
  )

  /**
   * POST /api/customers
   * Creates a new customer for the active company.
   *
   * Request body:
   * - name: string (required)
   * - documentNumber: string (optional)
   * - email: string (optional)
   * - phone: string (optional)
   * - address: string (optional)
   * - customerType: 'individual' | 'business' (optional)
   *
   * On success, returns the new customer record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate documentNumber, the global error handler returns 409.
   */
  fastify.post('/api/customers', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createCustomerSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid customer data', mapZodFieldErrors(flat.fieldErrors))
    }

    const customer = await CustomerService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'customer',
      entityId: String(customer.id),
      action: 'create'
    })

    reply.status(201)
    return ok(customer)
  })

  /**
   * GET /api/customers/:id
   * Returns customer detail with quoteCount and salesOrderCount.
   */
  fastify.get<{ Params: { id: string } }>('/api/customers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid customer ID', { id: 'Customer ID must be a valid integer' })
    }

    const customer = await CustomerService.detail(companyId, id)

    return ok(customer)
  })

  /**
   * PUT /api/customers/:id
   * Updates an existing customer.
   *
   * Request body:
   * - name: string (optional)
   * - documentNumber: string | null (optional)
   * - email: string | null (optional)
   * - phone: string | null (optional)
   * - address: string | null (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated customer record.
   * On validation failure, returns 400 with field-level errors.
   * On customer not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/customers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid customer ID', { id: 'Customer ID must be a valid integer' })
    }

    const parsed = updateCustomerSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid customer data', mapZodFieldErrors(flat.fieldErrors))
    }

    const customer = await CustomerService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'customer',
      entityId: String(customer.id),
      action: 'update'
    })

    return ok(customer)
  })

  /**
   * DELETE /api/customers/:id
   * Deletes a customer if it is not referenced by any quotes or orders.
   *
   * On success, returns 200 with success envelope.
   * On customer not found, returns 404.
   * On referenced by quotes/orders, returns 422.
   */
  fastify.delete<{ Params: { id: string } }>('/api/customers/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid customer ID', { id: 'Customer ID must be a valid integer' })
    }

    await CustomerService.deleteCustomer(companyId, id)

    await logAudit({
      companyId,
      entityType: 'customer',
      entityId: String(id),
      action: 'delete'
    })

    return ok(null)
  })
}
