import type { RuleEvaluationSummary } from '@shared/api'
import { AutomationRuleForm } from '@shared/ui/automation-rule-form'
import type { CreateAutomationRuleInput } from '@shared/ui/automation-rule-form'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Switch } from '@shared/ui/switch'
import { Cog, Play, Plus, Zap } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  useAutomationRules,
  useCreateAutomationRule,
  useEvaluateRules,
  useToggleAutomationRule
} from '../hooks/use-automation'
import type { AutomationRuleListItem } from '../hooks/use-automation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLastEvaluated(timestamp: string | null): string {
  if (!timestamp) return 'Nunca'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

// ---------------------------------------------------------------------------
// EvaluationSummaryCard
// ---------------------------------------------------------------------------

function EvaluationSummaryCard({ summary }: { summary: RuleEvaluationSummary }): React.JSX.Element {
  return (
    <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
      <CardHeader>
        <CardTitle className="text-sm">Resultado da Avaliação</CardTitle>
        <CardDescription>
          {summary.rulesEvaluated} {summary.rulesEvaluated === 1 ? 'regra avaliada' : 'regras avaliadas'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Ações executadas: </span>
            <span className="font-medium">{summary.actionsExecuted}</span>
          </div>
          {summary.actionsFailed > 0 && (
            <div>
              <span className="text-muted-foreground">Falhas: </span>
              <span className="font-medium text-destructive">{summary.actionsFailed}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RuleCard
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onToggle,
  isToggling
}: {
  rule: AutomationRuleListItem
  onToggle: (id: number, enabled: boolean) => void
  isToggling: boolean
}): React.JSX.Element {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8">
          <Cog className="size-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{rule.name}</span>
            <Badge variant={rule.enabled ? 'secondary' : 'outline'}>{rule.enabled ? 'Ativa' : 'Inativa'}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">{rule.triggerDescription}</p>
          <p className="truncate text-sm text-muted-foreground">{rule.actionDescription}</p>
          <p className="text-xs text-muted-foreground/70">
            Última avaliação: {formatLastEvaluated(rule.lastEvaluatedAt)}
          </p>
        </div>

        <Switch
          isSelected={rule.enabled}
          onChange={(checked) => onToggle(rule.id, checked)}
          isDisabled={isToggling}
          aria-label={`${rule.enabled ? 'Desativar' : 'Ativar'} regra ${rule.name}`}
        />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// AutomationRulesPage
// ---------------------------------------------------------------------------

function AutomationRulesPage(): React.JSX.Element {
  const rulesQuery = useAutomationRules(COMPANY_ID)
  const createRule = useCreateAutomationRule(COMPANY_ID)
  const toggleRule = useToggleAutomationRule(COMPANY_ID)
  const evaluateRules = useEvaluateRules(COMPANY_ID)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [evaluationSummary, setEvaluationSummary] = useState<RuleEvaluationSummary | null>(null)

  const rules = rulesQuery.data ?? []

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCreate(input: CreateAutomationRuleInput): void {
    createRule.mutate(input, {
      onSuccess: () => {
        toast.success('Regra de automação criada com sucesso')
        setIsCreateOpen(false)
      },
      onError: () => {
        toast.error('Erro ao criar regra. Tente novamente.')
      }
    })
  }

  function handleToggle(id: number, enabled: boolean): void {
    toggleRule.mutate(
      { id, enabled },
      {
        onSuccess: () => {
          toast.success(enabled ? 'Regra ativada' : 'Regra desativada')
        },
        onError: () => {
          toast.error('Erro ao alterar status da regra.')
        }
      }
    )
  }

  function handleEvaluate(): void {
    setEvaluationSummary(null)
    evaluateRules.mutate(undefined, {
      onSuccess: (summary) => {
        setEvaluationSummary(summary)
        toast.success(
          `Avaliação concluída: ${summary.actionsExecuted} ${summary.actionsExecuted === 1 ? 'ação executada' : 'ações executadas'}`
        )
      },
      onError: () => {
        toast.error('Erro ao avaliar regras. Tente novamente.')
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Regras de Automação"
      description="Configure regras que executam ações automáticas com base em eventos de negócio."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onPress={handleEvaluate}
            isDisabled={evaluateRules.isPending}
            isLoading={evaluateRules.isPending}
            className="gap-1.5"
          >
            <Play className="size-4" />
            Avaliar Regras
          </Button>
          <Button onPress={() => setIsCreateOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            Nova Regra
          </Button>
        </div>
      }
    >
      <PageSection>
        {evaluationSummary && <EvaluationSummaryCard summary={evaluationSummary} />}

        {rulesQuery.isLoading && <LoadingState message="Carregando regras de automação..." />}

        {rulesQuery.isError && (
          <ErrorState
            title="Erro ao carregar regras"
            description="Não foi possível buscar as regras de automação. Tente novamente."
            onRetry={() => rulesQuery.refetch()}
          />
        )}

        {rulesQuery.isSuccess && rules.length === 0 && (
          <EmptyState
            icon={<Zap />}
            title="Nenhuma regra configurada"
            description="Crie sua primeira regra para automatizar ações do negócio."
            action={
              <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
                <Plus className="size-4" />
                Criar regra
              </Button>
            }
          />
        )}

        {rulesQuery.isSuccess && rules.length > 0 && (
          <div className="space-y-3">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} isToggling={toggleRule.isPending} />
            ))}
          </div>
        )}
      </PageSection>

      {/* Create Rule Dialog */}
      <Dialog isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Regra de Automação</DialogTitle>
          <DialogDescription>Configure o gatilho e a ação que será executada automaticamente.</DialogDescription>
        </DialogHeader>
        <AutomationRuleForm onSubmit={handleCreate} isLoading={createRule.isPending} className="pt-2" />
      </Dialog>
    </PageShell>
  )
}

export { AutomationRulesPage }
