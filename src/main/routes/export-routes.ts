import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as ExportService from '../services/export-service'
import { EXPORTABLE_ENTITY_TYPES } from '../types/phase4-types'
import type { ExportableEntityType } from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Valid exportable entity types derived from the const object.
 */
const validEntityTypes = Object.values(EXPORTABLE_ENTITY_TYPES) as [ExportableEntityType, ...ExportableEntityType[]]

/**
 * Zod schema for POST /api/exports/entities request body.
 *
 * Accepts the entity type and optional filters for date range, status,
 * and category narrowing.
 */
const exportEntitiesSchema = z
  .object({
    entityType: z.enum(validEntityTypes),
    filters: z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.string().optional(),
        categoryId: z.number().int().positive().optional()
      })
      .strict()
      .optional()
  })
  .strict()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Throws ValidationError if missing or not a valid positive integer.
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
// Route Registration
// ---------------------------------------------------------------------------

/**
 * Registers export routes:
 *
 * - `POST /api/exports/entities` — export entity data to CSV
 *
 * Requirements: 6.1, 6.5, 16.1
 */
export function registerExportRoutes(fastify: FastifyInstance): void {
  /**
   * POST /api/exports/entities
   *
   * Request body (JSON):
   * - entityType: one of 'products' | 'customers' | 'suppliers' | 'categories' |
   *               'sales_orders' | 'purchase_orders' | 'inventory_movements'
   * - filters?: { startDate?, endDate?, status?, categoryId? }
   *
   * Generates a CSV file for the specified entity type (company-scoped),
   * applies optional filters, and returns the file path, size, and record count.
   */
  fastify.post('/api/exports/entities', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = exportEntitiesSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid export request', fieldErrors)
    }

    const result = await ExportService.exportEntities(companyId, {
      entityType: parsed.data.entityType,
      filters: parsed.data.filters
    })

    return ok(result)
  })
}
