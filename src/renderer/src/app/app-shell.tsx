import { CompanySelector } from '@app/company-selector'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@shared/ui/sidebar'
import { useRouterState } from '@tanstack/react-router'
import { HomeIcon, MoonStar, Package2, Settings2, SunMedium, Tags } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { ReactNode } from 'react'

function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { theme, setTheme } = useTheme()

  const navigationItems = [
    { href: '/', label: 'Início', icon: HomeIcon },
    { href: '/products', label: 'Produtos', icon: Package2 },
    { href: '/categories', label: 'Categorias', icon: Tags },
    { href: '/settings', label: 'Configurações', icon: Settings2 }
  ]

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-svh w-full bg-[radial-gradient(circle_at_6%_14%,_rgba(59,130,246,0.05),_transparent_44%),radial-gradient(circle_at_78%_88%,_rgba(59,130,246,0.03),_transparent_42%)] dark:bg-[radial-gradient(circle_at_6%_14%,_rgba(96,165,250,0.1),_transparent_46%),radial-gradient(circle_at_78%_88%,_rgba(96,165,250,0.06),_transparent_44%)]">
        <Sidebar variant="inset" collapsible="icon" className="border-0 bg-transparent">
          <SidebarHeader className="p-2 group-data-[collapsible=icon]:p-1.5">
            <CompanySelector />
          </SidebarHeader>

          <SidebarContent className="px-0.5 pb-2 backdrop-blur-sm group-data-[collapsible=icon]:px-1">
            <SidebarGroup className="group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-1">
              <SidebarGroupLabel className="px-2 text-[11px] tracking-[0.24em] text-muted-foreground/80 uppercase">
                Navegação
              </SidebarGroupLabel>
              <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
                {navigationItems.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href
                  return (
                    <SidebarMenuItem
                      key={href}
                      className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
                    >
                      <SidebarMenuButton
                        href={href}
                        isActive={isActive}
                        tooltip={label}
                        className="rounded-xl group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                      >
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="px-2 pt-0 pb-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1.5">
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-2 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-all duration-200 group-data-[collapsible=icon]:hidden">
              <div className="text-[9px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Tema</div>
              <button
                type="button"
                aria-label="Alternar tema"
                title="Alternar tema"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex h-6 w-11 items-center rounded-full border border-border/70 bg-muted/70 p-0.5 transition hover:bg-muted"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}
                >
                  {theme === 'dark' ? (
                    <MoonStar className="size-3.5 stroke-[2.25]" />
                  ) : (
                    <SunMedium className="size-3.5 stroke-[2.25]" />
                  )}
                </span>
              </button>
            </div>

            <button
              type="button"
              aria-label="Alternar tema"
              title="Alternar tema"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="hidden size-9 items-center justify-center rounded-xl border border-sidebar-border/80 bg-gradient-to-r from-sidebar-accent/90 to-sidebar-accent/65 text-sidebar-foreground transition-all duration-200 ease-out group-data-[collapsible=icon]:flex hover:border-sidebar-border hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)] active:translate-y-px dark:border-white/12 dark:hover:shadow-[0_10px_22px_rgba(2,6,23,0.28)]"
            >
              {theme === 'dark' ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
            </button>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-svh flex-1 border border-border/70 bg-background/80 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/10 dark:bg-background/60 dark:shadow-[0_10px_35px_rgba(2,6,23,0.25)]">
          <div className="min-h-svh overflow-hidden">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

export { AppShell }
