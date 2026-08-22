import { ApiError } from '@shared/api'
import type {
  ConnectionTestResult,
  CreateIntegrationInput,
  IntegrationConfigListItem,
  IntegrationProviderType,
  UpdateIntegrationInput
} from '@shared/api'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card, CardContent } from '@shared/ui/card'
import { ConnectionStatusIndicator } from '@shared/ui/connection-status-indicator'
import type { ConnectionStatus } from '@shared/ui/connection-status-indicator'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Switch } from '@shared/ui/switch'
import { Cable, Loader2, Pencil, Plus, Save, Wifi } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'

import {
  useCreateIntegration,
  useIntegrationConfigs,
  useTestConnection,
  useToggleIntegration,
  useUpdateIntegration
} from '../hooks/use-integrations'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

const PROVIDER_LABELS: Record<string, string> = {
  fiscal_provider: 'Provedor Fiscal (SEFAZ)',
  payment_gateway: 'Gateway de Pagamento',
  custom_webhook: 'Webhook Customizado'
}

const PROVIDER_OPTIONS = [
  { id: 'fiscal_provider', name: 'Provedor Fiscal (SEFAZ)' },
  { id: 'payment_gateway', name: 'Gateway de Pagamento' },
  { id: 'custom_webhook', name: 'Webhook Customizado' }
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskCredentials(ref: string | null): string {
  if (!ref) return 'Não configurado'
  if (ref.length <= 4) return '••••'
  return '••••' + ref.slice(-4)
}

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

// ---------------------------------------------------------------------------
// Integration Form Dialog
// ---------------------------------------------------------------------------

interface IntegrationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  onSubmitCreate?: (input: CreateIntegrationInput) => void
  onSubmitUpdate?: (input: UpdateIntegrationInput & { id: number }) => void
  isLoading: boolean
  fieldErrors: Record<string, string>
  integration?: IntegrationConfigListItem | null
}

function IntegrationFormDialog({
  open,
  onOpenChange,
  mode,
  onSubmitCreate,
  onSubmitUpdate,
  isLoading,
  fieldErrors,
  integration
}: IntegrationFormDialogProps): React.JSX.Element {
  const [providerType, setProviderType] = useState(integration?.providerType ?? 'fiscal_provider')
  const [endpointUrl, setEndpointUrl] = useState(integration?.endpointUrl ?? '')
  const [credentials, setCredentials] = useState('')
  const [description, setDescription] = useState(integration?.description ?? '')

  // Reset form when dialog opens with a different integration
  const [lastIntegrationId, setLastIntegrationId] = useState<number | null>(null)
  if (open && integration && integration.id !== lastIntegrationId) {
    setProviderType(integration.providerType)
    setEndpointUrl(integration.endpointUrl)
    setCredentials('')
    setDescription(integration.description ?? '')
    setLastIntegrationId(integration.id)
  } else if (open && !integration && lastIntegrationId !== null) {
    setProviderType('fiscal_provider')
    setEndpointUrl('')
    setCredentials('')
    setDescription('')
    setLastIntegrationId(null)
  }

  function handleSubmit(): void {
    if (mode === 'create' && onSubmitCreate) {
      onSubmitCreate({
        providerType,
        endpointUrl,
        credentials: credentials || undefined,
        description: description || undefined
      })
    } else if (mode === 'edit' && onSubmitUpdate && integration) {
      onSubmitUpdate({
        id: integration.id,
        endpointUrl: endpointUrl || undefined,
        credentials: credentials || undefined,
        description: description || undefined
      })
    }
  }

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'Nova Integração' : 'Editar Integração'}</DialogTitle>
        <DialogDescription>
          {mode === 'create' ? 'Configure uma nova conexão com serviço externo.' : 'Atualize os dados da integração.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {mode === 'create' && (
          <div className="space-y-2">
            <Label>Tipo de Provedor</Label>
            <Select
              selectedKey={providerType}
              onSelectionChange={(key) => setProviderType(key as IntegrationProviderType)}
            >
              <SelectTrigger aria-invalid={!!fieldErrors.providerType}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                    {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.providerType} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="endpointUrl">URL do Endpoint</Label>
          <Input
            id="endpointUrl"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="https://api.exemplo.com/v1"
            aria-invalid={!!fieldErrors.endpointUrl}
          />
          <FieldError message={fieldErrors.endpointUrl} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="credentials">
            Credenciais
            {mode === 'edit' && <span className="ml-1 text-xs text-muted-foreground">(deixe vazio para manter)</span>}
          </Label>
          <Input
            id="credentials"
            type="password"
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            placeholder={mode === 'edit' ? '••••••••' : 'Token ou chave de acesso'}
            aria-invalid={!!fieldErrors.credentials}
          />
          <FieldError message={fieldErrors.credentials} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição opcional"
            aria-invalid={!!fieldErrors.description}
          />
          <FieldError message={fieldErrors.description} />
        </div>
      </div>

      <DialogFooter>
        <DialogClose variant="outline">Cancelar</DialogClose>
        <Button onPress={handleSubmit} isDisabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {mode === 'create' ? 'Criar' : 'Salvar'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Integration Entry Card
// ---------------------------------------------------------------------------

interface IntegrationEntryProps {
  integration: IntegrationConfigListItem
  onEdit: (integration: IntegrationConfigListItem) => void
  onToggle: (id: number, active: boolean) => void
  onTest: (id: number) => void
  isTesting: boolean
  testResult: ConnectionTestResult | null
  testError: string | null
}

function IntegrationEntry({
  integration,
  onEdit,
  onToggle,
  onTest,
  isTesting,
  testResult,
  testError
}: IntegrationEntryProps): React.JSX.Element {
  const connectionStatus: ConnectionStatus = match<boolean, ConnectionStatus>(isTesting)
    .with(true, () => 'testing')
    .otherwise(() => {
      if (testResult) {
        return testResult.success ? 'success' : 'failure'
      }
      if (testError) {
        return 'failure'
      }
      return 'idle'
    })

  return (
    <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {PROVIDER_LABELS[integration.providerType] ?? integration.providerType}
            </span>
            {integration.active ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{integration.endpointUrl}</p>
          {integration.description && <p className="text-xs text-muted-foreground">{integration.description}</p>}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-muted-foreground">Credenciais: {maskCredentials(null)}</span>
            {integration.lastTestedAt && (
              <span className="text-xs text-muted-foreground">
                Último teste:{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short'
                }).format(new Date(integration.lastTestedAt))}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionStatusIndicator
            status={connectionStatus}
            responseTimeMs={testResult?.responseTimeMs ?? undefined}
            error={testResult?.error ?? testError ?? undefined}
          />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onPress={() => onTest(integration.id)}
            isDisabled={isTesting}
          >
            {isTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
            Testar
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar ${PROVIDER_LABELS[integration.providerType] ?? integration.providerType}`}
            onPress={() => onEdit(integration)}
          >
            <Pencil className="size-3.5" />
          </Button>

          <Switch
            size="sm"
            isSelected={integration.active}
            onChange={(isSelected) => onToggle(integration.id, isSelected)}
            aria-label={`Ativar/desativar ${PROVIDER_LABELS[integration.providerType] ?? integration.providerType}`}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Integrations Page
// ---------------------------------------------------------------------------

function IntegrationsPage(): React.JSX.Element {
  const integrationsQuery = useIntegrationConfigs(COMPANY_ID)
  const createMutation = useCreateIntegration(COMPANY_ID)
  const updateMutation = useUpdateIntegration(COMPANY_ID)
  const toggleMutation = useToggleIntegration(COMPANY_ID)
  const testMutation = useTestConnection(COMPANY_ID)

  const integrations = integrationsQuery.data ?? []

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingIntegration, setEditingIntegration] = useState<IntegrationConfigListItem | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Test state per integration
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testedId, setTestedId] = useState<number | null>(null)
  const [lastTestResult, setLastTestResult] = useState<ConnectionTestResult | null>(null)
  const [lastTestError, setLastTestError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCreate(input: CreateIntegrationInput): void {
    setFieldErrors({})
    createMutation.mutate(input, {
      onSuccess: () => {
        toast.success('Integração criada com sucesso')
        setIsCreateOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao criar integração. Tente novamente.')
        }
      }
    })
  }

  function handleUpdate(input: UpdateIntegrationInput & { id: number }): void {
    setFieldErrors({})
    updateMutation.mutate(input, {
      onSuccess: () => {
        toast.success('Integração atualizada com sucesso')
        setEditingIntegration(null)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao atualizar integração. Tente novamente.')
        }
      }
    })
  }

  function handleToggle(id: number, active: boolean): void {
    toggleMutation.mutate(
      { id, active },
      {
        onSuccess: () => {
          toast.success(active ? 'Integração ativada' : 'Integração desativada')
        },
        onError: () => {
          toast.error('Erro ao alterar status da integração.')
        }
      }
    )
  }

  function handleTest(id: number): void {
    setTestingId(id)
    setTestedId(id)
    setLastTestResult(null)
    setLastTestError(null)

    testMutation.mutate(id, {
      onSuccess: (result) => {
        setLastTestResult(result)
        setTestingId(null)
        if (result.success) {
          toast.success(`Conexão bem-sucedida${result.responseTimeMs != null ? ` (${result.responseTimeMs}ms)` : ''}`)
        } else {
          toast.error(result.error ?? 'Falha na conexão')
        }
      },
      onError: (error) => {
        setLastTestError(error instanceof ApiError ? error.message : 'Erro ao testar conexão')
        setTestingId(null)
        toast.error('Erro ao testar conexão. Tente novamente.')
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title="Integrações"
      description="Gerencie conexões com serviços externos e provedores fiscais."
      actions={
        <Button onPress={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Nova integração
        </Button>
      }
    >
      <PageSection>
        {integrationsQuery.isLoading && <LoadingState message="Carregando integrações..." />}

        {integrationsQuery.isError && (
          <ErrorState
            title="Erro ao carregar integrações"
            description="Não foi possível buscar a lista de integrações. Tente novamente."
            onRetry={() => integrationsQuery.refetch()}
          />
        )}

        {integrationsQuery.isSuccess && integrations.length === 0 && (
          <EmptyState
            icon={<Cable />}
            title="Nenhuma integração configurada"
            description="Adicione uma conexão com serviço externo para começar."
            action={
              <Button variant="outline" onPress={() => setIsCreateOpen(true)} className="gap-1.5">
                <Plus className="size-4" />
                Adicionar integração
              </Button>
            }
          />
        )}

        {integrationsQuery.isSuccess && integrations.length > 0 && (
          <div className="space-y-3">
            {integrations.map((integration) => (
              <IntegrationEntry
                key={integration.id}
                integration={integration}
                onEdit={(item) => {
                  setFieldErrors({})
                  setEditingIntegration(item)
                }}
                onToggle={handleToggle}
                onTest={handleTest}
                isTesting={testingId === integration.id}
                testResult={testedId === integration.id ? lastTestResult : null}
                testError={testedId === integration.id ? lastTestError : null}
              />
            ))}
          </div>
        )}
      </PageSection>

      {/* Create Dialog */}
      <IntegrationFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setFieldErrors({})
        }}
        mode="create"
        onSubmitCreate={handleCreate}
        isLoading={createMutation.isPending}
        fieldErrors={fieldErrors}
      />

      {/* Edit Dialog */}
      <IntegrationFormDialog
        open={!!editingIntegration}
        onOpenChange={(open) => {
          if (!open) {
            setEditingIntegration(null)
            setFieldErrors({})
          }
        }}
        mode="edit"
        onSubmitUpdate={handleUpdate}
        isLoading={updateMutation.isPending}
        fieldErrors={fieldErrors}
        integration={editingIntegration}
      />
    </PageShell>
  )
}

export { IntegrationsPage }
