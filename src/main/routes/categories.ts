import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as CategoryService from '../services/category-service'

/**
 * Zod schema for the create-category request body.
 */
const createCategorySchema = z
  .object({
    name: z.string().min(1, 'Category name is required').max(200),
    parentCategoryId: z.number().int().positive().optional().nullable()
  })
  .strict()

/**
 * Zod schema for the update-category request body.
 */
const updateCategorySchema = z
  .object({
    name: z.string().min(1, 'Category name is required').max(200).optional(),
    parentCategoryId: z.number().int().positive().optional().nullable(),
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
 * Registers category management routes:
 *
 * - `GET /api/categories` — list all categories for the active company
 * - `POST /api/categories` — create a new category
 * - `PUT /api/categories/:id` — update a category
 * - `DELETE /api/categories/:id` — delete a category (if unreferenced)
 */
export function registerCategoryRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/categories
   * Returns all categories for the active company.
   */
  fastify.get('/api/categories', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const result = await CategoryService.list(companyId)

    return ok(result)
  })

  /**
   * POST /api/categories
   * Creates a new category for the active company.
   *
   * Request body:
   * - name: string (required)
   * - parentCategoryId: number (optional)
   *
   * On success, returns the new category record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate name, the global error handler returns 409.
   */
  fastify.post('/api/categories', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createCategorySchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid category data', mapZodFieldErrors(flat.fieldErrors))
    }

    const category = await CategoryService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'category',
      entityId: String(category.id),
      action: 'create'
    })

    reply.status(201)
    return ok(category)
  })

  /**
   * PUT /api/categories/:id
   * Updates an existing category.
   *
   * Request body:
   * - name: string (optional)
   * - parentCategoryId: number | null (optional)
   * - status: 'active' | 'inactive' (optional)
   *
   * On success, returns the updated category record.
   * On validation failure, returns 400 with field-level errors.
   * On category not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/categories/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid category ID', { id: 'Category ID must be a valid integer' })
    }

    const parsed = updateCategorySchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid category data', mapZodFieldErrors(flat.fieldErrors))
    }

    const category = await CategoryService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'category',
      entityId: String(category.id),
      action: 'update'
    })

    return ok(category)
  })

  /**
   * DELETE /api/categories/:id
   * Deletes a category if it is not referenced by any products.
   *
   * On success, returns 200 with success envelope.
   * On category not found, returns 404.
   * On referenced by products, returns 422.
   */
  fastify.delete<{ Params: { id: string } }>('/api/categories/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid category ID', { id: 'Category ID must be a valid integer' })
    }

    await CategoryService.deleteCategory(companyId, id)

    return ok(null)
  })
}
