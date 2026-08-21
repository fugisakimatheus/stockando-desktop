import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as PaymentService from '../services/payment-service'
import * as SalesOrderService from '../services/sales-order-service'
import { SALES_ORDER_STATUSES } from '../services/status-transitions'
import type { SalesOrderStatus } from '../services/status-transitions'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for sales order item input.
 */
const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  discountAmount: z.number().min(0, 'Discount amount cannot be negative').optional()
})

/**
 * Zod schema for creating a sales order.
 */
const createSalesOrderSchema = z
  .object({
    customerId: z.number().int().positive(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required')
  })
  .strict()

/**
 * Zod schema for updating a sales order.
 */
const updateSalesOrderSchema = z
  .object({
    customerId: z.number().int().positive().optional(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required').optional()
  })
  .strict()

/**
 * Zod schema for transitioning sales order status.
 */
const transitionStatusSchema = z
  .object({
    status: z.enum([
      SALES_ORDER_STATUSES.draft,
      SALES_ORDER_STATUSES.confirmed,
      SALES_ORDER_STATUSES.partially_fulfilled,
      SALES_ORDER_STATUSES.fulfilled,
      SALES_ORDER_STATUSES.cancelled
    ])
  })
  .strict()

/**
 * Zod schema for registering a payment.
 */
const registerPaymentSchema = z
  .object({
    paymentMethodId: z.number().int().positive(),
    amount: z.number().positive('Amount must be greater than zero'),
    transactionReference: z.string().optional().nullable(),
    paidAt: z.string().min(1, 'Payment date is required')
  })
  .strict()

/**
 * Zod schema for list query parameters.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  customerId: z.coerce.number().int().positive().optional(),
  status: z
    .enum([
      SALES_ORDER_STATUSES.draft,
      SALES_ORDER_STATUSES.confirmed,
      SALES_ORDER_STATUSES.partially_fulfilled,
      SALES_ORDER_STATUSES.fulfilled,
      SALES_ORDER_STATUSES.cancelled
    ])
    .optional(),
  paymentStatus: z.enum(['unpaid', 'partially_paid', 'paid']).optional(),
  search: z.string().optional()
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
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers sales order management routes:
 *
 * - `GET /api/sales-orders` — paginated list with filters
 * - `POST /api/sales-orders` — create a new sales order with items
 * - `GET /api/sales-orders/:id` — detail with items and payments
 * - `PUT /api/sales-orders/:id` — update (draft only)
 * - `PATCH /api/sales-orders/:id/status` — transition status
 * - `GET /api/sales-orders/:id/payments` — list payments
 * - `POST /api/sales-orders/:id/payments` — register a payment
 */
export function registerSalesOrderRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/sales-orders
   * Returns a paginated list of sales orders for the active company.
   * Supports filtering by customerId, status, paymentStatus, and search.
   */
  fastify.get('/api/sales-orders', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = listQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid query parameters', mapZodFieldErrors(flat.fieldErrors))
    }

    const { limit, offset, customerId, status, paymentStatus, search } = parsed.data

    const result = await SalesOrderService.list(companyId, {
      limit,
      offset,
      customerId,
      status,
      paymentStatus,
      search
    })

    return ok(result)
  })

  /**
   * POST /api/sales-orders
   * Creates a new sales order for the active company.
   *
   * Request body:
   * - customerId: number (required)
   * - items: array of { productId, quantity, unitPrice, discountAmount? } (required, min 1)
   *
   * On success, returns the new sales order detail with status 201.
   */
  fastify.post('/api/sales-orders', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createSalesOrderSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid sales order data', mapZodFieldErrors(flat.fieldErrors))
    }

    const salesOrder = await SalesOrderService.create(companyId, parsed.data)

    reply.status(201)
    return ok(salesOrder)
  })

  /**
   * GET /api/sales-orders/:id
   * Returns the full sales order detail with items, payments, totalPaid, and remainingBalance.
   */
  fastify.get<{ Params: { id: string } }>('/api/sales-orders/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid sales order ID', { id: 'Sales order ID must be a valid integer' })
    }

    const result = await SalesOrderService.detail(companyId, id)

    return ok(result)
  })

  /**
   * PUT /api/sales-orders/:id
   * Updates an existing sales order (draft only).
   *
   * Request body:
   * - customerId: number (optional)
   * - items: array of { productId, quantity, unitPrice, discountAmount? } (optional)
   */
  fastify.put<{ Params: { id: string } }>('/api/sales-orders/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid sales order ID', { id: 'Sales order ID must be a valid integer' })
    }

    const parsed = updateSalesOrderSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid sales order data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await SalesOrderService.update(companyId, id, parsed.data)

    return ok(result)
  })

  /**
   * PATCH /api/sales-orders/:id/status
   * Transitions the sales order to a new status.
   *
   * Request body:
   * - status: SalesOrderStatus (required)
   */
  fastify.patch<{ Params: { id: string } }>('/api/sales-orders/:id/status', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid sales order ID', { id: 'Sales order ID must be a valid integer' })
    }

    const parsed = transitionStatusSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid status transition data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await SalesOrderService.transitionStatus(companyId, id, parsed.data.status as SalesOrderStatus)

    return ok(result)
  })

  /**
   * GET /api/sales-orders/:id/payments
   * Returns the payment summary for a sales order.
   */
  fastify.get<{ Params: { id: string } }>('/api/sales-orders/:id/payments', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid sales order ID', { id: 'Sales order ID must be a valid integer' })
    }

    const result = await PaymentService.listForSalesOrder(companyId, id)

    return ok(result)
  })

  /**
   * POST /api/sales-orders/:id/payments
   * Registers a payment against a sales order.
   *
   * Request body:
   * - paymentMethodId: number (required)
   * - amount: number (required, positive)
   * - transactionReference: string (optional)
   * - paidAt: string (required, ISO date)
   *
   * On success, returns the payment record with status 201.
   */
  fastify.post<{ Params: { id: string } }>('/api/sales-orders/:id/payments', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid sales order ID', { id: 'Sales order ID must be a valid integer' })
    }

    const parsed = registerPaymentSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid payment data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await PaymentService.registerForSalesOrder(companyId, id, parsed.data)

    reply.status(201)
    return ok(result)
  })
}
