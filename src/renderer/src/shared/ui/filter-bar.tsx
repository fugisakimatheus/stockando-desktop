import { cn } from '@shared/lib/cn'
import { Input } from '@shared/ui/input'
import { SearchIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  className?: string
}

function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  className,
  children
}: PropsWithChildren<FilterBarProps>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 dark:border-white/6 dark:bg-white/[0.02]',
        className
      )}
    >
      <div className="relative max-w-xs min-w-[200px] flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 border-transparent bg-background/80 pl-8 text-sm shadow-none focus-visible:border-ring dark:border-transparent dark:bg-background/60"
          aria-label={searchPlaceholder}
        />
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
