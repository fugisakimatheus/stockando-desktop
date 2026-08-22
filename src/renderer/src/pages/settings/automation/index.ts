export { AutomationRulesPage } from './ui/automation-rules-page'
export {
  automationKeys,
  useAutomationRules,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useToggleAutomationRule,
  useEvaluateRules
} from './hooks/use-automation'
export type {
  AutomationRuleListItem,
  AutomationRuleDetail,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  RuleEvaluationSummary
} from './hooks/use-automation'
