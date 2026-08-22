import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { CalendarIcon } from 'lucide-react'
import { match } from 'ts-pattern'

type DashboardPeriod =
  | { type: 'current_month' }
  | { type: 'last_30_days' }
  | { type: 'custom'; startDate: string; endDate: string }

type PeriodType = DashboardPeriod['type']

interface DateRangeFilterProps {
  value: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
  className?: string
}

const PERIOD_OPTIONS: { type: PeriodType; label: string }[] = [
  { type: 'current_month', label: 'Mês Atual' },
  { type: 'last_30_days', label: 'Últimos 30 dias' },
  { type: 'custom', label: 'Personalizado' }
]

function getPeriodLabel(period: DashboardPeriod): string {
  return match(period)
    .with({ type: 'current_month' }, () => 'Mês Atual')
    .with({ type: 'last_30_days' }, () => 'Últimos 30 dias')
    .with({ type: 'custom' }, () => 'Personalizado')
    .exhaustive()
}

function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps): React.JSX.Element {
  const handlePeriodTypeChange = (type: PeriodType): void => {
    match(type)
      .with('current_month', () => onChange({ type: 'current_month' }))
      .with('last_30_days', () => onChange({ type: 'last_30_days' }))
      .with('custom', () =>
        onChange({
          type: 'custom',
          startDate: value.type === 'custom' ? value.startDate : '',
          endDate: value.type === 'custom' ? value.endDate : ''
        })
      )
      .exhaustive()
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />

      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-0.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.type}
            variant={value.type === option.type ? 'secondary' : 'ghost'}
            size="sm"
            onPress={() => handlePeriodTypeChange(option.type)}
            aria-pressed={value.type === option.type}
            aria-label={`Filtrar por ${option.label}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {value.type === 'custom' && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="date-range-start">
            Data inicial
          </label>
          <Input
            id="date-range-start"
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ type: 'custom', startDate: e.target.value, endDate: value.endDate })}
            aria-label="Data inicial"
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <label className="sr-only" htmlFor="date-range-end">
            Data final
          </label>
          <Input
            id="date-range-end"
            type="date"
            value={value.endDate}
            onChange={(e) => onChange({ type: 'custom', startDate: value.startDate, endDate: e.target.value })}
            aria-label="Data final"
            className="h-8 w-36 text-xs"
          />
        </div>
      )}
    </div>
  )
}

export { DateRangeFilter, getPeriodLabel }
export type { DateRangeFilterProps, DashboardPeriod as DateRangeFilterPeriod }
