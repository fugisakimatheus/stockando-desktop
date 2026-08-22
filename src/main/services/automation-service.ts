/**
 * AutomationService — Rule configuration and evaluation engine.
 *
 * Provides CRUD for automation rules and a batch evaluation cycle that:
 * 1. Loads all enabled rules for a company
 * 2. Matches trigger conditions against current data
 * 3. Executes actions (create_reminder, log_notification) idempotently
 * 4. Records evaluations to prevent duplicate actions
 *
 * Trigger types:
 * - installment_overdue: installments past due by N days
 * - stock_below_minimum: product stock below configured minimum
 * - order_pending_too_long: orders pending for more than N days
 *
 * All operations are company-scoped.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { and, eq, lt, sql, sum } from 'drizzle-orm'
import { match } from 'ts-pattern'

import { NotFoundError, ValidationError } from '../api/errors'
import { automationRules, installments, orders, products, purchaseOrders, ruleEvaluations, stock } from '../db/schema'
import { getDb } from '../server'
import type {
  AutomationActionParams,
  AutomationActionType,
  AutomationRuleDetail,
  AutomationRuleListItem,
  AutomationTriggerParams,
  AutomationTriggerType,
  CreateAutomationRuleInput,
  CreateReminderInput,
  RuleEvaluationDetail,
  RuleEvaluationSummary,
  UpdateAutomationRuleInput
} from '../types/phase4-types'
import { AUTOMATION_ACTION_TYPES, AUTOMATION_TRIGGER_TYPES } from '../types/phase4-types'
import { logAudit } from './audit-service'
import * as ReminderService from './reminder-service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable description for a trigger configuration.
 */
function buildTriggerDescription(
  triggerType: AutomationTriggerType,
  triggerParams: AutomationTriggerParams[AutomationTriggerType]
): string {
  return match(triggerType)
    .with('installment_overdue', () => {
      const params = triggerParams as AutomationTriggerParams['installment_overdue']
      return `Installment overdue by ${params.overdueDays} days`
    })
    .with('stock_below_minimum', () => {
      const params = triggerParams as AutomationTriggerParams['stock_below_minimum']
      return `Stock below ${params.minimumQuantity} units`
    })
    .with('order_pending_too_long', () => {
      const params = triggerParams as AutomationTriggerParams['order_pending_too_long']
      return `Order pending for more than ${params.pendingDays} days`
    })
    .exhaustive()
}

/**
 * Generates a human-readable description for an action configuration.
 */
function buildActionDescription(
  actionType: AutomationActionType,
  actionParams: AutomationActionParams[AutomationActionType]
): string {
  return match(actionType)
    .with('create_reminder', () => {
      const params = actionParams as AutomationActionParams['create_reminder']
      return `Create reminder: "${params.messageTemplate}"`
    })
    .with('log_notification', () => {
      const params = actionParams as AutomationActionParams['log_notification']
      return `Log notification: "${params.notificationTemplate}"`
    })
    .exhaustive()
}

/**
 * Maps a raw DB row to AutomationRuleListItem.
 */
function mapToListItem(row: typeof automationRules.$inferSelect): AutomationRuleListItem {
  const triggerParams = JSON.parse(row.triggerParams) as AutomationTriggerParams[AutomationTriggerType]
  const actionParams = JSON.parse(row.actionParams) as AutomationActionParams[AutomationActionType]

  return {
    id: row.id,
    name: row.name,
    triggerType: row.triggerType as AutomationTriggerType,
    triggerDescription: buildTriggerDescription(row.triggerType as AutomationTriggerType, triggerParams),
    actionType: row.actionType as AutomationActionType,
    actionDescription: buildActionDescription(row.actionType as AutomationActionType, actionParams),
    enabled: row.enabled,
    lastEvaluatedAt: row.lastEvaluatedAt
  }
}

/**
 * Maps a raw DB row to AutomationRuleDetail.
 */
function mapToDetail(row: typeof automationRules.$inferSelect): AutomationRuleDetail {
  const triggerParams = JSON.parse(row.triggerParams) as AutomationTriggerParams[AutomationTriggerType]
  const actionParams = JSON.parse(row.actionParams) as AutomationActionParams[AutomationActionType]

  return {
    ...mapToListItem(row),
    triggerParams,
    actionParams,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/**
 * Validates that the trigger type is supported and that triggerParams has the required fields.
 */
function validateTriggerParams(
  triggerType: string,
  triggerParams: unknown
): asserts triggerParams is AutomationTriggerParams[AutomationTriggerType] {
  const validTypes = Object.values(AUTOMATION_TRIGGER_TYPES)
  if (!validTypes.includes(triggerType as AutomationTriggerType)) {
    throw new ValidationError(`Invalid trigger type: ${triggerType}`)
  }

  if (!triggerParams || typeof triggerParams !== 'object') {
    throw new ValidationError('triggerParams must be an object')
  }

  match(triggerType as AutomationTriggerType)
    .with('installment_overdue', () => {
      const params = triggerParams as Record<string, unknown>
      if (typeof params.overdueDays !== 'number' || params.overdueDays <= 0) {
        throw new ValidationError('triggerParams.overdueDays must be a positive number')
      }
    })
    .with('stock_below_minimum', () => {
      const params = triggerParams as Record<string, unknown>
      if (typeof params.minimumQuantity !== 'number' || params.minimumQuantity <= 0) {
        throw new ValidationError('triggerParams.minimumQuantity must be a positive number')
      }
    })
    .with('order_pending_too_long', () => {
      const params = triggerParams as Record<string, unknown>
      if (typeof params.pendingDays !== 'number' || params.pendingDays <= 0) {
        throw new ValidationError('triggerParams.pendingDays must be a positive number')
      }
    })
    .exhaustive()
}

/**
 * Validates that the action type is supported and that actionParams has the required fields.
 */
function validateActionParams(
  actionType: string,
  actionParams: unknown
): asserts actionParams is AutomationActionParams[AutomationActionType] {
  const validTypes = Object.values(AUTOMATION_ACTION_TYPES)
  if (!validTypes.includes(actionType as AutomationActionType)) {
    throw new ValidationError(`Invalid action type: ${actionType}`)
  }

  if (!actionParams || typeof actionParams !== 'object') {
    throw new ValidationError('actionParams must be an object')
  }

  match(actionType as AutomationActionType)
    .with('create_reminder', () => {
      const params = actionParams as Record<string, unknown>
      if (typeof params.messageTemplate !== 'string' || params.messageTemplate.trim().length === 0) {
        throw new ValidationError('actionParams.messageTemplate must be a non-empty string')
      }
    })
    .with('log_notification', () => {
      const params = actionParams as Record<string, unknown>
      if (typeof params.notificationTemplate !== 'string' || params.notificationTemplate.trim().length === 0) {
        throw new ValidationError('actionParams.notificationTemplate must be a non-empty string')
      }
    })
    .exhaustive()
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Lists all automation rules for a company.
 */
export async function list(companyId: number): Promise<AutomationRuleListItem[]> {
  const db = getDb()

  const rows = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.companyId, companyId))
    .orderBy(automationRules.createdAt)

  return rows.map(mapToListItem)
}

/**
 * Creates a new automation rule with trigger/action validation.
 *
 * @throws ValidationError if trigger type, action type, or params are invalid
 */
export async function create(companyId: number, input: CreateAutomationRuleInput): Promise<AutomationRuleDetail> {
  const db = getDb()

  validateTriggerParams(input.triggerType, input.triggerParams)
  validateActionParams(input.actionType, input.actionParams)

  const now = new Date().toISOString()

  const [row] = await db
    .insert(automationRules)
    .values({
      companyId,
      name: input.name,
      triggerType: input.triggerType,
      triggerParams: JSON.stringify(input.triggerParams),
      actionType: input.actionType,
      actionParams: JSON.stringify(input.actionParams),
      enabled: true,
      createdAt: now,
      updatedAt: now
    })
    .returning()

  await logAudit({
    companyId,
    entityType: 'automation_rule',
    entityId: String(row.id),
    action: 'created',
    details: JSON.stringify({ name: input.name, triggerType: input.triggerType, actionType: input.actionType })
  })

  return mapToDetail(row)
}

/**
 * Updates an existing automation rule's name, triggerParams, or actionParams.
 *
 * @throws NotFoundError if the rule does not exist or does not belong to the company
 * @throws ValidationError if provided params are invalid
 */
export async function update(
  companyId: number,
  id: number,
  input: UpdateAutomationRuleInput
): Promise<AutomationRuleDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Automation rule not found')
  }

  if (input.triggerParams) {
    validateTriggerParams(existing.triggerType, input.triggerParams)
  }

  if (input.actionParams) {
    validateActionParams(existing.actionType, input.actionParams)
  }

  const now = new Date().toISOString()

  const updates: Record<string, unknown> = { updatedAt: now }

  if (input.name !== undefined) {
    updates.name = input.name
  }
  if (input.triggerParams !== undefined) {
    updates.triggerParams = JSON.stringify(input.triggerParams)
  }
  if (input.actionParams !== undefined) {
    updates.actionParams = JSON.stringify(input.actionParams)
  }

  const [row] = await db
    .update(automationRules)
    .set(updates)
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)))
    .returning()

  await logAudit({
    companyId,
    entityType: 'automation_rule',
    entityId: String(id),
    action: 'updated',
    details: JSON.stringify(input)
  })

  return mapToDetail(row)
}

/**
 * Enables or disables an automation rule.
 *
 * @throws NotFoundError if the rule does not exist or does not belong to the company
 */
export async function toggle(companyId: number, id: number, enabled: boolean): Promise<AutomationRuleDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Automation rule not found')
  }

  const now = new Date().toISOString()

  const [row] = await db
    .update(automationRules)
    .set({ enabled, updatedAt: now })
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)))
    .returning()

  await logAudit({
    companyId,
    entityType: 'automation_rule',
    entityId: String(id),
    action: enabled ? 'enabled' : 'disabled'
  })

  return mapToDetail(row)
}

// ---------------------------------------------------------------------------
// Evaluation Engine
// ---------------------------------------------------------------------------

interface TriggeredEntity {
  entityType: string
  entityId: string
  entitySummary: string
}

/**
 * Evaluates all enabled automation rules for the company.
 *
 * For each rule:
 * 1. Queries entities matching the trigger condition
 * 2. Checks rule_evaluations for idempotency (skip already-evaluated entities)
 * 3. Executes the configured action for newly triggered entities
 * 4. Records evaluation in rule_evaluations
 * 5. Updates lastEvaluatedAt on the rule
 *
 * Returns a summary with counts and per-rule details.
 */
export async function evaluate(companyId: number): Promise<RuleEvaluationSummary> {
  const db = getDb()

  // Load all enabled rules for the company
  const enabledRules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.companyId, companyId), eq(automationRules.enabled, true)))

  const details: RuleEvaluationDetail[] = []
  let totalActionsExecuted = 0
  let totalActionsFailed = 0

  for (const rule of enabledRules) {
    const triggerType = rule.triggerType as AutomationTriggerType
    const triggerParams = JSON.parse(rule.triggerParams) as AutomationTriggerParams[AutomationTriggerType]
    const actionType = rule.actionType as AutomationActionType
    const actionParams = JSON.parse(rule.actionParams) as AutomationActionParams[AutomationActionType]

    const ruleDetail: RuleEvaluationDetail = {
      ruleId: rule.id,
      ruleName: rule.name,
      entitiesTriggered: 0,
      actionsExecuted: 0,
      errors: []
    }

    try {
      // 1. Query entities matching trigger condition
      const triggeredEntities = await queryTriggeredEntities(companyId, triggerType, triggerParams)

      // 2. Load existing evaluations for this rule to filter out already-processed entities
      const existingEvals = await db
        .select({ entityType: ruleEvaluations.entityType, entityId: ruleEvaluations.entityId })
        .from(ruleEvaluations)
        .where(eq(ruleEvaluations.ruleId, rule.id))

      const evaluatedSet = new Set(existingEvals.map((e) => `${e.entityType}:${e.entityId}`))

      // Filter to only new entities
      const newEntities = triggeredEntities.filter(
        (entity) => !evaluatedSet.has(`${entity.entityType}:${entity.entityId}`)
      )

      ruleDetail.entitiesTriggered = newEntities.length

      // 3. Execute action for each newly triggered entity
      for (const entity of newEntities) {
        try {
          await executeAction(companyId, rule.id, actionType, actionParams, entity)

          // 4. Record evaluation
          const now = new Date().toISOString()
          await db.insert(ruleEvaluations).values({
            ruleId: rule.id,
            entityType: entity.entityType,
            entityId: entity.entityId,
            actionTaken: actionType,
            evaluatedAt: now
          })

          ruleDetail.actionsExecuted++
          totalActionsExecuted++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          ruleDetail.errors.push(`Entity ${entity.entityType}:${entity.entityId} — ${message}`)
          totalActionsFailed++
        }
      }

      // 5. Update lastEvaluatedAt
      const now = new Date().toISOString()
      await db
        .update(automationRules)
        .set({ lastEvaluatedAt: now, updatedAt: now })
        .where(eq(automationRules.id, rule.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ruleDetail.errors.push(`Rule evaluation failed: ${message}`)
      totalActionsFailed++
    }

    details.push(ruleDetail)
  }

  await logAudit({
    companyId,
    entityType: 'automation_evaluation',
    entityId: 'batch',
    action: 'evaluated',
    details: JSON.stringify({
      rulesEvaluated: enabledRules.length,
      actionsExecuted: totalActionsExecuted,
      actionsFailed: totalActionsFailed
    })
  })

  return {
    rulesEvaluated: enabledRules.length,
    actionsExecuted: totalActionsExecuted,
    actionsFailed: totalActionsFailed,
    details
  }
}

// ---------------------------------------------------------------------------
// Trigger Evaluation Queries
// ---------------------------------------------------------------------------

/**
 * Queries entities that match the given trigger condition.
 * Uses ts-pattern match for trigger type dispatching.
 */
async function queryTriggeredEntities(
  companyId: number,
  triggerType: AutomationTriggerType,
  triggerParams: AutomationTriggerParams[AutomationTriggerType]
): Promise<TriggeredEntity[]> {
  return match(triggerType)
    .with('installment_overdue', () =>
      queryOverdueInstallments(companyId, triggerParams as AutomationTriggerParams['installment_overdue'])
    )
    .with('stock_below_minimum', () =>
      queryLowStockProducts(companyId, triggerParams as AutomationTriggerParams['stock_below_minimum'])
    )
    .with('order_pending_too_long', () =>
      queryPendingOrders(companyId, triggerParams as AutomationTriggerParams['order_pending_too_long'])
    )
    .exhaustive()
}

/**
 * Finds installments that are pending and past due by at least `overdueDays`.
 */
async function queryOverdueInstallments(
  companyId: number,
  params: AutomationTriggerParams['installment_overdue']
): Promise<TriggeredEntity[]> {
  const db = getDb()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - params.overdueDays)
  const cutoffIso = cutoffDate.toISOString().split('T')[0]

  const rows = await db
    .select({
      id: installments.id,
      orderId: installments.orderId,
      orderType: installments.orderType,
      installmentNumber: installments.installmentNumber,
      dueDate: installments.dueDate
    })
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.status, 'pending'),
        lt(installments.dueDate, cutoffIso)
      )
    )

  return rows.map((row) => ({
    entityType: 'installment',
    entityId: String(row.id),
    entitySummary: `Installment #${row.installmentNumber} (${row.orderType} order #${row.orderId}) due ${row.dueDate}`
  }))
}

/**
 * Finds products where total stock across all warehouses is below the minimum quantity.
 */
async function queryLowStockProducts(
  companyId: number,
  params: AutomationTriggerParams['stock_below_minimum']
): Promise<TriggeredEntity[]> {
  const db = getDb()

  const rows = await db
    .select({
      productId: stock.productId,
      productName: products.name,
      productSku: products.sku,
      totalQuantity: sum(stock.quantity)
    })
    .from(stock)
    .innerJoin(products, eq(stock.productId, products.id))
    .where(and(eq(stock.companyId, companyId), eq(products.trackInventory, true)))
    .groupBy(stock.productId, products.name, products.sku)
    .having(sql`sum(${stock.quantity}) < ${params.minimumQuantity}`)

  return rows.map((row) => ({
    entityType: 'product',
    entityId: String(row.productId),
    entitySummary: `${row.productName} (${row.productSku}) — stock: ${row.totalQuantity ?? 0}`
  }))
}

/**
 * Finds sales orders and purchase orders in "pending" status for longer than pendingDays.
 */
async function queryPendingOrders(
  companyId: number,
  params: AutomationTriggerParams['order_pending_too_long']
): Promise<TriggeredEntity[]> {
  const db = getDb()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - params.pendingDays)
  const cutoffIso = cutoffDate.toISOString().split('T')[0]

  // Query sales orders pending too long
  const salesRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt
    })
    .from(orders)
    .where(and(eq(orders.companyId, companyId), eq(orders.status, 'pending'), lt(orders.createdAt, cutoffIso)))

  // Query purchase orders pending too long
  const purchaseRows = await db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.orderNumber,
      createdAt: purchaseOrders.createdAt
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.status, 'pending'),
        lt(purchaseOrders.createdAt, cutoffIso)
      )
    )

  const results: TriggeredEntity[] = []

  for (const row of salesRows) {
    results.push({
      entityType: 'sales_order',
      entityId: String(row.id),
      entitySummary: `Sales order #${row.orderNumber} created ${row.createdAt.split('T')[0]}`
    })
  }

  for (const row of purchaseRows) {
    results.push({
      entityType: 'purchase_order',
      entityId: String(row.id),
      entitySummary: `Purchase order #${row.orderNumber} created ${row.createdAt.split('T')[0]}`
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Action Execution
// ---------------------------------------------------------------------------

/**
 * Executes the configured action for a triggered entity.
 * Uses ts-pattern match for action type dispatching.
 */
async function executeAction(
  companyId: number,
  ruleId: number,
  actionType: AutomationActionType,
  actionParams: AutomationActionParams[AutomationActionType],
  entity: TriggeredEntity
): Promise<void> {
  await match(actionType)
    .with('create_reminder', async () => {
      const params = actionParams as AutomationActionParams['create_reminder']
      const message = params.messageTemplate
        .replace('{entityType}', entity.entityType)
        .replace('{entityId}', entity.entityId)
        .replace('{entitySummary}', entity.entitySummary)

      const reminderInput: CreateReminderInput = {
        entityType: entity.entityType,
        entityId: entity.entityId,
        entitySummary: entity.entitySummary,
        message,
        dueDate: new Date().toISOString().split('T')[0],
        ruleId
      }

      await ReminderService.create(companyId, reminderInput)
    })
    .with('log_notification', async () => {
      const params = actionParams as AutomationActionParams['log_notification']
      const message = params.notificationTemplate
        .replace('{entityType}', entity.entityType)
        .replace('{entityId}', entity.entityId)
        .replace('{entitySummary}', entity.entitySummary)

      await logAudit({
        companyId,
        entityType: 'automation_notification',
        entityId: entity.entityId,
        action: 'notification_logged',
        details: JSON.stringify({
          ruleId,
          entityType: entity.entityType,
          message
        })
      })
    })
    .exhaustive()
}
