import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as PaymentService from '../services/payment-service'
import * as PurchaseOrderService from '../services/purchase-order-service'
import { PURCHASE_ORDER_STATUSES } from '../services/status-transitions'
import type { PurchaseOrderStatus } from '../services/status-transitions'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const purchaseOrderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().positive(),
  discountAmount: z.number().min(0).optional()
})

const createPurchaseOrderSchema = z
  .object({
    supplierId: z.number().int().positive(),
    expectedDeliveryDate: z.string().optional().nullable(),
    items: z.array(purchaseOrderItemSchema).min(1, 'At least one item is required')
  })
  .strict()

const updatePurchaseOrderSchema = z
  .object({
    supplierId: z.number().int().positive().optional(),
    expectedDeliveryDate: z.string().optional().nullable(),
    items: z.array(purchaseOrderItemSchema).min(1, 'At least one item is required').optional()
  })
  .strict()

const transitionStatusSchema = z
  .object({
    status: z.enum([
      PURCHASE_ORDER_STATUSES.draft,
      PURCHASE_ORDER_STATUSES.sent,
      PURCHASE_ORDER_STATUSES.partially_received,
      PURCHASE_ORDER_STATUSES.received,
      PURCHASE_ORDER_STATUSES.cancelled
    ])
  })
  .strict()

const receiptItemSchema = z.object({
  purchaseOrderItemId: z.number().int().positive(),
  receivedQuantity: z.number().positive(),
  warehouseId: z.number().int().positive()
})

const receiveSchema = z
  .object({
    items: z.array(receiptItemSchema).min(1, 'At least one receipt item is required'),
    notes: z.string().optional()
  })
  .strict()

const registerPaymentSchema = z
  .object({
    paymentMethodId: z.number().int().positive(),
    amount: z.number().positive(),
    transactionReference: z.string().optional().nullable(),
    paidAt: z.string().min(1, 'Payment date is required')
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
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers purchase order management routes:
 *
 * - `GET /api/purchase-orders` — paginated list with filters
 * - `POST /api/purchase-orders` — create a purchase order with items
 * - `GET /api/purchase-orders/:id` — detail with items + payments
 * - `PUT /api/purchase-orders/:id` — update (draft only)
 * - `PATCH /api/purchase-orders/:id/status` — transition status
 * - `POST /api/purchase-orders/:id/receive` — record receipt
 * - `GET /api/purchase-orders/:id/payments` — list payments
 * - `POST /api/purchase-orders/:id/payments` — register payment
 */
export function registerPurchaseOrderRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/purchase-orders
   * Returns a paginated list of purchase orders for the active company.
   *
   * Query params: limit, offset, supplierId, status, paymentStatus, search
   */
  fastify.get<{
    Querystring: {
      limit?: string
      offset?: string
      supplierId?: string
      status?: string
      paymentStatus?: string
      search?: string
    }
  }>('/api/purchase-orders', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const query = request.query
    const filters = {
      limit: query.limit ? Number.parseInt(query.limit, 10) : 20,
      offset: query.offset ? Number.parseInt(query.offset, 10) : 0,
      supplierId: query.supplierId ? Number.parseInt(query.supplierId, 10) : undefined,
      status: query.status as PurchaseOrderStatus | undefined,
      paymentStatus: query.paymentStatus as 'unpaid' | 'partially_paid' | 'paid' | undefined,
      search: query.search || undefined
    }

    const result = await PurchaseOrderService.list(companyId, filters)

    return ok(result)
  })

  /**
   * POST /api/purchase-orders
   * Creates a new purchase order with items for the active company.
   */
  fastify.post('/api/purchase-orders', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createPurchaseOrderSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid purchase order data', mapZodFieldErrors(flat.fieldErrors))
    }

    const purchaseOrder = await PurchaseOrderService.create(companyId, parsed.data)

    reply.status(201)
    return ok(purchaseOrder)
  })

  /**
   * GET /api/purchase-orders/:id
   * Returns full purchase order detail with items and payments.
   */
  fastify.get<{ Params: { id: string } }>('/api/purchase-orders/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const purchaseOrder = await PurchaseOrderService.detail(companyId, id)

    return ok(purchaseOrder)
  })

  /**
   * PUT /api/purchase-orders/:id
   * Updates a purchase order (draft only).
   */
  fastify.put<{ Params: { id: string } }>('/api/purchase-orders/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const parsed = updatePurchaseOrderSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid purchase order data', mapZodFieldErrors(flat.fieldErrors))
    }

    const purchaseOrder = await PurchaseOrderService.update(companyId, id, parsed.data)

    return ok(purchaseOrder)
  })

  /**
   * PATCH /api/purchase-orders/:id/status
   * Transitions the purchase order to a new status.
   */
  fastify.patch<{ Params: { id: string } }>('/api/purchase-orders/:id/status', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const parsed = transitionStatusSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid status transition data', mapZodFieldErrors(flat.fieldErrors))
    }

    const purchaseOrder = await PurchaseOrderService.transitionStatus(
      companyId,
      id,
      parsed.data.status as PurchaseOrderStatus
    )

    return ok(purchaseOrder)
  })

  /**
   * POST /api/purchase-orders/:id/receive
   * Records partial or full receipt of items for a purchase order.
   */
  fastify.post<{ Params: { id: string } }>('/api/purchase-orders/:id/receive', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const parsed = receiveSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid receipt data', mapZodFieldErrors(flat.fieldErrors))
    }

    const purchaseOrder = await PurchaseOrderService.recordReceipt(companyId, id, parsed.data)

    reply.status(201)
    return ok(purchaseOrder)
  })

  /**
   * GET /api/purchase-orders/:id/payments
   * Returns payment summary for a purchase order.
   */
  fastify.get<{ Params: { id: string } }>('/api/purchase-orders/:id/payments', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const summary = await PaymentService.listForPurchaseOrder(companyId, id)

    return ok(summary)
  })

  /**
   * POST /api/purchase-orders/:id/payments
   * Registers a payment for a purchase order.
   */
  fastify.post<{ Params: { id: string } }>('/api/purchase-orders/:id/payments', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new ValidationError('Invalid purchase order ID', { id: 'Purchase order ID must be a valid integer' })
    }

    const parsed = registerPaymentSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid payment data', mapZodFieldErrors(flat.fieldErrors))
    }

    const payment = await PaymentService.registerForPurchaseOrder(companyId, id, parsed.data)

    reply.status(201)
    return ok(payment)
  })
}
