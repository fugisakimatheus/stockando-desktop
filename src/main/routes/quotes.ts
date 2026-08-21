import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { logAudit } from '../services/audit-service'
import * as QuoteService from '../services/quote-service'
import { QUOTE_STATUSES } from '../services/status-transitions'
import type { QuoteStatus } from '../services/status-transitions'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const quoteItemSchema = z.object({
  productId: z.number().int().positive('Product ID must be a positive integer'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().positive('Unit price must be greater than 0'),
  discountAmount: z.number().nonnegative('Discount amount must be 0 or greater').optional()
})

const createQuoteSchema = z
  .object({
    customerId: z.number().int().positive('Customer ID must be a positive integer'),
    validUntil: z.string().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(quoteItemSchema).min(1, 'At least one item is required')
  })
  .strict()

const updateQuoteSchema = z
  .object({
    customerId: z.number().int().positive('Customer ID must be a positive integer').optional(),
    validUntil: z.string().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(quoteItemSchema).optional()
  })
  .strict()

const quoteStatusValues = Object.values(QUOTE_STATUSES) as [string, ...string[]]

const transitionStatusSchema = z
  .object({
    status: z.enum(quoteStatusValues)
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

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

/**
 * Registers quote management routes:
 *
 * - `GET /api/quotes` — paginated quote list with filters
 * - `POST /api/quotes` — create a new quote with items
 * - `GET /api/quotes/:id` — quote detail with items
 * - `PUT /api/quotes/:id` — update a quote (header + items)
 * - `PATCH /api/quotes/:id/status` — transition quote status
 * - `POST /api/quotes/:id/convert` — convert accepted quote to sales order
 */
export function registerQuoteRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/quotes
   * Returns a paginated list of quotes for the active company.
   *
   * Query params:
   * - limit (default: 20)
   * - offset (default: 0)
   * - customerId (optional)
   * - status (optional)
   * - search (optional: matches quoteNumber)
   */
  fastify.get<{
    Querystring: {
      limit?: string
      offset?: string
      customerId?: string
      status?: string
      search?: string
    }
  }>('/api/quotes', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const limit = Math.max(1, Number.parseInt(request.query.limit ?? '20', 10) || 20)
    const offset = Math.max(0, Number.parseInt(request.query.offset ?? '0', 10) || 0)

    const customerId = request.query.customerId ? Number.parseInt(request.query.customerId, 10) : undefined

    const status = request.query.status as QuoteStatus | undefined
    const search = request.query.search || undefined

    const result = await QuoteService.list(companyId, {
      limit,
      offset,
      customerId: customerId && !Number.isNaN(customerId) ? customerId : undefined,
      status,
      search
    })

    return ok(result)
  })

  /**
   * POST /api/quotes
   * Creates a new quote with items for the active company.
   *
   * Request body:
   * - customerId: number (required)
   * - validUntil: string (optional)
   * - notes: string (optional)
   * - items: [{ productId, quantity, unitPrice, discountAmount? }] (required, min 1)
   *
   * On success, returns the quote detail with status 201.
   */
  fastify.post('/api/quotes', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createQuoteSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid quote data', mapZodFieldErrors(flat.fieldErrors))
    }

    const quote = await QuoteService.create(companyId, parsed.data)

    await logAudit({
      companyId,
      entityType: 'quote',
      entityId: String(quote.id),
      action: 'create'
    })

    reply.status(201)
    return ok(quote)
  })

  /**
   * GET /api/quotes/:id
   * Returns the full quote detail with items for the active company.
   */
  fastify.get<{ Params: { id: string } }>('/api/quotes/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid quote ID', { id: 'Quote ID must be a valid integer' })
    }

    const quote = await QuoteService.detail(companyId, id)

    return ok(quote)
  })

  /**
   * PUT /api/quotes/:id
   * Updates an existing quote (header and/or items).
   *
   * Request body:
   * - customerId: number (optional)
   * - validUntil: string | null (optional)
   * - notes: string | null (optional)
   * - items: [{ productId, quantity, unitPrice, discountAmount? }] (optional)
   *
   * On success, returns the updated quote detail.
   * Only draft/sent quotes are editable.
   */
  fastify.put<{ Params: { id: string } }>('/api/quotes/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid quote ID', { id: 'Quote ID must be a valid integer' })
    }

    const parsed = updateQuoteSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid quote data', mapZodFieldErrors(flat.fieldErrors))
    }

    const quote = await QuoteService.update(companyId, id, parsed.data)

    await logAudit({
      companyId,
      entityType: 'quote',
      entityId: String(quote.id),
      action: 'update'
    })

    return ok(quote)
  })

  /**
   * PATCH /api/quotes/:id/status
   * Transitions the quote to a new status.
   *
   * Request body:
   * - status: QuoteStatus (required)
   *
   * The service layer validates the transition is allowed.
   */
  fastify.patch<{ Params: { id: string } }>('/api/quotes/:id/status', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid quote ID', { id: 'Quote ID must be a valid integer' })
    }

    const parsed = transitionStatusSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid status transition data', mapZodFieldErrors(flat.fieldErrors))
    }

    const quote = await QuoteService.transitionStatus(companyId, id, parsed.data.status as QuoteStatus)

    return ok(quote)
  })

  /**
   * POST /api/quotes/:id/convert
   * Converts an accepted quote into a sales order.
   *
   * No request body needed. The quote must be in "accepted" status.
   * On success, returns both the updated quote and the new sales order with status 201.
   */
  fastify.post<{ Params: { id: string } }>('/api/quotes/:id/convert', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid quote ID', { id: 'Quote ID must be a valid integer' })
    }

    const result = await QuoteService.convertToOrder(companyId, id)

    reply.status(201)
    return ok(result)
  })
}
