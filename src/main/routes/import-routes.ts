import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as ImportService from '../services/import-service'
import { IMPORTABLE_ENTITY_TYPES } from '../types/phase4-types'
import type { ImportableEntityType } from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Valid entity types derived from the const object.
 */
const validEntityTypes = Object.values(IMPORTABLE_ENTITY_TYPES) as [ImportableEntityType, ...ImportableEntityType[]]

/**
 * Zod schema for POST /api/imports/validate request body.
 *
 * The file content is sent as a base64-encoded string (simpler for the local
 * Electron IPC bridge than multipart form data).
 */
const validateSchema = z
  .object({
    entityType: z.enum(validEntityTypes),
    fileContent: z.string().min(1, 'fileContent is required'),
    delimiter: z.enum([',', ';'])
  })
  .strict()

/**
 * Zod schema for POST /api/imports/confirm request body.
 */
const confirmSchema = z
  .object({
    validationId: z.string().uuid('validationId must be a valid UUID'),
    skipInvalid: z.boolean()
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
 * Registers import routes:
 *
 * - `POST /api/imports/validate` — validate CSV file and return preview
 * - `POST /api/imports/confirm` — commit validated import transactionally
 *
 * Requirements: 5.1, 5.2, 5.3, 16.1
 */
export function registerImportRoutes(fastify: FastifyInstance): void {
  /**
   * POST /api/imports/validate
   *
   * Request body (JSON):
   * - entityType: one of 'products' | 'customers' | 'suppliers' | 'categories'
   * - fileContent: base64-encoded CSV string
   * - delimiter: ',' | ';'
   *
   * Decodes the base64 file content, enforces size limit via the service layer,
   * and returns an ImportValidationResult with row-level statuses.
   */
  fastify.post('/api/imports/validate', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = validateSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid import validation request', fieldErrors)
    }

    // Decode base64 file content to Buffer
    const fileBuffer = Buffer.from(parsed.data.fileContent, 'base64')

    const result = await ImportService.validate(companyId, {
      entityType: parsed.data.entityType,
      fileBuffer,
      delimiter: parsed.data.delimiter
    })

    return ok(result)
  })

  /**
   * POST /api/imports/confirm
   *
   * Request body (JSON):
   * - validationId: UUID string referencing a previous validation result
   * - skipInvalid: boolean — whether to skip invalid rows and commit only valid ones
   *
   * Commits the validated import transactionally and returns an ImportCommitResult.
   */
  fastify.post('/api/imports/confirm', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = confirmSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid import confirmation request', fieldErrors)
    }

    const result = await ImportService.confirm(companyId, parsed.data)

    return ok(result)
  })
}
