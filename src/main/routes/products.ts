import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as ProductService from '../services/product-service'

/**
 * Zod schema for the create-product request body.
 */
const createProductSchema = z
  .object({
    sku: z.string().min(1, 'Product SKU is required').max(50),
    name: z.string().min(1, 'Product name is required').max(200),
    description: z.string().max(500).optional(),
    barcode: z.string().max(50).optional(),
    costPrice: z.number().nonnegative().optional(),
    salePrice: z.number().nonnegative().optional(),
    categoryId: z.number().int().positive().optional().nullable(),
    unitId: z.number().int().positive().optional().nullable(),
    trackInventory: z.boolean().optional()
  })
  .strict()

/**
 * Zod schema for the update-product request body.
 */
const updateProductSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').max(200).optional(),
    description: z.string().max(500).optional(),
    barcode: z.string().max(50).optional(),
    costPrice: z.number().nonnegative().optional(),
    salePrice: z.number().nonnegative().optional(),
    categoryId: z.number().int().positive().optional().nullable(),
    unitId: z.number().int().positive().optional().nullable(),
    trackInventory: z.boolean().optional(),
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
 * Registers product management routes:
 *
 * - `GET /api/products` — paginated product list with filters
 * - `GET /api/products/:id` — product detail with resolved names
 * - `POST /api/products` — create a new product
 * - `PUT /api/products/:id` — update a product
 * - `DELETE /api/products/:id` — delete a product (if no active stock movements)
 */
export function registerProductRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/products
   * Returns a paginated list of products for the active company with optional filters.
   *
   * Query parameters:
   * - limit (default 20)
   * - offset (default 0)
   * - categoryId (optional)
   * - status (optional: 'active' | 'inactive')
   * - search (optional: matches name or SKU)
   */
  fastify.get('/api/products', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const query = request.query as Record<string, string | undefined>

    const limit = parseIntParam(query.limit) ?? 20
    const offset = parseIntParam(query.offset) ?? 0
    const categoryId = parseIntParam(query.categoryId)
    const status = query.status
    const search = query.search

    const result = await ProductService.list(companyId, {
      limit,
      offset,
      ...(categoryId !== undefined && { categoryId }),
      ...(status !== undefined && { status }),
      ...(search !== undefined && { search })
    })

    return ok(result)
  })

  /**
   * GET /api/products/:id
   * Returns full product details with resolved category and unit names.
   */
  fastify.get<{ Params: { id: string } }>('/api/products/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid product ID', { id: 'Product ID must be a valid integer' })
    }

    const product = await ProductService.detail(companyId, id)

    return ok(product)
  })

  /**
   * POST /api/products
   * Creates a new product for the active company.
   *
   * Request body:
   * - sku: string (required)
   * - name: string (required)
   * - description: string (optional)
   * - barcode: string (optional)
   * - costPrice: number (optional)
   * - salePrice: number (optional)
   * - categoryId: number (optional)
   * - unitId: number (optional)
   * - trackInventory: boolean (optional)
   *
   * On success, returns the new product record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate SKU, the global error handler returns 409.
   */
  fastify.post('/api/products', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createProductSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid product data', mapZodFieldErrors(flat.fieldErrors))
    }

    const product = await ProductService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'product',
      entityId: String(product.id),
      action: 'create'
    })

    reply.status(201)
    return ok(product)
  })

  /**
   * PUT /api/products/:id
   * Updates an existing product.
   *
   * Request body:
   * - name: string (optional)
   * - description: string | null (optional)
   * - barcode: string | null (optional)
   * - costPrice: number | null (optional)
   * - salePrice: number | null (optional)
   * - categoryId: number | null (optional)
   * - unitId: number | null (optional)
   * - trackInventory: boolean (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated product record.
   * On validation failure, returns 400 with field-level errors.
   * On product not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/products/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid product ID', { id: 'Product ID must be a valid integer' })
    }

    const parsed = updateProductSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid product data', mapZodFieldErrors(flat.fieldErrors))
    }

    const product = await ProductService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'product',
      entityId: String(product.id),
      action: 'update'
    })

    return ok(product)
  })

  /**
   * DELETE /api/products/:id
   * Deletes a product if it has no active stock movements (when trackInventory is true).
   *
   * On success, returns 200 with success envelope.
   * On product not found, returns 404.
   * On referenced by stock movements, returns 422.
   */
  fastify.delete<{ Params: { id: string } }>('/api/products/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid product ID', { id: 'Product ID must be a valid integer' })
    }

    await ProductService.deleteProduct(companyId, id)

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
