import type { FinancialAccountListItem, InstallmentItem, SettleInstallmentInput } from '@shared/api'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { BanknoteIcon } from 'lucide-react'
import { type FormEvent, useCallback, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettlementFormProps {
  installment: InstallmentItem | null
  accounts: FinancialAccountListItem[]
  onSubmit: (data: SettleInstallmentInput) => void
  onClose: () => void
  isOpen: boolean
  isPending: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// SettlementForm
// ---------------------------------------------------------------------------

function SettlementForm({
  installment,
  accounts,
  onSubmit,
  onClose,
  isOpen,
  isPending
}: SettlementFormProps): React.JSX.Element {
  const [accountId, setAccountId] = useState<number | null>(null)
  const [transactionDate, setTransactionDate] = useState(getTodayISO)
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const activeAccounts = useMemo(() => accounts.filter((a) => a.status === 'active'), [accounts])

  const isValid = useMemo(() => {
    if (accountId === null) return false
    if (!transactionDate.trim()) return false
    return true
  }, [accountId, transactionDate])

  const resetForm = useCallback(() => {
    setAccountId(null)
    setTransactionDate(getTodayISO())
    setDescription('')
    setErrors({})
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      const newErrors: Record<string, string> = {}

      if (accountId === null) {
        newErrors.accountId = 'Selecione uma conta financeira.'
      }

      if (!transactionDate.trim()) {
        newErrors.transactionDate = 'A data da transação é obrigatória.'
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      onSubmit({
        accountId: accountId as number,
        transactionDate,
        description: description.trim() || undefined
      })
    },
    [accountId, transactionDate, description, onSubmit]
  )

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      className="sm:max-w-sm"
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BanknoteIcon className="size-4 text-primary" aria-hidden="true" />
          Liquidar parcela
        </DialogTitle>
        <DialogDescription>Confirme os dados para registrar a liquidação desta parcela.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="grid gap-4">
        {/* Amount display (read-only) */}
        {installment && (
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3">
            <span className="text-sm text-muted-foreground">Valor da parcela</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(installment.amount)}
            </span>
          </div>
        )}

        {/* Account selection */}
        <div className="grid gap-1.5">
          <Label htmlFor="settlement-account">
            Conta financeira <span className="text-destructive">*</span>
          </Label>
          <Select
            placeholder="Selecione uma conta"
            selectedKey={accountId}
            onSelectionChange={(key) => {
              setAccountId(key === null ? null : Number(key))
              setErrors((prev) => ({ ...prev, accountId: '' }))
            }}
            isDisabled={isPending}
            aria-label="Conta financeira"
            aria-invalid={!!errors.accountId}
            aria-describedby={errors.accountId ? 'settlement-account-error' : undefined}
          >
            <SelectTrigger id="settlement-account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((account) => (
                <SelectItem key={account.id} id={account.id} textValue={account.name}>
                  <span className="flex items-center gap-2">
                    <span>{account.name}</span>
                    {account.bankName && <span className="text-xs text-muted-foreground">({account.bankName})</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.accountId && (
            <p id="settlement-account-error" className="text-xs text-destructive">
              {errors.accountId}
            </p>
          )}
        </div>

        {/* Transaction date */}
        <div className="grid gap-1.5">
          <Label htmlFor="settlement-date">
            Data da transação <span className="text-destructive">*</span>
          </Label>
          <Input
            id="settlement-date"
            type="date"
            value={transactionDate}
            onChange={(e) => {
              setTransactionDate(e.target.value)
              setErrors((prev) => ({ ...prev, transactionDate: '' }))
            }}
            disabled={isPending}
            aria-invalid={!!errors.transactionDate}
            aria-describedby={errors.transactionDate ? 'settlement-date-error' : undefined}
          />
          {errors.transactionDate && (
            <p id="settlement-date-error" className="text-xs text-destructive">
              {errors.transactionDate}
            </p>
          )}
        </div>

        {/* Description (optional) */}
        <div className="grid gap-1.5">
          <Label htmlFor="settlement-description">Descrição (opcional)</Label>
          <Input
            id="settlement-description"
            type="text"
            placeholder="Ex: PIX, TED, boleto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <DialogClose variant="outline" isDisabled={isPending}>
            Cancelar
          </DialogClose>
          <Button type="submit" isDisabled={!isValid || isPending} isLoading={isPending}>
            Confirmar liquidação
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

export { SettlementForm }
export type { SettlementFormProps }
