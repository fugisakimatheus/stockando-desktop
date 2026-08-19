import { ApiError } from '@shared/api'
import { useActiveCompany } from '@shared/hooks/use-active-company'
import { useCreateCompany } from '@shared/hooks/use-companies'
import { Button } from '@shared/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@shared/ui/dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCompanyDialogProps {
  /** Trigger element that opens the dialog. */
  children: ReactNode
}

interface FormFields {
  name: string
  documentNumber: string
  tradeName: string
}

type FieldErrors = Partial<Record<keyof FormFields, string>>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dialog for creating a new company.
 *
 * Features:
 * - Form fields: name (required), document number (required), trade name (optional)
 * - Inline validation errors from the API
 * - Auto-switches active company context on success
 * - Accessible: focus trap, keyboard navigation, close on escape
 *
 * Requirements: 3.1, 3.3, 3.5
 */
function CreateCompanyDialog({ children }: CreateCompanyDialogProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [fields, setFields] = useState<FormFields>({ name: '', documentNumber: '', tradeName: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const createCompany = useCreateCompany()
  const { setActive } = useActiveCompany()
  const queryClient = useQueryClient()

  const resetForm = useCallback(() => {
    setFields({ name: '', documentNumber: '', tradeName: '' })
    setFieldErrors({})
    setGeneralError(null)
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open)
      if (!open) {
        resetForm()
      }
    },
    [resetForm]
  )

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setFieldErrors({})
      setGeneralError(null)

      // Client-side required validation
      const errors: FieldErrors = {}
      if (!fields.name.trim()) {
        errors.name = 'Nome da empresa é obrigatório'
      }
      if (!fields.documentNumber.trim()) {
        errors.documentNumber = 'CNPJ/CPF é obrigatório'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }

      createCompany.mutate(
        {
          name: fields.name.trim(),
          documentNumber: fields.documentNumber.trim(),
          tradeName: fields.tradeName.trim() || null
        },
        {
          onSuccess: async (company) => {
            // Invalidate bootstrap so the gate re-evaluates (companies list updates)
            await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
            setActive(company.id)
            setIsOpen(false)
            resetForm()
          },
          onError: (error) => {
            if (error instanceof ApiError && error.fields) {
              setFieldErrors(error.fields as FieldErrors)
            } else if (error instanceof ApiError) {
              setGeneralError(error.message)
            } else {
              setGeneralError('Ocorreu um erro inesperado. Tente novamente.')
            }
          }
        }
      )
    },
    [fields, createCompany, setActive, resetForm, queryClient]
  )

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
      {children}
      <Dialog className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para criar uma nova empresa. Você será redirecionado automaticamente para ela.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {generalError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/10"
            >
              {generalError}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="company-name">
              Nome da empresa <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company-name"
              placeholder="Ex: Minha Empresa Ltda"
              value={fields.name}
              onChange={(e) => setFields((prev) => ({ ...prev, name: e.target.value }))}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? 'company-name-error' : undefined}
              autoFocus
            />
            {fieldErrors.name && (
              <p id="company-name-error" className="text-xs text-destructive">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="company-document">
              CNPJ/CPF <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company-document"
              placeholder="Ex: 12.345.678/0001-90"
              value={fields.documentNumber}
              onChange={(e) => setFields((prev) => ({ ...prev, documentNumber: e.target.value }))}
              aria-invalid={!!fieldErrors.documentNumber}
              aria-describedby={fieldErrors.documentNumber ? 'company-document-error' : undefined}
            />
            {fieldErrors.documentNumber && (
              <p id="company-document-error" className="text-xs text-destructive">
                {fieldErrors.documentNumber}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="company-trade-name">Nome fantasia</Label>
            <Input
              id="company-trade-name"
              placeholder="Ex: Minha Empresa"
              value={fields.tradeName}
              onChange={(e) => setFields((prev) => ({ ...prev, tradeName: e.target.value }))}
              aria-invalid={!!fieldErrors.tradeName}
              aria-describedby={fieldErrors.tradeName ? 'company-trade-name-error' : undefined}
            />
            {fieldErrors.tradeName && (
              <p id="company-trade-name-error" className="text-xs text-destructive">
                {fieldErrors.tradeName}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose>Cancelar</DialogClose>
            <Button type="submit" isDisabled={createCompany.isPending}>
              {createCompany.isPending && <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />}
              Criar empresa
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  )
}

export { CreateCompanyDialog }
