import { ApiError } from '@shared/api'
import type { UpdateCustomerInput } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCustomerDetail, useUpdateCustomer } from '@shared/hooks/use-customers'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ErrorState } from '@shared/ui/error-state'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, FileText, Pencil, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CustomerFormDialog } from './customer-form-dialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'active') {
    return <Badge variant="secondary">Ativo</Badge>
  }
  return <Badge variant="outline">Inativo</Badge>
}

function DetailField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(iso))
}

// ---------------------------------------------------------------------------
// CustomerDetailPage
// ---------------------------------------------------------------------------

function CustomerDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const customerId = id ? Number(id) : undefined
  const navigate = useNavigate()

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  const customerQuery = useCustomerDetail(companyId, customerId)
  const updateCustomer = useUpdateCustomer(companyId)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleUpdate(input: UpdateCustomerInput & { id: number }): void {
    setFieldErrors({})
    updateCustomer.mutate(input, {
      onSuccess: () => {
        toast.success('Cliente atualizado com sucesso')
        setIsEditOpen(false)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields)
        } else {
          toast.error('Erro ao atualizar cliente. Tente novamente.')
        }
      }
    })
  }

  function handleBack(): void {
    navigate({ to: '/customers' as string })
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (customerQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando cliente..." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (customerQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar cliente"
          description="Não foi possível buscar os detalhes do cliente. Tente novamente."
          onRetry={() => customerQuery.refetch()}
        />
      </PageShell>
    )
  }

  const customer = customerQuery.data
  if (!customer) {
    return (
      <PageShell>
        <ErrorState title="Cliente não encontrado" description="O cliente solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title={customer.name}
      description={customer.documentNumber ? `CPF/CNPJ: ${customer.documentNumber}` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onPress={handleBack} className="gap-2">
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          <Button
            onPress={() => {
              setFieldErrors({})
              setIsEditOpen(true)
            }}
            className="gap-2"
          >
            <Pencil className="size-4" />
            Editar
          </Button>
        </div>
      }
    >
      {/* Customer Information */}
      <PageSection title="Informações do cliente">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Nome" value={customer.name} />
          <DetailField label="CPF/CNPJ" value={customer.documentNumber ?? '—'} />
          <DetailField label="Email" value={customer.email ?? '—'} />
          <DetailField label="Telefone" value={customer.phone ?? '—'} />
          <DetailField label="Endereço" value={customer.address ?? '—'} />
          <DetailField
            label="Tipo"
            value={customer.customerType === 'business' ? 'Pessoa Jurídica' : 'Pessoa Física'}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <StatusBadge status={customer.status} />
          </div>
          <DetailField label="Criado em" value={formatDate(customer.createdAt)} />
          <DetailField label="Atualizado em" value={formatDate(customer.updatedAt)} />
        </div>
      </PageSection>

      {/* Summary Counts */}
      <PageSection title="Resumo de documentos">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{customer.quoteCount}</p>
              <p className="text-xs text-muted-foreground">{customer.quoteCount === 1 ? 'Cotação' : 'Cotações'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border/70 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted">
              <ShoppingCart className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{customer.salesOrderCount}</p>
              <p className="text-xs text-muted-foreground">
                {customer.salesOrderCount === 1 ? 'Pedido de venda' : 'Pedidos de venda'}
              </p>
            </div>
          </div>
        </div>
      </PageSection>

      {/* Quick Links */}
      <PageSection title="Ações rápidas">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onPress={() => navigate({ to: '/quotes' as string, search: { customerId: customer.id } as never })}
            className="gap-2"
          >
            <FileText className="size-4" />
            Ver cotações
          </Button>
          <Button
            variant="outline"
            onPress={() => navigate({ to: '/sales-orders' as string, search: { customerId: customer.id } as never })}
            className="gap-2"
          >
            <ShoppingCart className="size-4" />
            Ver pedidos de venda
          </Button>
        </div>
      </PageSection>

      {/* Edit Customer Dialog */}
      <CustomerFormDialog
        open={isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditOpen(false)
            setFieldErrors({})
          }
        }}
        mode="edit"
        onSubmitUpdate={handleUpdate}
        isLoading={updateCustomer.isPending}
        fieldErrors={fieldErrors}
        customer={customer}
      />
    </PageShell>
  )
}

export { CustomerDetailPage }
