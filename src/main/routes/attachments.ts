import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as AttachmentService from '../services/attachment-service'
import { ATTACHMENT_ENTITY_TYPES } from '../types/finance'
import type { AttachmentEntityType } from '../types/finance'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Valid attachment entity types.
 */
const validEntityTypes = Object.values(ATTACHMENT_ENTITY_TYPES) as [string, ...string[]]

/**
 * Zod schema for the :entityType route parameter.
 */
const entityTypeParamSchema = z.enum(validEntityTypes)

/**
 * Zod schema for the :id route parameter.
 */
const idParamSchema = z.coerce.number().int().positive()

/**
 * Zod schema for creating an attachment.
 */
const createAttachmentSchema = z
  .object({
    fileName: z.string().min(1, 'File name is required'),
    filePath: z.string().min(1, 'File path is required'),
    mimeType: z.string().min(1, 'MIME type is required')
  })
  .strict()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers attachment management routes:
 *
 * - `GET /api/attachments/:entityType/:entityId` — list attachments for an entity
 * - `POST /api/attachments/:entityType/:entityId` — upload attachment (file path based)
 * - `DELETE /api/attachments/:id` — delete attachment (record + file)
 */
export function registerAttachmentRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/attachments/:entityType/:entityId
   * Returns all attachments for the given entity, scoped to the active company.
   */
  fastify.get<{ Params: { entityType: string; entityId: string } }>(
    '/api/attachments/:entityType/:entityId',
    async (request) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const entityTypeParsed = entityTypeParamSchema.safeParse(request.params.entityType)
      if (!entityTypeParsed.success) {
        throw new ValidationError('Invalid entity type', {
          entityType: `Entity type must be one of: ${validEntityTypes.join(', ')}`
        })
      }

      const { entityId } = request.params
      if (!entityId || entityId.trim() === '') {
        throw new ValidationError('Invalid entity ID', {
          entityId: 'Entity ID is required'
        })
      }

      const attachments = await AttachmentService.listForEntity(companyId, entityTypeParsed.data, entityId)

      return ok(attachments)
    }
  )

  /**
   * POST /api/attachments/:entityType/:entityId
   * Creates a new attachment for the given entity.
   *
   * Request body:
   * - fileName: string (file name for storage)
   * - filePath: string (local filesystem path to the source file)
   * - mimeType: string (MIME type of the file)
   *
   * On success, returns the created attachment record with status 201.
   */
  fastify.post<{ Params: { entityType: string; entityId: string } }>(
    '/api/attachments/:entityType/:entityId',
    async (request, reply) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const entityTypeParsed = entityTypeParamSchema.safeParse(request.params.entityType)
      if (!entityTypeParsed.success) {
        throw new ValidationError('Invalid entity type', {
          entityType: `Entity type must be one of: ${validEntityTypes.join(', ')}`
        })
      }

      const { entityId } = request.params
      if (!entityId || entityId.trim() === '') {
        throw new ValidationError('Invalid entity ID', {
          entityId: 'Entity ID is required'
        })
      }

      const parsed = createAttachmentSchema.safeParse(request.body)
      if (!parsed.success) {
        const flat = parsed.error.flatten()
        const mapped: Record<string, string> = {}
        for (const [field, messages] of Object.entries(flat.fieldErrors)) {
          if (messages && messages.length > 0) {
            mapped[field] = messages[0]
          }
        }
        throw new ValidationError('Invalid attachment data', mapped)
      }

      const result = await AttachmentService.create(companyId, {
        entityType: entityTypeParsed.data as AttachmentEntityType,
        entityId,
        fileName: parsed.data.fileName,
        filePath: parsed.data.filePath,
        mimeType: parsed.data.mimeType
      })

      reply.status(201)
      return ok(result)
    }
  )

  /**
   * DELETE /api/attachments/:id
   * Deletes an attachment record and its associated file from the filesystem.
   */
  fastify.delete<{ Params: { id: string } }>('/api/attachments/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = idParamSchema.safeParse(request.params.id)
    if (!parsed.success) {
      throw new ValidationError('Invalid attachment ID', {
        id: 'Attachment ID must be a positive integer'
      })
    }

    await AttachmentService.deleteAttachment(companyId, parsed.data)

    return ok(null)
  })
}
