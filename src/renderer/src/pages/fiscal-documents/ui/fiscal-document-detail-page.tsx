import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useAttachments, useDeleteAttachment } from '@shared/hooks/use-attachments'
import { AttachmentList } from '@shared/ui/attachment-list'
import { AuditExpandablePanel } from '@shared/ui/audit-expandable-panel'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { ErrorState } from '@shared/ui/error-state'
import { FiscalStatusBadge } from '@shared/ui/fiscal-status-badge'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Textarea } from '@shared/ui/textarea'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarIcon,
  CheckCircle2Icon,
  FileTextIcon,
  HashIcon,
  KeyIcon,
  PackageIcon,
  ShieldCheckIcon,
  XCircleIcon
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { TextField as TextFieldPrimitive } from 'react-aria-components'
import { toast } from 'sonner'

import {
  useAuthorizeFiscalDocument,
  useCancelFiscalDocument,
  useFiscalDocumentDetail,
  useGenerateDanfe
} from '../hooks/use-fiscal-documents'
import { FiscalTransitionActions } from './fiscal-transition-actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthorizeFormData {
  accessKey: string
  protocolNumber: string
  xmlContent: string
  authorizedAt: string
}

interface CancelFormData {
  protocolNumber: string
  justification: string
  cancelledAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(isoDate))
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(isoDate))
}

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 16)
}

// ---------------------------------------------------------------------------
// FiscalDocumentDetailPage
// ---------------------------------------------------------------------------

function FiscalDocumentDetailPage(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()
  const documentId = id ? Number(id) : undefined

  const { company } = useActiveCompany()
  const companyId = company?.id ?? 0

  // Data hooks
  const detailQuery = useFiscalDocumentDetail(companyId, documentId)
  const authorizeMutation = useAuthorizeFiscalDocument(companyId)
  const cancelMutation = useCancelFiscalDocument(companyId)
  const danfeMutation = useGenerateDanfe(companyId)

  // Attachments
  const attachmentsQuery = useAttachments(companyId, 'fiscal_document', documentId ? String(documentId) : '')
  const deleteAttachment = useDeleteAttachment(companyId)

  // Dialog state
  const [authorizeDialogOpen, setAuthorizeDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // Authorize form state
  const [authorizeForm, setAuthorizeForm] = useState<AuthorizeFormData>({
    accessKey: '',
    protocolNumber: '',
    xmlContent: '',
    authorizedAt: getTodayISO()
  })

  // Cancel form state
  const [cancelForm, setCancelForm] = useState<CancelFormData>({
    protocolNumber: '',
    justification: '',
    cancelledAt: getTodayISO()
  })

  const document = detailQuery.data
  const isTransitioning = authorizeMutation.isPending || cancelMutation.isPending || danfeMutation.isPending

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleBack(): void {
    navigate({ to: '/fiscal-documents' as string })
  }

  const handleAuthorize = useCallback(() => {
    setAuthorizeForm({
      accessKey: '',
      protocolNumber: '',
      xmlContent: '',
      authorizedAt: getTodayISO()
    })
    setAuthorizeDialogOpen(true)
  }, [])

  const handleCancel = useCallback(() => {
    setCancelForm({
      protocolNumber: '',
      justification: '',
      cancelledAt: getTodayISO()
    })
    setCancelDialogOpen(true)
  }, [])

  const handleGenerateDanfe = useCallback(() => {
    if (!documentId) return

    danfeMutation.mutate(documentId, {
      onSuccess: () => {
        toast.success('DANFE gerado com sucesso')
      },
      onError: () => {
        toast.error('Erro ao gerar DANFE. Tente novamente.')
      }
    })
  }, [documentId, danfeMutation])

  const handleAuthorizeSubmit = useCallback(() => {
    if (!documentId) return

    if (authorizeForm.accessKey.length !== 44) {
      toast.error('A chave de acesso deve ter exatamente 44 dígitos.')
      return
    }

    if (!authorizeForm.protocolNumber.trim()) {
      toast.error('Informe o número do protocolo.')
      return
    }

    if (!authorizeForm.xmlContent.trim()) {
      toast.error('Informe o conteúdo XML da autorização.')
      return
    }

    authorizeMutation.mutate(
      {
        id: documentId,
        accessKey: authorizeForm.accessKey,
        protocolNumber: authorizeForm.protocolNumber,
        xmlContent: authorizeForm.xmlContent,
        authorizedAt: authorizeForm.authorizedAt || new Date().toISOString()
      },
      {
        onSuccess: () => {
          toast.success('Documento fiscal autorizado com sucesso')
          setAuthorizeDialogOpen(false)
        },
        onError: () => {
          toast.error('Erro ao autorizar documento. Tente novamente.')
        }
      }
    )
  }, [documentId, authorizeForm, authorizeMutation])

  const handleCancelSubmit = useCallback(() => {
    if (!documentId) return

    if (!cancelForm.protocolNumber.trim()) {
      toast.error('Informe o número do protocolo de cancelamento.')
      return
    }

    if (!cancelForm.justification.trim()) {
      toast.error('Informe a justificativa do cancelamento.')
      return
    }

    cancelMutation.mutate(
      {
        id: documentId,
        protocolNumber: cancelForm.protocolNumber,
        justification: cancelForm.justification,
        cancelledAt: cancelForm.cancelledAt || new Date().toISOString()
      },
      {
        onSuccess: () => {
          toast.success('Documento fiscal cancelado com sucesso')
          setCancelDialogOpen(false)
        },
        onError: () => {
          toast.error('Erro ao cancelar documento. Tente novamente.')
        }
      }
    )
  }, [documentId, cancelForm, cancelMutation])

  const handleDeleteAttachment = useCallback(
    (attachmentId: number) => {
      deleteAttachment.mutate(attachmentId, {
        onSuccess: () => {
          toast.success('Anexo excluído com sucesso')
        },
        onError: () => {
          toast.error('Erro ao excluir anexo.')
        }
      })
    },
    [deleteAttachment]
  )

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (detailQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando documento fiscal..." />
      </PageShell>
    )
  }

  if (detailQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar documento fiscal"
          description="Não foi possível buscar os detalhes do documento. Tente novamente."
          onRetry={() => detailQuery.refetch()}
        />
      </PageShell>
    )
  }

  if (!document) {
    return (
      <PageShell>
        <ErrorState title="Documento não encontrado" description="O documento fiscal solicitado não foi encontrado." />
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const attachments = attachmentsQuery.data ?? []

  return (
    <PageShell
      title={`${document.documentType} #${document.documentNumber}`}
      description={document.customerName ?? 'Documento fiscal'}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onPress={handleBack} className="gap-2">
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          <FiscalTransitionActions
            status={document.status}
            onAuthorize={handleAuthorize}
            onCancel={handleCancel}
            onGenerateDanfe={handleGenerateDanfe}
            isLoading={isTransitioning}
          />
        </div>
      }
    >
      {/* Metadata Section */}
      <PageSection title="Informações do documento">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetadataField icon={<FileTextIcon className="size-4" />} label="Tipo" value={document.documentType} />
          <MetadataField
            icon={<HashIcon className="size-4" />}
            label="Número / Série"
            value={`${document.documentNumber} / ${document.series}`}
          />
          <MetadataField
            icon={<CalendarIcon className="size-4" />}
            label="Data de Emissão"
            value={formatDate(document.issueDate)}
          />
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheckIcon className="size-3.5" />
              Status
            </span>
            <FiscalStatusBadge status={document.status} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {document.customerName && <MetadataField label="Cliente" value={document.customerName} />}
          {document.orderNumber && (
            <MetadataField
              icon={<PackageIcon className="size-4" />}
              label="Pedido"
              value={`#${document.orderNumber}`}
            />
          )}
          {document.accessKey && (
            <MetadataField
              icon={<KeyIcon className="size-4" />}
              label="Chave de Acesso"
              value={document.accessKey}
              className="sm:col-span-2"
            />
          )}
        </div>

        {document.protocolNumber && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetadataField label="Protocolo" value={document.protocolNumber} />
            {document.authorizedAt && (
              <MetadataField label="Autorizado em" value={formatDateTime(document.authorizedAt)} />
            )}
            {document.cancelledAt && (
              <MetadataField label="Cancelado em" value={formatDateTime(document.cancelledAt)} />
            )}
          </div>
        )}

        {document.cancellationJustification && (
          <div className="mt-4">
            <span className="text-xs font-medium text-muted-foreground">Justificativa de Cancelamento</span>
            <p className="mt-1 text-sm text-foreground">{document.cancellationJustification}</p>
          </div>
        )}

        {/* Financial summary */}
        <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-border/50 pt-4 dark:border-white/5">
          <FinancialField label="Subtotal" value={formatCurrency(document.subtotal)} />
          {document.discountAmount > 0 && (
            <FinancialField
              label="Desconto"
              value={`- ${formatCurrency(document.discountAmount)}`}
              className="text-red-600 dark:text-red-400"
            />
          )}
          <FinancialField label="Impostos" value={formatCurrency(document.taxAmount)} />
          <FinancialField label="Total" value={formatCurrency(document.totalAmount)} className="text-lg font-bold" />
        </div>
      </PageSection>

      {/* Items Table */}
      <PageSection title="Itens do documento">
        {document.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nenhum item registrado.</p>
        ) : (
          <Table aria-label="Itens do documento fiscal">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Preço Unit.</TableHead>
                <TableHead className="text-right">Impostos</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-muted-foreground">{item.productSku}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.taxAmount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(item.totalAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      {/* Lifecycle Events Timeline */}
      {document.events.length > 0 && (
        <PageSection title="Histórico de eventos">
          <div className="space-y-3">
            {document.events.map((event) => (
              <EventTimelineEntry key={event.id} event={event} />
            ))}
          </div>
        </PageSection>
      )}

      {/* Attachments (XML/DANFE) */}
      <PageSection title="Anexos">
        <AttachmentList attachments={attachments} onDelete={handleDeleteAttachment} />
      </PageSection>

      {/* Audit History */}
      {documentId && (
        <AuditExpandablePanel companyId={companyId} entityType="fiscal_document" entityId={String(documentId)} />
      )}

      {/* Authorize Dialog */}
      <Dialog isOpen={authorizeDialogOpen} onOpenChange={setAuthorizeDialogOpen} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Autorizar documento fiscal</DialogTitle>
          <DialogDescription>Informe os dados de autorização retornados pela SEFAZ.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <TextFieldPrimitive className="space-y-1.5">
            <Label>Chave de Acesso (44 dígitos)</Label>
            <Input
              value={authorizeForm.accessKey}
              onChange={(e) => setAuthorizeForm((prev) => ({ ...prev, accessKey: e.target.value }))}
              placeholder="00000000000000000000000000000000000000000000"
              maxLength={44}
            />
          </TextFieldPrimitive>

          <TextFieldPrimitive className="space-y-1.5">
            <Label>Número do Protocolo</Label>
            <Input
              value={authorizeForm.protocolNumber}
              onChange={(e) =>
                setAuthorizeForm((prev) => ({
                  ...prev,
                  protocolNumber: e.target.value
                }))
              }
              placeholder="000000000000000"
            />
          </TextFieldPrimitive>

          <TextFieldPrimitive className="space-y-1.5">
            <Label>Conteúdo XML</Label>
            <Textarea
              value={authorizeForm.xmlContent}
              onChange={(e) => setAuthorizeForm((prev) => ({ ...prev, xmlContent: e.target.value }))}
              placeholder="Cole o XML completo da NF-e autorizada..."
              rows={4}
            />
          </TextFieldPrimitive>

          <TextFieldPrimitive className="space-y-1.5">
            <Label>Data/Hora de Autorização</Label>
            <Input
              type="datetime-local"
              value={authorizeForm.authorizedAt}
              onChange={(e) =>
                setAuthorizeForm((prev) => ({
                  ...prev,
                  authorizedAt: e.target.value
                }))
              }
            />
          </TextFieldPrimitive>
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={authorizeMutation.isPending}>
            Cancelar
          </DialogClose>
          <Button onPress={handleAuthorizeSubmit} isLoading={authorizeMutation.isPending} className="gap-2">
            <CheckCircle2Icon className="size-4" />
            Autorizar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog isOpen={cancelDialogOpen} onOpenChange={setCancelDialogOpen} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar documento fiscal</DialogTitle>
          <DialogDescription>Informe os dados de cancelamento. Esta ação não pode ser desfeita.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <TextFieldPrimitive className="space-y-1.5">
            <Label>Número do Protocolo de Cancelamento</Label>
            <Input
              value={cancelForm.protocolNumber}
              onChange={(e) =>
                setCancelForm((prev) => ({
                  ...prev,
                  protocolNumber: e.target.value
                }))
              }
              placeholder="000000000000000"
            />
          </TextFieldPrimitive>

          <TextFieldPrimitive className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea
              value={cancelForm.justification}
              onChange={(e) => setCancelForm((prev) => ({ ...prev, justification: e.target.value }))}
              placeholder="Motivo do cancelamento do documento fiscal..."
              rows={3}
            />
          </TextFieldPrimitive>

          <TextFieldPrimitive className="space-y-1.5">
            <Label>Data/Hora de Cancelamento</Label>
            <Input
              type="datetime-local"
              value={cancelForm.cancelledAt}
              onChange={(e) =>
                setCancelForm((prev) => ({
                  ...prev,
                  cancelledAt: e.target.value
                }))
              }
            />
          </TextFieldPrimitive>
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={cancelMutation.isPending}>
            Voltar
          </DialogClose>
          <Button
            variant="destructive"
            onPress={handleCancelSubmit}
            isLoading={cancelMutation.isPending}
            className="gap-2"
          >
            <XCircleIcon className="size-4" />
            Cancelar Documento
          </Button>
        </DialogFooter>
      </Dialog>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetadataField({
  icon,
  label,
  value,
  className
}: {
  icon?: React.ReactNode
  label: string
  value: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <p className="text-sm font-medium break-all text-foreground">{value}</p>
    </div>
  )
}

function FinancialField({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-sm font-semibold text-foreground tabular-nums ${className ?? ''}`}>{value}</p>
    </div>
  )
}

function EventTimelineEntry({
  event
}: {
  event: {
    id: number
    eventType: string
    protocolNumber: string | null
    justification: string | null
    eventDate: string
    createdAt: string
  }
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3 dark:border-white/5 dark:bg-card/30">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
        <CalendarIcon className="size-3 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground capitalize">{event.eventType.replace(/_/g, ' ')}</span>
          <span className="text-xs text-muted-foreground">{formatDateTime(event.eventDate)}</span>
        </div>
        {event.protocolNumber && (
          <p className="mt-0.5 text-xs text-muted-foreground">Protocolo: {event.protocolNumber}</p>
        )}
        {event.justification && <p className="mt-0.5 text-xs text-muted-foreground">{event.justification}</p>}
      </div>
    </div>
  )
}

export { FiscalDocumentDetailPage }
