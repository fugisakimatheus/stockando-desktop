import {
  listAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  toggleAutomationRule,
  evaluateRules
} from '@shared/api'
import type {
  AutomationRuleListItem,
  AutomationRuleDetail,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  RuleEvaluationSummary
} from '@shared/api'
import { reminderKeys } from '@shared/hooks/use-reminders'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const automationKeys = {
  all: (companyId: number) => [companyId, 'automation-rules'] as const,
  list: (companyId: number) => [...automationKeys.all(companyId), 'list'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all automation rules for the given company.
 */
function useAutomationRules(companyId: number) {
  return useQuery({
    queryKey: automationKeys.list(companyId),
    queryFn: () => listAutomationRules(companyId)
  })
}

/**
 * Mutation to create a new automation rule.
 * Invalidates the automation rules list on success.
 */
function useCreateAutomationRule(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateAutomationRuleInput) => createAutomationRule(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing automation rule.
 * Invalidates the automation rules list on success.
 */
function useUpdateAutomationRule(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAutomationRuleInput & { id: number }) =>
      updateAutomationRule(companyId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to toggle an automation rule enabled/disabled.
 * Invalidates the automation rules list on success.
 */
function useToggleAutomationRule(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => toggleAutomationRule(companyId, id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to manually trigger rule evaluation for all enabled rules.
 * Invalidates both automation rules and reminders on success (since evaluation may create reminders).
 */
function useEvaluateRules(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => evaluateRules(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: reminderKeys.all(companyId) })
    }
  })
}

export {
  automationKeys,
  useAutomationRules,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useToggleAutomationRule,
  useEvaluateRules
}
export type {
  AutomationRuleListItem,
  AutomationRuleDetail,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  RuleEvaluationSummary
}
