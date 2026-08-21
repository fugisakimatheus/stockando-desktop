import { cn } from '@shared/lib/cn'
import { type FormEvent, useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentMethod {
  id: number
  name: string
}

interface RegisterPaymentFormData {
  paymentMethodId: number
  amount: number
  transactionReference?: string
  paidAt: string
}

interface PaymentFormProps {
  remainingBalance: number
  paymentMethods: readonly PaymentMethod[]
  onSubmit: (input: RegisterPaymentFormData) => void
  disabled?: boolean
  className?: string
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
// PaymentForm
// ---------------------------------------------------------------------------

function PaymentForm({
  remainingBalance,
  paymentMethods,
  onSubmit,
  disabled = false,
  className
}: PaymentFormProps): React.JSX.Element {
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [transactionReference, setTransactionReference] = useState('')
  const [paidAt, setPaidAt] = useState(getTodayISO)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const parsedAmount = useMemo(() => {
    const parsed = Number(amount.replace(',', '.'))
    return Number.isNaN(parsed) ? null : parsed
  }, [amount])

  const isValid = useMemo(() => {
    if (paymentMethodId === null) return false
    if (parsedAmount === null || parsedAmount <= 0) return false
    if (parsedAmount > remainingBalance) return false
    if (!paidAt.trim()) return false
    return true
  }, [paymentMethodId, parsedAmount, remainingBalance, paidAt])

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (paymentMethodId === null) {
      newErrors.paymentMethodId = 'Selecione um método de pagamento.'
    }

    if (!amount.trim()) {
      newErrors.amount = 'O valor é obrigatório.'
    } else if (parsedAmount === null || parsedAmount <= 0) {
      newErrors.amount = 'O valor deve ser maior que zero.'
    } else if (parsedAmount > remainingBalance) {
      newErrors.amount = `O valor não pode exceder o saldo restante (${formatCurrency(remainingBalance)}).`
    }

    if (!paidAt.trim()) {
      newErrors.paidAt = 'A data é obrigatória.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [paymentMethodId, amount, parsedAmount, remainingBalance, paidAt])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      if (!validate()) return

      onSubmit({
        paymentMethodId: paymentMethodId as number,
        amount: parsedAmount as number,
        transactionReference: transactionReference.trim() || undefined,
        paidAt
      })

      // Reset form after successful submission
      setPaymentMethodId(null)
      setAmount('')
      setTransactionReference('')
      setPaidAt(getTodayISO())
      setErrors({})
    },
    [validate, onSubmit, paymentMethodId, parsedAmount, transactionReference, paidAt]
  )

  return (
    <form onSubmit={handleSubmit} className={cn('grid gap-4', className)}>
      {/* Remaining balance display */}
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3">
        <span className="text-sm text-muted-foreground">Saldo restante</span>
        <span className="text-sm font-semibold text-foreground">{formatCurrency(remainingBalance)}</span>
      </div>

      {/* Payment method */}
      <div className="grid gap-1.5">
        <Label htmlFor="payment-method">Método de pagamento</Label>
        <Select
          placeholder="Selecione um método"
          selectedKey={paymentMethodId}
          onSelectionChange={(key) => {
            setPaymentMethodId(key === null ? null : Number(key))
            setErrors((prev) => ({ ...prev, paymentMethodId: '' }))
          }}
          isDisabled={disabled}
          aria-label="Método de pagamento"
        >
          <SelectTrigger id="payment-method" aria-invalid={!!errors.paymentMethodId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods.map((method) => (
              <SelectItem key={method.id} id={method.id} textValue={method.name}>
                {method.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.paymentMethodId ? <p className="text-xs text-destructive">{errors.paymentMethodId}</p> : null}
      </div>

      {/* Amount */}
      <div className="grid gap-1.5">
        <Label htmlFor="payment-amount">Valor</Label>
        <Input
          id="payment-amount"
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setErrors((prev) => ({ ...prev, amount: '' }))
          }}
          disabled={disabled}
          aria-invalid={!!errors.amount}
        />
        {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
      </div>

      {/* Date */}
      <div className="grid gap-1.5">
        <Label htmlFor="payment-date">Data</Label>
        <Input
          id="payment-date"
          type="date"
          value={paidAt}
          onChange={(e) => {
            setPaidAt(e.target.value)
            setErrors((prev) => ({ ...prev, paidAt: '' }))
          }}
          disabled={disabled}
          aria-invalid={!!errors.paidAt}
        />
        {errors.paidAt ? <p className="text-xs text-destructive">{errors.paidAt}</p> : null}
      </div>

      {/* Transaction reference (optional) */}
      <div className="grid gap-1.5">
        <Label htmlFor="payment-reference">Referência (opcional)</Label>
        <Input
          id="payment-reference"
          type="text"
          placeholder="Ex: PIX, comprovante, nº transação"
          value={transactionReference}
          onChange={(e) => setTransactionReference(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Submit button */}
      <Button type="submit" isDisabled={!isValid || disabled} className="w-full">
        Registrar pagamento
      </Button>
    </form>
  )
}

export { PaymentForm }
export type { PaymentFormProps, RegisterPaymentFormData, PaymentMethod }
