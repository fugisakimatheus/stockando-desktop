import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as InstallmentService from '../services/installment-service'
import type { OrderType } from '../types/finance'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single installment entry within a payment plan.
 */
const installmentItemSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  dueDate: z.string().min(1, 'Due date is required')
})

/**
 * Zod schema for creating a payment plan (set of installments) for an order.
 */
const createPaymentPlanSchema = z
  .object({
    installments: z.array(installmentItemSchema).min(1, 'At least one installment is required')
  })
  .strict()

/**
 * Zod schema for settling an installment.
 */
const settleInstallmentSchema = z
  .object({
    accountId: z.number().int().positive('Account ID must be a positive integer'),
    transactionDate: z.string().min(1, 'Transaction date is required'),
    description: z.string().optional()
  })
  .strict()

/**
 * Validates the orderType route parameter.
 */
const orderTypeSchema = z.enum(['sales_order', 'purchase_order'])

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
 * Registers installment management routes:
 *
 * - `GET /api/installments/order/:orderType/:orderId` — list installments with computed totals
 * - `POST /api/installments/order/:orderType/:orderId` — create a payment plan
 * - `POST /api/installments/:id/settle` — settle an installment
 */
export function registerInstallmentRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/installments/order/:orderType/:orderId
   * Returns installments for an order with computed totals (totalExpected, totalPaid, totalOverdue),
   * derived financialStatus, and overdue classification.
   */
  fastify.get<{ Params: { orderType: string; orderId: string } }>(
    '/api/installments/order/:orderType/:orderId',
    async (request) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const orderTypeParsed = orderTypeSchema.safeParse(request.params.orderType)
      if (!orderTypeParsed.success) {
        throw new ValidationError('Invalid order type', {
          orderType: 'Order type must be "sales_order" or "purchase_order"'
        })
      }

      const orderId = Number.parseInt(request.params.orderId, 10)
      if (Number.isNaN(orderId) || orderId <= 0) {
        throw new ValidationError('Invalid order ID', {
          orderId: 'Order ID must be a positive integer'
        })
      }

      const result = await InstallmentService.listForOrder(companyId, orderTypeParsed.data as OrderType, orderId)

      return ok(result)
    }
  )

  /**
   * POST /api/installments/order/:orderType/:orderId
   * Creates a payment plan (set of installments) for an order.
   *
   * Request body:
   * - installments: array of { amount: number, dueDate: string } (min 1)
   *
   * On success, returns the installment summary with status 201.
   */
  fastify.post<{ Params: { orderType: string; orderId: string } }>(
    '/api/installments/order/:orderType/:orderId',
    async (request, reply) => {
      const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

      const orderTypeParsed = orderTypeSchema.safeParse(request.params.orderType)
      if (!orderTypeParsed.success) {
        throw new ValidationError('Invalid order type', {
          orderType: 'Order type must be "sales_order" or "purchase_order"'
        })
      }

      const orderId = Number.parseInt(request.params.orderId, 10)
      if (Number.isNaN(orderId) || orderId <= 0) {
        throw new ValidationError('Invalid order ID', {
          orderId: 'Order ID must be a positive integer'
        })
      }

      const parsed = createPaymentPlanSchema.safeParse(request.body)
      if (!parsed.success) {
        const flat = z.flattenError(parsed.error)
        throw new ValidationError('Invalid payment plan data', mapZodFieldErrors(flat.fieldErrors))
      }

      const result = await InstallmentService.createPlan(companyId, {
        orderType: orderTypeParsed.data as OrderType,
        orderId,
        installments: parsed.data.installments
      })

      reply.status(201)
      return ok(result)
    }
  )

  /**
   * POST /api/installments/:id/settle
   * Settles an installment — updates status to "paid", creates a Financial_Transaction,
   * and updates the financial account balance atomically.
   *
   * Request body:
   * - accountId: number (positive integer)
   * - transactionDate: string (ISO date)
   * - description: string (optional)
   */
  fastify.post<{ Params: { id: string } }>('/api/installments/:id/settle', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id) || id <= 0) {
      throw new ValidationError('Invalid installment ID', {
        id: 'Installment ID must be a positive integer'
      })
    }

    const parsed = settleInstallmentSchema.safeParse(request.body)
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid settlement data', mapZodFieldErrors(flat.fieldErrors))
    }

    const result = await InstallmentService.settle(companyId, id, parsed.data)

    return ok(result)
  })
}
