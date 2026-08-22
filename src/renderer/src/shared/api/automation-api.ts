/**
 * Typed API client helpers for automation rule endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface AutomationRuleListItem {
  id: number
  name: string
  triggerType: string
  triggerDescription: string
  actionType: string
  actionDescription: string
  enabled: boolean
  lastEvaluatedAt: string | null
}

interface AutomationRuleDetail extends AutomationRuleListItem {
  triggerParams: Record<string, unknown>
  actionParams: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface CreateAutomationRuleInput {
  name: string
  triggerType: string
  triggerParams: Record<string, unknown>
  actionType: string
  actionParams: Record<string, unknown>
}

interface UpdateAutomationRuleInput {
  name?: string
  triggerType?: string
  triggerParams?: Record<string, unknown>
  actionType?: string
  actionParams?: Record<string, unknown>
}

interface RuleEvaluationDetail {
  ruleId: number
  ruleName: string
  triggered: boolean
  actionsExecuted: number
  error: string | null
}

interface RuleEvaluationSummary {
  rulesEvaluated: number
  actionsExecuted: number
  actionsFailed: number
  details: RuleEvaluationDetail[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Automation Rules API
// ---------------------------------------------------------------------------

/**
 * Lists all automation rules for the active company.
 */
function listAutomationRules(companyId: number): Promise<AutomationRuleListItem[]> {
  return apiClient<AutomationRuleListItem[]>('/automation-rules', {
    headers: companyHeaders(companyId)
  })
}

/**
 * Creates a new automation rule.
 */
function createAutomationRule(companyId: number, input: CreateAutomationRuleInput): Promise<AutomationRuleDetail> {
  return apiClient<AutomationRuleDetail>('/automation-rules', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

/**
 * Updates an existing automation rule.
 */
function updateAutomationRule(
  companyId: number,
  id: number,
  input: UpdateAutomationRuleInput
): Promise<AutomationRuleDetail> {
  return apiClient<AutomationRuleDetail>(`/automation-rules/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

/**
 * Toggles the enabled/disabled status of an automation rule.
 */
function toggleAutomationRule(companyId: number, id: number, enabled: boolean): Promise<AutomationRuleDetail> {
  return apiClient<AutomationRuleDetail>(`/automation-rules/${id}/toggle`, {
    method: 'POST',
    body: { enabled },
    headers: companyHeaders(companyId)
  })
}

/**
 * Manually triggers rule evaluation for all enabled rules.
 */
function evaluateRules(companyId: number): Promise<RuleEvaluationSummary> {
  return apiClient<RuleEvaluationSummary>('/automation-rules/evaluate', {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

export { listAutomationRules, createAutomationRule, updateAutomationRule, toggleAutomationRule, evaluateRules }
export type {
  AutomationRuleListItem,
  AutomationRuleDetail,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  RuleEvaluationSummary
}
