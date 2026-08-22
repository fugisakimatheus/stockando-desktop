import {
  useActiveReminderCount,
  useCompleteReminder,
  useDismissReminder,
  useReminders
} from '@shared/hooks/use-reminders'
import { BellIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from './empty-state'
import { LoadingState } from './loading-state'
import { ReminderBadge } from './reminder-badge'
import { ReminderCard } from './reminder-card'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from './sheet'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemindersPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// RemindersPanel
// ---------------------------------------------------------------------------

function RemindersPanel({ open, onOpenChange }: RemindersPanelProps): React.JSX.Element {
  const { data: reminders, isLoading } = useReminders(COMPANY_ID, { status: 'active' })
  const { data: countData } = useActiveReminderCount(COMPANY_ID)
  const dismissMutation = useDismissReminder(COMPANY_ID)
  const completeMutation = useCompleteReminder(COMPANY_ID)

  const activeCount = countData?.count ?? 0

  function handleDismiss(id: number): void {
    dismissMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Lembrete dispensado com sucesso')
      }
    })
  }

  function handleComplete(id: number): void {
    completeMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Lembrete concluído com sucesso')
      }
    })
  }

  return (
    <Sheet isOpen={open} onOpenChange={onOpenChange} side="right">
      <SheetHeader>
        <div className="flex items-center gap-2">
          <SheetTitle>Lembretes</SheetTitle>
          <ReminderBadge count={activeCount} />
        </div>
        <SheetDescription>Lembretes ativos ordenados por vencimento.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <LoadingState message="Carregando lembretes..." />
        ) : !reminders?.data?.length ? (
          <EmptyState
            icon={<BellIcon />}
            title="Nenhum lembrete ativo"
            description="Quando houver lembretes ativos, eles aparecerão aqui."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {reminders.data.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onDismiss={handleDismiss}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

export { RemindersPanel }
export type { RemindersPanelProps }
