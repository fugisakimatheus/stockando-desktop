import { ApiError } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import {
  useAppSettings,
  useCompanySettings,
  useUpdateAppSettings,
  useUpdateCompanySettings
} from '@shared/hooks/use-settings'
import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { ErrorState } from '@shared/ui/error-state'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Building2, Loader2, Monitor, Moon, Palette, Save, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Field Error Component
// ---------------------------------------------------------------------------

function FieldError({ message }: { message: string | undefined }): React.JSX.Element | null {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

// ---------------------------------------------------------------------------
// App Settings Form
// ---------------------------------------------------------------------------

function AppSettingsForm(): React.JSX.Element {
  const { data: settings, isLoading, isError, refetch } = useAppSettings()
  const updateSettings = useUpdateAppSettings()

  const [theme, setTheme] = useState<string>('system')

  useEffect(() => {
    if (settings?.theme) {
      setTheme(settings.theme)
    }
  }, [settings?.theme])

  function handleSaveTheme(): void {
    updateSettings.mutate(
      { theme },
      {
        onSuccess: () => {
          toast.success('Configurações salvas com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
            toast.error('Erro de validação ao salvar configurações')
          } else {
            toast.error('Erro ao salvar configurações. Tente novamente.')
          }
        }
      }
    )
  }

  if (isLoading) {
    return <LoadingState message="Carregando configurações..." />
  }

  if (isError) {
    return (
      <ErrorState
        title="Erro ao carregar configurações"
        description="Não foi possível carregar as configurações do aplicativo."
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
          <Palette className="size-4" />
        </div>
        <CardTitle>Aparência</CardTitle>
        <CardDescription>Configure o tema visual da aplicação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tema</Label>
          <Select selectedKey={theme} onSelectionChange={(key) => setTheme(key as string)}>
            <SelectTrigger>
              <SelectValue>
                {({ selectedText }) => (
                  <span className="flex items-center gap-2">
                    {match(theme)
                      .with('light', () => <Sun className="size-4" />)
                      .with('dark', () => <Moon className="size-4" />)
                      .otherwise(() => (
                        <Monitor className="size-4" />
                      ))}
                    {selectedText}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="light" textValue="Claro">
                <Sun className="size-4" />
                Claro
              </SelectItem>
              <SelectItem id="dark" textValue="Escuro">
                <Moon className="size-4" />
                Escuro
              </SelectItem>
              <SelectItem id="system" textValue="Sistema">
                <Monitor className="size-4" />
                Sistema
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="default" className="gap-2" onPress={handleSaveTheme} isDisabled={updateSettings.isPending}>
            {updateSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Company Settings Form
// ---------------------------------------------------------------------------

function CompanySettingsForm(): React.JSX.Element {
  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0
  const { data: companySettings, isLoading, isError, refetch } = useCompanySettings(companyId)
  const updateSettings = useUpdateCompanySettings()

  const [taxRegime, setTaxRegime] = useState('')
  const [currencyCode, setCurrencyCode] = useState('BRL')
  const [fiscalEnvironment, setFiscalEnvironment] = useState('production')
  const [invoiceSeries, setInvoiceSeries] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (companySettings) {
      setTaxRegime(companySettings.taxRegime ?? '')
      setCurrencyCode(companySettings.currencyCode ?? 'BRL')
      setFiscalEnvironment(companySettings.fiscalEnvironment ?? 'production')
      setInvoiceSeries(companySettings.invoiceSeries ?? '')
    }
  }, [companySettings])

  function handleSave(): void {
    setFieldErrors({})

    updateSettings.mutate(
      {
        companyId,
        taxRegime: taxRegime || null,
        currencyCode: currencyCode || undefined,
        fiscalEnvironment: fiscalEnvironment || undefined,
        invoiceSeries: invoiceSeries || null
      },
      {
        onSuccess: () => {
          toast.success('Configurações da empresa salvas com sucesso')
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields) {
            setFieldErrors(error.fields)
            toast.error('Corrija os erros de validação nos campos indicados.')
          } else {
            toast.error('Erro ao salvar configurações da empresa. Tente novamente.')
          }
        }
      }
    )
  }

  if (!company) {
    return (
      <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
            <Building2 className="size-4" />
          </div>
          <CardTitle>Configurações da Empresa</CardTitle>
          <CardDescription>Selecione uma empresa para configurar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return <LoadingState message="Carregando configurações da empresa..." />
  }

  if (isError) {
    return (
      <ErrorState
        title="Erro ao carregar configurações da empresa"
        description="Não foi possível carregar as configurações da empresa ativa."
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
          <Building2 className="size-4" />
        </div>
        <CardTitle>Configurações da Empresa</CardTitle>
        <CardDescription>Ajustes fiscais e operacionais para {company.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="taxRegime">Regime Tributário</Label>
            <Input
              id="taxRegime"
              value={taxRegime}
              onChange={(e) => {
                setTaxRegime(e.target.value)
                setFieldErrors((prev) => ({ ...prev, taxRegime: '' }))
              }}
              placeholder="Ex: Simples Nacional"
              aria-invalid={!!fieldErrors.taxRegime}
            />
            <FieldError message={fieldErrors.taxRegime} />
          </div>

          <div className="space-y-2">
            <Label>Moeda</Label>
            <Select
              selectedKey={currencyCode}
              onSelectionChange={(key) => {
                setCurrencyCode(key as string)
                setFieldErrors((prev) => ({ ...prev, currencyCode: '' }))
              }}
            >
              <SelectTrigger aria-invalid={!!fieldErrors.currencyCode}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="BRL" textValue="BRL — Real Brasileiro">
                  BRL — Real Brasileiro
                </SelectItem>
                <SelectItem id="USD" textValue="USD — Dólar Americano">
                  USD — Dólar Americano
                </SelectItem>
                <SelectItem id="EUR" textValue="EUR — Euro">
                  EUR — Euro
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.currencyCode} />
          </div>

          <div className="space-y-2">
            <Label>Ambiente Fiscal</Label>
            <Select
              selectedKey={fiscalEnvironment}
              onSelectionChange={(key) => {
                setFiscalEnvironment(key as string)
                setFieldErrors((prev) => ({ ...prev, fiscalEnvironment: '' }))
              }}
            >
              <SelectTrigger aria-invalid={!!fieldErrors.fiscalEnvironment}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="production" textValue="Produção">
                  Produção
                </SelectItem>
                <SelectItem id="homologation" textValue="Homologação">
                  Homologação
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.fiscalEnvironment} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceSeries">Série NF-e</Label>
            <Input
              id="invoiceSeries"
              value={invoiceSeries}
              onChange={(e) => {
                setInvoiceSeries(e.target.value)
                setFieldErrors((prev) => ({ ...prev, invoiceSeries: '' }))
              }}
              placeholder="Ex: 1"
              aria-invalid={!!fieldErrors.invoiceSeries}
            />
            <FieldError message={fieldErrors.invoiceSeries} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="default" className="gap-2" onPress={handleSave} isDisabled={updateSettings.isPending}>
            {updateSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

function SettingsPage(): React.JSX.Element {
  return (
    <PageShell title="Configurações" description="Ajustes gerais da empresa e do ambiente do sistema.">
      <PageSection>
        <div className="space-y-6">
          <AppSettingsForm />
          <CompanySettingsForm />
        </div>
      </PageSection>
    </PageShell>
  )
}

export { SettingsPage }
