import { useActiveCompany } from '@shared/hooks/use-active-company'
import type { BootstrapCompany } from '@shared/hooks/use-active-company'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@shared/ui/dropdown-menu'
import { Spinner } from '@shared/ui/spinner'
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button as AriaButton } from 'react-aria-components'

/**
 * Company selector displayed in the sidebar header.
 *
 * - Shows the active company name prominently
 * - Dropdown to switch between companies
 * - Loading state during company switch
 * - Prompt to create first company when none exist
 *
 * Requirements: 2.1, 2.2, 2.5
 */
function CompanySelector(): React.JSX.Element {
  const { company, companies, isLoading, setActive, isSettingActive } = useActiveCompany()

  if (isLoading) {
    return <CompanySelectorSkeleton />
  }

  if (companies.length === 0) {
    return <EmptyCompanyPrompt />
  }

  return (
    <DropdownMenuTrigger>
      <AriaButton
        className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2 py-2 text-left shadow-[0_4px_14px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5 hover:bg-accent/50 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
        aria-label="Selecionar empresa"
      >
        <CompanyAvatar name={company?.name ?? ''} />
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-sm leading-tight font-medium">{company?.name ?? 'Selecionar empresa'}</p>
          <p className="truncate text-[11px] text-muted-foreground">{company?.documentNumber ?? ''}</p>
        </div>
        {isSettingActive ? (
          <Spinner className="size-3.5 group-data-[collapsible=icon]:hidden" />
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        )}
      </AriaButton>

      <DropdownMenu className="w-64">
        <DropdownMenuLabel>Empresas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <CompanyMenuItem key={c.id} company={c} isActive={c.id === company?.id} onSelect={() => setActive(c.id)} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem href="/companies/new" textValue="Criar nova empresa" className="gap-2 text-primary">
          <Plus className="size-4" />
          <span>Criar nova empresa</span>
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}

function CompanyMenuItem({
  company,
  isActive,
  onSelect
}: {
  company: BootstrapCompany
  isActive: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem onAction={onSelect} textValue={company.name} className="gap-2">
      <CompanyAvatar name={company.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{company.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{company.documentNumber}</p>
      </div>
      {isActive && <Check className="size-3.5 shrink-0 text-primary" />}
    </DropdownMenuItem>
  )
}

function CompanyAvatar({ name, size = 'default' }: { name: string; size?: 'default' | 'sm' }): React.JSX.Element {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const sizeClasses = size === 'sm' ? 'size-6 min-h-6 min-w-6 text-[10px]' : 'size-8 min-h-8 min-w-8 text-xs'

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/8 font-semibold text-primary ${sizeClasses}`}
    >
      {initials || <Building2 className="size-3.5" />}
    </div>
  )
}

function CompanySelectorSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2 py-2 shadow-[0_4px_14px_rgba(15,23,42,0.05)] backdrop-blur-sm">
      <div className="size-8 min-h-8 min-w-8 animate-pulse rounded-lg bg-muted" />
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-2.5 w-16 animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  )
}

function EmptyCompanyPrompt(): React.JSX.Element {
  return (
    <a
      href="/companies/new"
      className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2 py-2 text-left transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5 hover:border-primary/60 hover:bg-primary/10"
    >
      <div className="flex size-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
        <Plus className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p className="text-sm font-medium text-primary">Criar empresa</p>
        <p className="text-[11px] text-muted-foreground">Configure sua primeira empresa</p>
      </div>
    </a>
  )
}

export { CompanySelector }
