import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as FiscalDocumentService from '../services/fiscal-document-service'
import { FISCAL_DOCUMENT_STATUSES, FISCAL_DOCUMENT_TYPES } from '../types/finance'
import type { FiscalDocumentStatus, FiscalDocumentType } from '../types/finance'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for creating a fiscal document from a Sales_Order.
 */
const createFiscalDocumentSchema = z
  .object({
    orderId: z.number().int().positive('Order ID must be a positive integer'),
    documentType: z.enum([FISCAL_DOCUMENT_TYPES.nfe, FISCAL_DOCUMENT_TYPES.nfce]),
    series: z.string().min(1, 'Series is required'),
    issueDate: z.string().min(1, 'Issue date is required'),
    taxRuleId: z.number().int().positive().optional(),
    digitalCertificateId: z.number().int().positive().optional()
  })
  .strict()

/**
 * Zod schema for recording fiscal document authorization.
 */
const authorizeFiscalSchema = z
  .object({
    accessKey: z.string().min(1, 'Access key is required'),
    protocolNumber: z.string().min(1, 'Protocol number is required'),
    xmlContent: z.string().min(1, 'XML content is required'),
    authorizedAt: z.string().min(1, 'Authorization date is required')
  })
  .strict()

/**
 * Zod schema for recording fiscal document cancellation.
 */
const cancelFiscalSchema = z
  .object({
    protocolNumber: z.string().min(1, 'Protocol number is required'),
    justification: z.string().min(1, 'Justification is required'),
    cancelledAt: z.string().min(1, 'Cancellation date is required')
  })
  .strict()

/**
 * Zod schema for fiscal document list query parameters.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  documentType: z.enum([FISCAL_DOCUMENT_TYPES.nfe, FISCAL_DOCUMENT_TYPES.nfce]).optional(),
  status: z
    .enum([
      FISCAL_DOCUMENT_STATUSES.draft,
      FISCAL_DOCUMENT_STATUSES.authorized,
      FISCAL_DOCUMENT_STATUSES.cancelled,
      FISCAL_DOCUMENT_STATUSES.denied
    ])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  search: z.string().optional()
})

/**
 * Zod schema for searching by access key.
 */
const searchByKeySchema = z.object({
  accessKey: z.string().min(1, 'Access key is required')
})

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
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers fiscal document management routes:
 *
 * - `GET /api/fiscal-documents` — paginated list with filters
 * - `POST /api/fiscal-documents` — create fiscal document from Sales_Order
 * - `GET /api/fiscal-documents/search-by-key` — search by access key
 * - `GET /api/fiscal-documents/:id` — fiscal document detail with items and events
 * - `POST /api/fiscal-documents/:id/authorize` — record authorization
 * - `POST /api/fiscal-documents/:id/cancel` — record cancellation
 * - `POST /api/fiscal-documents/:id/danfe` — generate DANFE PDF
 * - `GET /api/fiscal-documents/:id/xml` — retrieve XML
 * - `GET /api/fiscal-documents/:id/danfe` — retrieve DANFE path
 *
 * Requirements: 4.1, 5.1, 5.2, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */
export function registerFiscalDocumentRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/fiscal-documents
   * Returns a paginated list of fiscal documents for the active company.
   * Supports filtering by documentType, status, dateRange, customerId, and search.
   */
  fastify.get('/api/fiscal-documents', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = listQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid query parameters', mapZodFieldErrors(flat.fieldErrors))
    }

    const { limit, offset, documentType, status, startDate, endDate, customerId, search } = parsed.data

    const result = await FiscalDocumentService.list(companyId, {
      limit,
      offset,
      documentType: documentType as FiscalDocumentType | undefined,
      status: status as FiscalDocumentStatus | undefined,
      startDate,
      endDate,
      customerId,
      search
    })

    return ok(result)
  })

  /**
   * POST /api/fiscal-documents
   * Creates a fiscal document (NF-e or NFC-e) from a Sales_Order.
   *
   * Request body:
   * - orderId: number (required, positive integer)
   * - documentType: 'NF-e' | 'NFC-e' (required)
   * - series: string (required)
   * - issueDate: string (required, ISO date)
   * - taxRuleId: number (optional)
   * - digitalCertificateId: number (optional)
   *
   * On success, returns the new fiscal document detail with status 201.
   */
  fastify.post('/api/fiscal-documents', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createFiscalDocumentSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid fiscal document data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await FiscalDocumentService.create(companyId, parsed.data)

    reply.status(201)
    return ok(result)
  })

  /**
   * GET /api/fiscal-documents/search-by-key
   * Searches for a fiscal document by exact access key within the active company.
   *
   * IMPORTANT: This route MUST be registered before the :id param route
   * to prevent "search-by-key" being matched as an ID parameter.
   */
  fastify.get('/api/fiscal-documents/search-by-key', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = searchByKeySchema.safeParse(request.query)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid search parameters', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await FiscalDocumentService.searchByAccessKey(companyId, parsed.data.accessKey)

    return ok(result)
  })

  /**
   * GET /api/fiscal-documents/:id
   * Returns the full fiscal document detail with items, events, customer name,
   * and order reference.
   */
  fastify.get<{ Params: { id: string } }>('/api/fiscal-documents/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const result = await FiscalDocumentService.detail(companyId, id)

    return ok(result)
  })

  /**
   * POST /api/fiscal-documents/:id/authorize
   * Records the authorization of a fiscal document with access key, protocol, and XML.
   *
   * Request body:
   * - accessKey: string (required, 44-digit)
   * - protocolNumber: string (required)
   * - xmlContent: string (required)
   * - authorizedAt: string (required, ISO datetime)
   */
  fastify.post<{ Params: { id: string } }>('/api/fiscal-documents/:id/authorize', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const parsed = authorizeFiscalSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid authorization data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await FiscalDocumentService.authorize(companyId, id, parsed.data)

    return ok(result)
  })

  /**
   * POST /api/fiscal-documents/:id/cancel
   * Records the cancellation of an authorized fiscal document.
   *
   * Request body:
   * - protocolNumber: string (required)
   * - justification: string (required, min 1 char)
   * - cancelledAt: string (required, ISO datetime)
   */
  fastify.post<{ Params: { id: string } }>('/api/fiscal-documents/:id/cancel', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const parsed = cancelFiscalSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid cancellation data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await FiscalDocumentService.cancel(companyId, id, parsed.data)

    return ok(result)
  })

  /**
   * POST /api/fiscal-documents/:id/danfe
   * Generates a DANFE PDF for an authorized fiscal document.
   *
   * Returns the attachment record for the generated PDF.
   */
  fastify.post<{ Params: { id: string } }>('/api/fiscal-documents/:id/danfe', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const result = await FiscalDocumentService.generateDanfe(companyId, id)

    reply.status(201)
    return ok(result)
  })

  /**
   * GET /api/fiscal-documents/:id/xml
   * Retrieves the stored XML content for a fiscal document.
   */
  fastify.get<{ Params: { id: string } }>('/api/fiscal-documents/:id/xml', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const result = await FiscalDocumentService.getXml(companyId, id)

    return ok(result)
  })

  /**
   * GET /api/fiscal-documents/:id/danfe
   * Retrieves the stored DANFE file path for a fiscal document.
   */
  fastify.get<{ Params: { id: string } }>('/api/fiscal-documents/:id/danfe', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid fiscal document ID', {
        id: 'Fiscal document ID must be a positive integer'
      })
    }

    const result = await FiscalDocumentService.getDanfePath(companyId, id)

    return ok(result)
  })
}
