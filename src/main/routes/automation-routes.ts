import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as AutomationService from '../services/automation-service'
import { AUTOMATION_ACTION_TYPES, AUTOMATION_TRIGGER_TYPES } from '../types/phase4-types'
import type {
  AutomationActionType,
  AutomationTriggerType,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput
} from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Valid trigger types derived from the const object.
 */
const validTriggerTypes = Object.values(AUTOMATION_TRIGGER_TYPES) as [AutomationTriggerType, ...AutomationTriggerType[]]

/**
 * Valid action types derived from the const object.
 */
const validActionTypes = Object.values(AUTOMATION_ACTION_TYPES) as [AutomationActionType, ...AutomationActionType[]]

/**
 * Zod schema for POST /api/automation-rules request body (create).
 */
const createRuleSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    triggerType: z.enum(validTriggerTypes as unknown as readonly [string, ...string[]]),
    triggerParams: z.record(z.string(), z.unknown()),
    actionType: z.enum(validActionTypes as unknown as readonly [string, ...string[]]),
    actionParams: z.record(z.string(), z.unknown())
  })
  .strict()

/**
 * Zod schema for PUT /api/automation-rules/:id request body (update).
 */
const updateRuleSchema = z
  .object({
    name: z.string().min(1, 'name must not be empty').optional(),
    triggerParams: z.record(z.string(), z.unknown()).optional(),
    actionParams: z.record(z.string(), z.unknown()).optional()
  })
  .strict()

/**
 * Zod schema for POST /api/automation-rules/:id/toggle request body.
 */
const toggleRuleSchema = z
  .object({
    enabled: z.boolean()
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
 * Registers automation rule routes:
 *
 * - `GET /api/automation-rules` — list all rules for active company
 * - `POST /api/automation-rules` — create a new rule
 * - `PUT /api/automation-rules/:id` — update rule configuration
 * - `POST /api/automation-rules/:id/toggle` — enable/disable a rule
 * - `POST /api/automation-rules/evaluate` — trigger manual evaluation
 *
 * Requirements: 7.1, 7.5, 7.6, 8.7, 16.1
 */
export function registerAutomationRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/automation-rules
   *
   * Returns all automation rules for the active company with their current
   * enabled/disabled status and last evaluation timestamp.
   */
  fastify.get('/api/automation-rules', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const rules = await AutomationService.list(companyId)

    return ok(rules)
  })

  /**
   * POST /api/automation-rules
   *
   * Request body (JSON):
   * - name: string
   * - triggerType: 'installment_overdue' | 'stock_below_minimum' | 'order_pending_too_long'
   * - triggerParams: { overdueDays?: number, minimumQuantity?: number, pendingDays?: number }
   * - actionType: 'create_reminder' | 'log_notification'
   * - actionParams: { messageTemplate?: string, notificationTemplate?: string }
   *
   * Creates a new automation rule with trigger/action validation.
   */
  fastify.post('/api/automation-rules', async (request, reply) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = createRuleSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid automation rule request', fieldErrors)
    }

    const rule = await AutomationService.create(companyId, {
      name: parsed.data.name,
      triggerType: parsed.data.triggerType as AutomationTriggerType,
      triggerParams: parsed.data.triggerParams as unknown as CreateAutomationRuleInput['triggerParams'],
      actionType: parsed.data.actionType as AutomationActionType,
      actionParams: parsed.data.actionParams as unknown as CreateAutomationRuleInput['actionParams']
    })

    reply.status(201)
    return ok(rule)
  })

  /**
   * PUT /api/automation-rules/:id
   *
   * Request body (JSON):
   * - name?: string
   * - triggerParams?: object
   * - actionParams?: object
   *
   * Updates an existing automation rule's configuration.
   */
  fastify.put('/api/automation-rules/:id', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const { id } = request.params as { id: string }
    const ruleId = Number.parseInt(id, 10)

    if (Number.isNaN(ruleId) || ruleId <= 0) {
      throw new ValidationError('Invalid rule id', {
        id: 'id must be a positive integer'
      })
    }

    const parsed = updateRuleSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid update request', fieldErrors)
    }

    const rule = await AutomationService.update(companyId, ruleId, {
      name: parsed.data.name,
      triggerParams: parsed.data.triggerParams as unknown as UpdateAutomationRuleInput['triggerParams'],
      actionParams: parsed.data.actionParams as unknown as UpdateAutomationRuleInput['actionParams']
    })

    return ok(rule)
  })

  /**
   * POST /api/automation-rules/:id/toggle
   *
   * Request body (JSON):
   * - enabled: boolean
   *
   * Enables or disables an automation rule without deleting it.
   */
  fastify.post('/api/automation-rules/:id/toggle', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const { id } = request.params as { id: string }
    const ruleId = Number.parseInt(id, 10)

    if (Number.isNaN(ruleId) || ruleId <= 0) {
      throw new ValidationError('Invalid rule id', {
        id: 'id must be a positive integer'
      })
    }

    const parsed = toggleRuleSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          body: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid toggle request', fieldErrors)
    }

    const rule = await AutomationService.toggle(companyId, ruleId, parsed.data.enabled)

    return ok(rule)
  })

  /**
   * POST /api/automation-rules/evaluate
   *
   * Triggers a manual evaluation of all enabled automation rules for the active
   * company. Returns a summary of rules evaluated, actions executed, and failures.
   */
  fastify.post('/api/automation-rules/evaluate', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const summary = await AutomationService.evaluate(companyId)

    return ok(summary)
  })
}
