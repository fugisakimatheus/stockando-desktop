import { cn } from '@shared/lib/cn'
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { match } from 'ts-pattern'

type TrendDirection = 'up' | 'down' | 'neutral'

interface SummaryCardProps {
  label: string
  value: string
  trend?: {
    direction: TrendDirection
    label: string
  }
  icon?: React.ReactNode
  onClick?: () => void
  className?: string
}

function getTrendStyles(direction: TrendDirection): { color: string; Icon: typeof TrendingUpIcon | null } {
  return match(direction)
    .with('up', () => ({
      color: 'text-green-700 dark:text-green-300',
      Icon: TrendingUpIcon
    }))
    .with('down', () => ({
      color: 'text-red-700 dark:text-red-300',
      Icon: TrendingDownIcon
    }))
    .with('neutral', () => ({
      color: 'text-muted-foreground',
      Icon: null
    }))
    .exhaustive()
}

function SummaryCard({ label, value, trend, icon, onClick, className }: SummaryCardProps): React.JSX.Element {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_35px_rgba(2,6,23,0.25)]',
        onClick &&
          'cursor-pointer hover:border-primary/20 hover:shadow-[0_12px_35px_rgba(15,23,42,0.08)] active:translate-y-px dark:hover:border-primary/30',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-semibold tracking-tight text-foreground">{value}</span>

        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              getTrendStyles(trend.direction).color
            )}
          >
            {getTrendStyles(trend.direction).Icon && (
              <span className="[&_svg]:size-3">
                {(() => {
                  const { Icon } = getTrendStyles(trend.direction)
                  return Icon ? <Icon aria-hidden="true" /> : null
                })()}
              </span>
            )}
            {trend.label}
          </span>
        )}
      </div>
    </Component>
  )
}

export { SummaryCard }
export type { SummaryCardProps, TrendDirection }
