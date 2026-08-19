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
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div className="relative w-full max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          aria-label={searchPlaceholder}
        />
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
