import { cn } from '@shared/lib/cn'
import { type FormEvent, useCallback, useMemo, useState } from 'react'
import { match } from 'ts-pattern'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Textarea } from './textarea'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const AUTOMATION_TRIGGER_TYPES = {
  installment_overdue: 'installment_overdue',
  stock_below_minimum: 'stock_below_minimum',
  order_pending_too_long: 'order_pending_too_long'
} as const

type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[keyof typeof AUTOMATION_TRIGGER_TYPES]

const AUTOMATION_ACTION_TYPES = {
  create_reminder: 'create_reminder',
  log_notification: 'log_notification'
} as const

type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[keyof typeof AUTOMATION_ACTION_TYPES]

interface AutomationTriggerParams {
  installment_overdue: { overdueDays: number }
  stock_below_minimum: { minimumQuantity: number }
  order_pending_too_long: { pendingDays: number }
}

interface AutomationActionParams {
  create_reminder: { messageTemplate: string }
  log_notification: { notificationTemplate: string }
}

interface CreateAutomationRuleInput {
  name: string
  triggerType: AutomationTriggerType
  triggerParams: AutomationTriggerParams[AutomationTriggerType]
  actionType: AutomationActionType
  actionParams: AutomationActionParams[AutomationActionType]
}

interface AutomationRuleFormProps {
  onSubmit: (data: CreateAutomationRuleInput) => void
  defaultValues?: Partial<CreateAutomationRuleInput>
  isLoading?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Trigger/Action label maps
// ---------------------------------------------------------------------------

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  installment_overdue: 'Parcela vencida',
  stock_below_minimum: 'Estoque abaixo do mínimo',
  order_pending_too_long: 'Pedido pendente por muito tempo'
}

const ACTION_LABELS: Record<AutomationActionType, string> = {
  create_reminder: 'Criar lembrete',
  log_notification: 'Registrar notificação'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultTriggerParams(type: AutomationTriggerType): AutomationTriggerParams[AutomationTriggerType] {
  return match(type)
    .with('installment_overdue', () => ({ overdueDays: 7 }))
    .with('stock_below_minimum', () => ({ minimumQuantity: 5 }))
    .with('order_pending_too_long', () => ({ pendingDays: 14 }))
    .exhaustive()
}

function getDefaultActionParams(type: AutomationActionType): AutomationActionParams[AutomationActionType] {
  return match(type)
    .with('create_reminder', () => ({ messageTemplate: '' }))
    .with('log_notification', () => ({ notificationTemplate: '' }))
    .exhaustive()
}

// ---------------------------------------------------------------------------
// AutomationRuleForm
// ---------------------------------------------------------------------------

function AutomationRuleForm({
  onSubmit,
  defaultValues,
  isLoading = false,
  className
}: AutomationRuleFormProps): React.JSX.Element {
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [triggerType, setTriggerType] = useState<AutomationTriggerType | null>(defaultValues?.triggerType ?? null)
  const [triggerParams, setTriggerParams] = useState<AutomationTriggerParams[AutomationTriggerType] | null>(
    defaultValues?.triggerParams ?? null
  )
  const [actionType, setActionType] = useState<AutomationActionType | null>(defaultValues?.actionType ?? null)
  const [actionParams, setActionParams] = useState<AutomationActionParams[AutomationActionType] | null>(
    defaultValues?.actionParams ?? null
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isValid = useMemo(() => {
    if (!name.trim()) return false
    if (!triggerType) return false
    if (!triggerParams) return false
    if (!actionType) return false
    if (!actionParams) return false
    return true
  }, [name, triggerType, triggerParams, actionType, actionParams])

  const handleTriggerTypeChange = useCallback((key: AutomationTriggerType) => {
    setTriggerType(key)
    setTriggerParams(getDefaultTriggerParams(key))
    setErrors((prev) => ({ ...prev, triggerType: '' }))
  }, [])

  const handleActionTypeChange = useCallback((key: AutomationActionType) => {
    setActionType(key)
    setActionParams(getDefaultActionParams(key))
    setErrors((prev) => ({ ...prev, actionType: '' }))
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      const newErrors: Record<string, string> = {}
      if (!name.trim()) newErrors.name = 'O nome é obrigatório.'
      if (!triggerType) newErrors.triggerType = 'Selecione um tipo de gatilho.'
      if (!actionType) newErrors.actionType = 'Selecione um tipo de ação.'

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      if (!triggerType || !triggerParams || !actionType || !actionParams) return

      onSubmit({
        name: name.trim(),
        triggerType,
        triggerParams,
        actionType,
        actionParams
      })
    },
    [name, triggerType, triggerParams, actionType, actionParams, onSubmit]
  )

  // -------------------------------------------------------------------------
  // Trigger params fields
  // -------------------------------------------------------------------------

  const triggerParamsFields = useMemo(() => {
    if (!triggerType || !triggerParams) return null

    return match(triggerType)
      .with('installment_overdue', () => (
        <div className="grid gap-1.5">
          <Label htmlFor="trigger-overdue-days">Dias de atraso</Label>
          <Input
            id="trigger-overdue-days"
            type="number"
            min={1}
            value={String((triggerParams as { overdueDays: number }).overdueDays)}
            onChange={(e) => setTriggerParams({ overdueDays: Math.max(1, Number(e.target.value) || 1) })}
            disabled={isLoading}
          />
        </div>
      ))
      .with('stock_below_minimum', () => (
        <div className="grid gap-1.5">
          <Label htmlFor="trigger-min-quantity">Quantidade mínima</Label>
          <Input
            id="trigger-min-quantity"
            type="number"
            min={1}
            value={String((triggerParams as { minimumQuantity: number }).minimumQuantity)}
            onChange={(e) => setTriggerParams({ minimumQuantity: Math.max(1, Number(e.target.value) || 1) })}
            disabled={isLoading}
          />
        </div>
      ))
      .with('order_pending_too_long', () => (
        <div className="grid gap-1.5">
          <Label htmlFor="trigger-pending-days">Dias pendente</Label>
          <Input
            id="trigger-pending-days"
            type="number"
            min={1}
            value={String((triggerParams as { pendingDays: number }).pendingDays)}
            onChange={(e) => setTriggerParams({ pendingDays: Math.max(1, Number(e.target.value) || 1) })}
            disabled={isLoading}
          />
        </div>
      ))
      .exhaustive()
  }, [triggerType, triggerParams, isLoading])

  // -------------------------------------------------------------------------
  // Action params fields
  // -------------------------------------------------------------------------

  const actionParamsFields = useMemo(() => {
    if (!actionType || !actionParams) return null

    return match(actionType)
      .with('create_reminder', () => (
        <div className="grid gap-1.5">
          <Label htmlFor="action-message-template">Modelo de mensagem</Label>
          <Textarea
            id="action-message-template"
            placeholder="Ex: Parcela de {entity} está vencida há {days} dias"
            value={(actionParams as { messageTemplate: string }).messageTemplate}
            onChange={(e) => setActionParams({ messageTemplate: e.target.value })}
            disabled={isLoading}
          />
        </div>
      ))
      .with('log_notification', () => (
        <div className="grid gap-1.5">
          <Label htmlFor="action-notification-template">Modelo de notificação</Label>
          <Textarea
            id="action-notification-template"
            placeholder="Ex: Estoque de {product} abaixo do mínimo"
            value={(actionParams as { notificationTemplate: string }).notificationTemplate}
            onChange={(e) => setActionParams({ notificationTemplate: e.target.value })}
            disabled={isLoading}
          />
        </div>
      ))
      .exhaustive()
  }, [actionType, actionParams, isLoading])

  return (
    <form onSubmit={handleSubmit} className={cn('grid gap-4', className)}>
      {/* Rule name */}
      <div className="grid gap-1.5">
        <Label htmlFor="rule-name">Nome da regra</Label>
        <Input
          id="rule-name"
          type="text"
          placeholder="Ex: Alerta de parcela vencida"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((prev) => ({ ...prev, name: '' }))
          }}
          disabled={isLoading}
          aria-invalid={!!errors.name}
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>

      {/* Trigger type */}
      <div className="grid gap-1.5">
        <Label htmlFor="trigger-type">Tipo de gatilho</Label>
        <Select
          placeholder="Selecione um gatilho"
          selectedKey={triggerType}
          onSelectionChange={(key) => handleTriggerTypeChange(key as AutomationTriggerType)}
          isDisabled={isLoading}
          aria-label="Tipo de gatilho"
        >
          <SelectTrigger id="trigger-type" aria-invalid={!!errors.triggerType}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
              <SelectItem key={key} id={key} textValue={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.triggerType ? <p className="text-xs text-destructive">{errors.triggerType}</p> : null}
      </div>

      {/* Trigger params */}
      {triggerParamsFields}

      {/* Action type */}
      <div className="grid gap-1.5">
        <Label htmlFor="action-type">Tipo de ação</Label>
        <Select
          placeholder="Selecione uma ação"
          selectedKey={actionType}
          onSelectionChange={(key) => handleActionTypeChange(key as AutomationActionType)}
          isDisabled={isLoading}
          aria-label="Tipo de ação"
        >
          <SelectTrigger id="action-type" aria-invalid={!!errors.actionType}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <SelectItem key={key} id={key} textValue={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.actionType ? <p className="text-xs text-destructive">{errors.actionType}</p> : null}
      </div>

      {/* Action params */}
      {actionParamsFields}

      {/* Submit */}
      <Button type="submit" isDisabled={!isValid} isLoading={isLoading} className="w-full">
        Salvar regra
      </Button>
    </form>
  )
}

export { AutomationRuleForm }
export type { AutomationRuleFormProps, CreateAutomationRuleInput }
